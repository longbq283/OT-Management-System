const {XLSX,binary}=require('./workbooks.cjs');
const projects=[{id:'BIDC',name:'BIDC'},{id:'LVB',name:'LVB'},{id:'C',name:'Dự án C'}];
const people=Array.from({length:10},(_,i)=>({employeeId:String(i+1).padStart(6,'0'),name:`Nhân sự giả lập ${String(i+1).padStart(2,'0')}`,unit:'Đơn vị kiểm thử'}));
// Independent input specification: these values are not calculated by application code.
const assignments={
 '000001':{BIDC:1500,LVB:1080},'000002':{BIDC:1200},'000003':{LVB:600},'000004':{C:900},
 '000005':{BIDC:720,C:480},'000006':{BIDC:month=>month<=5?2400:0},'000007':{LVB:480,C:120},
 '000008':{C:0},'000009':{BIDC:630,LVB:585},'000010':{C:month=>month*60},
};
function expectedRecords(){const result=[];for(let month=1;month<=12;month++)for(const p of projects)for(const e of people){const input=assignments[e.employeeId][p.id];if(input===undefined)continue;const totalMinutes=typeof input==='function'?input(month):input;let ntMinutes=Math.floor(totalMinutes*3/5),lMinutes=Math.min(120,totalMinutes-ntMinutes),rest=totalMinutes-ntMinutes-lMinutes;const offset={BIDC:0,LVB:3,C:6}[p.id];let days=[{day:1+offset,type:'NT',minutes:ntMinutes},{day:2+offset,type:'NN',minutes:rest},{day:3+offset,type:'L',minutes:lMinutes}].filter(d=>d.minutes>0);
 if(e.employeeId==='000007'){ntMinutes=totalMinutes;lMinutes=0;rest=0;days=[{day:4,type:'NT',minutes:totalMinutes}];}
 result.push({...e,projectId:p.id,year:2026,month,ntMinutes,nnMinutes:rest+lMinutes,lMinutes,totalMinutes,days:days.map(({day,...d})=>({...d,date:`2026-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}`}))});
}return result;}
const layouts={
 BIDC:{headerRow:5,typeRow:6,startRow:7,columns:{name:0,code:1,unit:2,nt:34,nn:35,total:36},dayStart:3,labels:{name:'Họ và tên',code:'Mã cán bộ',unit:'Đơn vị',nt:'Giờ NT',nn:'Giờ NN',total:'Tổng số giờ'}},
 LVB:{headerRow:3,typeRow:4,startRow:5,columns:{code:0,unit:1,name:2,nt:3,nn:4,total:36},dayStart:5,labels:{name:'Full name',code:'Employee ID',unit:'Department',nt:'OT NT',nn:'OT NN',total:'Total hours'}},
 C:{headerRow:8,typeRow:9,startRow:10,columns:{name:0,code:1,unit:2,nt:34,nn:35,total:36},dayStart:3,labels:{name:'Người thực hiện',code:'Định danh nội bộ',unit:'Đơn vị',nt:'NT được duyệt',nn:'NN được duyệt',total:'Giờ đã duyệt'}},
};
function workbook(projectId,month,{records,reverse=false,summary=false}={}){
 const spec=records||expectedRecords().filter(r=>r.projectId===projectId&&r.month===month);const layout=layouts[projectId];
 const rows=Array.from({length:layout.startRow+spec.length+1},()=>[]);rows[0][0]=`${projectId} — CHỈ DÙNG DỮ LIỆU GIẢ LẬP`;rows[2][0]=`BẢNG CHẤM CÔNG THÁNG ${month} NĂM 2026`;
 for(const [field,c] of Object.entries(layout.columns))rows[layout.headerRow][c]=layout.labels[field];
 const offset={BIDC:0,LVB:3,C:6}[projectId];for(let day=1;day<=31;day++){const c=layout.dayStart+day-1;if(!summary){rows[layout.headerRow][c]=projectId==='C'?`Ngày ${day}`:day;rows[layout.typeRow][c]=day===2+offset?'NN':day===3+offset?'L':'NT';}}
 for(const [i,r] of (reverse?[...spec].reverse():spec).entries()){const row=rows[layout.startRow+i];row[layout.columns.name]=r.name;row[layout.columns.code]=r.employeeId;row[layout.columns.unit]=r.unit;row[layout.columns.nt]=r.ntMinutes/60;row[layout.columns.nn]=r.nnMinutes/60;row[layout.columns.total]=r.totalMinutes/60;if(!summary)for(const d of r.days)row[layout.dayStart+Number(d.date.slice(-2))-1]=d.minutes/60;}
 rows.at(-1)[layout.columns.name]='Tổng cộng';rows.at(-1)[layout.columns.total]=spec.reduce((n,r)=>n+r.totalMinutes,0)/60;
 const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),'Sheet1');return book;
}
function oracleMetrics(records,code,month){const yearRows=records.filter(r=>r.employeeId===code&&r.year===2026);const year=yearRows.reduce((n,r)=>n+r.totalMinutes,0),current=yearRows.filter(r=>r.month===month).reduce((n,r)=>n+r.totalMinutes,0);return {monthMinutes:current,yearMinutes:year,remainingMonthMinutes:Math.max(0,2400-current),remainingYearMinutes:Math.max(0,12000-year),excessMonthMinutes:Math.max(0,current-2400),excessYearMinutes:Math.max(0,year-12000)};}
function oracleConflicts(records){const map=new Map();for(const r of records)for(const day of r.days){const key=`${r.employeeId}|${day.date}`;const set=map.get(key)||new Set();set.add(r.projectId);map.set(key,set);}return [...map.entries()].filter(([,p])=>p.size>1).map(([key,p])=>({key,projects:[...p].sort()})).sort((a,b)=>a.key.localeCompare(b.key));}
module.exports={projects,people,layouts,expectedRecords,workbook,oracleMetrics,oracleConflicts,binary,XLSX};
