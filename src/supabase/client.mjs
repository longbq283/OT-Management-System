export const SUPABASE_URL = 'https://zlvukgylpcuwpvmkuxgm.supabase.co';
const PUBLISHABLE_KEY = 'sb_publishable_9egkmRYStJQsCOMYUPAcAg_ZX4rDAuW';

export function normalizeEmployeeCode(value) {
  if (typeof value !== 'string' || !/^[0-9]{1,8}$/.test(value)) {
    throw Error('Mã cán bộ phải gồm 1–8 chữ số.');
  }
  return value.padStart(8, '0');
}

export function normalizeEmail(value) {
  const email = value.trim().toLowerCase();
  if (!/^[^\s@]+@bidv\.com\.vn$/.test(email)) {
    throw Error('Vui lòng dùng địa chỉ @bidv.com.vn.');
  }
  return email;
}

const errorMessages = {
  email_exists: 'Email đã đăng ký. Hãy đăng nhập hoặc gửi lại mã nếu chưa xác nhận.',
  user_already_exists: 'Email đã đăng ký. Hãy đăng nhập hoặc gửi lại mã nếu chưa xác nhận.',
  email_not_confirmed: 'Email chưa xác nhận. Hãy gửi lại và nhập mã OTP đăng ký.',
  invalid_credentials: 'Email hoặc mật khẩu không đúng.',
  otp_expired: 'Mã OTP không đúng hoặc đã hết hạn. Bạn có thể gửi lại mã.',
  invalid_otp: 'Mã OTP không đúng hoặc đã hết hạn. Bạn có thể gửi lại mã.',
  over_email_send_rate_limit: 'Đã yêu cầu email quá nhanh. Vui lòng chờ trước khi gửi lại.',
  over_request_rate_limit: 'Có quá nhiều yêu cầu. Vui lòng thử lại sau.',
  weak_password: 'Mật khẩu chưa đáp ứng chính sách bảo mật.',
  '42501': 'Tài khoản không có quyền thực hiện thao tác này.',
  '23505': 'Mã cán bộ, dự án hoặc dữ liệu đã tồn tại.',
  '40001': 'Kỳ đã thay đổi. Hãy tải lại dữ liệu, kiểm tra và xác nhận lại.',
  OT_CLOSED: 'Kỳ nhập đang khóa hoặc dự án đã ngừng hoạt động.',
  OT_EXISTS: 'Kỳ đã có dữ liệu. Hãy kiểm tra và xác nhận thay thế.',
  OT_MISSING: 'Không có dữ liệu hiện hành để thay thế.',
  OT_EMPLOYEE: 'Có mã cán bộ chưa được duyệt hoặc chưa được phân công vào dự án.',
  OT_INVALID: 'Dữ liệu giờ, mã cán bộ hoặc kỳ nhập không hợp lệ.',
  OT_CONFIRM: 'Tài khoản phải xác nhận email trước khi được duyệt.'
};

function signupServerMessage(response, result, code) {
  const details = [result?.message, result?.msg, result?.error_description]
    .filter(value => typeof value === 'string').join(' ');
  let message = 'Máy chủ Supabase báo lỗi khi đăng ký. Quản trị viên cần kiểm tra Auth Logs của yêu cầu POST /signup.';
  if (/error sending confirmation (email|mail)|error sending email/i.test(details)) {
    message = 'Supabase gặp lỗi khi gửi email xác nhận. Quản trị viên cần kiểm tra SMTP trong Auth Logs.';
  } else if (/database error saving new user/i.test(details)) {
    message = 'Supabase gặp lỗi khi lưu tài khoản. Quản trị viên cần kiểm tra Postgres Logs và trigger tạo hồ sơ OT.';
  } else if (typeof code === 'string' && code.startsWith('hook_')) {
    message = 'Supabase gặp lỗi ở bước kiểm tra trước khi tạo tài khoản. Quản trị viên cần kiểm tra Auth Hook và Auth Logs.';
  }

  const requestId = response.headers.get('sb-request-id') ?? response.headers.get('x-request-id');
  return message + ' (HTTP ' + response.status + ')' +
    (requestId && /^[a-zA-Z0-9_-]{8,128}$/.test(requestId) ? ' Mã yêu cầu: ' + requestId + '.' : '');
}

export function createSupabaseClient(fetcher = globalThis.fetch.bind(globalThis)) {
  let session = null;

  async function request(path, { method = 'GET', body, token, headers = {} } = {}) {
    let response;
    try {
      response = await fetcher(SUPABASE_URL + path, {
        method,
        cache: 'no-store',
        headers: {
          apikey: PUBLISHABLE_KEY,
          ...(token && { Authorization: 'Bearer ' + token }),
          ...(body !== undefined && { 'Content-Type': 'application/json' }),
          ...headers
        },
        body: body === undefined ? undefined : JSON.stringify(body)
      });
    } catch {
      throw Error('Không kết nối được với Supabase. Kiểm tra mạng và thử lại.');
    }
    const result = response.status === 204 ? null : await response.json().catch(() => null);
    if (!response.ok) {
      const code = result?.error_code ?? result?.code;
      const key = Object.hasOwn(errorMessages, result?.message) ? result.message : code;
      const message = Object.hasOwn(errorMessages, key) ? errorMessages[key] : undefined;
      const signupFailure = path === '/auth/v1/signup' && response.status >= 500
        ? signupServerMessage(response, result, code) : undefined;
      const error = Error(signupFailure ?? message ?? (response.status === 401
        ? 'Phiên đã hết hạn. Vui lòng đăng nhập lại.'
        : 'Supabase không xử lý được yêu cầu (HTTP ' + response.status + ').'));
      error.status = response.status;
      error.code = code;
      throw error;
    }
    return { result, response };
  }

  async function auth(path, body, { signIn = false, token } = {}) {
    const { result } = await request('/auth/v1/' + path, { method: 'POST', body, token });
    if (signIn) {
      if (!result?.access_token || !result?.user?.id) {
        throw Error('Supabase chưa cấp phiên đăng nhập.');
      }
      session = { token: result.access_token, id: result.user.id };
    }
    return result;
  }

  return {
    get userId() { return session?.id; },
    async signUp({ email, password, fullName, employeeCode }) {
      const result = await auth('signup', {
        email, password, data: { full_name: fullName.trim(), employee_code: normalizeEmployeeCode(employeeCode) }
      });
      const identities = result?.identities ?? result?.user?.identities;
      if (Array.isArray(identities) && !identities.length) {
        throw Error(errorMessages.email_exists);
      }
    },
    async verify(email, token) { await auth('verify', { email, token, type: 'signup' }, { signIn: true }); },
    async resend(email) { await auth('resend', { email, type: 'signup' }); },
    async signIn(email, password) { await auth('token?grant_type=password', { email, password }, { signIn: true }); },
    async signOut() {
      const token = session?.token;
      session = null;
      if (token) await auth('logout?scope=local', undefined, { token });
    },
    forget() { session = null; },
    async list(table, query) {
      const current = session;
      if (!current) throw Error('Vui lòng đăng nhập.');
      const rows = [];
      const params = new URLSearchParams(query);
      for (let offset = 0; ; offset += 500) {
        const { result, response } = await request('/rest/v1/' + table + '?' + params, {
          token: current.token,
          headers: { Range: offset + '-' + (offset + 499), Prefer: 'count=exact' }
        });
        if (current !== session) throw Error('Tài khoản đã thay đổi.');
        if (!Array.isArray(result)) throw Error('Máy chủ trả về dữ liệu không hợp lệ.');
        rows.push(...result);
        const total = Number(response.headers.get('content-range')?.split('/').at(-1));
        if (Number.isFinite(total) ? rows.length >= total : result.length < 500) return rows;
        if (!result.length) throw Error('Không tải được đầy đủ dữ liệu.');
        offset += result.length - 500;
      }
    },
    async rpc(name, body) {
      if (!session) throw Error('Vui lòng đăng nhập.');
      return (await request('/rest/v1/rpc/' + name, { method: 'POST', body, token: session.token })).result;
    }
  };
}
