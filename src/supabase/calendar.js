import { dateOf, dayTypes, defaultDays, defaultLimit, durationValue, monthLegend, monthOptions, renderMonthGrid, weekdays } from './month-grid.js?v=7';
import { esc, option, projectOptions } from './ui.mjs';

export function renderCalendar(state) {
  const { calendarProject: project, calendarYear: year, calendarMonth: month } = state;
  return `<section class="account-card" aria-labelledby="calendar-title">
    <h2 id="calendar-title">Lịch và kỳ nhập OT</h2>
    <form id="calendar-scope" class="account-grid">
      <label>Dự án<select name="project" required>${projectOptions(state.projects, project)}</select></label>
      <label>Năm<input type="number" name="year" min="2000" max="2100" required value="${year}"></label>
      <label>Tháng<select name="month">${monthOptions(month)}</select></label>
    </form>
    <div id="calendar-content"></div>
  </section>`;
}

export function renderCalendarPeriod(state, findPeriod, findCalendar, findLimits) {
  const { calendarProject: project, calendarYear: year, calendarMonth: month } = state;
  const period = findPeriod(project, year, month);
  const saved = findCalendar(project, year, month);
  const days = saved ?? defaultDays(year, month);
  const limits = findLimits(project, year, month) ?? days.map(defaultLimit);
  const active = state.projects.find(item => item.id === project)?.status === 'active';
  const editing = active && !period?.is_open;
  return `<form id="calendar-days">
    <div class="pane-heading"><h3>Tháng ${month}/${year}</h3>
      <span class="period-status" data-open="${Boolean(period?.is_open)}">${period?.is_open ? 'Đang mở' : 'Đang khóa'}</span>
    </div>
      ${monthLegend()}
      <p class="account-muted">${!active ? 'Dự án đã ngừng hoạt động.' : period?.is_open ? 'Khóa kỳ trước khi sửa lịch.'
        : saved ? 'Chọn loại ngày cần đổi rồi lưu lịch.' : 'Lịch gợi ý đặt thứ Bảy và Chủ nhật là ngày nghỉ. Chọn ngày lễ của đơn vị trước khi lưu.'}</p>
      <p class="account-muted">${state.limitsEnabled ? 'Mặc định 2 giờ ngày thường và 4 giờ ngày nghỉ hoặc ngày lễ. Nhập 0 để ngày đó không được nhập OT.'
        : 'Cần áp dụng migration giới hạn OT trong Supabase để chỉnh giới hạn theo ngày.'}</p>
      ${renderMonthGrid(year, month, days, {
        label: 'Loại ngày tháng ' + month + '/' + year,
        rows: [{ label: 'Loại ngày', cell: (type, day) => `<select name="day" aria-label="Ngày ${day}"
          title="${dayTypes[type]}" ${editing ? '' : 'disabled'}>${Object.keys(dayTypes)
            .map(code => option(code, code, type)).join('')}</select>` },
          ...(state.limitsEnabled ? [{ label: 'Giới hạn (giờ)', cell: (_, day) => `<input name="limit" inputmode="decimal"
            aria-label="Giới hạn giờ ngày ${day}" value="${durationValue(limits[day - 1])}" ${editing ? 'required' : 'readonly'}>` }] : [])]
      })}
      <div class="account-actions month-actions">
        ${editing ? '<button class="primary">Lưu lịch tháng</button>' : ''}
        ${period?.is_open || (active && saved) ? `<button type="button" id="calendar-period" ${period?.is_open ? '' : 'class="primary"'}>
          ${period?.is_open ? 'Khóa kỳ' : 'Mở kỳ'}</button>` : ''}
      </div>
      ${editing ? '<p id="calendar-draft" role="status" hidden>Lịch có thay đổi. Hãy lưu trước khi mở kỳ.</p>' : ''}
    </form>
    <details><summary>Xem đủ 12 tháng</summary>
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
                `<span data-day-type="${esc(type)}" title="${dayTypes[type]}">${j + 1} <small>${esc(type)}</small></span>`).join('')}
            </div></section>`;
        }).join('')}
      </div>
    </details>`;
}
