import { esc, option } from '../supabase/ui.mjs';

const standardUnits = [
  'Ban QLPTCB',
  'Trung tâm PTPM',
  'Trung tâm CNTT',
  'TTDVKH',
  'Ban KDV&TT',
  'Trung tâm TNTTTM',
  'Ban QLRRHĐ&TT',
  'Trung tâm DL&PT',
  'TTTT',
  'Ban Sản phẩm Bán lẻ',
  'Ban Kế toán',
  'Trung tâm VHNHBL'
];
const memory = new Map();
const cleanUnit = value => typeof value === 'string' ? value.trim().replace(/\s+/g, ' ').normalize('NFC') : '';
export const unitKey = value => cleanUnit(value).toLocaleLowerCase('vi');
const storageKey = scope => 'ot-workspace:organization-units:' + scope;

function savedUnits(scope) {
  try {
    const stored = JSON.parse(localStorage.getItem(storageKey(scope)) ?? '[]');
    if (Array.isArray(stored)) return [...stored, ...(memory.get(scope) ?? [])];
  } catch {
    // The active page can still remember units when browser storage is unavailable.
  }
  return memory.get(scope) ?? [];
}

function uniqueUnits(units) {
  const names = new Map();
  for (const item of units) {
    const name = cleanUnit(item);
    const key = unitKey(name);
    if (key && !names.has(key)) names.set(key, name);
  }
  return [...names.values()];
}

function rememberUnit(scope, name) {
  const names = uniqueUnits([...savedUnits(scope), name]);
  memory.set(scope, names);
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(names));
  } catch {
    // Keep the current page usable even if storage is unavailable.
  }
}

export function renderUnitPicker({ id, scope, label, selected, history = [], placeholder = 'Chọn đơn vị',
  required = false, maxLength = 250, className = '', showLabel = true }) {
  const names = uniqueUnits([...standardUnits, ...savedUnits(scope), ...history, selected]);
  const value = names.find(name => unitKey(name) === unitKey(selected)) ?? '';
  const select = `<select id="${esc(id)}" class="${esc(className)}" aria-label="${esc(label)}"${required ? ' required' : ''}>
    ${option('', placeholder, value)}
    ${names.map(name => option(name, name, value)).join('')}
    <option value=":other:" data-other>Khác</option>
  </select>`;
  return `<div data-unit-picker>
    ${showLabel ? `<label for="${esc(id)}">${esc(label)}${select}</label>` : select}
    <label data-unit-custom hidden>Tên đơn vị khác <input class="${esc(className)}" type="text" maxlength="${maxLength}" disabled></label>
  </div>`;
}

export function bindUnitPicker(select, { scope, onInput = () => {}, onCommit = () => {} }) {
  const label = select.closest('[data-unit-picker]').querySelector('[data-unit-custom]');
  const custom = label.querySelector('input');
  const isOther = () => select.selectedOptions[0]?.hasAttribute('data-other');
  const value = () => isOther() ? cleanUnit(custom.value) : select.value;
  function showCustom(show) {
    label.hidden = !show;
    custom.disabled = !show;
    custom.required = show;
  }
  function finish() {
    const name = value();
    if (!isOther() || !name) return name;
    const other = select.selectedOptions[0];
    let item = [...select.options].find(option => option !== other && unitKey(option.value) === unitKey(name));
    if (!item) {
      item = new Option(name, name);
      other.before(item);
    }
    rememberUnit(scope, item.value);
    item.selected = true;
    custom.value = '';
    showCustom(false);
    if (value() !== name) onInput();
    onCommit(value());
    return value();
  }

  select.addEventListener('change', () => {
    const other = isOther();
    showCustom(other);
    if (other) {
      custom.value = '';
      custom.setCustomValidity('');
      custom.focus();
    }
    onInput();
    if (!other) onCommit(value());
  });
  custom.addEventListener('input', () => {
    custom.setCustomValidity(value() ? '' : 'Vui lòng nhập tên đơn vị.');
    onInput();
  });
  custom.addEventListener('change', finish);
  return { value, finish, controls: [select, custom] };
}
