export async function readExcel(file,{signal}={}){
  if(!/\.(xlsx|xls)$/i.test(file.name))throw Error('Chỉ hỗ trợ Excel .xlsx và .xls.');
  if(file.size>10*1024*1024)throw Error('File vượt giới hạn 10 MB.');
  if(!globalThis.crypto?.subtle)throw Error('Cần mở website bằng HTTPS hoặc localhost để kiểm tra hash an toàn.');
  const buffer=await file.arrayBuffer();
  if(signal?.aborted)throw Error('Đã hủy đọc file.');
  const prefix=new Uint8Array(buffer,0,Math.min(8,buffer.byteLength));
  const zip=prefix[0]===0x50&&prefix[1]===0x4b;
  const ole=prefix[0]===0xd0&&prefix[1]===0xcf&&prefix[2]===0x11&&prefix[3]===0xe0;
  if(!zip&&!ole)throw Error('File không phải workbook Excel XLSX/XLS hợp lệ hoặc định dạng XLS quá cũ chưa được hỗ trợ.');
  const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',buffer)),b=>b.toString(16).padStart(2,'0')).join('');
  return new Promise((resolve,reject)=>{
    const worker=new Worker(new URL('../workers/excel-worker.js',import.meta.url));
    const finish=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',abort);worker.terminate();error?reject(error):resolve(value);};
    const abort=()=>finish(Error('Đã hủy đọc file.'));
    const timer=setTimeout(()=>finish(Error('Đọc file quá 30 giây. Hãy tách nhỏ workbook.')),30000);
    signal?.addEventListener('abort',abort,{once:true});
    worker.onerror=()=>finish(Error('Không khởi động được bộ đọc Excel. Hãy kiểm tra tài nguyên SheetJS.'));
    worker.onmessage=({data})=>data.error?finish(Error(data.error)):finish(null,{...data,hash,filename:file.name});
    worker.postMessage(buffer,[buffer]);
  });
}
