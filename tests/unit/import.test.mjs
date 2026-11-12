import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {detectTemplate,detectPeriod,previewSheet,parseMinutes,createProfile,validateMapping} from '../../src/import/engine.mjs';
import {assessImport,periodKey,fingerprint} from '../../src/db/import-store.mjs';
const {bidc,bookFrom,model}=createRequire(import.meta.url)('../fixtures/workbooks.cjs');
const preview=(sheet,options={year:2026,month:10})=>previewSheet(sheet,detectTemplate(sheet).mapping,options);

test('BIDC: A1/A3, header 6, types 7, employees 8–46; excludes total 47',()=>{
  const sheet=model(bidc()),d=detectTemplate(sheet),p=preview(sheet);
  assert.equal(d.mapping.headerRow,5);assert.equal(d.mapping.typeRow,6);assert.equal(d.mapping.startRow,7);
  assert.deepEqual(d.mapping.columns,{name:0,code:1,unit:2,nt:34,nn:35,total:36});assert.equal(d.mapping.days.length,31);
  assert.equal(p.records.length,39);assert.deepEqual(p.skipped,[{row:47,reason:'Dòng tổng'}]);assert.equal(p.canSave,true);
  assert.equal(p.records[0].ntMinutes,60);assert.equal(p.records[0].nnMinutes,180);assert.equal(p.records[0].lMinutes,120);assert.equal(p.records[0].totalMinutes,240);
});
test('Finds shifted header and moved equivalent columns',()=>{
  const sheet=model(bidc({shift:4,reorder:true})),d=detectTemplate(sheet),p=preview(sheet);
  assert.equal(d.mapping.headerRow,9);assert.equal(d.mapping.columns.code,2);assert.equal(d.mapping.columns.total,34);assert.equal(p.records[0].totalMinutes,240);assert.equal(p.canSave,true);
});
test('Recognizes period and requires missing year',()=>{
  const sh=model(bidc()),d=detectTemplate(sh),period=detectPeriod(sh,d.mapping.headerRow,'sample.xlsx');assert.equal(period.month,10);assert.equal(period.year,null);
  assert.equal(previewSheet(sh,d.mapping,{year:0,month:10}).canSave,false);
  const withYear=model(bidc({year:true}));assert.equal(detectPeriod(withYear,5).year,2026);
  const conflict=detectPeriod(sh,5,'Thang11_2025.xlsx');assert.equal(conflict.conflict,true);assert.equal(conflict.month,null);
});
test('Never adds NT + NN + total; warns when spreadsheet differs',()=>{
  const sh=model(bidc({people:1}));sh.rows[7][36]={v:999,t:'n'};
  const r=preview(sh).records[0];assert.equal(r.totalMinutes,240);assert.match(r.warnings.join(' '),/999h/);assert.equal(r.errors.length,0);
});
test('Summary supports both NT/NN and total-only without inventing categories',()=>{
  let sh=model(bookFrom([['Họ tên','Mã CB','Phòng ban','OT NT','OT NN','Tổng OT'],['Giả lập A','000123','DEMO',8,2,10]]));
  let p=preview(sh);assert.equal(p.canSave,true);assert.equal(p.records[0].employeeId,'000123');assert.equal(p.records[0].totalMinutes,600);
  sh=model(bookFrom([['Full name','Employee ID','Total hours'],['Giả lập B','SYNTH002',5]]));p=preview(sh);assert.equal(p.canSave,true);assert.equal(p.records[0].unclassifiedMinutes,300);assert.equal(p.records[0].ntMinutes,0);
});
test('Catches missing identity, duplicate code, negative hours, bad formula and unknown day type',()=>{
  const sh=model(bidc({people:2}));sh.rows[7][1]={v:'',t:'s'};sh.rows[7][3]={v:-1,t:'n'};sh.rows[8][5]={t:'n',f:'1+2'};sh.rows[6][9]={v:'UNKNOWN',t:'s'};
  let p=preview(sh);assert.equal(p.canSave,false);assert.match(p.records.flatMap(r=>r.errors).join(' '),/Thiếu mã|không âm|Công thức|chưa được phân loại/);
  const dupe=model(bidc({people:2}));dupe.rows[8][1]=dupe.rows[7][1];p=preview(dupe);assert.equal(p.canSave,false);assert.match(p.records[1].errors.join(' '),/trùng dòng/);
});
test('Invalid dates, >24h/day, leap year and blank non-existent day columns',()=>{
  const sh=model(bidc({people:1}));sh.rows[7][33]={v:2,t:'n'};assert.match(preview(sh,{year:2026,month:11}).records[0].errors.join(' '),/Ngày 31 không tồn tại/);
  sh.rows[7][33]=null;assert.equal(preview(sh,{year:2026,month:11}).canSave,true);
  sh.rows[7][3]={v:25,t:'n'};assert.match(preview(sh).records[0].errors.join(' '),/vượt 24/);
  const feb=model(bidc({people:1}));feb.rows[7][31]={v:1,t:'n'};assert.equal(preview(feb,{year:2024,month:2}).canSave,true);assert.equal(preview(feb,{year:2025,month:2}).canSave,false);
});
test('Duration, decimal comma, rounding and errors',()=>{
  assert.equal(parseMinutes({v:0.5,t:'n'},'duration').minutes,720);assert.equal(parseMinutes({v:'8,5'}).minutes,510);assert.equal(parseMinutes({v:'08:30'}).minutes,510);assert.equal(parseMinutes({v:'25:00'}).minutes,1500);assert.ok(parseMinutes({v:'8:99'}).error);assert.ok(parseMinutes({v:'=1+2'}).error);assert.ok(parseMinutes({t:'e',v:7}).error);assert.equal(parseMinutes({v:1/7}).rounded,true);
});
test('Manual profiles recognize unfamiliar labels and do not reuse stale row bounds',()=>{
  const sh=model(bidc({people:1})),m=detectTemplate(sh).mapping;
  sh.rows[5][0]={v:'Tên người tham gia'};sh.rows[5][1]={v:'Định danh nội bộ'};
  const profile=createProfile(sh,m,'BIDC');assert.equal(profile.projectId,'BIDC');
  const d=detectTemplate(sh,[profile]);assert.equal(d.mapping.columns.code,1);assert.equal(d.profileId,profile.id);
  const next=model(bidc({people:2,shift:3,reorder:true}));assert.equal(detectTemplate(next,[profile]).mapping.headerRow,8);assert.equal(detectTemplate(next,[profile]).mapping.columns.code,2);
  const invalid=structuredClone(m);invalid.days[1].day=1;assert.match(validateMapping(sh,invalid).join(' '),/bị trùng/);
});
const rec=(code='SYNTH001',minutes=240,date='2026-10-01')=>({employeeId:code,name:'Giả lập',unit:'DEMO',source:'daily',ntMinutes:minutes,nnMinutes:0,totalMinutes:minutes,days:[{date,type:'NT',minutes}],errors:[]});
const candidate=(changes={})=>({id:'old',projectId:'BIDC',year:2026,month:10,mode:'initial',contentHash:'hash1',records:[rec()],...changes});
const snapshot=(batch)=>({imports:[batch],periods:[{key:periodKey(batch),activeIds:[batch.id],revision:1}]});
test('Supplement disallows employees in any active file; identical content not duplicated',()=>{
  const old=candidate(),s=snapshot(old);assert.match(assessImport(candidate({mode:'supplement',contentHash:'new'}),s).errors.join(' '),/trùng cán bộ/);assert.match(assessImport(candidate(),s).errors.join(' '),/đã có hiệu lực/);assert.equal(assessImport(candidate({mode:'supplement',contentHash:'new',records:[rec('SYNTH002')]}),s).errors.length,0);
});
test('Cross-project same day only warns; other day allowed; replaced versions excluded',()=>{
  const old=candidate(),s=snapshot(old);assert.equal(assessImport(candidate({projectId:'LVB'}),s).errors.length,0);assert.match(assessImport(candidate({projectId:'LVB'}),s).warnings.join(' '),/đã khai OT/);
  assert.equal(assessImport(candidate({projectId:'LVB',records:[rec('SYNTH001',240,'2026-10-02')]}),s).errors.length,0);
  const stale={...old,id:'stale',projectId:'CORE'};s.imports.push(stale);assert.equal(assessImport(candidate({mode:'replace',contentHash:'new'}),s).errors.length,0);
});
test('Thresholds warn rather than block; exactly 40h / 200h not exceeded',()=>{
  const s=snapshot(candidate({records:[rec('SYNTH001',2400,'2026-10-01')]}));let r=assessImport(candidate({projectId:'LVB',records:[rec('SYNTH001',60,'2026-10-02')]}),s);assert.equal(r.errors.length,0);assert.match(r.warnings.join(' '),/vượt 40h/);
  assert.equal(assessImport(candidate({records:[rec('SYNTH001',2400)]}),{imports:[],periods:[]}).warnings.length,0);
  r=assessImport(candidate({records:[rec('SYNTH001',12001)]}),{imports:[],periods:[]});assert.match(r.warnings.join(' '),/vượt 200h/);
});
test('Fingerprints independent of row order but sensitive to hours',async()=>{
  const a=rec('SYNTH001'),b=rec('SYNTH002');assert.equal(await fingerprint([a,b]),await fingerprint([b,a]));assert.notEqual(await fingerprint([a]),await fingerprint([{...a,totalMinutes:241}]));
});

test('Recognizes merged classification headers and Excel duration formats',()=>{
  const sh=model(bidc({people:1}));sh.rows[6][4]=null;sh.merges=[{s:{r:6,c:3},e:{r:6,c:4}}];
  assert.equal(detectTemplate(sh).mapping.days.find(d=>d.day===2).type,'NT');
  sh.rows[7][3]={v:1/24,t:'n',z:'[h]:mm'};assert.equal(detectTemplate(sh).mapping.unit,'duration');
});
test('Saved profiles learn custom day labels, but do not reuse month-specific weekdays',()=>{
  const sh=model(bidc({people:1})),m=detectTemplate(sh).mapping;
  sh.rows[6][3]={v:'W',t:'s'};m.days[0].type='NT';
  const profile=createProfile(sh,m,'BIDC');const found=detectTemplate(sh,[profile]);assert.equal(found.mapping.days[0].type,'NT');
  sh.rows[6][3]={v:'NN',t:'s'};assert.equal(detectTemplate(sh,[profile]).mapping.days[0].type,'NN');
});
