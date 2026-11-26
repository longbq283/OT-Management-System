import { buildOTReport } from '../domain/reports.mjs';
import { createOTWorkbook, loadSheetJS } from '../reports/excel-export.mjs';
import { createAttendanceFile } from '../reports/attendance.mjs';
import { download, esc, hours, option, projectOptions, table } from './ui.mjs';

export function renderReport(state, report) {
  const project = id => state.projects.find(item => item.id === id)?.code || id;
  const annual = state.reportMode === 'yearly';
  return `<section class="account-card">
    <h2>Báo cáo và tra cứu OT</h2>
    <form id="report-form">
      <div class="account-grid">
        <label>Năm<input name="year" type="number" min="2000" max="2100" required value="${state.year}"></label>
        <label>Tháng<input name="month" type="number" min="1" max="12" required value="${state.month}"></label>
        <label>Dự án<select name="project">${option('all', 'Tất cả dự án')}${projectOptions(state.projects, state.project)}</select></label>
        <label>Loại báo cáo<select name="mode">${option('monthly', 'Báo cáo tháng', state.reportMode)}${option('yearly', 'Báo cáo năm', state.reportMode)}</select></label>
        <label>Tìm mã, họ tên hoặc đơn vị<input type="search" name="query" value="${esc(state.query)}"></label>
      </div>
      <div class="account-actions">
        <button class="primary">Áp dụng bộ lọc</button>
        <button type="button" id="report-xlsx">Xuất Excel</button>
        <button type="button" id="report-csv">Xuất CSV</button>
        ${state.role !== 'member' ? '<button type="button" id="report-attendance">Xuất bảng trình ký</button>' : ''}
      </div>
    </form>
    <p>Tổng OT theo bộ lọc: <strong>${hours(report.totalMinutes)} giờ</strong> · ${report.employeeCount} cán bộ</p>
    ${table(['Mã cán bộ', 'Họ tên', 'Đơn vị (Ban/TT)', 'NT (giờ)', 'NN gồm L (giờ)', 'OT bộ lọc (giờ)', 'OT mọi dự án (giờ)', 'Còn hạn mức năm (giờ)'],
      report.rows.map(row => [row.employeeId, row.name, row.unit, row.unclassifiedMinutes ? '—' : hours(row.ntMinutes),
        row.unclassifiedMinutes ? '—' : hours(row.nnMinutes), hours(row.totalMinutes), hours(row.globalPeriodMinutes),
        hours(row.remainingYearMinutes)]))}
    ${annual ? table(['Mã cán bộ', ...Array.from({ length: 12 }, (_, month) => 'T' + (month + 1))],
      report.rows.map(row => [row.employeeId, ...row.months.map(item => hours(item.selectedMinutes))])) : ''}
    <details${report.warnings.length || report.dayWarnings.length ? ' open' : ''}><summary>Cảnh báo hạn mức và trùng ngày</summary>
      <ul>${report.warnings.map(warning => `<li>${esc(warning.employeeId)} · ${warning.type === 'year' ? 'Năm ' + report.year : 'Tháng ' + warning.month} · vượt ${hours(warning.excessMinutes)} giờ</li>`).join('')}
      ${report.dayWarnings.map(warning => `<li>${esc(warning.employeeId)} · trùng ngày ${esc(warning.date)} · ${esc(warning.projects.map(project).join(', '))}</li>`).join('')}
      ${report.warnings.length || report.dayWarnings.length ? '' : '<li>Chưa có cảnh báo trong phạm vi lọc.</li>'}</ul>
    </details>
    <details><summary>Chi tiết OT theo dự án</summary>${table(['Mã cán bộ', 'Dự án', 'Kỳ', 'OT (giờ)', 'Chi tiết ngày'],
      report.selected.map(row => [row.employeeId, project(row.projectId), row.month + '/' + row.year, hours(row.totalMinutes),
        row.days.map(day => day.date + ' · ' + day.type + ' · ' + hours(day.minutes) + 'h').join('; ') || 'Dữ liệu tổng hợp']))}</details>
    <details><summary>Lịch sử phiên bản</summary>${table(['Mã cán bộ', 'Dự án', 'Kỳ', 'Phiên bản', 'OT (giờ)', 'Trạng thái'],
      state.entries.filter(row => row.year === state.year && (annual || row.month === state.month)
        && (state.project === 'all' || row.projectId === state.project)).map(row => [
        row.employeeId, project(row.projectId), row.month + '/' + row.year, row.importId,
        hours(row.totalMinutes), row.status === 'active' ? 'Hiện hành' : 'Đã thay thế'
      ]))}</details>
  </section>`;
}

export function getReport(state) {
  return buildOTReport({
    records: state.entries, projects: state.projects, year: state.year,
    month: state.reportMode === 'yearly' ? 0 : state.month, projectId: state.project, query: state.query
  });
}

export async function exportXlsx(state, alive) {
  const XLSX = await loadSheetJS();
  if (!alive()) return;
  const employees = [...new Map(state.entries.map(row => [row.employeeId, row])).values()];
  const book = createOTWorkbook({
    employees, records: state.entries, projects: state.projects, year: state.year, month: state.month,
    report: state.reportMode, projectId: state.project, query: state.query
  }, XLSX);
  XLSX.writeFile(book, 'bao-cao-ot-' + state.year + '.xlsx');
}

export async function exportAttendance(state, fields, findCalendar, alive) {
  const project = state.projects.find(item => item.id === fields.get('project'));
  if (!project) throw Error('Chọn một dự án cụ thể để xuất bảng trình ký.');
  const year = Number(fields.get('year'));
  const month = Number(fields.get('month'));
  const calendar = findCalendar(project.id, year, month);
  const XLSX = await loadSheetJS();
  if (!alive()) return;
  const content = createAttendanceFile({ project, year, month, calendar, entries: state.entries }, XLSX);
  const code = project.code.replace(/[^0-9A-Za-z_-]/g, '-');
  download('Cham-cong-OT-' + code + '-' + year + '-' + String(month).padStart(2, '0') + '.xlsx',
    new Uint8Array(content), 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
}

export function exportCsv(report) {
  const cell = value => {
    const text = String(value);
    return '"' + (/^[\s]*[=+@-]|^[\t\r\n]/.test(text) ? "'" : '') + text.replaceAll('"', '""') + '"';
  };
  const data = [['Mã cán bộ', 'Họ tên', 'Tổng OT theo bộ lọc (giờ)', 'Tổng OT mọi dự án (giờ)'],
    ...report.rows.map(row => [row.employeeId, row.name, row.totalMinutes / 60, row.globalPeriodMinutes / 60])];
  download('bao-cao-ot-' + report.year + '.csv', '\ufeff' + data.map(row => row.map(cell).join(',')).join('\r\n'), 'text/csv;charset=utf-8');
}
