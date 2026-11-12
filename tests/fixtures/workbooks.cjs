const XLSX=require('../../vendor/sheetjs/xlsx.full.min.js');
// Only synthetic identities. No real employee data or binary workbook is committed.
function bidc({year=false,month=10,people=39,shift=0,reorder=false}={}){
  const data=Array.from({length:47+shift},()=>[]);
  data[shift][0]='DỰ ÁN BIDC GIẢ LẬP';data[2+shift][0]=`BẢNG CHẤM CÔNG THÁNG ${month}${year?' NĂM 2026':''}`;
  data[5+shift]=['Họ và tên','Mã cán bộ','Đơn vị',...Array.from({length:31},(_,i)=>i+1),'Giờ NT','Giờ NN','Tổng số giờ'];
  for(let d=1;d<=31;d++)data[6+shift][d+2]=d===3?'L':d%7===0?'NN':'NT';
  for(let i=0;i<people;i++){
    const r=7+shift+i;data[r][0]=`Cán bộ giả lập ${i+1}`;data[r][1]=`SYNTH${String(i+1).padStart(3,'0')}`;data[r][2]='Đơn vị giả lập';
    data[r][3]=1;data[r][5]=2;data[r][9]=1;data[r][34]=1;data[r][35]=3;data[r][36]=4;
  }
  data[46+shift][0]='Tổng cộng';data[46+shift][36]=people*4;
  if(reorder)for(const row of data){const copy=[...row];row[0]=copy[2];row[1]=copy[0];row[2]=copy[1];row[34]=copy[36];row[35]=copy[34];row[36]=copy[35];}
  return bookFrom(data);
}
function bookFrom(rows,name='Sheet1'){const book=XLSX.utils.book_new();XLSX.utils.book_append_sheet(book,XLSX.utils.aoa_to_sheet(rows),name);return book;}
function model(book,name='Sheet1'){
  const ws=book.Sheets[name],range=XLSX.utils.decode_range(ws['!ref']);
  return {name,merges:ws['!merges']||[],columns:range.e.c+1,rows:Array.from({length:range.e.r+1},(_,r)=>Array.from({length:range.e.c+1},(_,c)=>{const cell=ws[XLSX.utils.encode_cell({r,c})];if(!cell)return null;return {v:cell.v,t:cell.t,w:cell.w,f:cell.f};}))};
}
function binary(book,type='xlsx'){return Buffer.from(XLSX.write(book,{type:'buffer',bookType:type}));}
// Reproduces only the monthly form's structure; every identity/hour is invented.
function monthlyTemplate({month=10,people=39}={}){
  const book=bidc({month,people}),ws=book.Sheets.Sheet1;
  ws.A6={t:'s',v:'Họ tên'};ws.C6={t:'s',v:'Đơn vị (Ban/TT)'};
  ws.AK6={t:'s',v:`Tổng số giờ Tháng ${month}`};
  ws.A7={t:'s',v:'Loại ngày (NT/NN)'};
  for(let i=0;i<people;i++){
    const r=i+8;ws[`B${r}`]={t:'n',v:i+1,z:'000000'};
    ws[`AI${r}`]={t:'n',v:1,f:`SUMIF($D$7:$AH$7,"NT",D${r}:AH${r})`};
    ws[`AJ${r}`]={t:'n',v:3,f:`SUMIF($D$7:$AH$7,"NN",D${r}:AH${r})+SUMIF($D$7:$AH$7,"L",D${r}:AH${r})`};
    ws[`AK${r}`]={t:'n',v:4,f:`SUM(D${r}:AH${r})`};
  }
  ws.C51={t:'s',v:'Người kiểm tra (giả lập)'};ws.T51={t:'s',v:'Người phê duyệt (giả lập)'};
  ws.C58={t:'s',v:'Chữ ký giả lập'};ws.D62={t:'s',v:'Xác nhận giả lập'};
  ws['!merges']=[{s:{r:6,c:0},e:{r:6,c:2}}];ws['!ref']='A1:AK68';
  return book;
}
module.exports={XLSX,bidc,bookFrom,model,binary,monthlyTemplate};
