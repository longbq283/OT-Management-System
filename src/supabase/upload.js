import { bindUnitPicker, renderUnitPicker } from '../ui/organization-units.mjs';
import { readExcel } from '../import/reader.mjs';
import { cellText, colName, detectPeriod, detectTemplate, FIELD_LABELS, previewSheet } from '../import/engine.mjs';
import { fromDatabase, periodKey, prepareRows } from './records.mjs';
import { defaultDays, durationMinutes, durationValue, monthLegend, monthOptions, renderMonthGrid } from './month-grid.js?v=7';
import { buildOTReport } from '../domain/reports.mjs';
import { esc, hours, option, projectOptions, table } from './ui.mjs';

function periodFields(state, selection = state) {
  const selected = state.projects.filter(project => project.status === 'active');
  return `<div class="account-grid">
    <label>Dự án<select name="project" required>${option('', 'Chọn dự án', selection.project)}
      ${projectOptions(selected, selection.project)}</select></label>
    <label>Năm<input name="year" type="number" min="2026" max="2100" value="${Math.max(2026, selection.year)}" required></label>
    <label>Tháng<select name="month">${monthOptions(selection.month)}</select></label>
  </div>`;
}

export function renderUpload(state, profile) {
  const admin = state.role === 'system';
  if (!admin && !profile.employee_code) return '';
  const excel = `<form id="excel-ot">${periodFields(state)}
    <label>File Excel<input name="file" type="file" accept=".xlsx,.xls" required></label>
    <button class="primary">Đọc file và kiểm tra ánh xạ</button>
  </form><div id="workbook-mapping"></div>`;
  return `<section class="account-card">
    <h2>${admin ? 'Nhập OT từ Excel' : 'Nhập giờ OT trực tiếp'}</h2>
    ${admin ? excel + '<div id="upload-preview" aria-live="polite"></div>'
      : `<form id="manual-scope">${periodFields(state, state.manualScope ?? state)}</form>
        <p id="manual-period-notice" class="manual-period-notice" role="status"></p>
        <div id="manual-sheet"></div>`}
  </section>`;
}

function dailyRecord(minutes, types, profile, { year, month }, unit) {
  const days = minutes.flatMap((value, index) => value ? [{
    date: year + '-' + String(month).padStart(2, '0') + '-' + String(index + 1).padStart(2, '0'),
    type: types[index], minutes: value
  }] : []);
  const ntMinutes = days.filter(day => day.type === 'NT').reduce((sum, day) => sum + day.minutes, 0);
  const nnMinutes = days.filter(day => day.type !== 'NT').reduce((sum, day) => sum + day.minutes, 0);
  return { employeeId: profile.employee_code, name: profile.full_name, unit, source: 'daily',
    days, ntMinutes, nnMinutes, totalMinutes: ntMinutes + nnMinutes };
}

function summaryMarkup(rows, alerts = []) {
  return table(['Mã cán bộ', 'Họ tên', 'Đơn vị (Ban/TT)', 'NT (giờ)', 'NN gồm L (giờ)', 'OT (giờ)'],
    rows.map(row => [row.employeeId, row.name, row.unit || '—',
      row.ntMinutes === null || row.unclassifiedMinutes ? '—' : hours(row.ntMinutes),
      row.nnMinutes === null || row.unclassifiedMinutes ? '—' : hours(row.nnMinutes),
      row.totalMinutes === null ? '—' : hours(row.totalMinutes)])) +
    (alerts.length ? '<ul>' + alerts.map(item => '<li>' + esc(item) + '</li>').join('') + '</ul>' : '');
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

function renderMapping(target, book, onReview, { year, month, calendar, batch, limits }) {
  const dailyOnly = Boolean(calendar && (!batch || limits));
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

export function bindUpload(root, state, profile, { action, findPeriod, findCalendar, findLimits, api, alive, refresh, notice, uploadSignal }) {
  const preview = root.querySelector('#upload-preview');

  function excelContext(fields) {
    const year = Number(fields.year);
    const month = Number(fields.month);
    const project = fields.project;
    const period = findPeriod(project, year, month);
    if (!period?.is_open) throw Error('Kỳ chưa mở. Liên hệ quản trị viên để mở kỳ nhập.');
    const calendar = findCalendar(project, year, month);
    if (state.calendars !== null && !calendar) throw Error('Kỳ chưa có lịch làm việc. Liên hệ quản trị viên.');
    return { year, month, project, period, batch: true, calendar, limits: findLimits(project, year, month) };
  }

  function buildPreview(scope, records, warnings = []) {
    if (!records.length) throw Error('Không tìm thấy dòng OT cho phạm vi đã chọn.');
    const seenErrors = records.flatMap(record => record.errors ?? []);
    if (seenErrors.length) throw Error([...new Set(seenErrors)].slice(0, 10).join(' '));
    const rows = prepareRows(records, scope);
    if (scope.limits) {
      for (const row of rows) {
        for (const day of row.days) {
          const limit = scope.limits[Number(day.date.slice(-2)) - 1];
          if (day.minutes > limit) throw Error('Ngày ' + day.date.slice(-2) + ' vượt giới hạn ' + hours(limit) + ' giờ OT.');
        }
      }
    }
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
    return { rows, work, alerts, replace };
  }

  async function save(scope, rows, replace, onSaved) {
    await api.rpc('ot_submit_entries', {
      p_project: scope.project, p_year: scope.year, p_month: scope.month,
      p_period_revision: scope.period.revision, p_data_revision: scope.period.data_revision,
      p_replace: replace, p_batch: scope.batch, p_rows: rows
    });
    if (!alive()) return;
    onSaved?.();
    await refresh();
    const queued = !scope.batch && state.approvalAccess?.submit_projects.includes(scope.project);
    if (alive()) notice(queued ? 'Đã gửi phiếu OT để duyệt.' : scope.batch && state.approvalAccess
      ? 'Đã xử lý OT cho ' + rows.length + ' cán bộ. Phiếu thuộc nhóm cần duyệt đã được chuyển đến người duyệt.'
      : 'Đã lưu OT cho ' + rows.length + ' cán bộ.');
  }

  function showExcelPreview(scope, records, warnings) {
    const { rows, work, alerts, replace } = buildPreview(scope, records, warnings);
    const project = state.projects.find(item => item.id === scope.project);
    preview.innerHTML = `<form id="commit-ot">
      <h3>Xác nhận nhập OT · ${esc(project.code)} · ${scope.month}/${scope.year}</h3>
      ${summaryMarkup(work, alerts)}
      <label><input type="checkbox" required> ${replace
        ? 'Tôi xác nhận thay thế toàn bộ dữ liệu hiện hành của dự án trong kỳ này, kể cả dòng vắng trong file.'
        : 'Tôi xác nhận kỳ và dữ liệu sẽ lưu.'}</label>
      <div class="account-actions"><button class="primary">Xác nhận lưu OT</button><button type="button" id="cancel-ot">Hủy xem trước</button></div>
    </form>`;
    preview.querySelector('#cancel-ot').onclick = () => preview.replaceChildren();
    preview.querySelector('form').onsubmit = event => {
      event.preventDefault();
      action(() => save(scope, rows, replace, () => preview.replaceChildren()));
    };
  }

  const picker = root.querySelector('#manual-scope');
  if (picker) {
    const sheet = root.querySelector('#manual-sheet');
    const periodNotice = root.querySelector('#manual-period-notice');
    const drafts = state.manualDrafts ??= new Map();
    function buildSheet(selection) {
      const { project, year, month } = selection;
      if (!project) {
        periodNotice.textContent = '';
        sheet.innerHTML = '<p class="account-muted">Chọn dự án để hiện bảng ngày trong tháng.</p>';
        return;
      }
      const period = findPeriod(project, year, month);
      periodNotice.textContent = period?.is_open ? '' :
        `Kỳ OT tháng ${month}/${year} hiện đang khóa. Vui lòng liên hệ quản trị dự án để mở kỳ và cập nhật OT.`;
      const saved = findCalendar(project, year, month);
      const types = saved ?? defaultDays(year, month);
      const limits = findLimits(project, year, month);
      const editable = Boolean(period?.is_open && saved);
      const scope = { project, year, month, period, limits, batch: false };
      const projectCode = state.projects.find(item => item.id === project)?.code;
      const current = state.entries.find(entry => entry.status === 'active' && entry.projectId === project &&
        entry.year === year && entry.month === month && entry.employeeId === profile.employee_code);
      const byDay = new Map(current?.days.map(day => [Number(day.date.slice(-2)), day.minutes]));
      const key = periodKey(project, year, month);
      const draft = drafts.get(key);
      const requiresApproval = state.approvalAccess?.submit_projects.includes(project);
      const previousUnit = state.entries.filter(entry => entry.status === 'active' && entry.unit &&
        entry.employeeId === profile.employee_code && (entry.year < year || (entry.year === year && entry.month <= month)))
        .sort((a, b) => b.year - a.year || b.month - a.month)[0]?.unit;
      sheet.innerHTML = `<form id="manual-ot">
        <div class="manual-unit">${renderUnitPicker({
          id: 'manual-unit', scope: profile.id, label: 'Đơn vị (Ban/TT)', required: true,
          selected: draft?.unit ?? (current?.unit || previousUnit || ''),
          history: state.entries.filter(entry => entry.employeeId === profile.employee_code).map(entry => entry.unit)
        })}</div>
        ${monthLegend()}
        <p class="account-muted">${editable ? 'Nhập số giờ, ví dụ 1,5 hoặc 1:30. Ô trống tính 0 giờ.'
          : saved ? 'Bạn có thể nhập nháp trong phiên này và lưu khi kỳ mở.'
            : 'Kỳ chưa có lịch đã lưu. Bạn có thể nhập nháp trong phiên này và lưu sau khi quản trị viên lưu lịch và mở kỳ.'}</p>
        ${current?.source === 'summary' ? '<p class="account-muted">Kỳ này đã có bản tổng hợp. Nếu lưu bảng ngày mới, bản tổng hợp sẽ được thay thế.</p>' : ''}
        ${renderMonthGrid(year, month, types, {
          label: 'Giờ OT tháng ' + month + '/' + year,
          rows: [
            { label: 'Loại ngày', cell: type => esc(type) },
            ...(limits ? [{ label: 'Giới hạn (giờ)', cell: (_, day) => hours(limits[day - 1]) }] : []),
            { label: 'Số giờ OT', cell: (_, day) => `<input name="duration" inputmode="decimal" autocomplete="off"
              aria-label="Giờ OT ngày ${day}" value="${esc(draft?.values[day - 1] ?? (byDay.has(day) ? durationValue(byDay.get(day)) : ''))}">` }
          ]
        })}
        ${state.approvalAccess ? '<p class="account-muted" id="manual-approval-status" role="status"></p>' : ''}
        <div class="month-actions"><output aria-live="polite" id="manual-total"></output></div>
        <section class="manual-review" aria-labelledby="manual-review-title">
          <h3 id="manual-review-title">Dự kiến lưu OT · ${esc(projectCode)} · ${month}/${year}</h3>
          <div id="manual-summary"></div>
          <p class="account-muted" id="manual-unit-required" hidden>Chọn đơn vị (Ban/TT) để xác nhận lưu.</p>
          <label><input type="checkbox" name="confirmed" required disabled> ${current
            ? 'Tôi xác nhận thay thế bản OT của mình trong kỳ này.'
            : 'Tôi xác nhận kỳ và dữ liệu sẽ lưu.'}</label>
          <button type="submit" class="primary" disabled>${requiresApproval ? 'Gửi duyệt OT' : 'Xác nhận lưu OT'}</button>
        </section>
      </form>`;
      const form = sheet.querySelector('form');
      const inputs = [...form.querySelectorAll('input[name=duration]')];
      const approvalStatus = form.querySelector('#manual-approval-status');
      if (approvalStatus) void api.rpc('ot_my_approval_request',{p_project:project,p_year:year,p_month:month}).then(item => {
        if (!alive() || !approvalStatus.isConnected) return;
        approvalStatus.textContent = item?.state === 'pending' ? 'Phiếu OT của bạn đang chờ duyệt.'
          : item?.state === 'returned' ? 'Phiếu OT đã được trả lại: ' + item.reason
          : item?.state === 'approved' ? 'Phiếu OT của kỳ này đã được duyệt.' : '';
      }).catch(error => {
        if (alive() && approvalStatus.isConnected) approvalStatus.textContent = error.message;
      });
      const unitPicker = bindUnitPicker(form.querySelector('#manual-unit'), { scope: profile.id, onInput: editDraft });
      function keepDraft() {
        drafts.set(key, { unit: unitPicker.value(), values: inputs.map(input => input.value) });
      }
      function editDraft() {
        keepDraft();
        updateDraft();
      }
      const confirmed = form.elements.confirmed;
      const saveButton = form.querySelector('button[type=submit]');
      let prepared;
      function updateDraft() {
        confirmed.checked = false;
        const minutes = inputs.map(input => durationMinutes(input.value));
        const issues = minutes.map((value, index) => {
          if (value === null) return 'Ngày ' + (index + 1) + ' cần số giờ từ 0 đến 24.';
          if (limits && value > limits[index]) return 'Ngày ' + (index + 1) + ' vượt giới hạn ' + hours(limits[index]) + ' giờ OT.';
          return '';
        });
        inputs.forEach((input, index) => {
          if (issues[index]) input.setAttribute('aria-invalid', 'true');
          else input.removeAttribute('aria-invalid');
        });
        const error = issues.find(Boolean);
        const unit = unitPicker.value();
        const record = dailyRecord(minutes, types, profile, selection, unit);
        const canSave = editable && !error && Boolean(unit) && record.totalMinutes > 0;
        prepared = canSave ? buildPreview(scope, [record]) : null;
        const summary = error ? { ...record, ntMinutes: null, nnMinutes: null, totalMinutes: null } : record;
        form.querySelector('#manual-summary').innerHTML = summaryMarkup([summary], prepared?.alerts);
        form.querySelector('#manual-unit-required').hidden = !editable || Boolean(unit) || !record.totalMinutes;
        form.querySelector('#manual-total').textContent = error || 'Tổng OT ' + hours(record.totalMinutes) + ' giờ';
        confirmed.disabled = !canSave;
        saveButton.disabled = true;
      }
      updateDraft();
      for (const input of inputs) input.oninput = editDraft;
      confirmed.onchange = () => { saveButton.disabled = !prepared || !confirmed.checked; };
      form.onpaste = event => {
        const first = inputs.indexOf(event.target);
        const text = event.clipboardData?.getData('text/plain').replace(/\r?\n$/, '');
        if (first < 0 || !text?.includes('\t') || /[\r\n]/.test(text)) return;
        event.preventDefault();
        const cells = text.split('\t');
        if (first + cells.length > inputs.length) {
          notice('Dãy giờ dán vượt quá số ngày còn lại trong tháng.', true);
          return;
        }
        cells.forEach((value, offset) => { inputs[first + offset].value = value; });
        keepDraft();
        updateDraft();
      };
      form.onsubmit = event => {
        event.preventDefault();
        if (!prepared || !confirmed.checked || !picker.reportValidity()) return;
        action(async () => {
          unitPicker.finish();
          if (!prepared || !confirmed.checked) return;
          const { rows, replace } = prepared;
          const controls = [...picker.querySelectorAll('input, select'), ...inputs, ...unitPicker.controls, confirmed];
          const enabled = controls.filter(control => !control.disabled);
          enabled.forEach(control => { control.disabled = true; });
          try {
            await save(scope, rows, replace, () => drafts.delete(key));
          } finally {
            enabled.forEach(control => { control.disabled = false; });
          }
        });
      };
    }
    function selectPeriod() {
      if (picker.elements.project.value && !picker.checkValidity()) return;
      const fields = new FormData(picker);
      const project = fields.get('project');
      const year = Number(fields.get('year'));
      const month = Number(fields.get('month'));
      if (sheet.firstElementChild && state.manualScope?.project === project &&
        state.manualScope.year === year && state.manualScope.month === month) return;
      state.manualScope = { project, year, month };
      buildSheet(state.manualScope);
    }
    picker.onchange = selectPeriod;
    picker.elements.year.oninput = selectPeriod;
    picker.onsubmit = event => event.preventDefault();
    selectPeriod();
    return;
  }
  const excel = root.querySelector('#excel-ot');
  const mapping = root.querySelector('#workbook-mapping');
  excel.onchange = () => { mapping.replaceChildren(); preview.replaceChildren(); };
  excel.onsubmit = event => {
    event.preventDefault();
    action(async () => {
      preview.replaceChildren();
      mapping.replaceChildren();
      const fields = Object.fromEntries(new FormData(excel));
      const scope = excelContext(fields);
      const book = await readExcel(fields.file, { signal: uploadSignal });
      if (!alive()) return;
      renderMapping(mapping, book, review => action(async () => {
        preview.replaceChildren();
        const { records, warnings } = review();
        showExcelPreview(scope, records, warnings);
      }), scope);
    });
  };
}
