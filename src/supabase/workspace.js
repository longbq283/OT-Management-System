import { bindAdmin, renderAdmin } from './admin.js';
import { bindMigration } from './migration.js';
import { fromDatabase, periodKey } from './records.mjs';
import { exportCsv, exportXlsx, getReport, renderReport } from './report.js';
import { bindUpload, renderUpload } from './upload.js';
import { download } from './ui.mjs';

export function mountWorkspace(root, { api, profile, notice, expire }) {
  const admin = profile.role === 'admin';
  const today = new Date();
  const state = { year: today.getFullYear(), month: today.getMonth() + 1,
    project: 'all', reportMode: 'monthly', query: '' };
  const uploads = new AbortController();
  let closed = false;
  let busy = false;
  const alive = () => !closed && api.userId === profile.id;
  const findPeriod = (project, year, month) => state.periodIndex.get(periodKey(project, year, month));

  async function action(run) {
    if (busy || !alive()) return;
    busy = true;
    notice();
    const buttons = [...root.querySelectorAll('button')].filter(button => !button.disabled);
    buttons.forEach(button => { button.disabled = true; });
    try {
      await run();
    } catch (error) {
      if (alive()) {
        if (error.status === 401) expire(error);
        else notice(error.message, true);
      }
    } finally {
      busy = false;
      buttons.forEach(button => { button.disabled = false; });
    }
  }

  function render() {
    const report = getReport(state);
    const open = new Set([...root.querySelectorAll('details[open] > summary')].map(summary => summary.textContent));
    root.innerHTML = `<div class="account-actions"><button type="button" id="refresh-ot">Tải lại dữ liệu</button></div>
      ${renderReport(state, report)}${renderUpload(state, profile)}${admin ? renderAdmin(state) : ''}
      <section class="account-card"><h2>Sao lưu dữ liệu</h2>
        <p>Bản JSON chứa dữ liệu trong phạm vi tài khoản hiện tại. Lưu ở nơi được phép lưu trữ dữ liệu OT.</p>
        <button type="button" id="export-backup">Tải JSON sao lưu</button>
        ${admin ? `<details><summary>Chuyển dữ liệu cũ</summary>
          <p>Chọn bản sao từ IndexedDB hoặc JSON dùng chung đã tải riêng. Kiểm tra mã trùng, phân công và tổng giờ trước khi chuyển.</p>
          <form id="legacy-migration">
            <label>JSON sao lưu cũ<input type="file" name="file" accept=".json,application/json" required></label>
            <button class="primary">Kiểm tra bản sao và đối chiếu</button>
          </form><div id="migration-preview"></div>
        </details>` : ''}
      </section>`;
    for (const summary of root.querySelectorAll('details > summary')) {
      if (open.has(summary.textContent)) summary.parentElement.open = true;
    }

    const on = (selector, event, handler) => root.querySelector(selector).addEventListener(event, handler);
    on('#refresh-ot', 'click', () => action(async () => {
      await refresh();
      if (alive()) notice('Đã tải dữ liệu mới nhất.');
    }));
    function bindReport() {
      on('#report-xlsx', 'click', () => action(() => exportXlsx(state, alive)));
      on('#report-csv', 'click', () => action(async () => exportCsv(getReport(state))));
      root.querySelector('#report-form').onsubmit = filterReport;
    }
    function filterReport(event) {
      event.preventDefault();
      if (busy) return;
      const fields = Object.fromEntries(new FormData(event.currentTarget));
      Object.assign(state, { year: Number(fields.year), month: Number(fields.month),
        project: fields.project, reportMode: fields.mode, query: fields.query });
      const current = event.currentTarget.closest('section');
      const next = document.createElement('template');
      next.innerHTML = renderReport(state, getReport(state)).trim();
      current.replaceWith(next.content);
      bindReport();
    }
    bindReport();

    on('#export-backup', 'click', () => action(async () => {
      const snapshot = { format: 'ot-management-supabase-export', schemaVersion: 1, exportedAt: new Date().toISOString(),
        projects: state.projects, entries: state.rawEntries, periods: state.periods,
        ...(admin && { profiles: state.profiles, memberships: state.memberships, audit: state.audit }) };
      download('ot-supabase-backup.json', JSON.stringify(snapshot, null, 2), 'application/json');
    }));
    const options = { action, api, alive, findPeriod, refresh, notice, uploadSignal: uploads.signal };
    bindUpload(root, state, profile, options);
    if (admin) {
      const submit = (selector, rpc, payload, message) => on(selector, 'submit', event => {
        event.preventDefault();
        const fields = Object.fromEntries(new FormData(event.currentTarget));
        action(async () => {
          await api.rpc(rpc, payload(fields));
          if (!alive()) return;
          await refresh();
          if (alive()) notice(message);
        });
      });
      bindAdmin(root, state, submit, findPeriod);
      bindMigration(root, state, options);
    }
  }

  async function refresh() {
    const [own] = await api.list('ot_profiles', { select: 'id,role,status,employee_code', id: 'eq.' + profile.id });
    if (!alive()) return;
    if (own?.status !== 'active' || own.role !== profile.role || own.employee_code !== profile.employee_code) {
      expire(Error('Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.'));
      return;
    }
    const [projects, periods, entries, profiles, memberships, audit] = await Promise.all([
      api.list('ot_projects', { select: 'id,code,name,description,status', order: 'code.asc,id.asc' }),
      api.list('ot_periods', { select: 'project_id,year,month,is_open,revision,data_revision', order: 'project_id.asc,year.asc,month.asc' }),
      api.list('ot_entries', { select: '*', order: 'id.desc' }),
      admin ? api.list('ot_profiles', { select: 'id,email,full_name,requested_employee_code,employee_code,role,status', order: 'id.asc' }) : [],
      admin ? api.list('ot_project_members', { select: 'project_id,user_id,active', order: 'project_id.asc,user_id.asc' }) : [],
      admin ? api.list('ot_audit_events', { select: '*', order: 'id.desc' }) : []
    ]);
    if (!alive()) return;
    if (!state.entries) {
      const latest = entries.find(row => row.active);
      if (latest) Object.assign(state, { year: latest.year, month: latest.month });
    }
    if (!projects.some(project => project.id === state.project)) state.project = 'all';
    Object.assign(state, { projects, periods, entries: entries.map(fromDatabase), rawEntries: entries, profiles, memberships, audit,
      periodIndex: new Map(periods.map(period => [periodKey(period.project_id, period.year, period.month), period])) });
    render();
  }

  root.innerHTML = '<section class="account-card"><p>Đang tải dữ liệu OT…</p><button type="button" id="retry-ot">Tải lại dữ liệu</button></section>';
  root.querySelector('#retry-ot').onclick = () => action(refresh);
  return {
    load: () => action(refresh),
    close() {
      closed = true;
      uploads.abort();
      root.replaceChildren();
    }
  };
}
