export const MAX_SHARED_BYTES=20*1024*1024;
export class SharedError extends Error{constructor(message,code='network'){super(message);this.name='SharedError';this.code=code;}}
export function encodeContent(text){const bytes=new TextEncoder().encode(text);let raw='';for(let i=0;i<bytes.length;i+=32768)raw+=String.fromCharCode(...bytes.subarray(i,i+32768));return btoa(raw);}
export function decodeContent(base64){try{return new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(base64.replace(/\s/g,'')),c=>c.charCodeAt(0)));}catch{throw new SharedError('Nội dung dữ liệu GitHub không phải UTF-8 hợp lệ.','invalid');}}
export function parseShared(text){
  if(new TextEncoder().encode(text).length>MAX_SHARED_BYTES)throw new SharedError('Dữ liệu chung vượt giới hạn 20 MB.','invalid');
  let value;try{value=JSON.parse(text);}catch{throw new SharedError('File dữ liệu chung không phải JSON hợp lệ.','invalid');}
  if(!value||value.format!=='ot-management-shared'||value.schemaVersion!==1||typeof value.initialized!=='boolean'||typeof value.revision!=='string'||!value.revision||value.revision.length>100)throw new SharedError('File dữ liệu chung không đúng định dạng OT Management.','invalid');
  if(value.initialized){if(!value.backup||!Number.isFinite(Date.parse(value.updatedAt)))throw new SharedError('Dữ liệu chung thiếu bản sao hoặc thời điểm cập nhật.','invalid');}
  else if(value.backup!==null)throw new SharedError('Kho chung chưa khởi tạo nhưng chứa dữ liệu không hợp lệ.','invalid');
  return value;
}
export function createGitHubClient(config,{fetcher=(...args)=>fetch(...args),fallbackURL=new URL('../../data/shared-ot.json',import.meta.url).href}={}){
  if(!/^[A-Za-z0-9-]+$/.test(config.owner)||! /^[A-Za-z0-9_.-]+$/.test(config.repo)||!config.path||config.path.split('/').some(p=>!p||p==='.'||p==='..'))throw Error('Cấu hình repository không hợp lệ.');
  const root=`https://api.github.com/repos/${encodeURIComponent(config.owner)}/${encodeURIComponent(config.repo)}`;
  const contents=`${root}/contents/${config.path.split('/').map(encodeURIComponent).join('/')}`;
  async function request(url,{token='',method='GET',body,raw=false}={}){
    const abort=new AbortController(),timer=setTimeout(()=>abort.abort(),15000);
    try{
      const response=await fetcher(url,{method,body,signal:abort.signal,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',headers:{Accept:raw?'application/vnd.github.raw+json':'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(token?{Authorization:`Bearer ${token}`}:{ }),...(body?{'Content-Type':'application/json'}:{})}});
      if(!response.ok){const status=response.status;
        if(status===409||status===422)throw new SharedError('Dữ liệu GitHub đã thay đổi. Tải bản chung mới nhất rồi thực hiện lại; không ghi đè thay đổi của thiết bị khác.','conflict');
        if(status===401||status===403)throw new SharedError('GitHub từ chối truy cập hoặc đã hết hạn mức API. Kiểm tra token, quyền Contents và hạn mức truy cập.','access');
        if(status===404)throw new SharedError('Không tìm thấy file dữ liệu chung hoặc tài khoản chưa có quyền truy cập.','missing');
        throw new SharedError(`GitHub trả lỗi ${status}; chưa xác nhận lưu dữ liệu.`,status>=500?'network':'rejected');
      }
      return raw?response.text():response.json();
    }catch(e){if(e instanceof SharedError)throw e;throw new SharedError('Không kết nối được GitHub. Kiểm tra mạng và tải lại dữ liệu chung.','network');}finally{clearTimeout(timer);}
  }
  async function read({token='',allowFallback=false}={}){
    try{
      const meta=await request(`${contents}?ref=${encodeURIComponent(config.branch)}`,{token});
      if(!meta||meta.type!=='file'||! /^[a-f0-9]{40}$/.test(meta.sha)||!Number.isSafeInteger(meta.size)||meta.size<0||meta.size>MAX_SHARED_BYTES)throw new SharedError('File GitHub sai định dạng hoặc vượt 20 MB.','invalid');
      // Metadata may omit base64 content for files larger than 1 MB. Read that
      // exact immutable blob, never a mutable branch URL paired with an old SHA.
      const text=meta.encoding==='base64'&&typeof meta.content==='string'&&meta.content?decodeContent(meta.content):await request(`${root}/git/blobs/${meta.sha}`,{token,raw:true});
      return {data:parseShared(text),sha:meta.sha,fallback:false};
    }catch(e){
      if(!allowFallback||!['network','access','missing'].includes(e.code))throw e;
      try{const response=await fetcher(fallbackURL,{cache:'no-store',credentials:'omit',signal:AbortSignal.timeout(10000)});if(!response.ok)throw Error();return {data:parseShared(await response.text()),sha:null,fallback:true};}catch{throw e;}
    }
  }
  async function write(data,{token,sha}){
    if(!token||/\s/.test(token))throw new SharedError('Cần token GitHub có quyền Contents: Read and write để cập nhật kho chung.','access');
    if(! /^[a-f0-9]{40}$/.test(sha||''))throw new SharedError('Chưa có phiên bản GitHub để ghi an toàn. Hãy tải lại kho chung.','conflict');
    const text=JSON.stringify(data,null,2)+'\n';parseShared(text);
    const result=await request(contents,{token,method:'PUT',body:JSON.stringify({message:'data: update shared OT workspace',branch:config.branch,sha,content:encodeContent(text)})});
    if(! /^[a-f0-9]{40}$/.test(result?.content?.sha||''))throw new SharedError('GitHub chưa xác nhận phiên bản vừa lưu.','network');
    return {data,sha:result.content.sha,fallback:false};
  }
  return {read,write};
}
