import {buildOTReport} from '../domain/reports.mjs';
import {employeeMetrics,isActive} from '../domain/overtime.mjs';
export async function loadSheetJS(){
  if(globalThis.XLSX)return globalThis.XLSX;
  if(!loadSheetJS.pending)loadSheetJS.pending=new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../../vendor/sheetjs/xlsx.full.min.js',import.meta.url);script.onload=()=>resolve(globalThis.XLSX);script.onerror=()=>{loadSheetJS.pending=null;script.remove();reject(Error('Không tải được thư viện xuất Excel.'));};document.head.append(script);});
  return loadSheetJS.pending;
}
export function createOTWorkbook({employees,records,projects,year,month,report='monthly',projectId='all',demo=false},XLSX){
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<1||month>12)throw Error('Kỳ xuất Excel không hợp lệ.');
  if(!['monthly','yearly','alerts'].includes(report))throw Error('Loại báo cáo không hợp lệ.');
  const active=records.filter(isActive).map(r=>({...r,ntMinutes:r.ntMinutes??Math.round((r.nt||0)*60),nnMinutes:r.nnMinutes??Math.round((r.nn||0)*60),totalMinutes:r.totalMinutes??Math.round(((r.nt||0)+(r.nn||0))*60),unclassifiedMinutes:r.unclassifiedMinutes||0}));
  const people=employees.map(e=>({...e,code:e.employeeId??e.id})).sort((a,b)=>a.code.localeCompare(b.code));
  const metrics=new Map(people.map(e=>[e.code,employeeMetrics(active,e.code,year,month)]));
  const scope=active.filter(r=>r.year===year&&(report==='yearly'||r.month===month)&&(projectId==='all'||r.projectId===projectId)),participants=new Set(scope.map(r=>r.employeeId));
  const chosen=people.filter(e=>participants.has(e.code)&&(report!=='alerts'||metrics.get(e.code).excessMonthMinutes>0)),codes=new Set(chosen.map(e=>e.code));
  const selected=scope.filter(r=>codes.has(r.employeeId));
  const title=`BÁO CÁO OT${demo?' — DỮ LIỆU GIẢ LẬP':''}`;
  const rows=[[title],[`Kỳ: ${report==='yearly'?`Năm ${year}`:`Tháng ${month}/${year}`} · Dự án: ${projectId}`],['Đơn vị: giờ; tính từ phút nguyên. NN bao gồm L. Chỉ lấy phiên bản có hiệu lực.'],[],['Mã cán bộ','Họ tên','Đơn vị','Giờ NT','Giờ NN','Chưa phân loại','Tổng giờ',`Tổng OT tháng ${month} (mọi dự án)`,'Tổng OT năm (mọi dự án)','Còn lại tháng','Còn lại năm','Vượt tháng','Vượt năm']];
  for(const e of chosen){const rs=selected.filter(r=>r.employeeId===e.code),m=metrics.get(e.code);const nt=rs.reduce((n,r)=>n+r.ntMinutes,0),nn=rs.reduce((n,r)=>n+r.nnMinutes,0),unknown=rs.reduce((n,r)=>n+r.unclassifiedMinutes,0),total=rs.reduce((n,r)=>n+r.totalMinutes,0);
    // Avoid exporting partial NT/NN as complete categories in total-only datasets.
    rows.push([e.code,[...new Set(rs.map(r=>r.name).filter(Boolean))].join(' / ')||e.name,[...new Set(rs.map(r=>r.unit).filter(Boolean))].join(' / ')||e.unit||'',unknown?null:nt/60,unknown?null:nn/60,unknown/60,total/60,m.hours.month,m.hours.year,m.hours.remainingMonth,m.hours.remainingYear,m.hours.excessMonth,m.hours.excessYear]);
  }
  const projectNames=new Map(projects.map(p=>[p.id,p.name]));
  const details=[['Mã cán bộ','Họ tên nguồn','Dự án','Tên dự án','Năm','Tháng','NT (giờ)','NN gồm L (giờ)','L (giờ)','Chưa phân loại (giờ)','Tổng (giờ)','Tổng (phút)','Phiên bản import']];
  const days=[['Mã cán bộ','Ngày OT','Dự án','Loại ngày','Giờ OT','Phút OT','Phiên bản import']];
  for(const r of selected){details.push([r.employeeId,r.name||people.find(e=>e.code===r.employeeId)?.name||'',r.projectId,projectNames.get(r.projectId)||r.projectId,r.year,r.month,r.ntMinutes/60,r.nnMinutes/60,(r.lMinutes||0)/60,r.unclassifiedMinutes/60,r.totalMinutes/60,r.totalMinutes,r.importId||'']);for(const d of r.days||[])days.push([r.employeeId,d.date,r.projectId,d.type,d.minutes/60,d.minutes,r.importId||'']);}
  const book=XLSX.utils.book_new();
  for(const [name,data,headerRow] of [['Tổng hợp OT',rows,4],['Chi tiết dự án',details,0],['Ngày OT',days,0]]){
    const sheet=XLSX.utils.aoa_to_sheet(data);sheet['!cols']=data[headerRow].map((_,c)=>({wch:c===1?30:c===0?16:20}));sheet['!autofilter']={ref:XLSX.utils.encode_range({r:headerRow,c:0},{r:Math.max(headerRow,data.length-1),c:data[headerRow].length-1})};
    if(name==='Tổng hợp OT')sheet['!merges']=[{s:{r:0,c:0},e:{r:0,c:12}}];
    for(let r=headerRow+1;r<data.length;r++){const cell=sheet[`A${r+1}`];if(cell){cell.t='s';cell.z='@';}const hourColumns=name==='Tổng hợp OT'?[3,4,5,6,7,8,9,10,11,12]:name==='Chi tiết dự án'?[6,7,8,9,10]:[4];for(const c of hourColumns){const hour=sheet[XLSX.utils.encode_cell({r,c})];if(hour?.t==='n')hour.z='0.00';}}
    XLSX.utils.book_append_sheet(book,sheet,name);
  }
  if(report==='yearly'){
    const annual=buildOTReport({records:active,employees:people.map(e=>({...e,employeeId:e.code})),projects,year,month:0,projectId});
    const matrix=[['Mã cán bộ','Họ tên','Đơn vị',...Array.from({length:12},(_,i)=>`Tháng ${i+1}`),'OT năm theo bộ lọc','Tổng năm mọi dự án','Còn lại năm','Vượt năm','Lượt vượt tháng'],...annual.rows.map(r=>[r.employeeId,r.name,r.unit,...r.months.map(m=>m.selectedMinutes/60),r.totalMinutes/60,r.yearMinutes/60,r.remainingYearMinutes/60,r.excessYearMinutes/60,r.monthlyBreaches.length])];
    const grouped=[['Mã dự án','Tên dự án','OT năm theo bộ lọc (giờ)'],...annual.byProject.map(p=>[p.projectId,p.name,p.totalMinutes/60])];
    const limits=[['Tháng','OT theo dự án lọc (giờ)','Số lượt vượt 40h toàn dự án'],...annual.byMonth.map(m=>[m.month,m.totalMinutes/60,m.exceedanceCount])];
    for(const [name,data] of [['Tổng hợp 12 tháng',matrix],['Tổng hợp dự án',grouped],['Hạn mức từng tháng',limits]]){const sheet=XLSX.utils.aoa_to_sheet(data);sheet['!cols']=data[0].map((_,i)=>({wch:i===1?30:18}));for(let r=1;r<data.length;r++){if(name!=='Hạn mức từng tháng'&&sheet[`A${r+1}`])sheet[`A${r+1}`].z='@';}XLSX.utils.book_append_sheet(book,sheet,name);}
  }
  book.Props={Title:title,Subject:'OT Management System',Author:'OT Workspace'};return book;
}
