export const DB_NAME='ot-management';
export const DB_VERSION=2;
export const STORES=['Employees','Projects','OTRecords','Imports','ImportHistory','AuditLogs','periods','mappingProfiles','Metadata'];
let opening;
export const otRecordId=(importId,code)=>JSON.stringify([importId,code]);
export function periodSnapshot(imports,ids){const selected=imports.filter(i=>ids.includes(i.id));const records=selected.flatMap(i=>i.records);return {importIds:[...ids],employeeCount:new Set(records.map(r=>r.employeeId)).size,totalMinutes:records.reduce((n,r)=>n+r.totalMinutes,0),records:structuredClone(records)};}
export function openDatabase(){
  if(!opening)opening=new Promise((resolve,reject)=>{
    const request=indexedDB.open(DB_NAME,DB_VERSION);
    request.onupgradeneeded=event=>{
      const db=request.result,tx=request.transaction;
      const create=(name,keyPath)=>db.objectStoreNames.contains(name)?tx.objectStore(name):db.createObjectStore(name,{keyPath});
      const employees=create('Employees','employeeId');employees.createIndex('projectIds','projectIds',{multiEntry:true});
      employees.createIndex('unit','unit');
      create('Projects','id');
      const records=create('OTRecords','id');records.createIndex('employeePeriod',['employeeId','year','month']);records.createIndex('projectPeriod',['projectId','year','month']);records.createIndex('importId','importId');records.createIndex('statusPeriod',['status','year','month']);
      const imports=create('Imports','id');imports.createIndex('projectPeriod',['projectId','year','month']);
      const history=create('ImportHistory','id');history.createIndex('importId','importId');history.createIndex('periodKey','periodKey');history.createIndex('at','at');
      const audit=create('AuditLogs','id');audit.createIndex('at','at');audit.createIndex('action','action');
      create('periods','key');const profiles=create('mappingProfiles','id');if(!profiles.indexNames.contains('projectId'))profiles.createIndex('projectId','projectId');
      const meta=create('Metadata','key');meta.put({key:'revision',value:1});
      if(event.oldVersion===1&&db.objectStoreNames.contains('imports')){
        const a=tx.objectStore('imports').getAll(),b=tx.objectStore('periods').getAll();let done=0;
        const migrate=()=>{if(++done<2)return;const active=new Set(b.result.flatMap(p=>p.activeIds));const employeeMap=new Map();
          for(const batch of a.result){const {records:rows,...metadata}=batch;const status=active.has(batch.id)?'active':'archived';imports.put({...metadata,status});
            if(!db.objectStoreNames.contains('Projects'))throw Error('Migration thiếu Projects.');
            tx.objectStore('Projects').put({id:batch.projectId,name:batch.projectName||batch.projectId,description:'',manager:'Chưa phân công',color:'green',status:'active',updatedAt:batch.importedAt});
            for(const row of rows){records.put({...row,id:otRecordId(batch.id,row.employeeId),importId:batch.id,projectId:batch.projectId,year:batch.year,month:batch.month,status});
              const employee=employeeMap.get(row.employeeId)||{employeeId:row.employeeId,name:row.name,unit:row.unit||'',projectIds:[]};if(status==='active'&&!employee.projectIds.includes(batch.projectId))employee.projectIds.push(batch.projectId);employeeMap.set(row.employeeId,employee);
            }
            // v1 did not store replacement events. Preserve versions, mark the historical gap honestly.
            history.put({id:`migration:${batch.id}`,action:'MIGRATE_V1',importId:batch.id,periodKey:JSON.stringify([batch.projectId,batch.year,batch.month]),at:batch.importedAt||new Date().toISOString(),filename:batch.filename,before:null,after:periodSnapshot(a.result,[batch.id]),note:'Giữ phiên bản v1; hệ thống cũ chưa lưu snapshot trước thay thế.'});
          }
          for(const employee of employeeMap.values())employees.put(employee);
          audit.put({id:crypto.randomUUID(),action:'MIGRATE_V1',entity:'database',at:new Date().toISOString(),details:{importCount:a.result.length},actor:'Hệ thống'});
          db.deleteObjectStore('imports');
        };a.onsuccess=migrate;b.onsuccess=migrate;
      }
    };
    request.onerror=()=>{opening=null;reject(request.error);};
    request.onblocked=()=>{opening=null;reject(Error('Đóng tab OT cũ để nâng cấp cơ sở dữ liệu rồi tải lại trang.'));};
    request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
  });return opening;
}
export async function readTables(names=STORES){const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction(names);const requests=Object.fromEntries(names.map(name=>[name,tx.objectStore(name).getAll()]));tx.oncomplete=()=>resolve(Object.fromEntries(names.map(name=>[name,requests[name].result])));tx.onabort=()=>reject(tx.error);});}
export function nextRevision(tx){const store=tx.objectStore('Metadata');const request=store.get('revision');request.onsuccess=()=>store.put({key:'revision',value:(request.result?.value||0)+1});}
export function auditEvent(action,entity,details={}){return {id:crypto.randomUUID(),at:new Date().toISOString(),action,entity,details,actor:'Người dùng cục bộ'};}
