import {projectNameKey} from '../domain/projects.mjs';
import {openDatabase,readTables,STORES,auditEvent,otRecordId,periodSnapshot,detailsForRecord} from './database.mjs';
import {validateRecord,employeeCode} from '../domain/overtime.mjs';
import {periodKey} from './import-store.mjs';
const clone=value=>structuredClone(value);
async function checksum(data){const bytes=new TextEncoder().encode(JSON.stringify({format:data.format,schemaVersion:data.schemaVersion,tables:data.tables}));return [...new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');}
export async function readFullBackup(){const tables=await readTables();tables.Metadata=tables.Metadata.filter(m=>!m.key.startsWith('device:'));const result={format:'ot-management',schemaVersion:3,exportedAt:new Date().toISOString(),tables};result.checksum=await checksum(result);return result;}
function convertV1(data){
  if(!Array.isArray(data.imports)||!Array.isArray(data.periods)||!Array.isArray(data.mappingProfiles))throw Error('Backup v1 thiếu imports, periods hoặc mappingProfiles.');
  const tables=Object.fromEntries(STORES.map(s=>[s,[]]));tables.periods=clone(data.periods);tables.mappingProfiles=clone(data.mappingProfiles);tables.Metadata=[{key:'revision',value:1}];
  const active=new Set(data.periods.flatMap(p=>p.activeIds)),people=new Map(),projects=new Map();
  for(const batch of data.imports){if(!Array.isArray(batch.records))throw Error('Backup v1 có phiên bản thiếu bản ghi.');const {records,...meta}=batch;const status=active.has(batch.id)?'active':'archived';tables.Imports.push({...meta,status});
    projects.set(batch.projectId,{id:batch.projectId,name:batch.projectName||batch.projectId,description:'',manager:'Chưa phân công',color:'green',status:'active'});
    for(const r of records){tables.OTRecords.push({...r,id:otRecordId(batch.id,r.employeeId),importId:batch.id,projectId:batch.projectId,year:batch.year,month:batch.month,status});const e=people.get(r.employeeId)||{employeeId:r.employeeId,name:r.name,unit:r.unit||'',projectIds:[]};if(status==='active'&&!e.projectIds.includes(batch.projectId))e.projectIds.push(batch.projectId);people.set(e.employeeId,e);}
    tables.ImportHistory.push({id:`migration:${batch.id}`,action:'MIGRATE_V1',importId:batch.id,periodKey:periodKey(batch),at:batch.importedAt||new Date().toISOString(),filename:batch.filename,before:null,after:periodSnapshot(data.imports,[batch.id]),note:'Backup v1 chưa lưu snapshot trước thay thế.'});
  }
  tables.Employees=[...people.values()];tables.Projects=[...projects.values()];tables.AuditLogs.push(auditEvent('MIGRATE_BACKUP_V1','database',{importCount:data.imports.length}));
  tables.OTDetails=tables.OTRecords.flatMap(detailsForRecord);
  return {format:'ot-management',schemaVersion:3,exportedAt:data.exportedAt||new Date().toISOString(),tables};
}
export async function validateBackup(input){
  if(!input||input.format!=='ot-management'||![1,2,3].includes(input.schemaVersion))throw Error('Chỉ hỗ trợ backup OT Management v1/v2/v3; không nhận backup DEMO.');
  const migrated=input.schemaVersion!==3;let data;
  if(input.schemaVersion===1)data=convertV1(clone(input));
  else{data=clone(input);if(typeof data.checksum!=='string'||await checksum(data)!==data.checksum)throw Error('Checksum JSON không khớp; file bị thay đổi hoặc hỏng.');if(input.schemaVersion===2){if(!Array.isArray(data.tables?.OTRecords)||'OTDetails' in data.tables)throw Error('Backup v2 không hợp lệ.');data.tables.OTDetails=data.tables.OTRecords.flatMap(detailsForRecord);data.schemaVersion=3;}}
  const t=data.tables;if(!t||typeof t!=='object'||Object.keys(t).length!==STORES.length||STORES.some(s=>!Array.isArray(t[s])))throw Error('Backup thiếu bảng hoặc có bảng không được hỗ trợ.');
  if(STORES.some(s=>t[s].length>100000))throw Error('Backup vượt giới hạn 100.000 dòng mỗi bảng.');
  const keys={Employees:'employeeId',Projects:'id',OTRecords:'id',OTDetails:'id',Imports:'id',ImportHistory:'id',AuditLogs:'id',periods:'key',mappingProfiles:'id',Metadata:'key'};
  for(const name of STORES){const seen=new Set();for(const row of t[name]){if(!row||typeof row!=='object'||Array.isArray(row))throw Error(`${name}: dòng không hợp lệ.`);const key=row[keys[name]];if(typeof key!=='string'||!key||seen.has(key))throw Error(`${name}: khóa thiếu, không phải chuỗi hoặc trùng.`);seen.add(key);}}
  const imports=new Map(t.Imports.map(i=>[i.id,i])),projects=new Map(t.Projects.map(p=>[p.id,p])),people=new Map(t.Employees.map(e=>[e.employeeId,e]));
  for(const e of people.values()){if(employeeCode(e.employeeId)!==e.employeeId||typeof e.name!=='string'||!e.name.trim()||typeof e.unit!=='string'||!Array.isArray(e.projectIds)||e.projectIds.some(id=>!projects.has(id))||new Set(e.projectIds).size!==e.projectIds.length)throw Error('Employees: mã, tên, đơn vị hoặc dự án không hợp lệ.');}
  for(const p of projects.values())if(!/^[A-Z0-9_]+(?:-[A-Z0-9_]+)*$/.test(p.id)||typeof p.name!=='string'||!p.name.trim()||!['active','inactive'].includes(p.status)||!['green','blue','purple','orange'].includes(p.color))throw Error('Projects: tên/trạng thái không hợp lệ.');
  if(new Set([...projects.values()].map(p=>projectNameKey(p.name))).size!==projects.size)throw Error('Projects: tên dự án bị trùng.');
  const active=new Set();for(const p of t.periods){if(p.key!==periodKey(p)||!Number.isSafeInteger(p.revision)||p.revision<1||!Array.isArray(p.activeIds)||new Set(p.activeIds).size!==p.activeIds.length)throw Error('Kỳ dữ liệu không hợp lệ.');for(const id of p.activeIds){const i=imports.get(id);if(!i||periodKey(i)!==p.key||active.has(id))throw Error('Kỳ tham chiếu phiên bản sai hoặc lặp.');active.add(id);}}
  for(const i of imports.values()){if(!projects.has(i.projectId)||!Number.isInteger(i.year)||i.year<2000||i.year>2100||!Number.isInteger(i.month)||i.month<1||i.month>12||i.status!==(active.has(i.id)?'active':'archived')||typeof i.filename!=='string'||!Number.isFinite(Date.parse(i.importedAt)))throw Error('Imports: liên kết, kỳ hoặc trạng thái không hợp lệ.');}
  const grouped=new Map(),membership=new Map();
  for(const r of t.OTRecords){const i=imports.get(r.importId);if(!i||!people.has(r.employeeId)||r.id!==otRecordId(r.importId,r.employeeId)||r.projectId!==i.projectId||r.year!==i.year||r.month!==i.month||r.status!==i.status)throw Error('OTRecords: khóa hoặc liên kết không hợp lệ.');const errors=validateRecord(r,{period:i});if(errors.length)throw Error(`OTRecords ${r.employeeId}: ${errors.join(' ')}`);const group=grouped.get(i.id)||[];group.push(r);grouped.set(i.id,group);if(r.status==='active'){const set=membership.get(r.employeeId)||new Set();set.add(r.projectId);membership.set(r.employeeId,set);}}
  const expectedDetails=new Map(t.OTRecords.flatMap(detailsForRecord).map(d=>[d.id,d]));
  if(t.OTDetails.length!==expectedDetails.size)throw Error('OTDetails thiếu hoặc thừa bản ghi ngày.');
  for(const d of t.OTDetails){const expected=expectedDetails.get(d.id);if(!expected||Object.keys(expected).some(k=>d[k]!==expected[k]))throw Error('OTDetails không khớp snapshot OTRecords.');}
  for(const i of imports.values())if(!grouped.get(i.id)?.length)throw Error('Phiên bản import không có bản ghi OT.');
  for(const e of people.values()){const actual=[...(membership.get(e.employeeId)||[])].sort();if(JSON.stringify([...e.projectIds].sort())!==JSON.stringify(actual))throw Error('Employees: danh sách dự án không khớp các bản ghi có hiệu lực.');}
  for(const h of t.ImportHistory){if(typeof h.action!=='string'||!Number.isFinite(Date.parse(h.at))||(h.importId!==null&&(!imports.has(h.importId)||h.periodKey!==periodKey(imports.get(h.importId)))))throw Error('ImportHistory: sự kiện/liên kết không hợp lệ.');for(const snap of [h.before,h.after]){if(snap===null)continue;if(!snap||!Array.isArray(snap.importIds)||!Array.isArray(snap.records)||new Set(snap.importIds).size!==snap.importIds.length||snap.importIds.some(id=>!imports.has(id)||periodKey(imports.get(id))!==h.periodKey))throw Error('Snapshot lịch sử không hợp lệ.');const records=snap.importIds.flatMap(id=>grouped.get(id)||[]);if(snap.totalMinutes!==records.reduce((n,r)=>n+r.totalMinutes,0)||snap.employeeCount!==new Set(records.map(r=>r.employeeId)).size||snap.records.length!==records.length||snap.records.reduce((n,r)=>n+r.totalMinutes,0)!==snap.totalMinutes)throw Error('Snapshot trước/sau không khớp dữ liệu phiên bản.');}}
  for(const a of t.AuditLogs)if(typeof a.action!=='string'||!Number.isFinite(Date.parse(a.at)))throw Error('AuditLogs: hành động/thời điểm không hợp lệ.');
  for(const m of t.mappingProfiles){
    const x=m.mapping;
    if(typeof m.projectId!=='string'||typeof m.signature!=='string'||!x||typeof x!=='object'||!Array.isArray(x.days)||!x.columns||!['hours','duration'].includes(x.unit)||!['auto','daily','summary'].includes(x.source)||['headerRow','startRow','endRow'].some(k=>!Number.isInteger(x[k])||x[k]<0)||x.startRow<=x.headerRow||x.endRow<x.startRow||(x.typeRow!==null&&(!Number.isInteger(x.typeRow)||x.typeRow<x.headerRow||x.typeRow>=x.startRow))||Object.values(x.columns).some(c=>!Number.isInteger(c)||c<0||c>255)||['name','code'].some(f=>!Number.isInteger(x.columns[f]))||x.days.some(d=>!d||!Number.isInteger(d.column)||d.column<0||d.column>255||!Number.isInteger(d.day)||d.day<1||d.day>31||!['','NT','NN','L'].includes(d.type)))throw Error('Mapping không hợp lệ.');
  }
  if(!Number.isSafeInteger(t.Metadata.find(m=>m.key==='revision')?.value))throw Error('Metadata thiếu revision.');
  data.checksum=await checksum(data);return {data,migrated,counts:Object.fromEntries(STORES.map(s=>[s,t[s].length]))};
}
export async function restoreFullBackup(input,{expectedRevision,auditAction='RESTORE_BACKUP'}={}){
  const {data}=await validateBackup(input);const db=await openDatabase();
  return new Promise((resolve,reject)=>{const tx=db.transaction(STORES,'readwrite'),metadata=tx.objectStore('Metadata').getAll();let problem;
    metadata.onsuccess=()=>{try{const current=metadata.result.find(m=>m.key==='revision')?.value||0;if(expectedRevision!==undefined&&expectedRevision!==current)throw Error('Dữ liệu đã thay đổi từ lúc xem trước. Hãy chọn lại file sao lưu.');
      for(const name of STORES){const store=tx.objectStore(name);store.clear();for(const row of data.tables[name])if(!(name==='Metadata'&&(row.key==='revision'||row.key.startsWith('device:'))))store.put(row);}
      for(const row of metadata.result.filter(m=>m.key.startsWith('device:')))tx.objectStore('Metadata').put(row);
      tx.objectStore('Metadata').put({key:'revision',value:current+1});
      tx.objectStore('AuditLogs').add(auditEvent(auditAction,'database',{sourceChecksum:data.checksum,sourceExportedAt:data.exportedAt,counts:Object.fromEntries(STORES.map(s=>[s,data.tables[s].length]))}));
    }catch(e){problem=e;tx.abort();}};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(problem||tx.error||Error('Khôi phục thất bại; dữ liệu cũ vẫn được giữ.'));
  });
}
