import { esc } from './ui.mjs';

const searchKey = value => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').trim();

export function renderMemberPicker() {
  return `<details class="member-picker">
    <summary>Cán bộ · <span data-picked-count>0 đã chọn</span></summary>
    <label>Tìm theo tên hoặc mã cán bộ<input type="search" data-member-search></label>
    <div data-member-options class="member-picker-options" role="group" aria-label="Danh sách cán bộ"></div>
  </details><div class="account-actions member-picker-selection" data-member-selection></div>`;
}

export function bindMemberPicker(parent, people, initiallySelected = []) {
  const search = parent.querySelector('[data-member-search]');
  const results = parent.querySelector('[data-member-options]');
  const selected = new Set(initiallySelected.map(String));
  const chips = parent.querySelector('[data-member-selection]');
  function updateSelection() {
    parent.querySelector('[data-picked-count]').textContent = selected.size + ' đã chọn';
    chips.innerHTML = people.filter(person => selected.has(String(person.user_id))).map(person =>
      `<button type="button" data-remove="${esc(person.user_id)}" aria-label="Bỏ chọn ${esc(person.full_name)}">${esc(person.full_name)} ×</button>`).join('');
    for (const button of chips.querySelectorAll('button')) button.onclick = () => {
      selected.delete(button.dataset.remove);
      updateSelection();
      showResults();
      parent.querySelector('.member-picker summary').focus();
    };
  }
  function showResults() {
    const query = searchKey(search.value);
    results.innerHTML = people.filter(person => searchKey(person.full_name + ' ' + person.employee_code).includes(query)).map(person =>
      `<label><input type="checkbox" value="${esc(person.user_id)}" ${selected.has(String(person.user_id)) ? 'checked' : ''}>
        <span>${esc(person.full_name)} · ${esc(person.employee_code)}${person.group_name ? ' · ' + esc(person.group_name) : ''}</span></label>`)
      .join('') || '<p>Không tìm thấy cán bộ phù hợp.</p>';
    for (const input of results.querySelectorAll('input')) input.onchange = () => {
      if (input.checked) selected.add(input.value);
      else selected.delete(input.value);
      updateSelection();
    };
  }
  search.oninput = showResults;
  search.onkeydown = event => { if (event.key === 'Enter') event.preventDefault(); };
  updateSelection();
  showResults();
  return { values: () => [...selected] };
}
