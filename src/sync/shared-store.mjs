import {SHARED_CONFIG,sharedEnabled} from './config.mjs';
import {createGitHubClient,SharedError} from './github-client.mjs?v=0.7.1';
import {readFullBackup,validateBackup,restoreFullBackup} from '../db/backup.mjs?v=0.7.0';
import {readDeviceState,writeDeviceState} from '../db/device-state.mjs';
const revision=backup=>backup.tables.Metadata.find(m=>m.key==='revision')?.value||0;
const hasData=backup=>['Projects','Employees','Imports','OTRecords'].some(name=>backup.tables[name].length>0);
export function createSharedStore({enabled=sharedEnabled(),config=SHARED_CONFIG,client=createGitHubClient(config)}={}){
  const source=`${config.owner}/${config.repo}/${config.branch}/${config.path}`;
  let token='',base=null,busy=false,error='',offline=false,conflict=false,pending=false,needsPublish=false;
  const listeners=new Set();
  const status=()=>({enabled,busy,error,offline,conflict,pending,needsPublish,writer:!!token,initialized:!!base?.data.initialized,fallback:!!base?.fallback,updatedAt:base?.data.updatedAt||null,canWrite:!enabled||!!token&&!busy&&!offline&&!conflict&&!pending&&!needsPublish&&!!base?.sha});
  const emit=()=>{for(const fn of listeners)fn(status());};
  function recordError(e){error=e.message;if(e.code==='access'){token='';offline=false;}else if(e.code==='conflict')conflict=true;else if(e.code==='uncertain')pending=true;else if(['network','missing','invalid'].includes(e.code))offline=true;}
  const assertWriter=()=>{if(!token)throw new SharedError('Chỉ xem dữ liệu chung. Mở Quản trị GitHub và nhập token có quyền ghi để thay đổi dữ liệu.','access');};
  async function lock(fn){if(busy)throw new SharedError('Đang đồng bộ dữ liệu; vui lòng chờ thao tác hiện tại hoàn tất.','busy');busy=true;emit();try{return await(globalThis.navigator?.locks?navigator.locks.request('ot-management-shared',fn):fn());}finally{busy=false;emit();}}
  async function markClean(remote,{expectedRevision,expectedChecksum}={}){const local=await readFullBackup();if((expectedRevision!==undefined&&revision(local)!==expectedRevision)||(expectedChecksum!==undefined&&local.checksum!==expectedChecksum))throw new SharedError('Dữ liệu cache đã thay đổi ở tab khác trong lúc đồng bộ; giữ lại để đối chiếu.','uncertain');await writeDeviceState({source,remoteRevision:remote.data.revision,localRevision:revision(local),pending:false});base=remote;error='';offline=false;conflict=false;pending=false;needsPublish=false;}
  async function checkRemote(remote){if(remote.data.initialized)await validateBackup(remote.data.backup);return remote;}
  async function ingest(remote,{discardLocal=false,expectedRevision}={}){
    await checkRemote(remote);const local=await readFullBackup(),marker=await readDeviceState();
    if(expectedRevision!==undefined&&revision(local)!==expectedRevision)throw new SharedError('Dữ liệu trên thiết bị đã thay đổi. Hãy kiểm tra lại trước khi tải bản chung.','conflict');
    const known=marker?.source===source,clean=known&&!marker.pending&&marker.localRevision===revision(local);
    if(!discardLocal&&known&&marker.pending&&remote.data.initialized&&marker.pendingRevision===remote.data.revision&&remote.data.backup.checksum===local.checksum){await markClean(remote,{expectedRevision:revision(local),expectedChecksum:local.checksum});return;}
    base=remote;offline=false;error='';
    if(!discardLocal&&remote.fallback&&clean&&marker.remoteRevision!==remote.data.revision){offline=true;error='GitHub Pages đang có bản cũ hơn hoặc khác bản cache. Giữ dữ liệu trên thiết bị; bấm tải lại khi GitHub sẵn sàng.';return;}
    if(!discardLocal&&known&&marker.pending){pending=true;conflict=false;needsPublish=false;error='Có thay đổi trên thiết bị chưa được GitHub xác nhận. Xuất sao lưu trước khi chọn gửi lại hoặc tải bản chung.';return;}
    if(!remote.data.initialized){needsPublish=hasData(local);pending=false;conflict=false;return;}
    if(!discardLocal&&hasData(local)&&!clean){conflict=true;pending=false;needsPublish=false;error='Thiết bị có dữ liệu cục bộ chưa chia sẻ. Chọn giữ dữ liệu thiết bị để gửi lên hoặc sao lưu rồi dùng bản chung.';return;}
    if(!discardLocal&&clean&&marker.remoteRevision===remote.data.revision){conflict=false;pending=false;needsPublish=false;return;}
    await restoreFullBackup(remote.data.backup,{expectedRevision:revision(local),auditAction:'SYNC_SHARED_DATA'});await markClean(remote,{expectedRevision:revision(local)+1});
  }
  async function refresh(options={}){
    if(!enabled)return;
    return lock(async()=>{try{await ingest(await client.read({token,allowFallback:!token}),options);}catch(e){recordError(e);throw e;}});
  }
  async function start(){if(!enabled)return;try{await refresh();}catch{/* Keep the local cache visible with an explicit error banner. */}}
  async function connect(value){
    if(typeof value!=='string'||!value.trim()||/\s/.test(value.trim()))throw new SharedError('Nhập token GitHub hợp lệ, không có khoảng trắng.','access');
    return lock(async()=>{try{const candidate=value.trim();const remote=await checkRemote(await client.read({token:candidate}));token=candidate;await ingest(remote);}catch(e){recordError(e);throw e;}});
  }
  function disconnect(){token='';emit();}
  async function rollback(before,remote,expectedRevision){await restoreFullBackup(before,{expectedRevision,auditAction:'ROLLBACK_SHARED_WRITE'});await markClean(remote,{expectedRevision:expectedRevision+1});}
  async function commitSnapshot(backup,remote){
    await validateBackup(backup);
    const data={format:'ot-management-shared',schemaVersion:1,initialized:true,revision:crypto.randomUUID(),updatedAt:new Date().toISOString(),backup};
    await writeDeviceState({source,remoteRevision:remote.data.revision,localRevision:revision(backup),pending:true,pendingRevision:data.revision});
    pending=true;
    const expected={expectedRevision:revision(backup),expectedChecksum:backup.checksum};
    try{const saved=await client.write(data,{token,sha:remote.sha});try{await markClean(saved,expected);}catch{base=saved;error='GitHub đã nhận dữ liệu nhưng cache có thể đã đổi ở tab khác. Giữ bản chờ; mở Đồng bộ GitHub để đối chiếu trước khi sửa tiếp.';throw new SharedError(error,'uncertain');}return saved;}
    catch(e){
      if(e.code==='network'){
        try{const verified=await checkRemote(await client.read({token}));if(verified.data.revision===data.revision&&verified.data.backup?.checksum===backup.checksum){await markClean(verified,expected);return verified;}}catch{/* Outcome remains unknown. Preserve the local draft. */}
        error='Chưa xác nhận được lần ghi GitHub. Dữ liệu vẫn còn trên thiết bị; mở Đồng bộ GitHub để kiểm tra hoặc xuất sao lưu.';
        throw new SharedError(error,'uncertain');
      }
      throw e;
    }
  }
  async function runMutation(operation){
    if(!enabled)return operation();assertWriter();
    return lock(async()=>{
      if(offline||conflict||pending||needsPublish||!base?.sha)throw new SharedError('Kho chung chưa sẵn sàng để sửa. Mở Đồng bộ GitHub để xử lý dữ liệu hoặc tải phiên bản mới nhất.','conflict');
      let remote;try{remote=await checkRemote(await client.read({token}));}catch(e){recordError(e);throw e;}
      if(remote.data.revision!==base.data.revision){conflict=true;error='Thiết bị khác đã cập nhật kho chung. Bấm tải dữ liệu chung rồi thực hiện lại.';throw new SharedError(error,'conflict');}
      const before=await readFullBackup(),marker=await readDeviceState();
      if(marker?.source===source&&(marker.pending||marker.localRevision!==revision(before))){pending=true;error='Dữ liệu cục bộ đã thay đổi ở tab khác; kiểm tra và đồng bộ trước khi tiếp tục.';throw new SharedError(error,'conflict');}
      await writeDeviceState({source,remoteRevision:remote.data.revision,localRevision:revision(before),pending:true});pending=true;
      let result,applied=null;
      try{result=await operation();applied=await readFullBackup();await commitSnapshot(applied,remote);return result;}
      catch(e){
        if(e.code!=='uncertain'){
          const current=await readFullBackup();
          if(applied&&current.checksum===applied.checksum)await rollback(before,remote,revision(current));
          else if(!applied&&current.checksum===before.checksum)await markClean(remote,{expectedRevision:revision(before),expectedChecksum:before.checksum});
          else{pending=true;error='Tab khác đã thay đổi dữ liệu cache. Giữ bản chờ để tránh mất dữ liệu; mở Đồng bộ GitHub để xử lý.';throw new SharedError(error,'uncertain');}
          recordError(e);
        }
        throw e;
      }
    });
  }
  async function publishLocal({confirmed=false,expectedRevision}={}){
    assertWriter();if(!confirmed)throw new SharedError('Cần xác nhận dùng dữ liệu của thiết bị này làm dữ liệu chung.','confirm');
    return lock(async()=>{
      let remote;try{remote=await checkRemote(await client.read({token}));}catch(e){recordError(e);throw e;}
      if(!base||remote.data.revision!==base.data.revision){conflict=true;error='Kho chung đã thay đổi. Xem lại bản chung trước khi xác nhận gửi dữ liệu thiết bị.';throw new SharedError(error,'conflict');}
      const backup=await readFullBackup();if(expectedRevision!==undefined&&expectedRevision!==revision(backup))throw new SharedError('Dữ liệu thiết bị đã thay đổi; hãy mở lại màn hình đồng bộ.','conflict');
      try{await commitSnapshot(backup,remote);}catch(e){recordError(e);throw e;}
    });
  }
  return {status,subscribe:fn=>{listeners.add(fn);return()=>listeners.delete(fn);},start,refresh,connect,disconnect,runMutation,publishLocal};
}
export const sharedStore=createSharedStore();
