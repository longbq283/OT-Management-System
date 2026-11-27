import { bindMemberPicker, renderMemberPicker } from './member-picker.js';
import { bindUnitPicker, renderUnitPicker } from '../ui/organization-units.mjs';
import { normalizeEmail, normalizeEmployeeCode } from './client.mjs?v=13';
import { esc, option, projectOptions, table } from './ui.mjs';

const labels = { pending: 'Chờ duyệt', active: 'Hoạt động', disabled: 'Đã khóa' };

function renderActivationForm(id) {
  return `<form id="${id}">
    <div class="account-grid">
      <label>Họ tên<input name="fullName" maxlength="200" required></label>
      <label>Mã cán bộ<input name="code" inputmode="numeric" maxlength="8" pattern="[0-9]{1,8}" required></label>
      <label>Email BIDV<input name="email" type="email" maxlength="254" required></label>
    </div>
    <button class="primary">Tạo tài khoản</button>
  </form>`;
}

function bindActivationForm(form, project, { action, api, alive, notice, refresh }) {
  form.onsubmit = event => {
    event.preventDefault();
    const fields = new FormData(form);
    action(async () => {
      const fullName = fields.get('fullName').trim();
      if (!fullName) throw Error('Vui lòng nhập họ tên đầy đủ.');
      await api.inviteUser({
        email: normalizeEmail(fields.get('email')), fullName,
        employeeCode: normalizeEmployeeCode(fields.get('code')), project
      });
      if (!alive()) return;
      form.reset();
      if (refresh) await refresh();
      if (alive()) notice('Đã gửi liên kết kích hoạt đến email BIDV.');
    });
  };
}

export function renderUsers(state) {
  const managed = Boolean(state.approvalAccess);
  const people = state.profiles.filter(profile => profile.role === 'user' && !profile.deleted_at);
  const accounts = people.map(profile => option(profile.id, profile.full_name + ' · ' + profile.email)).join('');
  const assignable = state.profiles.filter(profile => profile.employee_code && !profile.deleted_at)
    .map(profile => option(profile.id, profile.employee_code + ' · ' + profile.full_name)).join('');
  const person = id => state.profiles.find(profile => profile.id === id)?.full_name || id;
  const project = id => state.projects.find(item => item.id === id)?.code || id;
  const updated = state.invitations !== null;
  return `<section class="account-card">
    <h2>Quản lý người dùng</h2>
    ${table(['Họ tên', 'Email BIDV', 'Mã cán bộ', ...(managed ? ['Đơn vị (Ban/TT)'] : []), 'Quyền hệ thống', 'Trạng thái'], state.profiles.map(profile => [
      profile.full_name, profile.email, profile.employee_code || profile.requested_employee_code,
      ...(managed ? [profile.organization_unit || '—'] : []),
      profile.role === 'admin' ? 'Quản trị hệ thống' : 'Người dùng', profile.deleted_at ? 'Đã xóa' : managed && profile.status === 'pending' ? 'Chưa kích hoạt' : labels[profile.status]]))}
    ${managed && people.length ? `<details open><summary>Chỉnh sửa và quản lý tài khoản</summary>
      <form id="admin-account">
        <div class="account-grid">
          <label>Tài khoản<select name="user" required><option value="">Chọn tài khoản</option>${accounts}</select></label>
          <label>Họ tên<input name="fullName" required maxlength="200"></label>
          <label>Mã cán bộ<input name="code" required inputmode="numeric" maxlength="8" pattern="[0-9]{1,8}"></label>
          <label>Email BIDV<input name="email" type="email" readonly></label>
        </div>
        <div id="admin-organization-unit"></div>
        <div class="account-actions">
          <button class="primary" type="submit" disabled>Lưu chỉnh sửa</button>
          <button id="admin-send-reset" type="button" disabled>Gửi mã đặt lại mật khẩu</button>
          <button id="admin-lock-account" type="button" disabled>Tạm khóa tài khoản</button>
          <button id="admin-delete-account" type="button" disabled>Xóa tài khoản</button>
        </div>
      </form></details>` : people.length ? `<details open><summary>Chỉnh sửa và duyệt tài khoản</summary>
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
    </details>` : '<p>Chưa có tài khoản người dùng. Cán bộ có thể tự đăng ký bằng email BIDV.</p>'}
    <details${people.length ? '' : ' open'}><summary>Thêm người dùng</summary>
      ${updated ? `<p>Cán bộ nhận liên kết kích hoạt và tự đặt mật khẩu qua email BIDV.</p>
        ${renderActivationForm('user-invitation')}
        ${state.invitations.length ? table(['Chờ kích hoạt', 'Họ tên', 'Mã cán bộ'], state.invitations.map(item => [item.email, item.full_name, item.employee_code])) : ''}
        ${state.invitations.length ? `<form id="cancel-invitation" class="month-actions">
          <label>Tài khoản chờ kích hoạt cần hủy<select name="email" required>
            <option value="">Chọn email</option>${state.invitations.map(item => option(item.email, item.email)).join('')}
          </select></label>
          <button>Hủy kích hoạt</button>
        </form>` : ''}` : '<p>Chạy tệp 202611260004_user_management.sql trong Supabase SQL Editor, rồi bấm Tải lại dữ liệu.</p>'}
    </details>
    <details><summary>Phân công dự án</summary>
      ${table(['Dự án', 'Cán bộ', 'Phân công'], state.memberships.map(member => [
        project(member.project_id), person(member.user_id), member.active ? 'Đang phân công' : 'Đã gỡ']))}
      <form id="admin-member">
        <div class="account-grid">
          <label>Dự án<select name="project" required><option value="">Chọn dự án</option>${projectOptions(state.projects)}</select></label>
          ${managed ? '' : `<label>Tài khoản<select name="user" required><option value="">Chọn tài khoản</option>${assignable}</select></label>`}
          <label>Thao tác<select name="active"><option value="true">Thêm vào dự án</option><option value="false">Gỡ khỏi dự án</option></select></label>
        </div>
        ${managed ? renderMemberPicker() : ''}
        <button class="primary">Lưu phân công</button>
      </form>
    </details>
  </section>`;
}

function bindAccountEditor(root,state,{ action,api,refresh,alive,notice }) {
  const form = root.querySelector('#admin-account');
  if (!form) return;
  const unit = form.querySelector('#admin-organization-unit');
  const reset = form.querySelector('#admin-send-reset');
  const lock = form.querySelector('#admin-lock-account');
  let selected;
  let unitPicker;
  form.elements.user.onchange = () => {
    selected = state.profiles.find(item => item.id === form.elements.user.value && !item.deleted_at);
    form.elements.fullName.value = selected?.full_name ?? '';
    form.elements.code.value = selected?.employee_code || selected?.requested_employee_code || '';
    form.elements.email.value = selected?.email ?? '';
    for (const button of form.querySelectorAll('button')) button.disabled = !selected;
    reset.disabled = !selected || selected.status === 'disabled';
    lock.disabled = !selected || selected.status === 'pending';
    lock.textContent = selected?.status === 'disabled' ? 'Mở khóa tài khoản' : 'Tạm khóa tài khoản';
    unit.replaceChildren();
    if (selected) {
      unit.innerHTML = renderUnitPicker({id:'account-organization-unit',scope:'admin-units',label:'Đơn vị (Ban/TT)',
        selected:selected.organization_unit ?? '',history:state.profiles.map(item => item.organization_unit)});
      unitPicker = bindUnitPicker(unit.querySelector('select'),{scope:'admin-units'});
    }
  };
  const update = (operation, message) => {
    const user = selected?.id;
    if (!user) return;
    const changes = operation === 'edit' ? { p_name:form.elements.fullName.value.trim(),
      p_code:normalizeEmployeeCode(form.elements.code.value), p_unit:unitPicker.finish() } : { p_name:null,p_code:null,p_unit:null };
    return api.rpc('ot_admin_account',{p_user:user,p_action:operation,...changes}).then(async () => {
      await refresh();
      if (alive()) notice(message);
    });
  };
  form.onsubmit = event => { event.preventDefault(); void action(() => update('edit','Đã lưu hồ sơ tài khoản.')); };
  reset.onclick = () => {
    if (!selected || !window.confirm('Gửi mã đặt lại mật khẩu tới ' + selected.email + '?')) return;
    const email = selected.email;
    void action(async () => {
      await api.sendPasswordReset(email);
      if (alive()) notice('Đã yêu cầu gửi mã đặt lại mật khẩu đến email BIDV.');
    });
  };
  lock.onclick = () => {
    if (!selected) return;
    const unlocking = selected.status === 'disabled';
    if (!window.confirm((unlocking ? 'Mở khóa ' : 'Tạm khóa ') + selected.full_name + '?')) return;
    void action(() => update(unlocking ? 'unlock' : 'lock',unlocking ? 'Đã mở khóa tài khoản.' : 'Đã tạm khóa tài khoản.'));
  };
  form.querySelector('#admin-delete-account').onclick = () => {
    if (selected && window.confirm('Xóa tài khoản ' + selected.full_name + ' và thu hồi quyền dự án? Lịch sử OT sẽ được giữ.')) {
      void action(() => update('delete','Đã xóa tài khoản và thu hồi quyền dự án.'));
    }
  };
}

function bindBulkAssignment(form,state,{ action,api,refresh,alive,notice }) {
  const project = form.elements.project;
  const active = form.elements.active;
  let picker;
  function renderPicker() {
    const members = new Set(state.memberships.filter(item => item.project_id === project.value && item.active).map(item => item.user_id));
    const add = active.value === 'true';
    const people = project.value ? state.profiles.filter(item => item.status === 'active' && item.employee_code &&
      !item.deleted_at && members.has(item.id) !== add).map(item => ({...item,user_id:item.id})) : [];
    picker = bindMemberPicker(form,people);
  }
  project.onchange = active.onchange = renderPicker;
  renderPicker();
  form.onsubmit = event => {
    event.preventDefault();
    const users = picker.values();
    if (!users.length) return notice('Chọn ít nhất một cán bộ.',true);
    void action(async () => {
      await api.rpc('ot_set_members',{p_project:project.value,p_users:users,p_active:active.value === 'true'});
      await refresh();
      if (alive()) notice('Đã cập nhật phân công cho ' + users.length + ' cán bộ.');
    });
  };
}

export function bindUsers(root, state, { submit, action, api, refresh, alive, notice }) {
  bindAccountEditor(root,state,{action,api,refresh,alive,notice});
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
    bindActivationForm(root.querySelector('#user-invitation'), null, { action, api, alive, notice, refresh });
    if (state.invitations.length) submit('#cancel-invitation', 'ot_save_user_invitation', fields => ({
      p_email: normalizeEmail(fields.email), p_full_name: null, p_employee_code: null, p_active: false
    }), 'Đã hủy kích hoạt tài khoản.');
  }
  if (state.approvalAccess) bindBulkAssignment(root.querySelector('#admin-member'),state,{action,api,refresh,alive,notice});
  else submit('#admin-member', 'ot_set_member', fields => ({
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
    let candidates;
    try {
      [rows,candidates] = await Promise.all([api.rpc('ot_list_project_members', { p_project: project }),
        state.approvalAccess ? api.rpc('ot_project_candidates',{p_project:project}) : null]);
    } catch (error) {
      if (!alive() || !roster.isConnected || requested !== version) return;
      if (error.status === 401) expire(error);
      else roster.textContent = error.code === 'PGRST202'
        ? 'Chạy tệp 202611260004_user_management.sql trong Supabase SQL Editor, rồi bấm Tải lại dữ liệu.' : error.message;
      return;
    }
    if (!alive() || !roster.isConnected || requested !== version) return;
    roster.innerHTML = `${table(['Mã cán bộ', 'Họ tên', 'Trạng thái'],
      rows.map(item => [item.employee_code, item.full_name, labels[item.status]]))}
      <form id="team-add" class="month-actions">
        ${candidates ? renderMemberPicker() : '<label>Mã cán bộ đã kích hoạt<input name="code" required maxlength="8" inputmode="numeric" pattern="[0-9]{1,8}"></label>'}
        <button class="primary">Thêm vào dự án</button>
      </form>
      <details>
        <summary>Tạo tài khoản cho dự án này</summary>
        <p>Cán bộ sẽ được thêm vào dự án sau khi kích hoạt qua email BIDV.</p>
        ${renderActivationForm('team-activation')}
      </details>
      ${rows.length ? `<form id="team-remove" class="month-actions">
        <label>Thành viên cần gỡ<select name="user" required><option value="">Chọn thành viên</option>
        ${rows.map(item => option(item.user_id, item.employee_code + ' · ' + item.full_name)).join('')}</select></label>
        <button>Gỡ khỏi dự án</button>
      </form>` : ''}`;
    bindActivationForm(roster.querySelector('#team-activation'), project, { action, api, alive, notice });
    const addForm = roster.querySelector('#team-add');
    const memberPicker = candidates ? bindMemberPicker(addForm,candidates.filter(item => !item.assigned)) : null;
    addForm.onsubmit = event => {
      event.preventDefault();
      const users = memberPicker?.values();
      if (memberPicker && !users.length) return notice('Chọn ít nhất một cán bộ.',true);
      const code = new FormData(addForm).get('code');
      action(async () => {
        if (memberPicker) await api.rpc('ot_set_members',{p_project:project,p_users:users,p_active:true});
        else await api.rpc('ot_set_member_by_code', { p_project: project, p_employee_code: normalizeEmployeeCode(code), p_active: true });
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
