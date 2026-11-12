const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const { mkdtempSync, existsSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { chromium } = require('playwright');

// Chạy ứng dụng tĩnh ở cổng riêng; chỉ dùng dữ liệu giả lập.
async function run() {
  const root = path.resolve(__dirname, '../..');
  const server = spawn('python3', ['-m', 'http.server', '4175', '--bind', '127.0.0.1'], { cwd: root, stdio: 'ignore' });
  const base = 'http://127.0.0.1:4175';
  const artifacts = mkdtempSync(path.join(tmpdir(), 'ot-preview-'));
  let browser;
  try {
    for (let i = 0; i < 40; i++) {
      if (server.exitCode !== null) throw Error('Không khởi động được HTTP server ở cổng 4175.');
      try { if ((await fetch(base)).ok) break; } catch {}
      await new Promise(resolve => setTimeout(resolve, 100));
      if (i === 39) throw Error('HTTP server không phản hồi.');
    }
    const executablePath = process.env.BROWSER_EXECUTABLE || (existsSync('/usr/bin/chromium') ? '/usr/bin/chromium' : undefined);
    browser = await chromium.launch({ executablePath, headless: true });
    const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    const goto = async route => {
      await page.goto(`${base}/#/${route}`);
      await page.locator('h1').waitFor();
    };
    const routes = ['dashboard', 'upload', 'projects', 'employees', 'lookup', 'alerts', 'history', 'reports', 'backup'];
    for (const width of [1440, 768, 390, 360]) {
      await page.setViewportSize({ width, height: 1000 });
      for (const route of routes) {
        await goto(route);
        assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `Tràn ngang: ${route}, ${width}px`);
      }
    }
    console.log('PASS: 9 màn hình ở 4 kích thước (1440, 768, 390, 360).');
    await page.setViewportSize({ width: 1440, height: 1000 });
    await goto('dashboard');
    await page.screenshot({ path: path.join(artifacts, 'dashboard-desktop.png'), fullPage: true });
    assert.equal(await page.locator('.stat-value').first().innerText(), '48');
    await page.locator('[data-filter="year"]').selectOption('2025');
    assert.match(await page.locator('.stat-value').nth(2).innerText(), /^0/);
    await page.locator('[data-filter="year"]').selectOption('2026');
    await goto('employees');
    await page.locator('#employee-search').fill('DEMO001');
    assert.equal(await page.locator('#employee-results tbody tr').count(), 1);
    await page.locator('[data-action="employee-detail"]').click();
    await page.locator('dialog[open]').waitFor();
    assert.equal(await page.locator('dialog tbody tr').count(), 2, 'Cán bộ mẫu phải có OT trên nhiều dự án.');
    await page.getByRole('button', { name: 'Đóng', exact: true }).click();
    console.log('PASS: lọc kỳ, tìm kiếm và chi tiết cán bộ nhiều dự án.');
    await goto('projects');
    await page.getByRole('button', { name: 'Thêm dự án' }).click();
    await page.locator('#project-code').fill('TEST');
    await page.locator('#project-name').fill('Dự án Demo Kiểm thử');
    await page.getByRole('button', { name: 'Lưu dự án mẫu' }).click();
    assert.equal(await page.locator('.project-card').count(), 5);
    await goto('upload');
    await page.locator('[data-import="demo"]').click();
    await page.locator('[data-action="use-demo"]').click();
    await page.locator('input[value="supplement"]').check();
    await page.locator('[data-action="upload-next"]').click();
    await page.locator('[data-action="upload-review"]').click();
    assert(await page.locator('[data-action="confirm-import"]').isDisabled());
    await page.locator('[data-action="upload-back"]').click();
    await page.locator('[data-action="upload-back"]').click();
    await page.locator('input[value="replace"]').check();
    await page.locator('[data-action="upload-next"]').click();
    await page.locator('[data-action="upload-review"]').click();
    await page.locator('[data-action="confirm-import"]').click();
    assert.match(await page.locator('#toast').innerText(), /xác nhận kỳ/);
    await page.locator('#confirm-year').check();
    await page.locator('[data-action="confirm-import"]').click();
    await page.waitForURL('**/#/history');
    assert.equal(await page.getByText('Chỉ mô phỏng', { exact: true }).count(), 1);
    console.log('PASS: thêm dự án tạm, chặn bổ sung trùng và xác nhận kỳ trước import mô phỏng.');
    await goto('reports');
    const [report] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="export-report"]').click()]);
    assert.match(report.suggestedFilename(), /^DEMO_.*\.csv$/);
    await goto('backup');
    const [backup] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="backup-export"]').click()]);
    const backupPath = path.join(artifacts, 'backup.json');
    await backup.saveAs(backupPath);
    await page.locator('#backup-file').setInputFiles(backupPath);
    await page.waitForFunction(() => document.querySelector('#backup-result').textContent.includes('Cấu trúc DEMO hợp lệ'));
    await page.locator('#backup-file').setInputFiles({ name: 'invalid.json', mimeType: 'application/json', buffer: Buffer.from('{"demo":false}') });
    await page.waitForFunction(() => document.querySelector('#backup-result').textContent.includes('Không thể kiểm tra'));
    const storage = await page.evaluate(async () => ({ local: localStorage.length, databases: await indexedDB.databases() }));
    assert.deepEqual(storage, { local: 0, databases: [] });
    await page.reload();
    await goto('projects');
    assert.equal(await page.locator('.project-card').count(), 4, 'Dữ liệu demo không được lưu bền.');
    console.log('PASS: CSV, JSON hợp lệ/không hợp lệ, không ghi kho lưu trữ và đặt lại khi tải trang.');
    await page.setViewportSize({ width: 390, height: 844 });
    await goto('dashboard');
    await page.screenshot({ path: path.join(artifacts, 'dashboard-mobile.png'), fullPage: true });
    await page.locator('[data-action="toggle-menu"]').click();
    await page.locator('.sidebar.open').waitFor();
    await page.locator('.nav-link[href="#/upload"]').click();
    await page.waitForURL('**/#/upload');
    await page.locator('#real-excel-file').waitFor();
    assert.equal(await page.locator('.sidebar.open').count(), 0);
    assert.deepEqual(errors, [], 'Có lỗi JavaScript, tài nguyên hoặc CSP.');
    console.log('PASS: menu điện thoại, không có lỗi trình duyệt.');
    console.log(`Ảnh kiểm tra: ${artifacts}`);
  } finally {
    if (browser) await browser.close();
    server.kill();
  }
}
run().catch(error => { console.error(error); process.exitCode = 1; });
