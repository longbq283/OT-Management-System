// Generated on demand; never writes synthetic employees to IndexedDB automatically.
export async function makeSyntheticFile(){
  if(!globalThis.XLSX)await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=new URL('../../vendor/sheetjs/xlsx.full.min.js',import.meta.url);script.onload=resolve;script.onerror=()=>reject(Error('Không tải được SheetJS để tạo file giả lập.'));document.head.append(script);});
  const X=globalThis.XLSX,rows=Array.from({length:47},()=>[]);
  rows[0][0]='DỰ ÁN BIDC — DỮ LIỆU GIẢ LẬP';rows[2][0]='BẢNG CHẤM CÔNG THÁNG 10';
  rows[5]=['Họ và tên','Mã cán bộ','Đơn vị',...Array.from({length:31},(_,i)=>i+1),'Giờ NT','Giờ NN','Tổng số giờ'];
  for(let d=1;d<=31;d++)rows[6][d+2]=d===3?'L':d%7===0?'NN':'NT';
  for(let r=7;r<46;r++){
    rows[r][0]=`Nhân sự giả lập ${r-6}`;rows[r][1]=`SYNTH${String(r-6).padStart(3,'0')}`;rows[r][2]='Đơn vị giả lập';
    rows[r][3]=1;rows[r][5]=2;rows[r][9]=1;rows[r][34]=1;rows[r][35]=3;rows[r][36]=4;
  }
  rows[46][0]='Tổng cộng';rows[46][36]=156;
  const book=X.utils.book_new();X.utils.book_append_sheet(book,X.utils.aoa_to_sheet(rows),'Sheet1');
  return new File([X.write(book,{type:'array',bookType:'xlsx'})],'DEMO_BIDC_Thang10.xlsx',{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
}
