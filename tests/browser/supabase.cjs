const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { existsSync } = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { bookFrom, binary } = require('../fixtures/workbooks.cjs');

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
const calls = [];
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
  calls.push({ endpoint, fields, actor: actor?.id });
  const send = (value, status = 200) => route.fulfill({ status, json: value,
    headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'sb-request-id',
      'sb-request-id': 'fixture-request-id' } });
  const session = user => ({ access_token: 'fixture-session-' + user.id, user: { id: user.id } });
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
  if (endpoint.endsWith('/ot_projects')) return send(projects);
  if (endpoint.endsWith('/ot_periods')) return send(periods);
  if (endpoint.endsWith('/ot_entries')) return send(entries.filter(row => actor === admin || row.user_id === actor.id));
  if (endpoint.endsWith('/ot_project_members') || endpoint.endsWith('/ot_audit_events')) return send([]);
  if (endpoint.endsWith('/ot_review_profile')) {
    assert.equal(actor, admin);
    Object.assign(account, { status: 'active', employee_code: fields.p_employee_code });
    return send(null);
  }
  if (endpoint.endsWith('/ot_set_member')) {
    assert.equal(actor, admin);
    return send(null);
  }
  if (endpoint.endsWith('/ot_set_period')) {
    assert.equal(actor, admin);
    const row = periods.find(item => item.project_id === fields.p_project);
    assert.equal(fields.p_expected_revision, row.revision);
    row.is_open = fields.p_open;
    return send(++row.revision);
  }
  if (endpoint.endsWith('/ot_submit_entries')) {
    const period = periods.find(item => item.project_id === fields.p_project);
    assert.equal(fields.p_period_revision, period.revision);
    assert.equal(fields.p_data_revision, period.data_revision);
    assert.equal(fields.p_batch, false);
    assert.ok(period.is_open);
    if (fields.p_replace) for (const row of entries) {
      if (row.project_id === fields.p_project && row.user_id === actor.id) row.active = false;
    }
    ++period.data_revision;
    for (const row of fields.p_rows) entries.push({ ...row, id: entries.length + 1, user_id: actor.id,
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
  await page.locator(selector + ' [name=month]').fill('11');
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
    await operator.getByText('Duyệt tài khoản', { exact: true }).click();
    await operator.locator('#admin-profile [name=user]').selectOption(account.id);
    await operator.locator('#admin-profile button').click();
    await sleepUntilMessage(operator, 'Đã cập nhật duyệt tài khoản.');
    await operator.getByText('Phân công dự án', { exact: true }).click();
    await operator.locator('#admin-member [name=project]').selectOption('pr-a');
    await operator.locator('#admin-member [name=user]').selectOption(account.id);
    await operator.locator('#admin-member button').click();
    await sleepUntilMessage(operator, 'Đã lưu phân công.');

    await login(page, account);
    await page.getByText('Nhập theo ngày', { exact: true }).click();
    await fillPeriod(page, '#manual-ot', 'pr-a');
    await page.locator('#manual-ot [name=days]').fill('1 NT 1200\n2 L 300');
    await page.locator('#manual-ot button').click();
    await sleepUntilMessage(page, 'Kỳ chưa mở');
    await operator.getByText('Mở và khóa kỳ nhập OT', { exact: true }).click();
    await fillPeriod(operator, '#admin-period', 'pr-a');
    await operator.locator('#admin-period button').click();
    await sleepUntilMessage(operator, 'Đã lưu trạng thái kỳ.');
    await page.locator('#refresh-ot').click();
    await sleepUntilMessage(page, 'Đã tải dữ liệu mới nhất.');
    await fillPeriod(page, '#manual-ot', 'pr-a');
    await page.locator('#manual-ot [name=days]').fill('1 NT 1200\n2 L 300');
    await page.locator('#manual-ot button').click();
    await page.locator('#commit-ot input').check();
    await page.locator('#commit-ot button.primary').click();
    await sleepUntilMessage(page, 'Đã lưu OT cho 1 cán bộ.');

    await page.getByText('Nhập từ Excel', { exact: true }).click();
    await fillPeriod(page, '#excel-ot', 'pr-b');
    const workbook = binary(bookFrom([['Họ tên', 'Mã cán bộ', 'Đơn vị', 'Giờ NT', 'Giờ NN', 'Tổng giờ'],
      [account.full_name, '23', 'Đơn vị giả lập', 25, 0, 25], ['Người khác', '99', 'Đơn vị giả lập', 1, 1, 2]]));
    await page.locator('#excel-ot [name=file]').setInputFiles({
      name: 'fixture.xlsx', mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', buffer: workbook
    });
    await page.locator('#excel-ot button').click();
    await page.locator('#excel-mapping button').click();
    await sleepUntilMessage(page, 'vượt hạn mức tháng 10 giờ');
    assert.doesNotMatch(await page.locator('#commit-ot').innerText(), /Người khác|00000099/);
    await page.locator('#commit-ot input').check();
    await page.locator('#commit-ot button.primary').click();
    await sleepUntilMessage(page, 'Đã lưu OT cho 1 cán bộ.');
    const report = '#report-form';
    await page.locator(report + ' [name=year]').fill('2026');
    await page.locator(report + ' [name=month]').fill('11');
    await page.locator(report + ' [name=project]').selectOption('pr-a');
    await page.locator(report + ' button.primary').click();
    await sleepUntilMessage(page, 'Tổng OT theo bộ lọc: 25 giờ');
    const reportText = await page.locator('#report-form').locator('..').innerText();
    assert.match(reportText, /50/);
    assert.match(reportText, /vượt 10 giờ/);
    const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('#export-backup').click()]);
    assert.match(backup.suggestedFilename(), /ot-supabase-backup/);
    assert.equal(await page.locator('#admin-project').count(), 0);
    await page.locator('#logout').click();
    await sleepUntilMessage(page, 'Đã đăng xuất');
    assert.equal(await page.locator('#ot-workspace').innerText(), '');
    assert.deepEqual(errors, []);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth), 390);
    console.log('PASS Supabase mocked: registration, OTP, resend, error handling, logout, admin, locked period, manual and Excel OT, filter, warning and export.');
  } finally {
    await browser?.close();
    server.kill();
  }
}

run().catch(error => { console.error(error); process.exitCode = 1; });
