import { createSupabaseClient, normalizeEmail } from '../../src/supabase/client.mjs';
import { mountWorkspace } from '../../src/supabase/workspace.js';

const api = createSupabaseClient();
const auth = document.querySelector('#auth');
const profilePanel = document.querySelector('#profile');
const workspace = document.querySelector('#ot-workspace');
const logout = document.querySelector('#logout');
const authForms = [...auth.querySelectorAll('form')];
const statuses = { pending: 'Chờ quản trị viên duyệt', active: 'Đang hoạt động', disabled: 'Đã vô hiệu hóa' };
let closeWorkspace;
let busy = false;

function notice(message = '', isError = false) {
  for (const id of ['status', 'error']) {
    const box = document.getElementById(id);
    box.textContent = id === (isError ? 'error' : 'status') ? message : '';
    box.hidden = !box.textContent;
  }
}

function showForm(id, email) {
  for (const form of authForms) {
    form.reset();
    form.hidden = form.id !== id;
    if (!form.hidden && email) form.elements.email.value = email;
  }
  for (const button of auth.querySelectorAll('[data-auth]')) {
    button.setAttribute('aria-current', String(button.dataset.auth === id));
  }
}

function clearAccount() {
  closeWorkspace?.();
  closeWorkspace = undefined;
  workspace.replaceChildren();
  workspace.hidden = true;
  profilePanel.replaceChildren();
  profilePanel.hidden = true;
  auth.hidden = false;
  logout.hidden = true;
  showForm('login');
}

function expire(error) {
  api.forget();
  clearAccount();
  notice(error.message, true);
}

async function showProfile() {
  auth.hidden = true;
  logout.hidden = false;
  for (const form of authForms) form.reset();
  profilePanel.hidden = false;
  const ownId = api.userId;
  const [profile] = await api.list('ot_profiles', {
    select: 'id,email,full_name,requested_employee_code,employee_code,role,status',
    id: 'eq.' + ownId
  });
  const heading = document.createElement('h1');
  heading.textContent = 'Hồ sơ của tôi';
  const text = document.createElement('p');
  profilePanel.replaceChildren(heading, text);
  if (!profile || profile.id !== ownId) {
    text.textContent = 'Chưa tìm thấy hồ sơ. Hãy thử tải lại hoặc báo quản trị viên kiểm tra trigger.';
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Tải lại hồ sơ';
    reload.addEventListener('click', () => run(showProfile));
    profilePanel.append(reload);
    return;
  }
  text.textContent = [profile.full_name, profile.email, profile.employee_code || profile.requested_employee_code,
    profile.role === 'admin' ? 'Quản trị viên' : 'Người dùng', statuses[profile.status]].filter(Boolean).join(' · ');
  if (profile.status === 'active') {
    const mounted = mountWorkspace(workspace, { api, profile, notice, expire });
    closeWorkspace = mounted.close;
    workspace.hidden = false;
    await mounted.load();
  } else {
    const reload = document.createElement('button');
    reload.type = 'button';
    reload.textContent = 'Tải lại hồ sơ';
    reload.addEventListener('click', () => run(showProfile));
    profilePanel.append(reload);
  }
}

async function run(action) {
  if (busy) return;
  busy = true;
  notice();
  const buttons = [...document.querySelectorAll('#auth button, #profile button, #logout')];
  buttons.forEach(button => { button.disabled = true; });
  try {
    await action();
  } catch (error) {
    if (api.userId && error.status === 401) expire(error);
    else {
      if (api.userId && !profilePanel.childElementCount) {
        profilePanel.textContent = 'Chưa tải được hồ sơ. Hãy đăng xuất và đăng nhập lại.';
      }
      notice(error.message, true);
    }
  } finally {
    busy = false;
    buttons.forEach(button => { button.disabled = false; });
    logout.disabled = false;
  }
}

for (const button of auth.querySelectorAll('[data-auth]')) {
  button.addEventListener('click', () => {
    const email = authForms.find(form => !form.hidden)?.elements.email.value;
    showForm(button.dataset.auth, email);
    notice();
  });
}

for (const form of authForms) {
  form.addEventListener('submit', event => {
    event.preventDefault();
    if (busy) return;
    const fields = Object.fromEntries(new FormData(form));
    // Clear credentials from the DOM even if a request fails.
    if (form.elements.password) form.elements.password.value = '';
    if (form.elements.otp) form.elements.otp.value = '';
    run(async () => {
      const email = normalizeEmail(fields.email);
      if (form.id === 'register') {
        if (!fields.fullName.trim()) throw Error('Vui lòng nhập họ tên đầy đủ.');
        await api.signUp({ ...fields, email });
        showForm('verify', email);
        notice('Nếu yêu cầu hợp lệ, mã OTP đã được gửi đến email BIDV.');
      } else {
        if (form.id === 'verify') await api.verify(email, fields.otp);
        else await api.signIn(email, fields.password);
        await showProfile();
      }
    });
  });
}

document.querySelector('#resend').addEventListener('click', () => run(async () => {
  const email = normalizeEmail(document.querySelector('#verify').elements.email.value);
  await api.resend(email);
  notice('Đã yêu cầu gửi lại mã OTP đăng ký.');
}));

logout.addEventListener('click', () => run(async () => {
  const ending = api.signOut();
  clearAccount();
  await ending;
  notice('Đã đăng xuất.');
}));

showForm('login');
