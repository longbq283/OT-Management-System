import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createOTWorkbook} from '../../src/reports/excel-export.mjs';
const {XLSX}=createRequire(import.meta.url)('../fixtures/workbooks.cjs');
const employee={employeeId:'000001',name:'Nhân sự giả lập',unit:'Đơn vị giả lập'};
const record={employeeId:'000001',projectId:'BIDC',year:2026,month:10,status:'active',ntMinutes:60,nnMinutes:120,lMinutes:120,totalMinutes:180,days:[{date:'2026-10-01',type:'NT',minutes:60},{date:'2026-10-03',type:'L',minutes:120}]};
const create=overrides=>createOTWorkbook({employees:[employee],records:[record],projects:[{id:'BIDC',name:'BIDC'}],year:2026,month:10,...overrides},XLSX);
const reopen=book=>XLSX.read(Buffer.from(XLSX.write(book,{type:'array',bookType:'xlsx'})),{type:'buffer',cellNF:true});
test('XLSX export preserves string IDs and numeric hours through actual serialization',()=>{const b=reopen(create()),s=b.Sheets['Tổng hợp OT'];assert.deepEqual(b.SheetNames,['Tổng hợp OT','Chi tiết dự án','Ngày OT']);assert.equal(s.A6.v,'000001');assert.equal(s.A6.t,'s');assert.equal(s.A6.z,'@');assert.equal(s.D6.v,1);assert.equal(s.E6.v,2);assert.equal(s.G6.v,3);assert.equal(s.G6.t,'n');assert.equal(s.J6.v,37);assert.equal(s.K6.v,197);});
test('Employee text beginning with a formula remains literal text, not an Excel formula',()=>{const b=reopen(create({employees:[{...employee,name:'=HYPERLINK("https://example.invalid")',unit:'@SUM(A1)'}]}));const s=b.Sheets['Tổng hợp OT'];assert.equal(s.B6.t,'s');assert.equal(s.B6.f,undefined);assert.equal(s.C6.t,'s');assert.equal(s.C6.f,undefined);});
test('Total-only data does not invent NT/NN or lose total on export',()=>{const b=reopen(create({records:[{...record,source:'summary',ntMinutes:0,nnMinutes:0,lMinutes:0,totalMinutes:300,unclassifiedMinutes:300,days:[]}]}));const s=b.Sheets['Tổng hợp OT'];assert.equal(s.D6,undefined);assert.equal(s.E6,undefined);assert.equal(s.F6.v,5);assert.equal(s.G6.v,5);assert.equal(s.H6.v,5);});
test('Export excludes archived/other-year rows, does not mutate data, preserves one-minute precision',()=>{const rows=[{...record,ntMinutes:1,nnMinutes:0,lMinutes:0,totalMinutes:1,days:[]},{...record,status:'archived'},{...record,year:2025}];const before=JSON.stringify(rows);const b=reopen(create({records:rows})),s=b.Sheets['Tổng hợp OT'];assert.equal(Math.round(s.G6.v*60),1);assert.equal(Math.round(s.J6.v*60),2399);assert.equal(XLSX.utils.sheet_to_json(b.Sheets['Chi tiết dự án'],{header:1}).length,2);assert.equal(JSON.stringify(rows),before);});
test('Invalid report and period are rejected even when no employees exist',()=>{assert.throws(()=>create({report:'unsupported'}),/báo cáo/);assert.throws(()=>create({employees:[],records:[],month:13}),/Kỳ/);assert.throws(()=>create({employees:[],records:[],year:NaN}),/Kỳ/);});
test('Annual project export includes a 12-month matrix and uses global limits',()=>{
 const source=[{...record,totalMinutes:1500,ntMinutes:1500,nnMinutes:0,days:[]},{...record,projectId:'LVB',totalMinutes:1080,ntMinutes:1080,nnMinutes:0,days:[]}];
 const b=reopen(create({records:source,projectId:'BIDC',report:'yearly'}));assert.equal(b.SheetNames.length,6);const s=b.Sheets['Tổng hợp OT'];assert.equal(s.G6.v,25);assert.equal(s.H6.v,43);assert.equal(s.L6.v,3);const matrix=XLSX.utils.sheet_to_json(b.Sheets['Tổng hợp 12 tháng'],{header:1});assert.equal(matrix[1][12],25);assert.equal(matrix[1][15],25);assert.equal(matrix[1][16],43);assert.equal(matrix[1][19],1);
});

test('Monthly and annual Excel exports apply search to every sheet and retain global limits',()=>{
 const employees=[{...employee,name:'Nguyễn Giả Lập'},{employeeId:'000002',name:'Nhân sự khác',unit:'Đơn vị khác'}];
 const records=[{...record,ntMinutes:1500,nnMinutes:0,totalMinutes:1500,days:[]},{...record,projectId:'LVB',ntMinutes:1080,nnMinutes:0,totalMinutes:1080,days:[]},{...record,employeeId:'000002'}];
 for(const report of ['monthly','yearly']){
  const b=reopen(create({employees,records,report,projectId:'BIDC',query:'nguyen gia lap'}));
  assert.equal(b.Sheets['Tổng hợp OT'].A6.v,'000001');assert.equal(b.Sheets['Tổng hợp OT'].A7,undefined);assert.equal(b.Sheets['Tổng hợp OT'].G6.v,25);assert.equal(b.Sheets['Tổng hợp OT'].H6.v,43);
  assert.equal(XLSX.utils.sheet_to_json(b.Sheets['Chi tiết dự án'],{header:1}).length,2);
  assert.equal(XLSX.utils.sheet_to_json(b.Sheets['Ngày OT'],{header:1}).length,1);
  if(report==='yearly'){assert.equal(XLSX.utils.sheet_to_json(b.Sheets['Tổng hợp 12 tháng'],{header:1}).length,2);assert.equal(b.Sheets['Tổng hợp dự án'].C2.v,25);assert.equal(b.Sheets['Hạn mức từng tháng'].C11.v,1);}
 }
});
