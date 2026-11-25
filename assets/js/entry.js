const local = ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
if (local || new URLSearchParams(location.search).get('legacy') === '1') {
  await import('./app.js?v=0.7.1');
} else {
  location.replace(new URL('./kiem-tra-tai-khoan.html', location.href));
}
