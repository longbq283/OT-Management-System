/* SheetJS stays in this dedicated worker: no network requests, no macro execution. */
importScripts('../../vendor/sheetjs/xlsx.full.min.js');
self.onmessage = async ({data}) => {
  try {
    if(data.byteLength > 10*1024*1024)throw Error('File vượt 10 MB.');
    const book=XLSX.read(data,{type:'array',cellNF:true,cellFormula:true,cellHTML:false,cellText:true,bookVBA:false});
    if(!book.SheetNames.length||book.SheetNames.length>30)throw Error('Workbook phải có 1–30 sheet.');
    let cells=0;
    const sheets=book.SheetNames.map(name=>{
      const ws=book.Sheets[name];const range=XLSX.utils.decode_range(ws['!ref']||'A1');
      const rows=range.e.r+1,columns=range.e.c+1;
      cells+=rows*columns;
      if(rows>10000||columns>256||cells>500000)throw Error('Workbook vượt giới hạn 10.000 dòng, 256 cột hoặc 500.000 ô.');
      const grid=Array.from({length:rows},(_,r)=>Array.from({length:columns},(_,c)=>{
        const cell=ws[XLSX.utils.encode_cell({r,c})];if(!cell)return null;
        return {v:cell.v,w:cell.w,t:cell.t,f:cell.f,z:cell.z};
      }));
      return {name,rows:grid,columns,merges:ws['!merges']||[]};
    });
    self.postMessage({sheets,version:XLSX.version});
  }catch(error){self.postMessage({error:error.message||'Không đọc được workbook.'});}
};
