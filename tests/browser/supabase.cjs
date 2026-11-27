const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync, readFileSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { XLSX, bookFrom, binary } = require('../fixtures/workbooks.cjs');

const port = 4191;
const base = 'http://127.0.0.1:' + port;
const origin = 'https://zlvukgylpcuwpvmkuxgm.supabase.co';
const account = { id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa', email: 'fixture-user@bidv.com.vn',
  full_name: 'Cán bộ giả lập', requested_employee_code: '00000023', employee_code: null, role: 'user', status: 'pending' };
const admin = { id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', email: 'fixture-admin@bidv.com.vn',
  full_name: 'Quản trị giả lập', requested_employee_code: '00000001', employee_code: '00000001', role: 'admin', status: 'active' };
const missing = { id: 'cccccccc-cccc-cccc-cccc-cccccccccccc', email: 'fixture-missing@bidv.com.vn' };
const projects = [{ id: 'pr-a', code: 'A', name: 'Dự án giả lập A', status: 'active' },
  { id: 'pr-b', code: 'B', name: 'Dự án giả lập B', status: 'active' }];
const periods = projects.map(project => ({ project_id: project.id, year: 2026, month: 11,
  is_open: project.code === 'B', revision: 1, data_revision: 0 }));
const entries = [];
const invitations = [];
const projectAdmins = [{ project_id: 'pr-a', user_id: admin.id, active: true }];
const memberships = [{ project_id: 'pr-b', user_id: account.id, active: true },
  { project_id: 'pr-b', user_id: admin.id, active: true }];
const calendars = [{ project_id: 'pr-b', year: 2026, month: 11, days: Array(30).fill('NT'), limit_minutes: [720, 780, ...Array(28).fill(120)] }];
const calls = [];
const passwordSetupToken = 'fixture-password-setup';
let networkError = false;
let duplicate = false;
let signupFailure;

async function routeRequest(route) {
  const req = route.request();
  const url = new URL(req.url());
  const endpoint = url.pathname;
  const fields = req.postDataJSON();
  const token = req.headers().authorization?.slice('Bearer '.length);
  const actor = [account, admin, missing].find(user => token === 'fixture-session-' + user.id);
  calls.push({ endpoint, fields, actor: actor?.id, userFilter: url.searchParams.get('user_id') });
  const send = (value, status = 200) => route.fulfill({ status, json: value,
    headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'sb-request-id',
      'sb-request-id': 'fixture-request-id' } });
  const session = user => ({ access_token: 'fixture-session-' + user.id, expires_in: 3600, user: { id: user.id } });
  if (endpoint.endsWith('/ot-invite-user')) {
    assert.equal(actor, admin);
    invitations.push({ email: fields.email, full_name: fields.fullName, employee_code: fields.employeeCode });
    return send({ invited: true });
  }
  if (endpoint.endsWith('/recover')) return send({});
  if (endpoint.endsWith('/verify') && ['invite', 'recovery'].includes(fields.type)) {
    return fields.token === '234567' ? send({ access_token: passwordSetupToken }) : send({ error_code: 'otp_expired' }, 403);
  }
  if (endpoint.endsWith('/auth/v1/user') && req.method() === 'PUT') {
    assert.equal(token, passwordSetupToken);
    assert.equal(fields.password, 'Fixture-new-password');
    return send({});
  }
  if (endpoint.endsWith('/signup')) {
    if (networkError) return route.abort();
    if (signupFailure) return send(signupFailure, 500);
    return send({ user: { id: account.id }, identities: duplicate ? [] : [{}] });
  }
  if (endpoint.endsWith('/resend')) return send({});
  if (endpoint.endsWith('/verify')) return fields.token === '123456' ? send(session(account)) : send({ error_code: 'otp_expired' }, 403);
  if (endpoint.endsWith('/token')) return send(session([admin, account, missing].find(user => user.email === fields.email)));
  if (endpoint.endsWith('/logout')) return route.fulfill({ status: 204 });
  if (!actor) return send({}, 401);
  if (endpoint.endsWith('/ot_profiles')) {
    const id = url.searchParams.get('id');
    return send(id ? [account, admin].filter(user => id === 'eq.' + user.id) : [account, admin]);
  }
  const inScope = (field, value) => {
    const filter = url.searchParams.get(field);
    return !filter || (filter.startsWith('in.(') ? filter.slice(4, -1).split(',').includes(value) : filter === 'eq.' + value);
  };
  if (endpoint.endsWith('/ot_projects')) return send(projects.filter(row => inScope('id', row.id)));
  if (endpoint.endsWith('/ot_periods')) return send(periods.filter(row => inScope('project_id', row.project_id)));
  if (endpoint.endsWith('/ot_period_calendars')) return send(calendars.filter(row => inScope('project_id', row.project_id)));
  if (endpoint.endsWith('/ot_entries')) return send(entries.filter(row => inScope('project_id', row.project_id) && inScope('user_id', row.user_id)));
  if (endpoint.endsWith('/ot_project_members')) return send(memberships.filter(row => inScope('user_id', row.user_id)));
  if (endpoint.endsWith('/ot_audit_events')) return send([]);
  if (endpoint.endsWith('/ot_consume_user_invitation')) return send(false);
  if (endpoint.endsWith('/ot_user_invitations')) {
    assert.equal(actor, admin);
    return send(invitations);
  }
  if (endpoint.endsWith('/ot_save_user_invitation')) {
    assert.equal(actor, admin);
    if (fields.p_active) invitations.push({ email: fields.p_email, full_name: fields.p_full_name, employee_code: fields.p_employee_code });
    else invitations.splice(invitations.findIndex(item => item.email === fields.p_email), 1);
    return send(null);
  }
  if (endpoint.endsWith('/ot_manage_user')) {
    assert.equal(actor, admin);
    account.status = fields.p_active ? 'active' : 'disabled';
    account.full_name = fields.p_full_name;
    if (fields.p_active) account.employee_code = fields.p_employee_code;
    return send(null);
  }
  const manages = project => actor === admin || projectAdmins.some(grant =>
    grant.project_id === project && grant.user_id === actor.id && grant.active);
  if (endpoint.endsWith('/ot_list_project_members')) {
    assert.ok(manages(fields.p_project));
    return send(memberships.filter(row => row.project_id === fields.p_project && row.active).map(row => {
      const person = [account, admin].find(item => item.id === row.user_id);
      return { user_id: row.user_id, employee_code: person.employee_code, full_name: person.full_name, status: person.status };
    }));
  }
  if (endpoint.endsWith('/ot_set_member') || endpoint.endsWith('/ot_set_member_by_code')) {
    assert.ok(manages(fields.p_project));
    const user = fields.p_user ?? [account, admin].find(person => person.employee_code === fields.p_employee_code).id;
    const existing = memberships.find(member => member.project_id === fields.p_project && member.user_id === user);
    if (existing) existing.active = fields.p_active;
    else memberships.push({ project_id: fields.p_project, user_id: user, active: fields.p_active });
    return send(null);
  }
  if (endpoint.endsWith('/ot_project_admins')) {
    return send(projectAdmins.filter(grant => (actor === admin || (grant.user_id === actor.id && grant.active)) && inScope('user_id', grant.user_id)));
  }
  if (endpoint.endsWith('/ot_set_project_admin')) {
    assert.equal(actor, admin);
    const existing = projectAdmins.find(grant => grant.project_id === fields.p_project && grant.user_id === fields.p_user);
    if (existing) existing.active = fields.p_active;
    else projectAdmins.push({ project_id: fields.p_project, user_id: fields.p_user, active: fields.p_active });
    return send(null);
  }
  if (endpoint.endsWith('/ot_set_calendar_with_limits')) {
    assert.ok(actor === admin || projectAdmins.some(grant => grant.active &&
      grant.project_id === fields.p_project && grant.user_id === actor.id));
    const period = periods.find(row => row.project_id === fields.p_project);
    assert.equal(fields.p_expected_revision, period.revision);
    assert.equal(period.is_open, false);
    const existing = calendars.find(calendar => calendar.project_id === fields.p_project &&
      calendar.year === fields.p_year && calendar.month === fields.p_month);
    assert.equal(fields.p_limit_minutes.length, fields.p_days.length);
    if (existing) Object.assign(existing, { days: fields.p_days, limit_minutes: fields.p_limit_minutes });
    else calendars.push({ project_id: fields.p_project, year: fields.p_year, month: fields.p_month,
      days: fields.p_days, limit_minutes: fields.p_limit_minutes });
    return send(++period.revision);
  }
  if (endpoint.endsWith('/ot_set_period')) {
    assert.ok(actor === admin || projectAdmins.some(grant => grant.active &&
      grant.project_id === fields.p_project && grant.user_id === actor.id));
    const row = periods.find(item => item.project_id === fields.p_project);
    assert.equal(fields.p_expected_revision, row.revision);
    row.is_open = fields.p_open;
    return send(++row.revision);
  }
  if (endpoint.endsWith('/ot_submit_entries')) {
    const period = periods.find(item => item.project_id === fields.p_project);
    assert.equal(fields.p_period_revision, period.revision);
    assert.equal(fields.p_data_revision, period.data_revision);
    assert.equal(fields.p_batch, actor === admin);
    assert.ok(period.is_open);
    const calendar = calendars.find(item => item.project_id === fields.p_project);
    for (const row of fields.p_rows) for (const day of row.days) {
      const index = Number(day.date.slice(-2)) - 1;
      assert.equal(day.type, calendar.days[index]);
      assert.ok(day.minutes <= calendar.limit_minutes[index]);
    }
    if (fields.p_replace) for (const row of entries) {
      if (row.project_id === fields.p_project && (fields.p_batch || row.user_id === actor.id)) row.active = false;
    }
    ++period.data_revision;
    for (const row of fields.p_rows) entries.push({ ...row, id: entries.length + 1, user_id: fields.p_batch ? account.id : actor.id,
      project_id: fields.p_project, year: fields.p_year, month: fields.p_month, active: true,
      period_data_revision: period.data_revision,
      total_minutes: row.nt_minutes + row.nn_minutes + row.unclassified_minutes });
    return send(period.data_revision);
  }
  return send({}, 404);
}

async function login(page, user) {
  await page.locator('#login input[name=email]').fill(user.email);
  await page.locator('#login input[name=password]').fill('Fixture-test-password');
  await page.locator('#login button').click();
}

async function fillPeriod(page, selector, project) {
  await page.locator(selector + ' [name=project]').selectOption(project);
  await page.locator(selector + ' [name=year]').fill('2026');
  const month = page.locator(selector + ' [name=month]');
  if (await month.evaluate(el => el.tagName === 'SELECT')) await month.selectOption('11');
  else await month.fill('11');
}

async function sleepUntilMessage(page, text) {
  await page.getByText(text, { exact: false }).first().waitFor();
}

async function run() {
  const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1'],
    { cwd: path.resolve(__dirname, '../..'), stdio: 'ignore' });
  let browser;
  try {
    for (let i = 0; i < 50; i++) {
      if (await fetch(base).then(response => response.ok).catch(() => false)) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    browser = await chromium.launch({ executablePath: process.env.BROWSER_EXECUTABLE ||
      (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined), headless: true });
    const context = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await context.route(origin + '/**', routeRequest);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    await page.goto(base + '/kiem-tra-tai-khoan.html');
    await page.getByRole('button', { name: 'Đăng ký', exact: true }).first().click();
    const register = page.locator('#register');
    await register.locator('[name=email]').fill('fixture-user@example.invalid');
    await register.locator('[name=fullName]').fill(account.full_name);
    await register.locator('[name=employeeCode]').fill('23');
    const registerButton = register.locator('#signup-submit');
    const otp = register.locator('[name=otp]');
    assert.equal(await otp.isVisible(), false);
    assert.equal(await page.locator('[data-auth="verify"]').count(), 0);
    async function submitRegistration() {
      await register.locator('[name=password]').fill('Fixture-test-password');
      await registerButton.click();
    }
    await submitRegistration();
    await sleepUntilMessage(page, 'Vui lòng dùng địa chỉ @bidv.com.vn.');
    assert.equal(calls.length, 0);
    await register.locator('[name=email]').fill(account.email);
    networkError = true;
    await submitRegistration();
    await sleepUntilMessage(page, 'Không kết nối được');
    networkError = false;
    signupFailure = { error_code: 'unexpected_failure', msg: 'Database error saving new user' };
    await submitRegistration();
    await sleepUntilMessage(page, 'Postgres Logs và trigger tạo hồ sơ OT');
    assert.match(await page.locator('#error').innerText(), /HTTP 500.*fixture-request-id/);
    assert.equal(await otp.isVisible(), false);
    assert.equal(await register.locator('[name=fullName]').inputValue(), account.full_name);
    assert.equal(await register.locator('[name=employeeCode]').inputValue(), '23');
    assert.equal(await register.locator('[name=password]').inputValue(), '');

    signupFailure = { error_code: 'unexpected_failure', msg: 'Error sending confirmation email' };
    await submitRegistration();
    await sleepUntilMessage(page, 'kiểm tra SMTP trong Auth Logs');
    signupFailure = { error_code: 'hook_timeout' };
    await submitRegistration();
    await sleepUntilMessage(page, 'kiểm tra Auth Hook và Auth Logs');
    signupFailure = { error_code: 'unexpected_failure', msg: 'Internal fixture-only detail' };
    await submitRegistration();
    await sleepUntilMessage(page, 'Auth Logs của yêu cầu POST /signup');
    assert.doesNotMatch(await page.locator('#error').innerText(), /fixture-only detail/);
    signupFailure = undefined;

    const requestsBeforeRecovery = calls.length;
    await register.locator('#open-otp').click();
    await otp.waitFor();
    assert.equal(calls.length, requestsBeforeRecovery);
    await register.locator('#edit-signup').click();
    assert.equal(await otp.isVisible(), false);
    assert.equal(await register.locator('[name=email]').isEditable(), true);

    duplicate = true;
    await submitRegistration();
    await sleepUntilMessage(page, 'Email đã đăng ký');
    duplicate = false;
    await submitRegistration();
    await otp.waitFor();
    assert.equal(await register.getByRole('heading', { name: 'Đăng ký', exact: true }).isVisible(), true);
    assert.equal(await page.locator('[data-auth="register"]').getAttribute('aria-current'), 'true');
    assert.equal(await register.locator('[name=email]').inputValue(), account.email);
    assert.equal(await register.locator('[name=email]').isEditable(), false);
    assert.equal(await register.locator('[name=employeeCode]').inputValue(), '23');
    assert.equal(await otp.evaluate(el => el === document.activeElement), true);
    assert.deepEqual(calls.find(call => call.endpoint.endsWith('/signup')).fields.data,
      { full_name: account.full_name, employee_code: '00000023' });
    await page.locator('#resend').click();
    await sleepUntilMessage(page, 'Đã yêu cầu gửi lại mã');
    assert.deepEqual(calls.find(call => call.endpoint.endsWith('/resend')).fields,
      { email: account.email, type: 'signup' });
    await otp.fill('654321');
    await otp.press('Enter');
    await sleepUntilMessage(page, 'Mã OTP không đúng hoặc đã hết hạn');
    await otp.fill('123456');
    await otp.press('Enter');
    await sleepUntilMessage(page, 'Chờ quản trị viên duyệt');
    assert.equal(calls.find(call => call.endpoint.endsWith('/verify')).fields.type, 'signup');
    assert.equal(await page.locator('#ot-workspace').isVisible(), false);
    await page.locator('#logout').click();
    await sleepUntilMessage(page, 'Đã đăng xuất');
    assert.equal(await page.locator('#profile').innerText(), '');
    assert.deepEqual(await page.evaluate(() => [localStorage.length, sessionStorage.length]), [0, 0]);
    await login(page, missing);
    await sleepUntilMessage(page, 'Chưa tìm thấy hồ sơ');
    await page.locator('#logout').click();

    const operator = await context.newPage();
    await operator.goto(base + '/kiem-tra-tai-khoan.html');
    await login(operator, admin);
    await operator.getByRole('heading', { name: 'Chọn vai trò làm việc' }).waitFor();
    assert.equal(await operator.locator('[data-role]').count(), 3);
    await operator.locator('[data-role=member]').click();
    await operator.locator('#manual-scope').waitFor();
    assert.equal(await operator.locator('#admin-profile').count(), 0);
    assert.deepEqual(await operator.locator('#manual-scope [name=project] option').evaluateAll(items =>
      items.map(item => item.value)), ['', 'pr-b']);
    assert.ok(calls.some(call => call.actor === admin.id && call.endpoint.endsWith('/ot_entries') &&
      call.userFilter === 'eq.' + admin.id));
    await operator.locator('[data-role=project]').click();
    await operator.getByRole('heading', { name: 'Lịch và kỳ nhập OT' }).waitFor();
    assert.equal(await operator.locator('#manual-ot').count(), 0);
    await operator.locator('[data-role=system]').click();
    await operator.locator('[data-pane=import]').click();
    await operator.locator('#excel-ot').waitFor();
    await operator.locator('[data-pane=management]').click();
    await operator.getByRole('heading', { name: 'Quản lý người dùng', exact: true }).waitFor();
    assert.deepEqual(await operator.locator('#pane-management > section > h2').allTextContents(),
      ['Dự án và nhật ký', 'Quản lý người dùng', 'Phân quyền quản trị dự án']);
    assert.equal(await operator.locator('[data-pane=users], [data-pane=permissions]').count(), 0);
    await operator.locator('#admin-profile [name=user]').selectOption(account.id);
    await operator.getByRole('button', { name: 'Lưu và kích hoạt', exact: true }).click();
    await sleepUntilMessage(operator, 'Đã cập nhật duyệt tài khoản.');
    await operator.getByText('Thêm người dùng', { exact: true }).click();
    await operator.locator('#user-invitation [name=email]').fill('fixture-new@bidv.com.vn');
    await operator.locator('#user-invitation [name=fullName]').fill('Đăng ký trước giả lập');
    await operator.locator('#user-invitation [name=code]').fill('456');
    await operator.getByRole('button', { name: 'Lưu đăng ký trước' }).click();
    await sleepUntilMessage(operator, 'Đã lưu hồ sơ đăng ký trước.');
    assert.equal(invitations[0].employee_code, '00000456');
    await operator.locator('#cancel-invitation [name=email]').selectOption('fixture-new@bidv.com.vn');
    await operator.getByRole('button', { name: 'Hủy đăng ký trước' }).click();
    await sleepUntilMessage(operator, 'Đã hủy hồ sơ đăng ký trước.');

    await operator.getByText('Phân công dự án', { exact: true }).click();
    await operator.locator('#admin-member [name=project]').selectOption('pr-a');
    await operator.locator('#admin-member [name=user]').selectOption(account.id);
    await operator.locator('#admin-member button').click();
    await sleepUntilMessage(operator, 'Đã lưu phân công.');

    await page.goto(base + '/kiem-tra-tai-khoan.html#nhap-ot');
    await login(page, account);
    await page.getByRole('heading', { name: 'Nhập giờ OT trực tiếp', exact: true }).waitFor();
    assert.equal(await page.locator('#manual-scope [name=project]').inputValue(), 'pr-b');
    assert.equal(await page.getByLabel('Giờ OT ngày 1', { exact: true }).isEditable(), true);
    const session = await page.evaluate(() => {
      const data = JSON.parse(sessionStorage.getItem('ot-workspace:session'));
      return { id: data.id, remaining: data.expiresAt - Date.now(), hasRefreshToken: Boolean(data.refresh_token) };
    });
    assert.equal(session.id, account.id);
    assert.ok(session.remaining > 29 * 60 * 1000 && session.remaining <= 30 * 60 * 1000);
    assert.equal(session.hasRefreshToken, false);
    const tokensBeforeReload = calls.filter(call => call.endpoint.endsWith('/token')).length;
    await page.reload();
    await page.getByRole('heading', { name: 'Nhập giờ OT trực tiếp', exact: true }).waitFor();
    assert.equal(calls.filter(call => call.endpoint.endsWith('/token')).length, tokensBeforeReload);

    await fillPeriod(page, '#manual-scope', 'pr-a');
    await sleepUntilMessage(page, 'Kỳ chưa có lịch đã lưu');
    assert.equal(await page.locator('#manual-ot [name=duration]').count(), 30);
    const dayOne = page.getByLabel('Giờ OT ngày 1', { exact: true });
    const dayTwo = page.getByLabel('Giờ OT ngày 2', { exact: true });
    const unit = page.getByLabel('Đơn vị (Ban/TT)', { exact: true });
    assert.equal(await dayOne.isEditable(), true);
    assert.equal(await page.locator('#manual-ot button').isDisabled(), true);
    assert.equal(await page.locator('#report-form').isVisible(), false);
    await unit.fill('Ban cũ giả lập');
    await dayOne.fill('1,5');

    await operator.locator('[data-pane=calendar]').click();
    await fillPeriod(operator, '#calendar-scope', 'pr-a');
    await operator.locator('#calendar-scope [name=year]').fill('2028');
    await operator.locator('#calendar-scope [name=year]').blur();
    await operator.locator('#calendar-scope [name=month]').selectOption('2');
    assert.equal(await operator.locator('#calendar-days select').count(), 29);
    await fillPeriod(operator, '#calendar-scope', 'pr-a');
    await operator.getByText('Xem đủ 12 tháng', { exact: true }).click();
    assert.equal(await operator.locator('.calendar-year section:visible').count(), 12);
    assert.equal(await operator.locator('#calendar-days select').count(), 30);
    assert.equal(await operator.getByLabel('Ngày 1', { exact: true }).inputValue(), 'NN');
    assert.equal(await operator.getByLabel('Giới hạn giờ ngày 1', { exact: true }).inputValue(), '4');
    assert.equal(await operator.getByLabel('Giới hạn giờ ngày 2', { exact: true }).inputValue(), '2');
    await operator.getByLabel('Ngày 1', { exact: true }).selectOption('NT');
    await operator.getByLabel('Ngày 2', { exact: true }).selectOption('L');
    assert.equal(await operator.getByLabel('Giới hạn giờ ngày 1', { exact: true }).inputValue(), '2');
    assert.equal(await operator.getByLabel('Giới hạn giờ ngày 2', { exact: true }).inputValue(), '4');
    await operator.getByLabel('Giới hạn giờ ngày 1', { exact: true }).fill('20');
    await operator.getByLabel('Giới hạn giờ ngày 2', { exact: true }).fill('5');
    assert.equal(await operator.getByRole('button', { name: 'Mở kỳ', exact: true }).count(), 0);
    await operator.getByRole('button', { name: 'Lưu lịch tháng' }).click();
    await sleepUntilMessage(operator, 'Đã lưu lịch làm việc tháng 11/2026.');
    await operator.getByRole('button', { name: 'Mở kỳ', exact: true }).click();
    await sleepUntilMessage(operator, 'Đã lưu trạng thái kỳ.');
    assert.equal(await operator.getByLabel('Ngày 1', { exact: true }).isDisabled(), true);

    await page.locator('#refresh-ot').click();
    await sleepUntilMessage(page, 'Đã tải dữ liệu mới nhất.');
    assert.equal(await dayOne.inputValue(), '1,5');
    assert.equal(await unit.inputValue(), 'Ban cũ giả lập');
    assert.equal(await page.locator('#manual-ot tr').nth(1).locator('td').nth(1).innerText(), 'L');
    const manual = page.locator('#manual-ot');
    const summary = manual.locator('#manual-summary');
    const confirm = manual.getByRole('checkbox');
    const saveButton = manual.getByRole('button', { name: 'Xác nhận lưu OT' });
    assert.equal(await page.locator('#excel-ot').count(), 0);
    assert.equal(await manual.getByRole('button', { name: 'Xem trước', exact: true }).count(), 0);
    assert.match(await summary.innerText(), /Ban cũ giả lập/);
    assert.equal(await saveButton.isDisabled(), true);
    await dayOne.fill('25');
    await sleepUntilMessage(page, 'Ngày 1 cần số giờ từ 0 đến 24');
    assert.equal(await confirm.isDisabled(), true);
    await dayOne.fill('21');
    assert.equal(await dayOne.getAttribute('aria-invalid'), 'true');
    await sleepUntilMessage(page, 'Ngày 1 vượt giới hạn 20 giờ OT');
    await dayOne.evaluate(input => {
      const clipboardData = new DataTransfer();
      clipboardData.setData('text/plain', '20\t5,0');
      input.dispatchEvent(new ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true }));
    });
    assert.equal(await dayTwo.inputValue(), '5,0');
    await sleepUntilMessage(page, 'Tổng OT 25 giờ');
    assert.equal(await summary.locator('tbody tr td').last().innerText(), '25');
    await page.locator('[data-pane=report]').click();
    assert.equal(await manual.isVisible(), false);
    await page.locator('[data-pane=entry]').click();
    assert.equal(await dayOne.inputValue(), '20');
    await confirm.check();
    assert.equal(await saveButton.isEnabled(), true);
    await dayTwo.fill('4');
    assert.equal(await confirm.isChecked(), false);
    assert.equal(await saveButton.isDisabled(), true);
    assert.equal(await summary.locator('tbody tr td').last().innerText(), '24');
    await dayTwo.fill('5,0');
    await confirm.check();
    await unit.fill('Ban cũ giả lập đổi tên');
    assert.equal(await confirm.isChecked(), false);
    assert.match(await summary.innerText(), /Ban cũ giả lập đổi tên/);
    await unit.fill('Ban cũ giả lập');
    await confirm.check();
    await saveButton.click();
    await sleepUntilMessage(page, 'Đã lưu OT cho 1 cán bộ.');
    assert.equal(await dayTwo.inputValue(), '5');
    assert.equal(entries.find(row => row.project_id === 'pr-a').unit, 'Ban cũ giả lập');
    assert.match(await manual.getByRole('checkbox').evaluate(input => input.parentElement.textContent), /thay thế/);
    assert.equal(await saveButton.isDisabled(), true);

    await fillPeriod(page, '#manual-scope', 'pr-b');
    assert.equal(await unit.inputValue(), 'Ban cũ giả lập');
    await unit.fill('Ban mới giả lập');
    await dayOne.fill('12');
    await dayTwo.fill('13');
    await sleepUntilMessage(page, 'vượt hạn mức tháng 10 giờ');
    await confirm.check();
    await saveButton.click();
    await sleepUntilMessage(page, 'Đã lưu OT cho 1 cán bộ.');
    await page.locator('[data-pane=report]').click();
    const report = '#report-form';
    await page.locator(report + ' [name=year]').fill('2026');
    await page.locator(report + ' [name=month]').fill('11');
    await page.locator(report + ' [name=project]').selectOption('pr-a');
    await page.locator(report + ' button.primary').click();
    await sleepUntilMessage(page, 'Tổng OT theo bộ lọc: 25 giờ');
    const reportText = await page.locator('#report-form').locator('..').innerText();
    assert.match(reportText, /50/);
    assert.match(reportText, /Ban cũ giả lập/);
    assert.doesNotMatch(reportText, /Ban mới giả lập/);
    assert.equal(await page.locator('#report-attendance').count(), 0);
    assert.match(reportText, /vượt 10 giờ/);
    await page.locator('[data-pane=backup]').click();
    const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('#export-backup').click()]);
    assert.match(backup.suggestedFilename(), /ot-supabase-backup/);
    assert.equal(await page.locator('#admin-project').count(), 0);
    await operator.locator('#refresh-ot').click();
    await sleepUntilMessage(operator, 'Đã tải dữ liệu mới nhất.');
    await operator.locator('[data-pane=import]').click();
    await fillPeriod(operator, '#excel-ot', 'pr-b');
    const workbook = binary(bookFrom([['Họ tên', 'Mã cán bộ', 'Đơn vị', 1, 2],
      [account.full_name, '23', 'Ban mới giả lập', 12, 13]]));
    await operator.locator('#excel-ot [name=file]').setInputFiles({
      name: 'fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook
    });
    await operator.locator('#excel-ot button').click();
    await operator.locator('#excel-mapping button').click();
    await operator.locator('#commit-ot input').check();
    await operator.locator('#commit-ot button.primary').click();
    await sleepUntilMessage(operator, 'Đã lưu OT cho 1 cán bộ.');
    assert.ok(calls.some(call => call.actor === admin.id && call.endpoint.endsWith('/ot_submit_entries') &&
      call.fields.p_batch === true && call.fields.p_project === 'pr-b' && call.fields.p_replace === true));

    await operator.locator('[data-pane=management]').click();
    const grantForm = operator.locator('#admin-project-role');
    await operator.getByRole('heading', { name: 'Phân quyền quản trị dự án', exact: true }).waitFor();
    await grantForm.locator('[name=project]').selectOption('pr-a');
    await grantForm.locator('[name=user]').selectOption(account.id);
    await grantForm.getByRole('button').click();
    await sleepUntilMessage(operator, 'Đã cập nhật quyền quản trị dự án.');

    await page.locator('#logout').click();
    await sleepUntilMessage(page, 'Đã đăng xuất');
    await page.goto(base + '/kiem-tra-tai-khoan.html#cau-hinh-du-an');
    await login(page, account);
    await page.getByRole('heading', { name: 'Lịch và kỳ nhập OT', exact: true }).waitFor();
    assert.deepEqual(await page.locator('#calendar-scope [name=project] option').evaluateAll(items =>
      items.map(item => item.value)), ['pr-a']);
    assert.equal(await page.locator('#admin-project-role').count(), 0);
    assert.equal(await page.locator('#admin-profile').count(), 0);
    await fillPeriod(page, '#calendar-scope', 'pr-a');
    await page.getByRole('button', { name: 'Khóa kỳ', exact: true }).click();
    await sleepUntilMessage(page, 'Đã lưu trạng thái kỳ.');
    await page.getByLabel('Ngày 3', { exact: true }).selectOption('L');
    await page.getByLabel('Giới hạn giờ ngày 3', { exact: true }).fill('1:30');
    await page.getByRole('button', { name: 'Lưu lịch tháng' }).click();
    await sleepUntilMessage(page, 'Đã lưu lịch làm việc tháng 11/2026.');
    assert.ok(calls.some(call => call.actor === account.id && call.endpoint.endsWith('/ot_set_calendar_with_limits') &&
      call.fields.p_project === 'pr-a' && call.fields.p_days[2] === 'L' && call.fields.p_limit_minutes[2] === 90));
    await page.getByRole('button', { name: 'Mở kỳ', exact: true }).click();
    await sleepUntilMessage(page, 'Đã lưu trạng thái kỳ.');

    await page.locator('[data-pane=members]').click();
    await page.locator('#team-add').waitFor();
    assert.deepEqual(await page.locator('#team-project option').evaluateAll(items => items.map(item => item.value)), ['pr-a']);
    await page.locator('#team-add [name=code]').fill('1');
    await page.getByRole('button', { name: 'Thêm vào dự án', exact: true }).click();
    await sleepUntilMessage(page, 'Đã thêm thành viên vào dự án.');
    assert.ok(memberships.some(row => row.project_id === 'pr-a' && row.user_id === admin.id && row.active));
    await page.locator('#team-remove [name=user]').selectOption(admin.id);
    await page.getByRole('button', { name: 'Gỡ khỏi dự án', exact: true }).click();
    await sleepUntilMessage(page, 'Đã gỡ thành viên khỏi dự án.');
    assert.ok(memberships.some(row => row.project_id === 'pr-a' && row.user_id === admin.id && !row.active));

    await page.locator('[data-pane=report]').click();
    await fillPeriod(page, '#report-form', 'pr-a');
    const [attendance] = await Promise.all([page.waitForEvent('download'), page.locator('#report-attendance').click()]);
    assert.equal(attendance.suggestedFilename(), 'Cham-cong-OT-A-2026-11.xlsx');
    const signingSheet = XLSX.read(readFileSync(await attendance.path()), { type: 'buffer' }).Sheets['Chấm công OT'];
    assert.equal(signingSheet.B8.v, '00000023');
    assert.equal(signingSheet.C8.v, 'Ban cũ giả lập');
    assert.equal(signingSheet.D8.v, 20);
    assert.equal(signingSheet.E7.v, 'L');
    assert.equal(signingSheet.AJ8.v, 5);
    assert.equal(signingSheet.AK9.v, 25);
    assert.equal(signingSheet.C13.v, 'Lập bảng');

    await grantForm.locator('[name=project]').selectOption('pr-a');
    await grantForm.locator('[name=user]').selectOption(account.id);
    await grantForm.locator('[name=active]').selectOption('false');
    await grantForm.getByRole('button').click();
    await sleepUntilMessage(operator, 'Đã cập nhật quyền quản trị dự án.');
    await page.locator('#refresh-ot').click();
    await page.locator('[data-role=project]').waitFor({ state: 'detached' });
    await page.getByText('Quản trị dự án · Chưa được cấp quyền', { exact: true }).waitFor();
    assert.equal(await page.locator('#calendar-scope').count(), 0);
    await page.reload();
    await sleepUntilMessage(page, 'Tài khoản chưa có quyền Quản trị dự án.');
    assert.equal(await page.locator('#calendar-scope').count(), 0);

    await page.locator('#logout').click();
    await sleepUntilMessage(page, 'Đã đăng xuất');
    assert.equal(await page.locator('#ot-workspace').innerText(), '');
    await login(page, account);
    await page.getByRole('heading', { name: 'Hồ sơ của tôi' }).waitFor();
    await page.evaluate(() => {
      const key = 'ot-workspace:session';
      const saved = JSON.parse(sessionStorage.getItem(key));
      sessionStorage.setItem(key, JSON.stringify({ ...saved, expiresAt: Date.now() - 1 }));
    });
    await page.reload();
    await page.getByRole('heading', { name: 'Đăng nhập', exact: true }).waitFor();
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ot-workspace:session')), null);
    await operator.locator('#user-invitation [name=email]').fill('fixture-send@bidv.com.vn');
    await operator.locator('#user-invitation [name=fullName]').fill('Thư mời giả lập');
    await operator.locator('#user-invitation [name=code]').fill('457');
    await operator.getByRole('button', { name: 'Tạo tài khoản và gửi thư mời' }).click();
    await sleepUntilMessage(operator, 'Đã gửi thư mời.');
    assert.ok(calls.some(call => call.endpoint.endsWith('/ot-invite-user') && call.fields.employeeCode === '00000457'));
    await page.getByRole('button', { name: 'Thư mời / Quên mật khẩu' }).click();
    const password = page.locator('#set-password');
    await password.locator('[name=email]').fill('fixture-send@bidv.com.vn');
    await password.locator('[name=otp]').fill('234567');
    await password.locator('[name=password]').fill('Fixture-new-password');
    await password.getByRole('button', { name: 'Lưu mật khẩu' }).click();
    await sleepUntilMessage(page, 'Đã lưu mật khẩu.');
    assert.equal(await page.locator('#login [name=email]').inputValue(), 'fixture-send@bidv.com.vn');
    assert.equal(await page.evaluate(() => sessionStorage.getItem('ot-workspace:session')), null);
    await page.getByRole('button', { name: 'Thư mời / Quên mật khẩu' }).click();
    await password.getByRole('button', { name: 'Gửi mã đặt lại mật khẩu' }).click();
    await sleepUntilMessage(page, 'Supabase sẽ gửi mã đặt lại mật khẩu');
    assert.equal(await password.locator('[name=mode]').inputValue(), 'recovery');
    await password.locator('[name=otp]').fill('234567');
    await password.locator('[name=password]').fill('Fixture-new-password');
    await password.getByRole('button', { name: 'Lưu mật khẩu' }).click();
    await sleepUntilMessage(page, 'Đã lưu mật khẩu.');
    assert.ok(calls.some(call => call.endpoint.endsWith('/verify') && call.fields.type === 'recovery'));
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    console.log('PASS Supabase mocked: registration, OTP, reload and expiry, user management, project membership, three selectable roles, live OT confirmation, monthly draft, unit history, signing XLSX, inline calendar and locked period, Excel OT, filter, warning and export.');
  } finally {
    await browser?.close();
    server.kill();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
