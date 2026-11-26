import { bindAdmin, bindPeriodAdmin, renderAdmin, renderPeriodAdmin } from './admin.js?v=6';
import { renderCalendar, renderCalendarPeriod } from './calendar.js?v=5';
import { bindMigration } from './migration.js?v=4';
import { fromDatabase, periodKey } from './records.mjs';
import { exportCsv, exportXlsx, getReport, renderReport } from './report.js';
import { bindUpload, renderUpload } from './upload.js?v=6';
import { download } from './ui.mjs';

const roleNames = { system: 'Quản trị hệ thống', project: 'Quản trị dự án', member: 'Thành viên' };
const roleActions = { system: 'Quản lý hệ thống', project: 'Cấu hình lịch và kỳ của dự án', member: 'Nhập giờ OT của tôi' };
const roleRoutes = new Map([['#nhap-ot', 'member'], ['#cau-hinh-du-an', 'project']]);
const optionalTable = promise => Promise.resolve(promise).catch(error => {
  if (error.status === 404 && error.code === 'PGRST205') return null;
  throw error;
});

export function mountWorkspace(root, { api, profile, notice, expire }) {
  const today = new Date();
  const state = { year: today.getFullYear(), month: today.getMonth() + 1,
    project: 'all', reportMode: 'monthly', query: '', role: null,
    calendarYear: today.getFullYear(), calendarMonth: today.getMonth() + 1 };
  const uploads = new AbortController();
  let closed = false;
  let busy = false;
  let requestedRole = roleRoutes.get(location.hash);
  const alive = () => !closed && api.userId === profile.id;
  const findPeriod = (project, year, month) => state.periodIndex.get(periodKey(project, year, month));
  const findCalendar = (project, year, month) => state.calendarIndex.get(periodKey(project, year, month))?.days;
  const on = (selector, event, handler) => root.querySelector(selector).addEventListener(event, handler);

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

  function roleNavigation() {
    return `<nav class="account-actions" aria-label="Vai trò làm việc">${state.roles.map(role =>
      `<button type="button" data-role="${role}" aria-current="${state.role === role}">${roleNames[role]}</button>`).join('')}
      <button type="button" id="refresh-ot">Tải lại dữ liệu</button></nav>`;
  }

  function bindNavigation() {
    for (const button of root.querySelectorAll('[data-role]')) {
      button.onclick = () => action(async () => {
        const next = button.dataset.role;
        if (!state.roles.includes(next) || state.role === next) return;
        // Replace the previous workspace immediately, including any drafts and private report markup.
        root.innerHTML = '<p>Đang mở giao diện…</p>';
        Object.assign(state, { role: next, pane: null, project: 'all', query: '', reportMode: 'monthly', calendarProject: null, manualScope: null });
        await refresh();
      });
    }
    on('#refresh-ot', 'click', () => action(async () => {
      await refresh();
      if (alive()) notice('Đã tải dữ liệu mới nhất.');
    }));
  }

  function render() {
    const central = state.role === 'system';
    const member = state.role === 'member';
    const canManage = state.role === 'project' || central;
    const open = new Set([...root.querySelectorAll('details[open] > summary')].map(summary => summary.textContent));
    const calendar = canManage && state.projects.length && state.calendars !== null;
    const upload = central || (member && state.projects.length);
    if (!state.role) {
      root.innerHTML = `<section class="account-card"><h2>Chọn vai trò làm việc</h2>
        <div class="workspace-role-options">${state.roles.map(role => `<button type="button" data-role="${role}">
          <strong>${roleNames[role]}</strong><span>${roleActions[role]}</span></button>`).join('')}</div>
        <button type="button" id="refresh-ot">Tải lại quyền</button>
      </section>`;
      bindNavigation();
      return;
    }
    const panes = [
      ...(canManage ? [['calendar', 'Lịch & kỳ nhập', calendar ? '<div id="role-calendar"></div>' :
        `<section class="account-card"><h2>Lịch và kỳ nhập OT</h2><p>${state.calendars === null
          ? 'Cần áp dụng migration lịch làm việc trong Supabase.'
          : 'Chưa có dự án để cấu hình lịch.'}</p>
          ${state.calendars === null && !central ? renderPeriodAdmin(state, state.projects) : ''}</section>`]] : []),
      ...(member ? [['entry', 'Nhập OT', upload ? renderUpload(state, profile)
        : '<section class="account-card"><h2>Nhập OT cá nhân</h2><p>Bạn chưa có dự án được phân công. Quản trị hệ thống cần thêm bạn vào danh sách thành viên của dự án.</p></section>']] : []),
      ['report', 'Báo cáo', renderReport(state, getReport(state))],
      ...(central ? [['management', 'Quản lý', renderAdmin(state)],
        ['import', 'Nhập Excel', renderUpload(state, profile)]] : []),
      ['backup', 'Sao lưu', `<section class="account-card"><h2>Sao lưu dữ liệu</h2>
        <p>Bản JSON chứa dữ liệu trong phạm vi vai trò đang sử dụng.</p>
        <button type="button" id="export-backup">Tải JSON sao lưu</button>
        ${central ? `<details><summary>Chuyển dữ liệu cũ</summary>
          <p>Chọn bản sao từ IndexedDB hoặc JSON dùng chung đã tải riêng.</p>
          <form id="legacy-migration">
            <label>JSON sao lưu cũ<input type="file" name="file" accept=".json,application/json" required></label>
            <button class="primary">Kiểm tra bản sao và đối chiếu</button>
          </form><div id="migration-preview"></div>
        </details>` : ''}
      </section>`]
    ];
    if (!panes.some(([id]) => id === state.pane)) state.pane = panes[0][0];
    root.innerHTML = roleNavigation() + `<nav class="workspace-panes" aria-label="Chức năng">
      ${panes.map(([id, label]) => `<button type="button" data-pane="${id}" aria-controls="pane-${id}"
        aria-current="${state.pane === id ? 'page' : 'false'}">${label}</button>`).join('')}
    </nav>` + panes.map(([id, , content]) =>
      `<div id="pane-${id}" data-workspace-pane="${id}" ${state.pane === id ? '' : 'hidden'}>${content}</div>`).join('');
    bindNavigation();
    for (const button of root.querySelectorAll('[data-pane]')) {
      button.onclick = () => {
        if (busy) return;
        state.pane = button.dataset.pane;
        notice();
        for (const item of root.querySelectorAll('[data-pane]')) {
          const current = item.dataset.pane === state.pane;
          item.setAttribute('aria-current', current ? 'page' : 'false');
          root.querySelector('#pane-' + item.dataset.pane).hidden = !current;
        }
      };
    }
    for (const summary of root.querySelectorAll('details > summary')) {
      if (open.has(summary.textContent)) summary.parentElement.open = true;
    }

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
        projects: state.projects, entries: state.rawEntries, periods: state.periods, calendars: state.calendars,
        ...(central && { profiles: state.profiles, memberships: state.memberships, audit: state.audit, projectAdmins: state.projectAdmins }) };
      download('ot-supabase-backup.json', JSON.stringify(snapshot, null, 2), 'application/json');
    }));
    const options = { action, api, alive, findPeriod, findCalendar, refresh, notice, uploadSignal: uploads.signal };
    if (upload) bindUpload(root, state, profile, options);
    if (canManage) {
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
      if (state.calendars === null) bindPeriodAdmin(submit, findPeriod);
      if (central) {
        bindAdmin(root, state, submit);
        bindMigration(root, state, options);
      }
    }
    if (calendar) renderCalendarEditor();
  }

  function renderCalendarEditor() {
    root.querySelector('#role-calendar').innerHTML = renderCalendar(state);
    const scope = root.querySelector('#calendar-scope');
    scope.onsubmit = event => event.preventDefault();
    function selectCalendarPeriod() {
      if (busy || !scope.checkValidity()) return;
      const fields = new FormData(scope);
      const project = fields.get('project');
      const year = Number(fields.get('year'));
      const month = Number(fields.get('month'));
      if (state.calendarProject === project && state.calendarYear === year && state.calendarMonth === month) return;
      Object.assign(state, { calendarProject: project, calendarYear: year, calendarMonth: month });
      renderCalendarContent();
    }
    scope.onchange = selectCalendarPeriod;
    scope.elements.year.oninput = selectCalendarPeriod;
    renderCalendarContent();
  }

  function renderCalendarContent() {
    const content = root.querySelector('#calendar-content');
    const showYear = Boolean(content.querySelector('details[open]'));
    content.innerHTML = renderCalendarPeriod(state, findPeriod, findCalendar);
    content.querySelector('details').open = showYear;
    const scope = root.querySelector('#calendar-scope');
    const periodButton = root.querySelector('#calendar-period');
    if (periodButton) periodButton.onclick = () => {
      if (!scope.reportValidity()) return;
      action(async () => {
        const { calendarProject: project, calendarYear: year, calendarMonth: month } = state;
        const period = findPeriod(project, year, month);
        await api.rpc('ot_set_period', { p_project: project, p_year: year, p_month: month,
          p_open: !period?.is_open, p_expected_revision: period?.revision ?? 0 });
        if (!alive()) return;
        await refresh();
        if (alive()) notice('Đã lưu trạng thái kỳ.');
      });
    };
    for (const select of root.querySelectorAll('#calendar-days select:not(:disabled)')) {
      select.onchange = () => {
        const index = select.closest('td').cellIndex;
        select.closest('td').dataset.dayType = select.value;
        select.closest('table').tHead.rows[0].cells[index].dataset.dayType = select.value;
        root.querySelector('#calendar-draft').hidden = false;
        if (periodButton) periodButton.disabled = true;
      };
    }
    on('#calendar-days', 'submit', event => {
      event.preventDefault();
      if (!scope.reportValidity()) return;
      const days = new FormData(event.currentTarget).getAll('day');
      if (!days.length) return;
      action(async () => {
        const { calendarProject: project, calendarYear: year, calendarMonth: month } = state;
        await api.rpc('ot_set_calendar', {
          p_project: project, p_year: year, p_month: month, p_days: days,
          p_expected_revision: findPeriod(project, year, month)?.revision ?? 0
        });
        if (!alive()) return;
        await refresh();
        if (alive()) notice('Đã lưu lịch làm việc tháng ' + month + '/' + year + '.');
      });
    });
  }

  async function refresh() {
    if (!root.querySelector('button')) {
      root.innerHTML = '<p>Đang tải dữ liệu OT…</p><button type="button" id="retry-ot">Tải lại dữ liệu</button>';
      on('#retry-ot', 'click', () => action(refresh));
    }
    const [own] = await api.list('ot_profiles', { select: 'id,role,status,employee_code', id: 'eq.' + profile.id });
    if (!alive()) return;
    if (own?.status !== 'active' || own.role !== profile.role || own.employee_code !== profile.employee_code) {
      expire(Error('Quyền tài khoản đã thay đổi. Vui lòng đăng nhập lại.'));
      return;
    }
    const ownGrant = { user_id: 'eq.' + profile.id, active: 'eq.true', select: 'project_id', order: 'project_id.asc' };
    const [membership, grants] = await Promise.all([
      api.list('ot_project_members', ownGrant), optionalTable(api.list('ot_project_admins', ownGrant))
    ]);
    if (!alive()) return;
    state.roles = [
      ...(own.role === 'admin' ? ['system'] : []),
      ...(grants?.length ? ['project'] : []),
      ...(own.employee_code ? ['member'] : [])
    ];
    if (requestedRole) {
      if (state.roles.includes(requestedRole)) state.role = requestedRole;
      else notice('Tài khoản chưa có quyền ' + roleNames[requestedRole] + '.', true);
      requestedRole = null;
    }
    if (!state.roles.includes(state.role)) state.role = state.roles.length === 1 ? state.roles[0] : null;
    if (!state.role) {
      render();
      return;
    }

    const central = state.role === 'system';
    const member = state.role === 'member';
    const scope = (member ? membership : grants ?? []).map(grant => grant.project_id);
    const filter = central ? {} : { project_id: 'in.(' + scope.join(',') + ')' };
    const scoped = (table, query) => central || scope.length ? api.list(table, query) : [];
    const [projects, periods, entries, profiles, memberships, audit, projectAdmins, calendars] = await Promise.all([
      scoped('ot_projects', { select: 'id,code,name,description,status', order: 'code.asc,id.asc',
        ...(!central && { id: filter.project_id }) }),
      scoped('ot_periods', { select: 'project_id,year,month,is_open,revision,data_revision', order: 'project_id.asc,year.asc,month.asc', ...filter }),
      scoped('ot_entries', { select: '*', order: 'id.desc', ...filter, ...(member && { user_id: ownGrant.user_id }) }),
      central ? api.list('ot_profiles', { select: 'id,email,full_name,requested_employee_code,employee_code,role,status', order: 'id.asc' }) : [],
      central ? api.list('ot_project_members', { select: 'project_id,user_id,active', order: 'project_id.asc,user_id.asc' }) : [],
      central ? api.list('ot_audit_events', { select: '*', order: 'id.desc' }) : [],
      central && grants !== null ? api.list('ot_project_admins', { select: 'project_id,user_id,active', order: 'project_id.asc,user_id.asc' }) : null,
      optionalTable(scoped('ot_period_calendars', { select: 'project_id,year,month,days', order: 'project_id.asc,year.asc,month.asc', ...filter }))
    ]);
    if (!alive()) return;
    if (!state.entries) {
      const latest = entries.find(row => row.active);
      if (latest) Object.assign(state, { year: latest.year, month: latest.month });
    }
    if (!projects.some(project => project.id === state.project)) state.project = 'all';
    if (!projects.some(project => project.id === state.calendarProject)) state.calendarProject = projects[0]?.id;
    const byPeriod = items => new Map(items.map(item => [periodKey(item.project_id, item.year, item.month), item]));
    const calendarIndex = byPeriod(calendars ?? []);
    if (member && !state.manualScope) {
      const active = projects.filter(project => project.status === 'active');
      const activeIds = new Set(active.map(project => project.id));
      const openPeriods = periods.filter(period => period.is_open && period.year >= 2026 && activeIds.has(period.project_id) &&
        calendarIndex.has(periodKey(period.project_id, period.year, period.month)));
      const current = openPeriods.find(period => period.year === today.getFullYear() && period.month === today.getMonth() + 1);
      const selected = current ?? openPeriods.sort((a, b) => b.year - a.year || b.month - a.month)[0];
      if (selected) state.manualScope = { project: selected.project_id, year: selected.year, month: selected.month };
      else if (active.length === 1) state.manualScope = { project: active[0].id, year: state.year, month: state.month };
    }
    Object.assign(state, { projects, periods, entries: entries.map(fromDatabase), rawEntries: entries, profiles, memberships, audit,
      projectAdmins, calendars, calendarIndex, periodIndex: byPeriod(periods) });
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
