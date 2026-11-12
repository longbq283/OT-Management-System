import {projectNameKey,personNameKey} from '../domain/projects.mjs';
import {openDatabase,readTables,nextRevision,auditEvent,otRecordId,periodSnapshot,STORES,detailsForRecord} from './database.mjs';
import {employeeCode,validateRecord} from '../domain/overtime.mjs';
export const openImportDB=openDatabase;
export async function getProfiles(projectId){const db=await openDatabase();return new Promise((resolve,reject)=>{const r=db.transaction('mappingProfiles').objectStore('mappingProfiles').index('projectId').getAll(projectId);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});}
export async function saveProfile(profile){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['mappingProfiles','AuditLogs','Metadata'],'readwrite');tx.objectStore('mappingProfiles').put(profile);tx.objectStore('AuditLogs').add(auditEvent('SAVE_MAPPING',profile.projectId,{profileId:profile.id}));nextRevision(tx);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('Không lưu được mapping.'));});}
export async function readImportState(){const t=await readTables();const grouped=new Map();for(const r of t.OTRecords){const list=grouped.get(r.importId)||[];list.push(r);grouped.set(r.importId,list);}return {imports:t.Imports.map(i=>({...i,records:grouped.get(i.id)||[]})),periods:t.periods,employees:t.Employees,projects:t.Projects,otRecords:t.OTRecords,otDetails:t.OTDetails,importHistory:t.ImportHistory,auditLogs:t.AuditLogs,mappingProfiles:t.mappingProfiles,databaseRevision:t.Metadata.find(m=>m.key==='revision')?.value||0};}
export const periodKey=({projectId,year,month})=>JSON.stringify([projectId,year,month]);
export function activeImports(snapshot){const ids=new Set(snapshot.periods.flatMap(p=>p.activeIds));return snapshot.imports.filter(i=>ids.has(i.id));}
export function assessImport(candidate,snapshot){
  const errors=[],warnings=[];const key=periodKey(candidate),period=snapshot.periods.find(p=>p.key===key);
  const active=activeImports(snapshot);const samePeriod=active.filter(i=>periodKey(i)===key);
  if(!['initial','replace'].includes(candidate.mode))errors.push('Chỉ nhập mới hoặc thay thế toàn bộ kỳ; không cộng chồng dữ liệu.');
  if(candidate.mode==='initial'&&samePeriod.length)errors.push('Kỳ đã có dữ liệu. Chọn thay thế toàn bộ kỳ hoặc hủy.');
  if(candidate.mode==='supplement'&&!samePeriod.length)errors.push('Kỳ chưa có file gốc. Hãy chọn nhập mới.');
  if(candidate.mode!=='replace'&&samePeriod.some(i=>i.contentHash===candidate.contentHash))errors.push('Nội dung này đã có hiệu lực trong kỳ; không nhập trùng.');
  if(candidate.mode==='supplement'){
    const codes=new Set(samePeriod.flatMap(i=>i.records.map(r=>r.employeeId)));
    const duplicates=candidate.records.filter(r=>codes.has(r.employeeId)).map(r=>r.employeeId);
    if(duplicates.length)errors.push(`File bổ sung trùng cán bộ đã có trong kỳ: ${duplicates.join(', ')}.`);
  }
  const other=active.filter(i=>!(candidate.mode==='replace'&&periodKey(i)===key));
  const dayIndex=new Map(),totals=new Map(),knownNames=new Map(),candidateCodes=new Set(candidate.records.map(r=>r.employeeId));
  const add=(r,y,m)=>{const k=JSON.stringify([r.employeeId,y]);const t=totals.get(k)||{year:0,month:0};t.year+=r.totalMinutes;if(m===candidate.month)t.month+=r.totalMinutes;totals.set(k,t);};
  for(const i of other){
    for(const r of i.records){if(!knownNames.has(r.employeeId))knownNames.set(r.employeeId,r.name);if(i.year===candidate.year)add(r,i.year,i.month);
      if(i.projectId!==candidate.projectId&&i.year===candidate.year&&i.month===candidate.month){
        if(r.source==='summary'&&candidateCodes.has(r.employeeId))warnings.push(`${r.employeeId}: dữ liệu tổng hợp ở ${i.projectId}, chưa thể xác minh trùng ngày.`);
        for(const d of r.days)dayIndex.set(JSON.stringify([r.employeeId,d.date]),i.projectId);
      }
    }
  }
  const names=new Map();for(const r of [...other.flatMap(i=>i.records),...(snapshot.employees||[]),...candidate.records]){const key=personNameKey(r.name);if(!key)continue;const ids=names.get(key)||new Set();ids.add(r.employeeId);names.set(key,ids);}
  for(const e of snapshot.employees||[])if(!knownNames.has(e.employeeId))knownNames.set(e.employeeId,e.name);
  for(const r of candidate.records){
    if((names.get(personNameKey(r.name))?.size||0)>1)warnings.push(`${r.employeeId}: cùng họ tên nhưng có mã cán bộ khác; không tự gộp danh tính.`);
    for(const d of r.days){const p=dayIndex.get(JSON.stringify([r.employeeId,d.date]));if(p)warnings.push(`${r.employeeId} ngày ${d.date} đã khai OT tại dự án ${p}; giữ nguyên dữ liệu, không tự xóa.`);}
    const known=knownNames.get(r.employeeId);
    if(known&&personNameKey(known)!==personNameKey(r.name))warnings.push(`${r.employeeId}: họ tên khác dữ liệu đang có; kiểm tra lại danh tính.`);
    add(r,candidate.year,candidate.month);
    const total=totals.get(JSON.stringify([r.employeeId,candidate.year]));
    if(total.month>2400)warnings.push(`${r.employeeId}: cộng dồn tháng ${total.month/60}h, vượt 40h.`);
    if(total.year>12000)warnings.push(`${r.employeeId}: cộng dồn năm ${total.year/60}h, vượt 200h.`);
  }
  return {errors:[...new Set(errors)],warnings:[...new Set(warnings)],revision:period?.revision||0};
}
export async function fingerprint(records){const canonical=records.map(r=>[r.employeeId,r.name,r.unit,r.ntMinutes,r.nnMinutes,r.totalMinutes,r.source,[...r.days].sort((a,b)=>a.date.localeCompare(b.date))]).sort((a,b)=>a[0].localeCompare(b[0]));const bytes=new TextEncoder().encode(JSON.stringify(canonical));return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');}
export async function saveImport(candidate,profile){
  if(!candidate||!Array.isArray(candidate.records)||!candidate.records.length)throw Error('Không có bản ghi để lưu.');
  if(typeof candidate.projectId!=='string'||!candidate.projectId.trim()||!Number.isInteger(candidate.year)||candidate.year<2000||candidate.year>2100||!Number.isInteger(candidate.month)||candidate.month<1||candidate.month>12)throw Error('Dự án hoặc kỳ nhập không hợp lệ.');
  const rows=candidate.records.map(r=>({...r,employeeId:employeeCode(r.employeeId),unit:r.unit||'',unclassifiedMinutes:r.unclassifiedMinutes??Math.max(0,r.totalMinutes-r.ntMinutes-r.nnMinutes)}));
  const problems=rows.flatMap(r=>validateRecord(r,{period:candidate}).map(e=>`${r.employeeId}: ${e}`));
  if(new Set(rows.map(r=>r.employeeId)).size!==rows.length)problems.push('Trùng mã cán bộ trong cùng file.');
  if(problems.length)throw Error(problems.join(' '));
  const clean={...candidate,records:rows,contentHash:await fingerprint(rows)};
  const db=await openDatabase();
  return new Promise((resolve,reject)=>{
    const tx=db.transaction(STORES,'readwrite');const names=['Imports','OTRecords','periods','Employees','Projects','Metadata'];
    const requests=Object.fromEntries(names.map(name=>[name,tx.objectStore(name).getAll()]));let done=0,problem,savedId;
    const write=()=>{if(++done<names.length)return;
      try{
        const grouped=new Map();for(const r of requests.OTRecords.result){const list=grouped.get(r.importId)||[];list.push(r);grouped.set(r.importId,list);}
        const snapshot={imports:requests.Imports.result.map(i=>({...i,records:grouped.get(i.id)||[]})),periods:requests.periods.result,employees:requests.Employees.result};
        const project=requests.Projects.result.find(p=>p.id===clean.projectId);if(!project||project.status!=='active')throw Error('Phải chọn dự án đang hoạt động trong danh mục; không tạo dự án ngầm khi import.');
        const revision=requests.Metadata.result.find(m=>m.key==='revision')?.value||0;
        const assessment=assessImport(clean,snapshot);
        if(assessment.errors.length)throw Error(assessment.errors.join('\n'));
        if(assessment.revision!==clean.revision||(clean.databaseRevision!==undefined&&revision!==clean.databaseRevision))throw Error('Dữ liệu đã thay đổi ở tab khác. Vui lòng kiểm tra lại trước khi lưu.');
        savedId=crypto.randomUUID();const at=new Date().toISOString();const key=periodKey(clean),old=snapshot.periods.find(p=>p.key===key);
        const beforeIds=old?.activeIds||[],afterIds=clean.mode==='supplement'?[...beforeIds,savedId]:[savedId];
        const {records,...metadata}=clean;
        const imported={...metadata,id:savedId,status:'active',importedAt:at,warnings:assessment.warnings};
        tx.objectStore('Imports').add(imported);
        const newRows=rows.map(r=>({...r,id:otRecordId(savedId,r.employeeId),importId:savedId,projectId:clean.projectId,year:clean.year,month:clean.month,status:'active'}));
        for(const r of newRows){tx.objectStore('OTRecords').add(r);for(const d of detailsForRecord(r))tx.objectStore('OTDetails').add(d);}
        if(clean.mode==='replace'){
          for(const oldImport of snapshot.imports.filter(i=>beforeIds.includes(i.id))){const {records,...oldMeta}=oldImport;tx.objectStore('Imports').put({...oldMeta,status:'archived'});for(const r of records){tx.objectStore('OTRecords').put({...r,status:'archived'});for(const d of detailsForRecord({...r,status:'archived'}))tx.objectStore('OTDetails').put(d);}}
        }
        const activeAfter=[...requests.OTRecords.result.filter(r=>r.status==='active'&&!(clean.mode==='replace'&&beforeIds.includes(r.importId))),...newRows];
        const people=new Map(requests.Employees.result.map(e=>[e.employeeId,e]));
        for(const r of rows)if(!people.has(r.employeeId))people.set(r.employeeId,{employeeId:r.employeeId,name:r.name,unit:r.unit,createdAt:at});
        const memberships=new Map();for(const r of activeAfter){const set=memberships.get(r.employeeId)||new Set();set.add(r.projectId);memberships.set(r.employeeId,set);}
        for(const e of people.values())tx.objectStore('Employees').put({...e,projectIds:[...(memberships.get(e.employeeId)||[])].sort(),updatedAt:at});
        tx.objectStore('periods').put({key,projectId:clean.projectId,year:clean.year,month:clean.month,revision:(old?.revision||0)+1,activeIds:afterIds});
        const event={id:crypto.randomUUID(),action:clean.mode==='replace'?'REPLACE_IMPORT':clean.mode==='supplement'?'SUPPLEMENT_IMPORT':'CREATE_IMPORT',importId:savedId,projectId:clean.projectId,year:clean.year,month:clean.month,periodKey:key,filename:clean.filename,at,before:periodSnapshot(snapshot.imports,beforeIds),after:periodSnapshot([...snapshot.imports,{...imported,records:newRows}],afterIds)};
        tx.objectStore('ImportHistory').add(event);tx.objectStore('AuditLogs').add(auditEvent(event.action,savedId,{historyId:event.id,projectId:clean.projectId,year:clean.year,month:clean.month,warnings:assessment.warnings}));
        if(profile)tx.objectStore('mappingProfiles').put(profile);nextRevision(tx);
      }catch(e){problem=e;tx.abort();}
    };
    for(const r of Object.values(requests))r.onsuccess=write;
    tx.oncomplete=()=>resolve(savedId);tx.onabort=()=>reject(problem||tx.error||Error('Không lưu được dữ liệu; toàn bộ thay đổi đã hoàn tác.'));
  });
}
export async function cancelImport(candidate){
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['ImportHistory','AuditLogs','Metadata'],'readwrite');const event={id:crypto.randomUUID(),action:'CANCEL_IMPORT',importId:null,projectId:candidate.projectId,year:candidate.year,month:candidate.month,periodKey:periodKey(candidate),filename:candidate.filename,at:new Date().toISOString(),before:null,after:null};tx.objectStore('ImportHistory').add(event);tx.objectStore('AuditLogs').add(auditEvent('CANCEL_IMPORT',candidate.projectId,{historyId:event.id,filename:candidate.filename}));nextRevision(tx);tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
}
export async function saveProject(project,{create=false}={}){
  if(typeof project.id!=='string'||!/^[A-Z0-9_]+(?:-[A-Z0-9_]+)*$/.test(project.id)||typeof project.name!=='string'||!project.name.trim()||!['active','inactive'].includes(project.status)||!['green','blue','purple','orange'].includes(project.color))throw Error('Mã, tên hoặc trạng thái dự án không hợp lệ.');
  const db=await openDatabase();return new Promise((resolve,reject)=>{
    const tx=db.transaction(['Projects','AuditLogs','Metadata'],'readwrite'),store=tx.objectStore('Projects'),get=store.getAll();let problem;
    get.onsuccess=()=>{try{const before=get.result.find(p=>p.id===project.id);if(create&&before)throw Error('Mã dự án đã tồn tại.');if(get.result.some(p=>p.id!==project.id&&projectNameKey(p.name)===projectNameKey(project.name)))throw Error('Tên dự án đã tồn tại.');const after={...project,name:project.name.trim(),nameKey:projectNameKey(project.name),description:project.description||'',createdAt:before?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};store.put(after);tx.objectStore('AuditLogs').add(auditEvent(before?'UPDATE_PROJECT':'CREATE_PROJECT',project.id,{before:before||null,after}));nextRevision(tx);}catch(e){problem=e;tx.abort();}};
    tx.oncomplete=()=>resolve();tx.onabort=()=>reject(problem||tx.error);
  });
}
export const createProject=project=>saveProject(project,{create:true});
export async function saveEmployee(employee){
  const code=employeeCode(employee.employeeId);if(typeof employee.name!=='string'||!employee.name.trim())throw Error('Họ tên không được để trống.');
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(['Employees','AuditLogs','Metadata'],'readwrite');const store=tx.objectStore('Employees'),get=store.get(code);get.onsuccess=()=>{const before=get.result||null,after={...before,employeeId:code,name:employee.name.trim(),unit:typeof employee.unit==='string'?employee.unit.trim():'',projectIds:before?.projectIds||[],createdAt:before?.createdAt||new Date().toISOString(),updatedAt:new Date().toISOString()};store.put(after);tx.objectStore('AuditLogs').add(auditEvent(before?'UPDATE_EMPLOYEE':'CREATE_EMPLOYEE',code,{before,after}));nextRevision(tx);};tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});
}
