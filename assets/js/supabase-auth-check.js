import { createSupabaseClient, normalizeEmail } from '../../src/supabase/client.mjs?v=12';
import { mountWorkspace } from '../../src/supabase/workspace.js?v=13';

const api = createSupabaseClient();
const auth = document.querySelector('#auth');
const profilePanel = document.querySelector('#profile');
const workspace = document.querySelector('#ot-workspace');
const logout = document.querySelector('#logout');
const authForms = [...auth.querySelectorAll('form')];
const register = document.querySelector('#register');
const signupFields = document.querySelector('#signup-fields');
const signupOtp = document.querySelector('#signup-otp');
const passwordForm = document.querySelector('#set-password');
const activationForm = document.querySelector('#activate-account');
const activationLink = '#kich-hoat=';
let activationHash;
let activationSession;
const statuses = { pending: 'Chờ quản trị viên duyệt', active: 'Đang hoạt động', disabled: 'Đã vô hiệu hóa' };
let closeWorkspace;
let busy = false;
let expiryTimer;
let passwordSession;

function notice(message = '', isError = false) {
  for (const id of ['status', 'error']) {
    const box = document.getElementById(id);
    box.textContent = id === (isError ? 'error' : 'status') ? message : '';
    box.hidden = !box.textContent;
  }
}

function setOtpStep(active) {
  signupFields.disabled = active;
  document.querySelector('#signup-submit').textContent = active ? 'Xác nhận OTP' : 'Đăng ký';
  document.querySelector('#open-otp').hidden = active;
  document.querySelector('#resend').hidden = !active;
  document.querySelector('#edit-signup').hidden = !active;
  signupOtp.hidden = !active;
  signupOtp.disabled = !active;
  register.elements.email.readOnly = active;
  register.elements.password.value = '';
  register.elements.otp.value = '';
}

function showForm(id, email) {
  setOtpStep(false);
  if (id !== activationForm.id) {
    activationHash = null;
    activationSession = undefined;
  }
  passwordSession = undefined;
  passwordForm.elements.otp.required = true;
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
  clearTimeout(expiryTimer);
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
  clearTimeout(expiryTimer);
  if (api.expiresAt) expiryTimer = setTimeout(() => {
    expire(Error('Phiên đã hết hạn. Vui lòng đăng nhập lại.'));
  }, Math.max(0, api.expiresAt - Date.now()));
  auth.hidden = true;
  logout.hidden = false;
  setOtpStep(false);
  for (const form of authForms) form.reset();
  profilePanel.hidden = false;
  const ownId = api.userId;
  const fields = {
    select: 'id,email,full_name,requested_employee_code,employee_code,role,status',
    id: 'eq.' + ownId
  };
  let [profile] = await api.list('ot_profiles', fields);
  if (profile?.status === 'pending') {
    try {
      if (await api.rpc('ot_consume_user_invitation', {})) [profile] = await api.list('ot_profiles', fields);
    } catch (error) {
      if (error.code === '23505') notice('Mã cán bộ trong hồ sơ đăng ký trước đang bị trùng. Hãy liên hệ quản trị hệ thống.', true);
      else if (error.code !== 'PGRST202') throw error;
    }
  }
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
    profile.role === 'admin' ? 'Quản trị hệ thống' : 'Người dùng', statuses[profile.status]].filter(Boolean).join(' · ');
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
    const email = authForms.find(form => !form.hidden)?.elements.email?.value;
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
      if (form === activationForm) {
        if (!activationSession) {
          if (!/^[A-Za-z0-9_-]{20,200}$/.test(activationHash ?? '')) {
            throw Error('Liên kết kích hoạt không hợp lệ. Hãy mở lại liên kết từ email.');
          }
          try {
            activationSession = await api.verifyActivation(activationHash);
          } catch (error) {
            if (error.code === 'otp_expired') {
              throw Error('Liên kết kích hoạt đã hết hạn hoặc đã được dùng. Hãy yêu cầu gửi lại hoặc dùng Quên mật khẩu.');
            }
            throw error;
          }
          activationHash = null;
        }
        try {
          await api.setPassword(activationSession.token, fields.password);
        } catch (error) {
          if (error.status === 401) {
            activationSession = undefined;
            showForm('set-password');
            throw Error('Phiên kích hoạt đã hết hạn. Hãy gửi mã đặt lại mật khẩu.');
          }
          throw error;
        }
        const { email } = activationSession;
        showForm('login', email);
        try {
          await api.signIn(email, fields.password);
        } catch {
          notice('Đã lưu mật khẩu. Hãy đăng nhập để hoàn tất kích hoạt.');
          return;
        }
        await showProfile();
        return;
      }
      const email = normalizeEmail(fields.email);
      if (form === passwordForm) {
        if (passwordSession?.email !== email) {
          if (!fields.otp) throw Error('Vui lòng nhập mã OTP đã nhận.');
          const token = await api.verifyPasswordCode(email, fields.otp);
          passwordSession = { email, token };
          passwordForm.elements.otp.required = false;
        }
        try {
          await api.setPassword(passwordSession.token, fields.password);
        } catch (error) {
          if (error.status === 401) {
            passwordSession = undefined;
            passwordForm.elements.otp.required = true;
            throw Error('Phiên đặt mật khẩu đã hết hạn. Hãy gửi mã đặt lại mật khẩu mới.');
          }
          throw error;
        }
        showForm('login', email);
        notice('Đã lưu mật khẩu. Hãy đăng nhập bằng mật khẩu mới.');
      } else if (form === register && !signupOtp.hidden) {
        await api.verify(email, fields.otp);
        await showProfile();
      } else if (form === register) {
        if (!fields.fullName.trim()) throw Error('Vui lòng nhập họ tên đầy đủ.');
        await api.signUp({ ...fields, email });
        register.elements.email.value = email;
        setOtpStep(true);
        register.elements.otp.focus();
        notice('Yêu cầu đăng ký đã được tiếp nhận. Kiểm tra email BIDV để lấy mã OTP.');
      } else {
        await api.signIn(email, fields.password);
        await showProfile();
      }
    });
  });
}

document.querySelector('#open-otp').addEventListener('click', () => {
  if (!register.elements.email.reportValidity()) return;
  run(() => {
    register.elements.email.value = normalizeEmail(register.elements.email.value);
    setOtpStep(true);
    register.elements.otp.focus();
    notice('Nhập mã đã nhận hoặc bấm Gửi lại mã OTP.');
  });
});

document.querySelector('#edit-signup').addEventListener('click', () => {
  setOtpStep(false);
  register.elements.email.focus();
  notice();
});

document.querySelector('#resend').addEventListener('click', () => run(async () => {
  const email = normalizeEmail(register.elements.email.value);
  await api.resend(email);
  notice('Đã yêu cầu gửi lại mã OTP đăng ký.');
}));

document.querySelector('#send-password-reset').addEventListener('click', () => {
  if (!passwordForm.elements.email.reportValidity()) return;
  run(async () => {
    const email = normalizeEmail(passwordForm.elements.email.value);
    await api.sendPasswordReset(email);
    passwordSession = undefined;
    passwordForm.elements.otp.required = true;
    passwordForm.elements.otp.value = '';
    passwordForm.elements.otp.focus();
    notice('Nếu tài khoản đủ điều kiện, Supabase sẽ gửi mã đặt lại mật khẩu đến email BIDV.');
  });
});

logout.addEventListener('click', () => run(async () => {
  const ending = api.signOut();
  clearAccount();
  await ending;
  notice('Đã đăng xuất.');
}));

function openActivationFromLink() {
  if (!location.hash.startsWith(activationLink)) return false;
  const tokenHash = location.hash.slice(activationLink.length);
  history.replaceState(null, '', location.pathname + location.search);
  api.forget();
  clearAccount();
  notice();
  activationHash = tokenHash;
  showForm(activationForm.id);
  activationForm.elements.password.focus();
  return true;
}

window.addEventListener('hashchange', openActivationFromLink);
if (!openActivationFromLink()) {
  if (api.userId) run(showProfile);
  else showForm('login');
}
