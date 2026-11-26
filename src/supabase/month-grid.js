import { esc, option } from './ui.mjs';

export const dayTypes = { NT: 'Ngày thường', NN: 'Ngày nghỉ', L: 'Ngày lễ' };
export const weekdays = ['T2', 'T3', 'T4', 'T5', 'T6', 'T7', 'CN'];
const weekdayByDate = ['CN', ...weekdays.slice(0, 6)];
export const dateOf = (year, month, day) => new Date(Date.UTC(year, month - 1, day));

export function defaultDays(year, month) {
  const count = dateOf(year, month + 1, 0).getUTCDate();
  return Array.from({ length: count }, (_, i) => {
    const weekday = dateOf(year, month, i + 1).getUTCDay();
    return weekday === 0 || weekday === 6 ? 'NN' : 'NT';
  });
}

export function monthOptions(selected) {
  return Array.from({ length: 12 }, (_, i) => option(i + 1, 'Tháng ' + (i + 1), selected)).join('');
}

export function monthLegend() {
  return `<ul class="month-legend">${Object.entries(dayTypes).map(([type, label]) =>
    `<li><span data-day-type="${type}">${type}</span> ${label}</li>`).join('')}</ul>`;
}

export function renderMonthGrid(year, month, days, { label, rows }) {
  return `<div class="month-scroll" tabindex="0" role="region" aria-label="${esc(label)}">
    <table class="month-sheet">
      <thead><tr><th scope="col">Ngày</th>${days.map((type, i) => {
        const weekday = weekdayByDate[dateOf(year, month, i + 1).getUTCDay()];
        return `<th scope="col" data-day-type="${esc(type)}"><strong>${i + 1}</strong><small>${weekday}</small></th>`;
      }).join('')}</tr></thead>
      <tbody>${rows.map(row => `<tr><th scope="row">${esc(row.label)}</th>${days.map((type, i) =>
        `<td data-day-type="${esc(type)}">${row.cell(type, i + 1)}</td>`).join('')}</tr>`).join('')}</tbody>
    </table>
  </div>`;
}
