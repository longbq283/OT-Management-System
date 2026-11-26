import { validateBackup } from '../db/backup.mjs';
import { planLegacyBackup } from './records.mjs';
import { esc, hours, table } from './ui.mjs';

const entryKey = row => JSON.stringify([
  row.employee_code, row.nt_minutes, row.nn_minutes, row.unclassified_minutes, row.source,
  [...row.days].sort((a, b) => a.date.localeCompare(b.date)).map(day => [day.date, day.type, day.minutes])
]);

export function bindMigration(root, state, { action, api, alive, findPeriod, findCalendar, findLimits, refresh, notice }) {
  const form = root.querySelector('#legacy-migration');
  const output = root.querySelector('#migration-preview');
  if (!form) return;
  let plan;
  form.elements.file.onchange = () => {
    plan = undefined;
    output.replaceChildren();
  };
  form.onsubmit = event => {
    event.preventDefault();
    action(async () => {
      output.replaceChildren();
      const file = form.elements.file.files[0];
      if (!file || file.size > 20 * 1024 * 1024) throw Error('Chọn bản sao JSON tối đa 20 MB.');
      const input = JSON.parse(await file.text());
      const { data } = await validateBackup(input.format === 'ot-management-shared' ? input.backup : input);
      if (!alive()) return;
      plan = planLegacyBackup(data.tables, state.projects, state.profiles, state.memberships).map(group => {
        const period = findPeriod(group.project, group.year, group.month);
        const active = state.rawEntries.filter(row => row.project_id === group.project && row.year === group.year
          && row.month === group.month && row.active);
        const same = JSON.stringify(active.map(entryKey).sort()) === JSON.stringify(group.rows.map(entryKey).sort());
        const calendar = findCalendar(group.project, group.year, group.month);
        const limits = findLimits(group.project, group.year, group.month);
        const typeConflict = calendar && group.rows.some(row => row.days.some(day =>
          day.type !== calendar[Number(day.date.slice(-2)) - 1]));
        const limitConflict = limits && group.rows.some(row => row.days.some(day =>
          day.minutes > limits[Number(day.date.slice(-2)) - 1]));
        const status = same ? 'Khớp dữ liệu đích' : active.length ? 'Xung đột dữ liệu đích'
          : state.calendars !== null && !calendar ? 'Chưa có lịch'
            : typeConflict ? 'Loại ngày nguồn khác lịch' : limitConflict ? 'Có ngày vượt giới hạn OT'
              : !period?.is_open ? 'Kỳ đang khóa' : 'Có thể chuyển';
        return { ...group, status, period };
      });
      output.innerHTML = `<p>Đã kiểm tra bản sao. Lịch sử cũ giữ trong JSON gốc. Mỗi lần chỉ chuyển một kỳ trống.</p>
        ${table(['Dự án', 'Kỳ', 'Số dòng', 'Giờ OT', 'Đối chiếu'], plan.map(group =>
          [group.projectCode, group.month + '/' + group.year, group.rows.length, hours(group.total), group.status]))}
        ${plan.some(group => group.status === 'Có thể chuyển') ? `<form id="confirm-migration">
          <label>Kỳ cần chuyển<select name="group">${plan.map((group, index) => group.status === 'Có thể chuyển'
            ? `<option value="${index}">${esc(group.projectCode)} · ${group.month}/${group.year}</option>` : '').join('')}</select></label>
          <label><input type="checkbox" required> Tôi đã giữ bản sao nguồn và rà soát dự án, kỳ và tổng giờ.</label>
          <button class="primary">Chuyển kỳ đã chọn</button>
        </form>` : ''}`;
      const confirm = output.querySelector('form');
      if (confirm) confirm.onsubmit = event => {
        event.preventDefault();
        action(async () => {
          const group = plan[Number(confirm.elements.group.value)];
          const version = await api.rpc('ot_submit_entries', {
            p_project: group.project, p_year: group.year, p_month: group.month,
            p_period_revision: group.period.revision, p_data_revision: group.period.data_revision,
            p_replace: false, p_batch: true, p_rows: group.rows
          });
          if (!alive()) return;
          const imported = await api.list('ot_entries', { select: '*', project_id: 'eq.' + group.project,
            year: 'eq.' + group.year, month: 'eq.' + group.month, period_data_revision: 'eq.' + version, order: 'id.asc' });
          if (!alive()) return;
          if (JSON.stringify(imported.map(entryKey).sort()) !== JSON.stringify(group.rows.map(entryKey).sort())) {
            throw Error('Kỳ đã ghi nhưng đối chiếu từng dòng không khớp. Hãy dừng chuyển các kỳ khác.');
          }
          await refresh();
          if (alive()) notice('Đã chuyển và đối chiếu ' + imported.length + ' dòng · ' + hours(group.total) + ' giờ.');
        });
      };
    });
  };
}
