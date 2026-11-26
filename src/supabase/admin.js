import { option, projectOptions, table } from './ui.mjs';

export function renderAdmin(state) {
  const projects = projectOptions(state.projects);
  const profileName = id => state.profiles.find(profile => profile.id === id)?.full_name || id;
  const actions = { profile_review: 'Quản lý tài khoản', user_invitation_changed: 'Cập nhật đăng ký trước', user_invitation_accepted: 'Kích hoạt đăng ký trước', project_saved: 'Lưu dự án',
    membership_changed: 'Phân công', period_calendar_saved: 'Lưu lịch tháng', period_limits_saved: 'Lưu giới hạn theo ngày', project_admin_changed: 'Cấp hoặc thu hồi quản trị dự án', period_changed: 'Đổi trạng thái kỳ',
    entries_submitted: 'Nhập OT', entries_replaced: 'Thay thế OT' };
  return `<section class="account-card">
    <h2>Dự án và nhật ký</h2>
    <details><summary>Dự án</summary>
      <form id="admin-project">
        <div class="account-grid">
          <label>Dự án<select name="project">${option('', 'Tạo dự án')}${projects}</select></label>
          <label>Mã dự án<input name="code" required maxlength="32" pattern="[A-Za-z0-9_\\-]{1,32}"></label>
          <label>Tên dự án<input name="name" required maxlength="200"></label>
          <label>Trạng thái<select name="active"><option value="true">Hoạt động</option><option value="false">Ngừng hoạt động</option></select></label>
        </div>
        <label>Mô tả<textarea name="description" maxlength="2000"></textarea></label>
        <button class="primary">Lưu dự án</button>
      </form>
    </details>
    ${state.calendars === null ? renderPeriodAdmin(state, state.projects) : ''}
    <details><summary>Nhật ký quản trị</summary>${table(['Thời điểm', 'Người thực hiện', 'Thao tác', 'Chi tiết'],
      state.audit.slice(0, 100).map(event => [
        new Date(event.occurred_at).toLocaleString('vi-VN'), profileName(event.actor_id), actions[event.action] || event.action,
        JSON.stringify(event.detail)
      ]))}${state.audit.length > 100 ? '<p>Xem toàn bộ nhật ký trong bản sao lưu.</p>' : ''}</details>
  </section>`;
}

export function renderProjectPermissions(state) {
  const projects = projectOptions(state.projects);
  const assignable = state.profiles.filter(profile => profile.employee_code)
    .map(profile => option(profile.id, profile.employee_code + ' · ' + profile.full_name)).join('');
  const profileName = id => state.profiles.find(profile => profile.id === id)?.full_name || id;
  const projectName = id => state.projects.find(project => project.id === id)?.code || id;
  return `<section class="account-card">
    <h2>Phân quyền quản trị dự án</h2>
      ${state.projectAdmins === null ? '<p>Áp dụng migration quản trị dự án trong Supabase để dùng chức năng này.</p>' : `
        <p class="account-muted">Duyệt tài khoản trước khi cấp quyền. Người được cấp quyền chọn Quản trị dự án sau khi đăng nhập để tự sửa lịch và mở hoặc khóa kỳ.</p>
        ${table(['Dự án', 'Cán bộ', 'Quyền'], state.projectAdmins.map(grant => [
          projectName(grant.project_id), profileName(grant.user_id), grant.active ? 'Quản trị dự án' : 'Đã thu hồi']))}
        <form id="admin-project-role">
          <div class="account-grid">
            <label>Dự án<select name="project" required><option value="">Chọn dự án</option>${projects}</select></label>
            <label>Tài khoản<select name="user" required><option value="">Chọn tài khoản</option>${assignable}</select></label>
            <label>Quyền<select name="active"><option value="true">Cấp quyền</option><option value="false">Thu hồi quyền</option></select></label>
          </div>
          <button class="primary">Lưu quyền quản trị dự án</button>
        </form>`}
  </section>`;
}

export function renderPeriodAdmin(state, managedProjects) {
  const codes = new Map(managedProjects.map(project => [project.id, project.code]));
  const projects = projectOptions(managedProjects);
  const periodRows = state.periods.filter(period => codes.has(period.project_id)).map(period => [
    codes.get(period.project_id), period.month + '/' + period.year, period.is_open ? 'Mở' : 'Khóa', period.data_revision
  ]);
  return `
    <details><summary>Mở và khóa kỳ nhập OT</summary>
      <p class="account-muted">Kỳ chưa được cấu hình mặc định khóa.</p>
      ${table(['Dự án', 'Kỳ', 'Trạng thái', 'Phiên bản dữ liệu'], periodRows)}
      <form id="admin-period">
        <div class="account-grid">
          <label>Dự án<select name="project" required><option value="">Chọn dự án</option>${projects}</select></label>
          <label>Năm<input type="number" name="year" min="2000" max="2100" value="${state.year}" required></label>
          <label>Tháng<input type="number" name="month" min="1" max="12" value="${state.month}" required></label>
          <label>Trạng thái<select name="active"><option value="true">Mở kỳ</option><option value="false">Khóa kỳ</option></select></label>
        </div>
        <button class="primary">Lưu trạng thái kỳ</button>
      </form>
    </details>`;
}

export function bindAdmin(root, state, submit) {
  const projectForm = root.querySelector('#admin-project');
  projectForm.elements.project.onchange = () => {
    const item = state.projects.find(project => project.id === projectForm.elements.project.value);
    for (const name of ['code', 'name', 'description']) projectForm.elements[name].value = item?.[name] ?? '';
    projectForm.elements.active.value = String(!item || item.status === 'active');
  };
  submit('#admin-project', 'ot_save_project', fields => ({
    p_project: fields.project || null, p_code: fields.code, p_name: fields.name,
    p_description: fields.description, p_active: fields.active === 'true'
  }), 'Đã lưu dự án.');
  if (state.projectAdmins !== null) {
    submit('#admin-project-role', 'ot_set_project_admin', fields => ({
      p_project: fields.project, p_user: fields.user, p_active: fields.active === 'true'
    }), 'Đã cập nhật quyền quản trị dự án.');
  }
}

export function bindPeriodAdmin(submit, findPeriod) {
  submit('#admin-period', 'ot_set_period', fields => ({
    p_project: fields.project, p_year: Number(fields.year), p_month: Number(fields.month),
    p_open: fields.active === 'true', p_expected_revision: findPeriod(fields.project, +fields.year, +fields.month)?.revision ?? 0
  }), 'Đã lưu trạng thái kỳ.');
}
