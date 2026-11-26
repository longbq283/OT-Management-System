import { normalizeEmail, normalizeEmployeeCode } from './client.mjs?v=10';
import { esc, option, projectOptions, table } from './ui.mjs';

const labels = { pending: 'Chờ duyệt', active: 'Hoạt động', disabled: 'Đã khóa' };

export function renderUsers(state) {
  const people = state.profiles.filter(profile => profile.role === 'user');
  const accounts = people.map(profile => option(profile.id, profile.full_name + ' · ' + profile.email)).join('');
  const assignable = state.profiles.filter(profile => profile.employee_code)
    .map(profile => option(profile.id, profile.employee_code + ' · ' + profile.full_name)).join('');
  const person = id => state.profiles.find(profile => profile.id === id)?.full_name || id;
  const project = id => state.projects.find(item => item.id === id)?.code || id;
  const updated = state.invitations !== null;
  return `<section class="account-card">
    <h2>Quản lý người dùng</h2>
    ${table(['Họ tên', 'Email BIDV', 'Mã cán bộ', 'Quyền hệ thống', 'Trạng thái'], state.profiles.map(profile => [
      profile.full_name, profile.email, profile.employee_code || profile.requested_employee_code,
      profile.role === 'admin' ? 'Quản trị hệ thống' : 'Người dùng', labels[profile.status]]))}
    ${people.length ? `<details open><summary>Chỉnh sửa và duyệt tài khoản</summary>
      <form id="admin-profile">
        <div class="account-grid">
          <label>Tài khoản<select name="user" required><option value="">Chọn tài khoản</option>${accounts}</select></label>
          <label>Họ tên<input name="fullName" maxlength="200" required ${updated ? '' : 'readonly'}></label>
          <label>Mã cán bộ<input name="code" inputmode="numeric" maxlength="8" pattern="[0-9]{1,8}"></label>
        </div>
        <div class="account-actions">
          <button class="primary" name="active" value="true" disabled>Lưu và kích hoạt</button>
          <button type="button" id="disable-user" disabled>Khóa tài khoản</button>
        </div>
        <label id="disable-confirm" hidden><input type="checkbox" name="confirmDisable"> Xác nhận khóa quyền truy cập của tài khoản này</label>
      </form>
    </details>` : '<p>Chưa có người dùng thường để duyệt. Thêm người dùng bên dưới hoặc để cán bộ tự đăng ký bằng email BIDV.</p>'}
    <details${people.length ? '' : ' open'}><summary>Thêm người dùng</summary>
      ${updated ? `<p>Thêm hồ sơ đăng ký trước. Cán bộ tự đăng ký hoặc đăng nhập trên web OT và xác minh email BIDV để nhận tài khoản.</p>
        ${table(['Email đăng ký trước', 'Họ tên', 'Mã cán bộ'], state.invitations.map(item => [item.email, item.full_name, item.employee_code]))}
        <form id="user-invitation">
          <div class="account-grid">
            <label>Email BIDV<input name="email" type="email" maxlength="254" required></label>
            <label>Họ tên<input name="fullName" maxlength="200" required></label>
            <label>Mã cán bộ<input name="code" inputmode="numeric" maxlength="8" pattern="[0-9]{1,8}" required></label>
          </div>
          <button class="primary">Lưu đăng ký trước</button>
        </form>
        ${state.invitations.length ? `<form id="cancel-invitation" class="month-actions">
          <label>Đăng ký trước cần hủy<select name="email" required>
            <option value="">Chọn email</option>${state.invitations.map(item => option(item.email, item.email)).join('')}
          </select></label>
          <button>Hủy đăng ký trước</button>
        </form>` : ''}` : '<p>Áp dụng migration quản lý người dùng để thêm hồ sơ đăng ký trước.</p>'}
    </details>
    <details><summary>Phân công dự án</summary>
      ${table(['Dự án', 'Cán bộ', 'Phân công'], state.memberships.map(member => [
        project(member.project_id), person(member.user_id), member.active ? 'Đang phân công' : 'Đã gỡ']))}
      <form id="admin-member">
        <div class="account-grid">
          <label>Dự án<select name="project" required><option value="">Chọn dự án</option>${projectOptions(state.projects)}</select></label>
          <label>Tài khoản<select name="user" required><option value="">Chọn tài khoản</option>${assignable}</select></label>
          <label>Thao tác<select name="active"><option value="true">Thêm vào dự án</option><option value="false">Gỡ khỏi dự án</option></select></label>
        </div>
        <button class="primary">Lưu phân công</button>
      </form>
    </details>
  </section>`;
}

export function bindUsers(root, state, { submit, action, api, refresh, alive, notice }) {
  const form = root.querySelector('#admin-profile');
  const updated = state.invitations !== null;
  if (form) {
    const disable = form.querySelector('#disable-user');
    const confirmation = form.querySelector('#disable-confirm');
    form.elements.user.onchange = () => {
      const user = state.profiles.find(profile => profile.id === form.elements.user.value);
      form.elements.fullName.value = user?.full_name ?? '';
      form.elements.code.value = user?.employee_code || user?.requested_employee_code || '';
      form.querySelector('button[type=submit], button[name=active]').disabled = !user;
      disable.disabled = !user || user.status === 'disabled';
      confirmation.hidden = true;
      confirmation.firstElementChild.checked = false;
      disable.textContent = 'Khóa tài khoản';
    };
    const profileRpc = updated ? 'ot_manage_user' : 'ot_review_profile';
    const payload = (active, fields) => ({
      p_user: fields.user, p_active: active, p_employee_code: active ? normalizeEmployeeCode(fields.code) : null,
      ...(updated && { p_full_name: fields.fullName.trim() })
    });
    submit('#admin-profile', profileRpc, fields => payload(true, fields), 'Đã cập nhật duyệt tài khoản.');
    disable.onclick = () => {
      if (confirmation.hidden) {
        confirmation.hidden = false;
        confirmation.firstElementChild.focus();
        disable.textContent = 'Lưu khóa tài khoản';
        return;
      }
      if (!confirmation.firstElementChild.checked) {
        notice('Tích xác nhận trước khi khóa tài khoản.', true);
        return;
      }
      const fields = Object.fromEntries(new FormData(form));
      action(async () => {
        await api.rpc(profileRpc, payload(false, fields));
        if (!alive()) return;
        await refresh();
        if (alive()) notice('Đã khóa quyền truy cập của tài khoản.');
      });
    };
  }
  if (updated) {
    submit('#user-invitation', 'ot_save_user_invitation', fields => ({
      p_email: normalizeEmail(fields.email), p_full_name: fields.fullName.trim(),
      p_employee_code: normalizeEmployeeCode(fields.code), p_active: true
    }), 'Đã lưu hồ sơ đăng ký trước.');
    if (state.invitations.length) submit('#cancel-invitation', 'ot_save_user_invitation', fields => ({
      p_email: normalizeEmail(fields.email), p_full_name: null, p_employee_code: null, p_active: false
    }), 'Đã hủy hồ sơ đăng ký trước.');
  }
  submit('#admin-member', 'ot_set_member', fields => ({
    p_user: fields.user, p_project: fields.project, p_active: fields.active === 'true'
  }), 'Đã lưu phân công.');
}

export function renderProjectMembers(state) {
  return `<section class="account-card">
    <h2>Thành viên dự án</h2>
    <label>Dự án<select id="team-project">${projectOptions(state.projects, state.teamProject)}</select></label>
    <div id="team-roster"></div>
  </section>`;
}

export function bindProjectMembers(root, state, { action, api, alive, notice, expire }) {
  const picker = root.querySelector('#team-project');
  const roster = root.querySelector('#team-roster');
  let requested = 0;
  async function load() {
    const project = picker.value;
    if (!project) return;
    const version = ++requested;
    state.teamProject = project;
    roster.textContent = 'Đang tải thành viên…';
    let rows;
    try {
      rows = await api.rpc('ot_list_project_members', { p_project: project });
    } catch (error) {
      if (!alive() || !roster.isConnected || requested !== version) return;
      if (error.status === 401) expire(error);
      else roster.textContent = error.code === 'PGRST202'
        ? 'Cần áp dụng migration quản lý người dùng trong Supabase.' : error.message;
      return;
    }
    if (!alive() || !roster.isConnected || requested !== version) return;
    roster.innerHTML = `${table(['Mã cán bộ', 'Họ tên', 'Trạng thái'],
      rows.map(item => [item.employee_code, item.full_name, labels[item.status]]))}
      <form id="team-add" class="month-actions">
        <label>Mã cán bộ đã kích hoạt<input name="code" required maxlength="8" inputmode="numeric" pattern="[0-9]{1,8}"></label>
        <button class="primary">Thêm vào dự án</button>
      </form>
      ${rows.length ? `<form id="team-remove" class="month-actions">
        <label>Thành viên cần gỡ<select name="user" required><option value="">Chọn thành viên</option>
        ${rows.map(item => option(item.user_id, item.employee_code + ' · ' + item.full_name)).join('')}</select></label>
        <button>Gỡ khỏi dự án</button>
      </form>` : ''}`;
    roster.querySelector('#team-add').onsubmit = event => {
      event.preventDefault();
      const code = new FormData(event.currentTarget).get('code');
      action(async () => {
        await api.rpc('ot_set_member_by_code', { p_project: project, p_employee_code: normalizeEmployeeCode(code), p_active: true });
        if (!alive()) return;
        await load();
        if (alive()) notice('Đã thêm thành viên vào dự án.');
      });
    };
    const remove = roster.querySelector('#team-remove');
    if (remove) remove.onsubmit = event => {
      event.preventDefault();
      const user = new FormData(event.currentTarget).get('user');
      action(async () => {
        await api.rpc('ot_set_member', { p_project: project, p_user: user, p_active: false });
        if (!alive()) return;
        await load();
        if (alive()) notice('Đã gỡ thành viên khỏi dự án.');
      });
    };
  }
  picker.onchange = () => { void load(); };
  return load;
}
