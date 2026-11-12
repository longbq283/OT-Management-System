export const MONTH_LIMIT_MINUTES=40*60;
export const YEAR_LIMIT_MINUTES=200*60;
export function employeeCode(value){
  if(typeof value!=='string')throw Error('Mã cán bộ phải là chuỗi, không được chuyển thành số.');
  const code=value.normalize('NFC').trim().toUpperCase();
  if(!code||code.length>100)throw Error('Mã cán bộ không hợp lệ.');return code;
}
export const isActive=r=>r.status===undefined||r.status==='active';
export function employeeMetrics(records,code,year,month){
  code=employeeCode(code);
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12)throw Error('Kỳ tính OT không hợp lệ.');
  let monthMinutes=0,yearMinutes=0;const projectIds=new Set();
  for(const r of records){if(!isActive(r)||r.employeeId!==code||r.year!==year)continue;
    if(!Number.isSafeInteger(r.totalMinutes)||r.totalMinutes<0)throw Error('Tổng OT phải là phút nguyên không âm.');
    yearMinutes+=r.totalMinutes;if(!Number.isSafeInteger(yearMinutes))throw Error('Tổng OT vượt phạm vi số nguyên an toàn.');if(r.month===month){monthMinutes+=r.totalMinutes;projectIds.add(r.projectId);}
  }
  const result={monthMinutes,yearMinutes,remainingMonthMinutes:Math.max(0,MONTH_LIMIT_MINUTES-monthMinutes),remainingYearMinutes:Math.max(0,YEAR_LIMIT_MINUTES-yearMinutes),excessMonthMinutes:Math.max(0,monthMinutes-MONTH_LIMIT_MINUTES),excessYearMinutes:Math.max(0,yearMinutes-YEAR_LIMIT_MINUTES),projectIds:[...projectIds].sort()};
  result.hours={month:monthMinutes/60,year:yearMinutes/60,remainingMonth:result.remainingMonthMinutes/60,remainingYear:result.remainingYearMinutes/60,excessMonth:result.excessMonthMinutes/60,excessYear:result.excessYearMinutes/60};return result;
}
export function dayConflicts(records){
  const groups=new Map();
  for(const r of records){if(!isActive(r))continue;for(const day of r.days||[]){if(day.minutes<=0)continue;
    const key=JSON.stringify([r.employeeId,day.date]);const group=groups.get(key)||{employeeId:r.employeeId,date:day.date,projects:new Set(),details:[]};group.projects.add(r.projectId);group.details.push({projectId:r.projectId,importId:r.importId||null,minutes:day.minutes});groups.set(key,group);
  }}
  return [...groups.values()].filter(g=>g.projects.size>1).map(g=>({...g,projects:[...g.projects].sort()})).sort((a,b)=>a.date.localeCompare(b.date)||a.employeeId.localeCompare(b.employeeId));
}
export function validateRecord(r,{period}={}){
  const errors=[];try{if(employeeCode(r.employeeId)!==r.employeeId)errors.push('Mã cán bộ chưa được chuẩn hóa.');}catch(e){errors.push(e.message);}
  if(typeof r.name!=='string'||!r.name.trim())errors.push('Thiếu họ tên cán bộ.');
  for(const key of ['ntMinutes','nnMinutes','totalMinutes'])if(!Number.isSafeInteger(r[key])||r[key]<0)errors.push(`${key} phải là phút nguyên không âm.`);
  const unknown=r.unclassifiedMinutes??Math.max(0,r.totalMinutes-r.ntMinutes-r.nnMinutes);
  if(!Number.isSafeInteger(unknown)||unknown<0||r.ntMinutes+r.nnMinutes+unknown!==r.totalMinutes)errors.push('Tổng phút không khớp NT + NN + chưa phân loại.');
  if(!['daily','summary'].includes(r.source)||!Array.isArray(r.days))errors.push('Nguồn tính hoặc danh sách ngày không hợp lệ.');
  const seen=new Set();let nt=0,nn=0,l=0;
  for(const d of Array.isArray(r.days)?r.days:[]){
    if(!d||typeof d!=='object'){errors.push('Chi tiết ngày không hợp lệ.');continue;}
    if(typeof d.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(d.date)){errors.push('Ngày OT sai định dạng.');continue;}
    const [y,m,day]=d.date.split('-').map(Number);const date=new Date(Date.UTC(y,m-1,day));
    if(date.toISOString().slice(0,10)!==d.date||(period&&(y!==period.year||m!==period.month)))errors.push('Ngày OT không tồn tại hoặc khác kỳ nhập.');
    if(seen.has(d.date))errors.push('Một bản ghi chứa ngày lặp.');seen.add(d.date);
    if(!Number.isSafeInteger(d.minutes)||d.minutes<=0||d.minutes>1440||!['NT','NN','L'].includes(d.type))errors.push('Giờ hoặc phân loại ngày không hợp lệ.');
    if(d.type==='NT')nt+=d.minutes;else nn+=d.minutes;if(d.type==='L')l+=d.minutes;
  }
  if(r.source==='daily'&&(nt!==r.ntMinutes||nn!==r.nnMinutes||nt+nn!==r.totalMinutes))errors.push('Giờ chi tiết ngày không khớp tổng OT.');
  if(r.source==='summary'&&r.days?.length)errors.push('Bản ghi tổng hợp không được có ngày OT.');
  if(r.lMinutes!==undefined&&(!Number.isSafeInteger(r.lMinutes)||r.lMinutes<0||r.lMinutes>r.nnMinutes||(r.source==='daily'&&r.lMinutes!==l)))errors.push('Giờ L không hợp lệ.');
  if(r.errors?.length)errors.push('Bản ghi vẫn còn lỗi import.');
  return [...new Set(errors)];
}
