import { defaultLimit, monthLegend, monthOptions, renderMonthGrid } from './month-grid.js?v=7';
import { bindMemberPicker, renderMemberPicker } from './member-picker.js';
import { esc, hours, option, projectOptions, table } from './ui.mjs';

export const groupPane = '<section class="account-card" id="approval-groups"></section>';
export const approvalPane = '<section class="account-card" id="approval-requests"></section>';
const statusLabels = { pending:'Chờ duyệt', approved:'Đã duyệt', returned:'Trả lại' };
const sum = row => row.nt_minutes + row.nn_minutes;

export function mountApprovalGroups(target, state, { api,action,alive,notice }) {
  if (!target) return null;
  const projects = state.projects.filter(item => item.status === 'active');
  let project = projects.some(item => item.id === state.approvalGroupProject) ? state.approvalGroupProject : projects[0]?.id;
  let activeId = state.approvalGroupId;
  let rows = [];
  let candidates = [];
  function paint() {
    state.approvalGroupProject = project;
    const group = rows.find(item => item.id === activeId);
    const eligible = candidates.filter(item => item.assigned && item.organization_unit === 'Ban QLPTCB');
    const personOptions = id => eligible.map(p => option(p.user_id,p.full_name + ' · ' + p.employee_code,id)).join('');
    target.innerHTML = `<h2>Cấu hình nhóm duyệt</h2>
      <label>Dự án<select id="approval-group-project">${projectOptions(projects,project)}</select></label>
      ${project ? `<p class="account-muted">Chỉ cấu hình các nhóm cần duyệt thuộc Ban QLPTCB. Cán bộ được quản trị hệ thống cập nhật đơn vị trong hồ sơ.</p>
      <div class="approval-group-layout">
        <div><div class="account-actions"><button id="new-approval-group" type="button">Thêm nhóm</button></div>
          ${rows.length ? rows.map(item => `<button class="approval-group-choice" data-group-id="${item.id}" type="button"
            aria-current="${group?.id === item.id}">${esc(item.name)} · ${item.members.length} cán bộ</button>`).join('') : '<p>Chưa có nhóm duyệt.</p>'}
        </div>
        <form id="approval-group-editor">
          <label>Tên nhóm<input name="name" required maxlength="70" value="${esc(group?.name)}"></label>
          <label><input name="enabled" type="checkbox" ${group?.enabled !== false ? 'checked' : ''}> Yêu cầu trưởng nhóm duyệt OT</label>
          <div class="account-grid">
            <label>Trưởng nhóm duyệt<select name="reviewer"><option value="">Chọn trưởng nhóm</option>${personOptions(group?.reviewer_id)}</select></label>
            <label>Người duyệt thay<select name="backup"><option value="">Chọn nếu cần</option>${personOptions(group?.backup_id)}</select></label>
          </div>
          ${renderMemberPicker()}
          <button class="primary" type="submit">Lưu cấu hình</button>
        </form>
      </div>` : '<p>Chưa có dự án thuộc phạm vi quản lý.</p>'}`;
    target.querySelector('#approval-group-project').onchange = event => action(async () => {
      const previousProject = project;
      const previousGroup = activeId;
      project = event.target.value;
      activeId = null;
      try {
        await load();
      } catch (error) {
        project = previousProject;
        activeId = previousGroup;
        event.target.value = previousProject;
        throw error;
      }
    });
    if (!project) return;
    for (const button of target.querySelectorAll('[data-group-id]')) button.onclick = () => {
      activeId = state.approvalGroupId = Number(button.dataset.groupId);
      paint();
    };
    target.querySelector('#new-approval-group').onclick = () => {
      activeId = state.approvalGroupId = null;
      paint();
    };
    const form = target.querySelector('#approval-group-editor');
    const people = eligible.map(item => ({...item, group_name:rows.find(row => row.id !== activeId && row.members.includes(item.user_id))?.name}));
    const picker = bindMemberPicker(form,people,(group?.members ?? []).filter(id => eligible.some(item => item.user_id === id)));
    form.onsubmit = event => {
      event.preventDefault();
      const fields = new FormData(form);
      const members = picker.values();
      if (!members.length) return notice('Chọn ít nhất một cán bộ thuộc nhóm.',true);
      const moves = people.filter(item => members.includes(item.user_id) && item.group_name);
      action(async () => {
        if (moves.length && !window.confirm('Chuyển ' + moves.map(item => item.full_name).join(', ') + ' sang nhóm này?')) return;
        activeId = state.approvalGroupId = await api.rpc('ot_save_approval_group',{
          p_project:project,p_group:activeId ?? null,p_name:fields.get('name'),p_enabled:fields.has('enabled'),
          p_reviewer:fields.get('reviewer') || null,p_backup:fields.get('backup') || null,p_members:members,p_transfer:Boolean(moves.length)
        });
        await load();
        if (alive()) notice('Đã lưu cấu hình nhóm duyệt.');
      });
    };
  }
  async function load() {
    const selected = project;
    if (selected) {
      const [groups,people] = await Promise.all([api.rpc('ot_list_approval_groups',{p_project:selected}),
        api.rpc('ot_project_candidates',{p_project:selected})]);
      if (!alive() || selected !== project || !target.isConnected) return;
      rows = groups;
      candidates = people;
      if (!rows.some(item => item.id === activeId)) activeId = rows[0]?.id;
    }
    paint();
  }
  return load;
}

export function mountApproval(target, state, { api,action,alive,notice,refresh }) {
  if (!target) return;
  const projects = state.projects.filter(project => state.approvalAccess.review_projects.includes(project.id));
  let project = projects.some(item => item.id === state.approvalProject) ? state.approvalProject : projects[0]?.id;
  let year = state.approvalYear ?? state.year;
  let month = state.approvalMonth ?? state.month;
  let status = state.approvalStatus ?? 'pending';
  let selectedId = state.approvalSelectedRequest;
  let all = [];
  const checked = new Set();
  async function load() {
    if (!project) return;
    const requests = await api.rpc('ot_list_approval_requests',{p_project:project,p_year:year,p_month:month});
    if (!alive() || !target.isConnected) return;
    all = requests;
    paint();
  }
  function confirm(items) {
    if (!items.length) return;
    const dialog = target.querySelector('#approval-confirm-approval');
    dialog.querySelector('p').textContent = items.length + ' phiếu OT thuộc dự án ' +
      projects.find(item => item.id === project).name + ' · tháng ' + month + '/' + year;
    dialog.returnValue = '';
    dialog.showModal();
    dialog.addEventListener('close', async () => {
      if (dialog.returnValue !== 'approve') return;
      void action(async () => {
        const count = await api.rpc('ot_decide_approval_requests',{p_project:project,p_year:year,p_month:month,
          p_ids:items.map(item => item.id),p_approve:true,p_reason:null});
        await refresh();
        if (alive()) notice('Đã duyệt ' + count + ' phiếu OT.');
      });
    }, { once:true });
  }
  function paint() {
    Object.assign(state,{approvalProject:project,approvalYear:year,approvalMonth:month,approvalStatus:status});
    const visible = all.filter(item => item.state === status);
    const current = visible.find(item => item.id === selectedId) ?? visible[0];
    selectedId = state.approvalSelectedRequest = current?.id;
    const pending = visible.filter(item => item.state === 'pending');
    target.innerHTML = `<h2>Duyệt bảng chấm OT</h2>
      <div class="account-grid">
        <label>Dự án<select id="approval-review-project">${projectOptions(projects,project)}</select></label>
        <label>Năm<input type="number" id="approval-review-year" min="2000" max="2100" required value="${year}"></label>
        <label>Tháng<select id="approval-review-month">${monthOptions(month)}</select></label>
      </div>
      <div class="account-actions">${Object.entries(statusLabels).map(([key,label]) => `<button type="button"
        aria-current="${status === key}" data-review-state="${key}">${label} (${all.filter(item => item.state === key).length})</button>`).join('')}</div>
      ${visible.length ? `<div class="table-wrap"><table><thead><tr>
        ${pending.length ? '<th scope="col"><input type="checkbox" id="approval-select-all" aria-label="Chọn tất cả phiếu chờ"></th>' : ''}
        <th scope="col">Cán bộ</th><th scope="col">Mã cán bộ</th><th scope="col">Nhóm</th><th scope="col">Tổng OT (giờ)</th><th scope="col">Bảng chấm</th>
      </tr></thead><tbody>${visible.map(item => `<tr>
        ${pending.length ? `<td><input type="checkbox" data-review-check="${item.id}" aria-label="Chọn phiếu của ${esc(item.row.full_name)}" ${checked.has(item.id) ? 'checked' : ''}></td>` : ''}
        <td>${esc(item.row.full_name)}</td><td>${esc(item.row.employee_code)}</td><td>${esc(item.group)}</td><td>${hours(sum(item.row))}</td>
        <td><button type="button" data-open-request="${item.id}" aria-label="Xem bảng chấm của ${esc(item.row.full_name)}" aria-current="${current?.id === item.id}">Xem bảng chấm</button></td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="account-muted">Không có phiếu ở trạng thái này.</p>'}
      ${pending.length ? '<div class="account-actions approval-review-actions"><span id="approval-selection" aria-live="polite"></span>' +
        '<button type="button" class="primary" id="approval-approve-selected">Duyệt đã chọn</button>' +
        '<button type="button" id="approval-approve-all">Duyệt tất cả (' + pending.length + ')</button></div>' : ''}
      <div id="approval-review-detail"></div>
      <dialog id="approval-confirm-approval" aria-label="Xác nhận duyệt"><h2>Xác nhận duyệt bảng chấm OT</h2><p></p>
        <form method="dialog" class="account-actions"><button value="cancel">Quay lại</button><button class="primary" value="approve">Xác nhận duyệt</button></form>
      </dialog>`;
    const changeScope = () => action(async () => {
      const yearInput = target.querySelector('#approval-review-year');
      if (!yearInput.reportValidity()) return;
      project = target.querySelector('#approval-review-project').value;
      year = Number(yearInput.value);
      month = Number(target.querySelector('#approval-review-month').value);
      checked.clear();
      all = [];
      paint();
      await load();
    });
    for (const selector of ['#approval-review-project','#approval-review-year','#approval-review-month']) {
      target.querySelector(selector).onchange = changeScope;
    }
    for (const button of target.querySelectorAll('[data-review-state]')) button.onclick = () => {
      status = button.dataset.reviewState; checked.clear(); paint();
    };
    for (const button of target.querySelectorAll('[data-open-request]')) button.onclick = () => {
      selectedId = Number(button.dataset.openRequest);
      state.approvalSelectedRequest = selectedId;
      for (const item of target.querySelectorAll('[data-open-request]')) item.setAttribute('aria-current',String(item===button));
      showDetail(visible.find(item => item.id === selectedId));
      target.querySelector('#approval-review-detail').scrollIntoView({block:'nearest'});
    };
    function updateSelection() {
      if (!pending.length) return;
      const count = pending.filter(item => checked.has(item.id)).length;
      const toggle = target.querySelector('#approval-select-all');
      toggle.checked = count === pending.length;
      toggle.indeterminate = count > 0 && count < pending.length;
      target.querySelector('#approval-selection').textContent = count + ' / ' + pending.length + ' phiếu đã chọn';
      target.querySelector('#approval-approve-selected').disabled = !count;
    }
    for (const box of target.querySelectorAll('[data-review-check]')) box.onchange = () => {
      const id = Number(box.dataset.reviewCheck);
      if (box.checked) checked.add(id); else checked.delete(id);
      updateSelection();
    };
    if (pending.length) {
      target.querySelector('#approval-select-all').onchange = event => {
        checked.clear();
        for (const box of target.querySelectorAll('[data-review-check]')) {
          box.checked = event.target.checked;
          if (box.checked) checked.add(Number(box.dataset.reviewCheck));
        }
        updateSelection();
      };
      target.querySelector('#approval-approve-selected').onclick = () => confirm(pending.filter(item => checked.has(item.id)));
      target.querySelector('#approval-approve-all').onclick = () => confirm(pending);
      updateSelection();
    }
    showDetail(current);
  }

  function showDetail(current) {
    const detail = target.querySelector('#approval-review-detail');
    detail.replaceChildren();
    if (!current) return;
    const { row, days } = current;
    const recorded = new Map(row.days.map(day => [Number(day.date.slice(-2)),day]));
    const limits = current.limits ?? days.map(defaultLimit);
    detail.innerHTML = `<section class="manual-review">
      <div class="pane-heading"><h3>Bảng chấm OT · ${esc(row.full_name)} · ${month}/${year}</h3><span class="period-status" data-open="${current.state === 'approved'}">${statusLabels[current.state]}</span></div>
      ${monthLegend()}
      ${renderMonthGrid(year, month, days, { label:'Bảng chấm OT cả tháng của ' + row.full_name, rows:[
        {label:'Loại ngày',cell:type=>type},
        {label:'Giới hạn (giờ)',cell:(_,day)=>hours(limits[day-1])},
        {label:'Số giờ OT',cell:(_,day)=>recorded.has(day) ? '<strong class="approval-logged">' + hours(recorded.get(day).minutes) + '</strong>' : ''}
      ] })}
      <div class="month-actions"><output>Tổng OT ${hours(sum(row))} giờ</output></div>
      <div class="manual-review">${table(['Mã cán bộ','Họ tên','Đơn vị (Ban/TT)','NT (giờ)','NN gồm L (giờ)','OT (giờ)'],
        [[row.employee_code,row.full_name,row.unit,hours(row.nt_minutes),hours(row.nn_minutes),hours(sum(row))]])}</div>
      ${current.reason ? '<p class="account-muted">Lý do trả lại: ' + esc(current.reason) + '</p>' : ''}
      ${current.state === 'pending' ? '<div class="account-actions approval-review-actions"><button type="button" id="approval-return-one">Trả lại</button>' +
        '<button type="button" class="primary" id="approval-approve-one">Duyệt phiếu này</button></div>' +
        '<dialog id="approval-return-dialog" aria-label="Trả lại phiếu"><h2>Trả lại phiếu OT</h2><form method="dialog">' +
        '<label>Lý do trả lại<textarea name="reason" required maxlength="500"></textarea></label>' +
        '<div class="account-actions"><button formnovalidate value="cancel">Quay lại</button><button class="primary" value="return">Xác nhận trả lại</button></div></form></dialog>' : ''}
    </section>`;
    if (current.state !== 'pending') return;
    detail.querySelector('#approval-approve-one').onclick = () => confirm([current]);
    detail.querySelector('#approval-return-one').onclick = () => {
      const dialog = detail.querySelector('#approval-return-dialog');
      const reason = dialog.querySelector('textarea');
      dialog.returnValue = '';
      reason.value = '';
      reason.oninput = () => reason.setCustomValidity(reason.value.trim() ? '' : 'Nhập lý do trả lại.');
      dialog.showModal();
      dialog.addEventListener('close', () => {
        if (dialog.returnValue !== 'return' || !reason.value.trim()) return;
        void action(async () => {
          await api.rpc('ot_decide_approval_requests',{p_project:project,p_year:year,p_month:month,
            p_ids:[current.id],p_approve:false,p_reason:reason.value.trim()});
          checked.delete(current.id);
          await load();
          if (alive()) notice('Đã trả lại phiếu OT.');
        });
      }, { once:true });
    };
  }
  return load;
}
