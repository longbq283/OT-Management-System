import { readExcel } from '../import/reader.mjs';
import { cellText, colName, detectPeriod, detectTemplate, FIELD_LABELS, previewSheet } from '../import/engine.mjs';
import { normalizeEmployeeCode } from './client.mjs';
import { fromDatabase, prepareRows } from './records.mjs';
import { buildOTReport } from '../domain/reports.mjs';
import { esc, hours, option, projectOptions, table } from './ui.mjs';

export function periodFields(state, { all = false } = {}) {
  return `<div class="account-grid">
    <label>Dự án<select name="project" required><option value="">Chọn dự án</option>${projectOptions(
      state.projects.filter(project => all || project.status === 'active'))}</select></label>
    <label>Năm<input name="year" type="number" min="2026" max="2100" value="${Math.max(2026, state.year)}" required></label>
    <label>Tháng<input name="month" type="number" min="1" max="12" value="${state.month}" required></label>
  </div>`;
}

export function renderUpload(state, profile) {
  const admin = state.role === 'system';
  const configured = state.calendars !== null;
  if (!admin && !profile.employee_code) return '';
  return `<section class="account-card">
    <h2>Nhập OT</h2>
    <p>Chọn dự án và kỳ đang mở. Giờ được lưu sau khi xem trước và xác nhận.</p>
    ${!admin && profile.employee_code ? `<details><summary>Nhập theo ngày</summary>
      <form id="manual-ot">${periodFields(state)}
        <label>${configured ? 'Ngày và số phút OT' : 'Ngày, loại và số phút OT'}<textarea name="days" required maxlength="2000"
          placeholder="${configured ? '1 120' : '1 NT 120'}"></textarea></label>
        <p class="account-muted">${configured ? 'Mỗi dòng gồm ngày trong tháng và số phút, ví dụ 1 120. Loại ngày lấy từ lịch đã lưu.'
          : 'Mỗi dòng gồm ngày trong tháng, loại NT/NN/L và số phút, ví dụ 1 NT 120.'}</p>
        <button class="primary">Xem trước giờ nhập</button>
      </form>
    </details>` : ''}
    <details><summary>Nhập từ Excel</summary>
      <form id="excel-ot">${periodFields(state)}
        ${admin ? '<p>Nhập toàn bộ kỳ cho người được phân công.</p>' : ''}
        <label>File Excel<input name="file" type="file" accept=".xlsx,.xls" required></label>
        <button class="primary">Đọc file và kiểm tra ánh xạ</button>
      </form>
      <div id="workbook-mapping"></div>
    </details>
    <div id="upload-preview" aria-live="polite"></div>
  </section>`;
}

export function readManual(text, profile, year, month, calendar) {
  const days = text.trim().split(/\r?\n/).filter(line => line.trim()).map(line => {
    const match = line.trim().match(/^(\d{1,2})(?:\s+(NT|NN|L))?\s+(\d{1,4})$/i);
    if (!match || (!calendar && !match[2])) throw Error(calendar
      ? 'Mỗi dòng cần có ngày và số phút.' : 'Mỗi dòng cần có ngày, loại NT/NN/L và số phút.');
    const [, day, type, minutes] = match;
    const dayType = calendar ? calendar[Number(day) - 1] : type.toUpperCase();
    if (!dayType) throw Error('Ngày ' + day + ' không thuộc lịch của tháng đã chọn.');
    return {
      date: year + '-' + String(month).padStart(2, '0') + '-' + day.padStart(2, '0'),
      type: dayType, minutes: Number(minutes)
    };
  });
  if (!days.length) throw Error('Vui lòng nhập ít nhất một ngày OT.');
  const ntMinutes = days.filter(day => day.type === 'NT').reduce((sum, day) => sum + day.minutes, 0);
  const nnMinutes = days.filter(day => day.type !== 'NT').reduce((sum, day) => sum + day.minutes, 0);
  return { employeeId: profile.employee_code, name: profile.full_name, source: 'daily',
    days, ntMinutes, nnMinutes, totalMinutes: ntMinutes + nnMinutes };
}

function mappingFields(sheet, mapping, dailyOnly) {
  return `<div class="account-grid">
    ${Object.entries(FIELD_LABELS).map(([key, label]) => `<label>${esc(label)}<select name="col-${key}">
      ${option('', 'Không ánh xạ')}${Array.from({ length: sheet.columns }, (_, i) =>
        option(i, colName(i) + ' · ' + (cellText(sheet.rows[mapping.headerRow]?.[i]) || '—'), mapping.columns[key])).join('')}
    </select></label>`).join('')}
    <label>Dòng bắt đầu<input type="number" name="start" min="1" max="${sheet.rows.length}" value="${mapping.startRow + 1}" required></label>
    <label>Dòng kết thúc<input type="number" name="end" min="1" max="${sheet.rows.length}" value="${mapping.endRow + 1}" required></label>
    ${dailyOnly ? '<p>Nguồn tính theo từng ngày trong lịch dự án.</p>' :
      `<label>Nguồn tính<select name="source">${option('auto', 'Tự động', mapping.source)}${option('daily', 'Theo ngày', mapping.source)}${option('summary', 'Tổng hợp', mapping.source)}</select></label>`}
    <label>Đơn vị số<select name="unit">${option('hours', 'Giờ thập phân', mapping.unit)}${option('duration', 'Thời lượng Excel', mapping.unit)}</select></label>
  </div>`;
}

function renderMapping(target, book, onReview, { year, month, calendar, batch }) {
  const dailyOnly = Boolean(calendar && !batch);
  target.innerHTML = `<form id="excel-mapping">
    <label>Sheet<select name="sheet">${book.sheets.map((sheet, index) => option(index, sheet.name)).join('')}</select></label>
    <div id="mapping-hint"></div><div id="mapping-fields"></div>
    <button class="primary">Kiểm tra và xem trước</button>
  </form>`;
  const form = target.querySelector('form');
  let mapping;
  let detected;
  function detect() {
    const sheet = book.sheets[Number(form.elements.sheet.value)];
    mapping = detectTemplate(sheet).mapping;
    detected = detectPeriod(sheet, mapping.headerRow, book.filename);
    target.querySelector('#mapping-hint').textContent = 'Kỳ sẽ lưu: ' + month + '/' + year +
      '. Đã nhận diện ' + mapping.days.length + ' cột ngày. Hãy kiểm tra ánh xạ.';
    target.querySelector('#mapping-fields').innerHTML = mappingFields(sheet, mapping, dailyOnly);
  }
  form.elements.sheet.onchange = detect;
  detect();
  form.onsubmit = event => {
    event.preventDefault();
    onReview(() => {
      const fields = new FormData(form);
      const sheet = book.sheets[Number(fields.get('sheet'))];
      const columns = Object.fromEntries(Object.keys(FIELD_LABELS).filter(key => fields.get('col-' + key) !== '')
        .map(key => [key, Number(fields.get('col-' + key))]));
      if (dailyOnly && !mapping.days.length) throw Error('Excel cần có cột ghi số giờ của từng ngày.');
      const days = calendar ? mapping.days.map(day => ({ ...day, type: calendar[day.day - 1] ?? '' })) : mapping.days;
      const source = dailyOnly ? 'daily' : fields.get('source');
      const result = previewSheet(sheet, { ...mapping, columns, days, unit: fields.get('unit'), source,
        startRow: Number(fields.get('start')) - 1, endRow: Number(fields.get('end')) - 1 }, { year, month });
      if (result.errors.length) throw Error(result.errors.join(' '));
      const warnings = calendar && result.source === 'daily' ? ['Loại ngày trong Excel được lấy theo lịch đã lưu của dự án.'] : [];
      if (detected.conflict || (detected.year && detected.year !== year) || (detected.month && detected.month !== month)) {
        warnings.push('Kỳ nhận diện trong file khác hoặc mâu thuẫn. Dữ liệu sẽ lưu theo kỳ đã chọn.');
      }
      return { records: result.records, warnings };
    });
  };
}

export function bindUpload(root, state, profile, { action, findPeriod, findCalendar, api, alive, refresh, notice, uploadSignal }) {
  const preview = root.querySelector('#upload-preview');
  if (!preview) return;

  function context(fields, batch = false) {
    const year = Number(fields.year);
    const month = Number(fields.month);
    const project = fields.project;
    const period = findPeriod(project, year, month);
    if (!period?.is_open) throw Error('Kỳ chưa mở. Liên hệ quản trị viên để mở kỳ nhập.');
    const calendar = findCalendar(project, year, month);
    if (state.calendars !== null && !calendar) throw Error('Kỳ chưa có lịch làm việc. Liên hệ quản trị viên.');
    return { year, month, project, period, batch, calendar };
  }

  function showPreview(scope, source, warnings = []) {
    const records = scope.batch ? source : source.filter(record =>
      /^[0-9]{1,8}$/.test(record.employeeId) && normalizeEmployeeCode(record.employeeId) === profile.employee_code);
    if (!records.length) throw Error('Không tìm thấy dòng OT cho phạm vi đã chọn.');
    const seenErrors = records.flatMap(record => record.errors ?? []);
    if (seenErrors.length) throw Error([...new Set(seenErrors)].slice(0, 10).join(' '));
    const rows = prepareRows(records, scope);
    const previous = row => row.status === 'active' && row.projectId === scope.project && row.year === scope.year &&
      row.month === scope.month && (scope.batch || row.employeeId === profile.employee_code);
    const replace = state.entries.some(previous);
    const work = rows.map(row => fromDatabase({ ...row, project_id: scope.project, year: scope.year, month: scope.month,
      active: true, total_minutes: row.nt_minutes + row.nn_minutes + row.unclassified_minutes }));
    const report = buildOTReport({ records: [...state.entries.filter(row => !previous(row)), ...work],
      year: scope.year, month: scope.month, projectId: scope.project });
    const included = new Set(rows.map(row => row.employee_code));
    const alerts = [
      ...warnings,
      ...new Set(records.flatMap(record => record.warnings ?? [])),
      ...report.warnings.filter(item => included.has(item.employeeId)).map(item =>
        item.employeeId + ' vượt ' + (item.type === 'year' ? 'hạn mức năm' : 'hạn mức tháng') + ' ' + hours(item.excessMinutes) + ' giờ.'),
      ...report.dayWarnings.filter(item => included.has(item.employeeId)).map(item => item.employeeId + ' trùng ngày ' + item.date + '.')
    ];
    const project = state.projects.find(item => item.id === scope.project);
    preview.innerHTML = `<form id="commit-ot">
      <h3>Xác nhận nhập OT · ${esc(project.code)} · ${scope.month}/${scope.year}</h3>
      ${table(['Mã cán bộ', 'Họ tên trong nguồn', 'NT (giờ)', 'NN gồm L (giờ)', 'OT (giờ)'],
        work.map(row => [row.employeeId, row.name, row.unclassifiedMinutes ? '—' : hours(row.ntMinutes),
          row.unclassifiedMinutes ? '—' : hours(row.nnMinutes), hours(row.totalMinutes)]))}
      ${alerts.length ? '<ul>' + alerts.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : ''}
      <label><input type="checkbox" required> ${replace ? (scope.batch
        ? 'Tôi xác nhận thay thế toàn bộ dữ liệu hiện hành của dự án trong kỳ này, kể cả dòng vắng trong file.'
        : 'Tôi xác nhận thay thế bản OT của mình trong kỳ này.')
        : 'Tôi xác nhận kỳ và dữ liệu sẽ lưu.'}</label>
      <div class="account-actions"><button class="primary">Xác nhận lưu OT</button><button type="button" id="cancel-ot">Hủy xem trước</button></div>
    </form>`;
    preview.querySelector('#cancel-ot').onclick = () => preview.replaceChildren();
    preview.querySelector('form').onsubmit = event => {
      event.preventDefault();
      action(async () => {
        await api.rpc('ot_submit_entries', {
          p_project: scope.project, p_year: scope.year, p_month: scope.month,
          p_period_revision: scope.period.revision, p_data_revision: scope.period.data_revision,
          p_replace: replace, p_batch: scope.batch, p_rows: rows
        });
        if (!alive()) return;
        preview.replaceChildren();
        await refresh();
        if (alive()) notice('Đã lưu OT cho ' + rows.length + ' cán bộ.');
      });
    };
  }

  const manual = root.querySelector('#manual-ot');
  if (manual) manual.onsubmit = event => {
    event.preventDefault();
    action(async () => {
      preview.replaceChildren();
      const fields = Object.fromEntries(new FormData(manual));
      const scope = context(fields);
      showPreview(scope, [readManual(fields.days, profile, scope.year, scope.month, scope.calendar)]);
    });
  };
  const excel = root.querySelector('#excel-ot');
  const mapping = root.querySelector('#workbook-mapping');
  excel.onchange = () => { mapping.replaceChildren(); preview.replaceChildren(); };
  excel.onsubmit = event => {
    event.preventDefault();
    action(async () => {
      preview.replaceChildren();
      mapping.replaceChildren();
      const fields = Object.fromEntries(new FormData(excel));
      const scope = context(fields, state.role === 'system');
      const book = await readExcel(fields.file, { signal: uploadSignal });
      if (!alive()) return;
      renderMapping(mapping, book, review => action(async () => {
        preview.replaceChildren();
        const { records, warnings } = review();
        showPreview(scope, records, warnings);
      }), scope);
    });
  };
}
