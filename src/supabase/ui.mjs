export const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
}[char]));

export const option = (value, label, selected) =>
  `<option value="${esc(value)}"${String(value) === String(selected) ? ' selected' : ''}>${esc(label)}</option>`;

export const projectOptions = (projects, selected) =>
  projects.map(project => option(project.id, project.code + ' · ' + project.name, selected)).join('');

export const hours = minutes => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(minutes / 60);

export function download(name, content, type) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function table(headers, rows) {
  if (!rows.length) return '<p class="account-muted">Chưa có dữ liệu phù hợp.</p>';
  return `<div class="table-wrap"><table><thead><tr>${headers.map(cell => '<th scope="col">' + esc(cell) + '</th>').join('')}</tr></thead>
    <tbody>${rows.map(row => '<tr>' + row.map(cell => '<td>' + esc(cell) + '</td>').join('') + '</tr>').join('')}</tbody></table></div>`;
}
