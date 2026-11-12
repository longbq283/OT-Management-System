import {employeeMetrics,isActive,dayConflicts} from './overtime.mjs';
import {matchesSearch,searchKey} from './search.mjs';
export function buildOTReport({records,employees=[],projects=[],year,month=0,projectId='all',query=''}){
  if(!Number.isInteger(year)||year<2000||year>2100||!Number.isInteger(month)||month<0||month>12)throw Error('Kỳ báo cáo không hợp lệ.');
  const all=records.filter(r=>isActive(r)&&r.year===year);
  const scope=all.filter(r=>(!month||r.month===month)&&(projectId==='all'||r.projectId===projectId));
  const master=new Map(employees.map(e=>[e.employeeId??e.id,e]));
  const queryKey=searchKey(query),sourceLabels=new Map();
  if(queryKey)for(const r of scope){const labels=sourceLabels.get(r.employeeId)||[];labels.push(r.name,r.unit);sourceLabels.set(r.employeeId,labels);}
  const ids=new Set([...new Set(scope.map(r=>r.employeeId))].filter(code=>{if(!queryKey)return true;const person=master.get(code);return matchesSearch([code,person?.name,person?.unit,...sourceLabels.get(code)],queryKey);}));
  const selected=scope.filter(r=>ids.has(r.employeeId));
  const chartRecords=queryKey?all.filter(r=>ids.has(r.employeeId)):all;
  const rows=[...ids].sort().map(code=>{
    const person=master.get(code)||all.find(r=>r.employeeId===code);const scope=selected.filter(r=>r.employeeId===code);const globalMonths=Array.from({length:12},(_,i)=>employeeMetrics(all,code,year,i+1));
    const selectedMonths=Array.from({length:12},(_,i)=>all.filter(r=>r.employeeId===code&&r.month===i+1&&(projectId==='all'||r.projectId===projectId)).reduce((n,r)=>n+r.totalMinutes,0));
    const annual=globalMonths[0],current=month?globalMonths[month-1]:null;
    const breaches=globalMonths.map((m,i)=>({...m,month:i+1})).filter(m=>m.excessMonthMinutes>0);
    const nearMonth=globalMonths.some((m,i)=>(!month||month===i+1)&&m.monthMinutes>=1920&&m.monthMinutes<=2400);
    const grouped=new Map();for(const r of scope){const p=grouped.get(r.projectId)||{projectId:r.projectId,ntMinutes:0,nnMinutes:0,totalMinutes:0,unclassifiedMinutes:0};p.ntMinutes+=r.ntMinutes||0;p.nnMinutes+=r.nnMinutes||0;p.totalMinutes+=r.totalMinutes;p.unclassifiedMinutes+=r.unclassifiedMinutes||0;grouped.set(r.projectId,p);}
    return {employeeId:code,name:[...new Set(scope.map(r=>r.name).filter(Boolean))].join(' / ')||person.name,unit:[...new Set(scope.map(r=>r.unit).filter(Boolean))].join(' / ')||person.unit||'',totalMinutes:scope.reduce((n,r)=>n+r.totalMinutes,0),ntMinutes:scope.reduce((n,r)=>n+(r.ntMinutes||0),0),nnMinutes:scope.reduce((n,r)=>n+(r.nnMinutes||0),0),unclassifiedMinutes:scope.reduce((n,r)=>n+(r.unclassifiedMinutes||0),0),globalPeriodMinutes:month?current.monthMinutes:annual.yearMinutes,yearMinutes:annual.yearMinutes,remainingMonthMinutes:current?.remainingMonthMinutes??null,remainingYearMinutes:annual.remainingYearMinutes,excessMonthMinutes:current?.excessMonthMinutes??null,excessYearMinutes:annual.excessYearMinutes,months:globalMonths.map((m,i)=>({month:i+1,selectedMinutes:selectedMonths[i],globalMinutes:m.monthMinutes,excessMinutes:m.excessMonthMinutes})),monthlyBreaches:breaches,nearLimit:nearMonth||(annual.yearMinutes>=9600&&annual.yearMinutes<=12000),projects:[...grouped.values()]};
  });
  const byMonth=Array.from({length:12},(_,i)=>({month:i+1,totalMinutes:chartRecords.filter(r=>r.month===i+1&&(projectId==='all'||r.projectId===projectId)).reduce((n,r)=>n+r.totalMinutes,0),exceedanceCount:rows.filter(r=>r.months[i].excessMinutes>0).length}));
  const byProject=projects.filter(p=>projectId==='all'||p.id===projectId).map(p=>({projectId:p.id,name:p.name,totalMinutes:selected.filter(r=>r.projectId===p.id).reduce((n,r)=>n+r.totalMinutes,0)}));
  const warnings=[];for(const r of rows){for(const b of r.monthlyBreaches.filter(b=>!month||b.month===month))warnings.push({employeeId:r.employeeId,type:'month',month:b.month,minutes:b.monthMinutes,excessMinutes:b.excessMonthMinutes});if(r.excessYearMinutes>0)warnings.push({employeeId:r.employeeId,type:'year',minutes:r.yearMinutes,excessMinutes:r.excessYearMinutes});}
  return {year,month,projectId,rows,selected,byMonth,byProject,warnings,dayWarnings:dayConflicts(all).filter(c=>ids.has(c.employeeId)&&(!month||Number(c.date.slice(5,7))===month)),totalMinutes:selected.reduce((n,r)=>n+r.totalMinutes,0),employeeCount:rows.length,projectCount:new Set(selected.map(r=>r.projectId)).size,overMonthCount:rows.filter(r=>r.monthlyBreaches.some(b=>!month||b.month===month)).length,overYearCount:rows.filter(r=>r.excessYearMinutes>0).length,nearCount:rows.filter(r=>r.nearLimit).length,monthlyExceedanceCount:byMonth.reduce((n,m)=>n+m.exceedanceCount,0)};
}
