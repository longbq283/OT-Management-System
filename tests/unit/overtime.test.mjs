import test from 'node:test';
import assert from 'node:assert/strict';
import {employeeCode,employeeMetrics,dayConflicts,validateRecord} from '../../src/domain/overtime.mjs';
const record=(projectId,year,month,totalMinutes,extra={})=>({employeeId:'000123',projectId,year,month,totalMinutes,status:'active',...extra});

test('Codes stay strings and preserve leading zeroes',()=>{assert.equal(employeeCode(' 000123 '),'000123');assert.equal(employeeCode('cb001'),'CB001');assert.throws(()=>employeeCode(123),/phải là chuỗi/);assert.notEqual(employeeCode('000123'),employeeCode('123'));});
test('All six metrics aggregate all projects and months, but only selected year and active versions',()=>{
  const data=[record('BIDC',2026,10,1500),record('LVB',2026,10,1080),record('BIDC',2026,1,9600),record('CORE',2025,10,9000),record('BIDC',2026,10,6000,{status:'archived'}),record('CORE',2026,10,600,{employeeId:'123'})];
  const m=employeeMetrics(data,'000123',2026,10);assert.deepEqual(m.hours,{month:43,year:203,remainingMonth:0,remainingYear:0,excessMonth:3,excessYear:3});assert.deepEqual(m.projectIds,['BIDC','LVB']);
  assert.equal(employeeMetrics(data,'123',2026,10).hours.month,10);assert.equal(employeeMetrics(data,'000123',2025,10).hours.year,150);
});
test('Exactly 40 and 200 hours: no excess and no remaining; 1 minute over has exact excess',()=>{
  let rows=[record('BIDC',2026,10,2400),record('LVB',2026,1,9600)];let m=employeeMetrics(rows,'000123',2026,10);assert.deepEqual(m.hours,{month:40,year:200,remainingMonth:0,remainingYear:0,excessMonth:0,excessYear:0});
  rows.push(record('CORE',2026,10,1));m=employeeMetrics(rows,'000123',2026,10);assert.equal(m.excessMonthMinutes,1);assert.equal(m.excessYearMinutes,1);assert.equal(m.monthMinutes,2401);
});
test('Unused allowance is nonnegative; zero OT retains full monthly/yearly allowance',()=>{
  const m=employeeMetrics([record('BIDC',2026,10,901)],'000123',2026,10);assert.equal(m.remainingMonthMinutes,1499);assert.equal(m.remainingYearMinutes,11099);
  assert.deepEqual(employeeMetrics([],'000123',2026,10).hours,{month:0,year:0,remainingMonth:40,remainingYear:200,excessMonth:0,excessYear:0});
});
test('Minute arithmetic avoids accumulating decimal-hour rounding error',()=>{
  const rows=Array.from({length:1000},(_,i)=>record(`P${i}`,2026,10,1));const m=employeeMetrics(rows,'000123',2026,10);assert.equal(m.monthMinutes,1000);assert.equal(m.remainingMonthMinutes,1400);assert.equal(m.hours.month,1000/60);
});
test('Day conflicts retain every record and ignore archived, zero-hour and different employee/date',()=>{
  const rows=[record('BIDC',2026,10,120,{days:[{date:'2026-10-01',minutes:120}]}),record('LVB',2026,10,180,{days:[{date:'2026-10-01',minutes:180}]}),record('CORE',2026,10,60,{status:'archived',days:[{date:'2026-10-01',minutes:60}]}),record('CORE',2026,10,60,{days:[{date:'2026-10-02',minutes:60}]})];
  const before=JSON.stringify(rows),warnings=dayConflicts(rows);assert.equal(warnings.length,1);assert.deepEqual(warnings[0].projects,['BIDC','LVB']);assert.equal(warnings[0].details.reduce((n,d)=>n+d.minutes,0),300);assert.equal(JSON.stringify(rows),before);assert.equal(employeeMetrics(rows,'000123',2026,10).monthMinutes,360);
});
test('Stored records require integral consistent minutes and valid calendar dates',()=>{
  const good={employeeId:'000123',name:'Giả lập',ntMinutes:60,nnMinutes:120,lMinutes:120,totalMinutes:180,unclassifiedMinutes:0,source:'daily',days:[{date:'2026-10-01',type:'NT',minutes:60},{date:'2026-10-03',type:'L',minutes:120}],errors:[]};assert.deepEqual(validateRecord(good,{period:{year:2026,month:10}}),[]);
  assert.ok(validateRecord({...good,totalMinutes:181}).length);assert.ok(validateRecord({...good,ntMinutes:0.5}).length);assert.ok(validateRecord({...good,days:[{date:'2026-02-30',type:'NT',minutes:180}]}).length);assert.ok(validateRecord({...good,employeeId:123}).length);
});
test('Invalid periods, fractional minutes and unsafe totals are rejected instead of miscalculated',()=>{
  assert.throws(()=>employeeMetrics([],'000123',2026,13),/Kỳ tính/);assert.throws(()=>employeeMetrics([],'000123',2026.5,1),/Kỳ tính/);assert.throws(()=>employeeMetrics([record('BIDC',2026,10,0.5)],'000123',2026,10),/phút nguyên/);assert.throws(()=>employeeMetrics([record('BIDC',2026,10,Number.MAX_SAFE_INTEGER),record('LVB',2026,10,1)],'000123',2026,10),/số nguyên an toàn/);
});
