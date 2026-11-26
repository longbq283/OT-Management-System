import { esc, option, projectOptions } from './ui.mjs';

const types = { NT: 'Ngày thường', NN: 'Ngày nghỉ', L: 'Ngày lễ' };
const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const dateOf = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

export function defaultDays(year, month) {
  const count = dateOf(year, month + 1, 0).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const weekday = dateOf(year, month, i + 1).getUTCDay();
    return weekday === 0 || weekday === 6 ? 'NN' : 'NT';
  });
}

export function renderCalendar(state, findPeriod, findCalendar) {
  const { calendarProject: project, calendarYear: year, calendarMonth: month } = state;
  const period = findPeriod(project, year, month);
  const saved = findCalendar(project, year, month);
  const days = saved ?? defaultDays(year, month);
  const offset = (dateOf(year, month, 1).getUTCDay() + 6) % 7;
  return `<section class="account-card" aria-labelledby="calendar-title">
    <h2 id="calendar-title">Lịch làm việc theo dự án</h2>
    <form id="calendar-scope">
      <div class="account-grid">
        <label>Dự án<select name="project" required>${projectOptions(state.projects, project)}</select></label>
        <label>Năm<input type="number" name="year" min="2000" max="2100" required value="${year}"></label>
      </div>
      <button>Xem lịch năm</button>
    </form>
    <div class="calendar-months" aria-label="Các tháng năm ${year}">
      ${Array.from({ length: 12 }, (_, i) => {
        const m = i + 1;
        const p = findPeriod(project, year, m);
        const label = p?.is_open ? 'Đang mở' : findCalendar(project, year, m) ? 'Đã lưu lịch' : 'Chưa có lịch';
        return `<button type="button" data-calendar-month="${m}" aria-current="${m === month}">
          <strong>Tháng ${m}</strong><small>${label}</small></button>`;
      }).join('')}
    </div>
    <details><summary>Xem đủ 12 tháng</summary>
      <p>NT · Ngày thường &nbsp; NN · Ngày nghỉ &nbsp; L · Ngày lễ</p>
      <div class="calendar-year">
        ${Array.from({ length: 12 }, (_, i) => {
          const m = i + 1;
          const monthDays = findCalendar(project, year, m);
          const first = (dateOf(year, m, 1).getUTCDay() + 6) % 7;
          return `<section><h3>Tháng ${m}${monthDays ? '' : ' · Gợi ý'}</h3>
            <div class="calendar-mini">
              ${weekdays.map(day => `<strong>${day}</strong>`).join('')}
              ${'<span aria-hidden="true"></span>'.repeat(first)}
              ${(monthDays ?? defaultDays(year, m)).map((type, j) =>
                `<span class="calendar-day" data-day-type="${esc(type)}" title="${types[type]}">${j + 1} <small>${esc(type)}</small></span>`).join('')}
            </div></section>`;
        }).join('')}
      </div>
    </details>
    <form id="calendar-days">
      <h3>Tháng ${month}/${year}</h3>
      <p class="account-muted">${period?.is_open ? 'Khóa kỳ nhập OT trước khi sửa lịch.'
        : saved ? 'Lịch đang sử dụng. Chọn loại ngày cần thay đổi rồi lưu lại.'
          : 'Lịch gợi ý đặt thứ Hai đến thứ Sáu là ngày thường, thứ Bảy và Chủ nhật là ngày nghỉ. Đánh dấu ngày lễ của đơn vị trước khi lưu và mở kỳ.'}</p>
      <div class="calendar-grid">
        ${weekdays.map(day => `<strong>${day}</strong>`).join('')}
        ${'<span aria-hidden="true"></span>'.repeat(offset)}
        ${days.map((type, i) => `<label class="calendar-day" data-day-type="${esc(type)}">
          <span>${i + 1}</span><select name="day" aria-label="Ngày ${i + 1}" ${period?.is_open ? 'disabled' : ''}>
          ${Object.entries(types).map(([code, label]) => option(code, label, type)).join('')}</select>
        </label>`).join('')}
      </div>
      <button class="primary" ${period?.is_open ? 'disabled' : ''}>Lưu lịch tháng</button>
    </form>
  </section>`;
}
