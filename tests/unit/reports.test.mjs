import test from 'node:test';
import assert from 'node:assert/strict';
import {buildOTReport} from '../../src/domain/reports.mjs';
const employees=[{employeeId:'0001',name:'Giả lập 1',unit:'DEMO'},{employeeId:'0002',name:'Giả lập 2',unit:'DEMO'}],projects=[{id:'BIDC',name:'BIDC'},{id:'LVB',name:'LVB'}];
const r=(employeeId,projectId,year,month,h)=>({employeeId,projectId,year,month,totalMinutes:h*60,ntMinutes:h*60,nnMinutes:0,status:'active',days:[]});
const records=[r('0001','BIDC',2026,1,25),r('0001','LVB',2026,1,18),r('0001','BIDC',2026,2,41),r('0001','LVB',2026,3,120),r('0001','BIDC',2025,1,100),r('0002','BIDC',2026,1,10)];
test('A project filter changes reported hours but not all-project quotas',()=>{const p=buildOTReport({records,employees,projects,year:2026,month:1,projectId:'BIDC'}),a=p.rows.find(r=>r.employeeId==='0001');assert.equal(a.totalMinutes,1500);assert.equal(a.globalPeriodMinutes,2580);assert.equal(a.yearMinutes,12240);assert.equal(a.excessMonthMinutes,180);assert.equal(a.excessYearMinutes,240);assert.equal(p.totalMinutes,2100);});
test('Annual view checks every month independently and exposes 12 columns',()=>{const p=buildOTReport({records,employees,projects,year:2026,month:0,projectId:'BIDC'}),a=p.rows.find(r=>r.employeeId==='0001');assert.equal(a.months.length,12);assert.deepEqual(a.monthlyBreaches.map(b=>b.month),[1,2,3]);assert.equal(a.totalMinutes,3960);assert.equal(a.yearMinutes,12240);assert.deepEqual(p.byMonth.slice(0,3).map(m=>m.exceedanceCount),[1,1,1]);assert.equal(p.monthlyExceedanceCount,3);assert.equal(p.overMonthCount,1);});
test('Years are independent and archived versions never contribute',()=>{const p=buildOTReport({records:[...records,{...records[0],status:'archived',totalMinutes:9999}],employees,projects,year:2025});assert.equal(p.totalMinutes,6000);assert.equal(p.rows.length,1);assert.equal(p.rows[0].yearMinutes,6000);assert.equal(p.overYearCount,0);});
test('No data produces a stable empty report without fabricated staff',()=>{const p=buildOTReport({records,employees,projects,year:2024});assert.equal(p.employeeCount,0);assert.equal(p.totalMinutes,0);assert.equal(p.byMonth.length,12);assert.equal(p.warnings.length,0);});

test('Report search supports Vietnamese without accents and preserves all-project quotas',()=>{
 const input={records,employees,projects,year:2026,month:1,projectId:'BIDC',query:'GIA LAP 1'};
 const p=buildOTReport(input);assert.equal(p.rows.length,1);assert.equal(p.rows[0].employeeId,'0001');assert.equal(p.totalMinutes,1500);assert.equal(p.rows[0].excessMonthMinutes,180);assert.equal(p.rows[0].yearMinutes,12240);assert.equal(p.byMonth[0].totalMinutes,1500);assert.equal(p.byProject[0].totalMinutes,1500);assert(p.warnings.every(w=>w.employeeId==='0001'));
 assert.equal(buildOTReport({...input,query:'0002'}).totalMinutes,600);
 assert.equal(buildOTReport({...input,query:'no matching person'}).byMonth.reduce((n,m)=>n+m.totalMinutes,0),0);
 assert.equal(buildOTReport({...input,query:'   '}).employeeCount,2);
});
test('Search matches source snapshots and units across the annual report without mutating records',()=>{
 const rows=records.map(r=>({...r,name:r.employeeId==='0001'?'Tên nguồn khác':'Tên khác',unit:r.employeeId==='0001'?'Phòng Kiểm thử':'Đơn vị khác'})),before=JSON.stringify(rows);
 const p=buildOTReport({records:rows,employees,projects,year:2026,query:'phong kiem thu'});assert.equal(p.rows.length,1);assert.equal(p.rows[0].totalMinutes,12240);assert.equal(p.monthlyExceedanceCount,3);assert.equal(p.byMonth.reduce((n,m)=>n+m.totalMinutes,0),12240);assert.equal(JSON.stringify(rows),before);
});
