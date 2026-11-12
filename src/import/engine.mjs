// Pure Excel recognition/normalization functions, shared by Worker and tests.
export const FIELD_LABELS = {name:'Họ tên',code:'Mã cán bộ',unit:'Đơn vị',nt:'Giờ NT',nn:'Giờ NN',total:'Tổng giờ'};
export const normalize = value => String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/g,'d').replace(/Đ/g,'D').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
const synonyms = {
  name:['ho ten','ho va ten','ten can bo','ten nhan vien','full name','employee name'],
  code:['ma can bo','ma cb','ma nhan vien','ma nv','employee id','employee code','staff id'],
  unit:['don vi','phong ban','bo phan','department','unit'],
  nt:['gio nt','nt','ot nt','gio ngay thuong','gio ot ngay thuong','ot ngay thuong','so gio ngay thuong','tong gio nt','gio lam them ngay thuong','tong gio ngay thuong'],
  nn:['gio nn','nn','ot nn','gio ngay nghi','gio ot ngay nghi','ot ngay nghi','so gio ngay nghi','tong gio nn','gio lam them ngay nghi','tong gio ngay nghi'],
  total:['tong gio','tong so gio','tong ot','tong gio ot','tong cong gio','tong so gio lam them','tong','total hours','total ot'],
};
export function colName(index){let n=index+1,s='';while(n>0){s=String.fromCharCode(65+(n-1)%26)+s;n=Math.floor((n-1)/26);}return s;}
export const cellText = cell => String(cell?.w ?? cell?.v ?? '').trim();
const at=(sheet,row,col)=>{
  const cell=sheet.rows[row]?.[col];if(cell&&cellText(cell))return cell;
  const merge=sheet.merges?.find(m=>row>=m.s.r&&row<=m.e.r&&col>=m.s.c&&col<=m.e.c);
  return merge?sheet.rows[merge.s.r]?.[merge.s.c]:cell;
};
function dayNumber(cell){
  if(!cell||cell.t==='e')return null;
  // Actual Excel date cells expose a formatted date, even when the value is a serial.
  const text=cellText(cell);let m=text.match(/^(?:ngày\s*)?(\d{1,2})(?:\s*\/\s*\d{1,2}(?:\s*\/\s*\d{2,4})?)?$/i);
  if(!m)m=normalize(text).match(/^(?:ngay|day)\s*(\d{1,2})$/);
  const n=m?Number(m[1]):(typeof cell.v==='number'&&Number.isInteger(cell.v)?cell.v:null);return n>=1&&n<=31?n:null;
}
function fieldMatches(text,field,profile){return [...synonyms[field],...(profile?.labels?.[field]?[normalize(profile.labels[field])]:[])].includes(normalize(text));}
export function headerLabels(sheet,row){return Array.from({length:sheet.columns},(_,c)=>cellText(at(sheet,row,c)));}
export function signature(sheet,row){return JSON.stringify(headerLabels(sheet,row).map(normalize));}
export function detectTemplate(sheet,profiles=[]){
  let best={score:-1,row:0,columns:{}};
  const sources=[null,...profiles];
  for(let r=0;r<Math.min(sheet.rows.length,60);r++){
    const rowSignature=signature(sheet,r);
    for(const profile of sources){
      const columns={},ambiguous=[];
      for(const field of Object.keys(FIELD_LABELS)){
        const matches=[];
        for(let c=0;c<sheet.columns;c++){
          const top=cellText(at(sheet,r,c)),below=cellText(at(sheet,r+1,c));
          if(fieldMatches(top,field,profile)||(top&&below&&fieldMatches(`${top} ${below}`,field,profile)))matches.push(c);
        }
        if(matches.length===1)columns[field]=matches[0];else if(matches.length>1)ambiguous.push(field);
      }
      const score=(profile?.signature===rowSignature?20:0)+(columns.name!==undefined?4:0)+(columns.code!==undefined?5:0)+(columns.unit!==undefined?2:0)+['nt','nn','total'].filter(f=>columns[f]!==undefined).length;
      if(score>best.score)best={score,row:r,columns,ambiguous};
    }
  }
  const matching=profiles.find(p=>p.signature===signature(sheet,best.row));
  const typeRow=matching?.mapping.typeRow!==null&&matching?.mapping.typeRow!==undefined
    ? best.row+matching.mapping.typeRow-matching.mapping.headerRow : best.row+1;
  const resolveType=column=>{
    const raw=normalize(cellText(at(sheet,typeRow,column))).toUpperCase();
    return ['NT','NN','L'].includes(raw)?raw:(matching?.typeAliases?.[raw]||'');
  };
  const summaryCols=new Set(Object.values(best.columns));
  let days=[];
  for(let c=0;c<sheet.columns;c++){
    if(summaryCols.has(c))continue;
    const day=dayNumber(at(sheet,best.row,c));
    if(day!==null)days.push({column:c,day,type:resolveType(c)});
  }
  if(days.length<2)days=[];
  const hasTypeRow=days.length&&days.some(d=>d.type);
  const firstData=hasTypeRow?typeRow+1:best.row+1;
  const mapping={headerRow:best.row,typeRow:hasTypeRow?typeRow:null,startRow:firstData,endRow:sheet.rows.length-1,columns:best.columns,days,unit:'hours',source:'auto'};
  if(matching){
    mapping.columns={...matching.mapping.columns};mapping.unit=matching.mapping.unit;mapping.source=matching.mapping.source;
    mapping.startRow=best.row+matching.mapping.startRow-matching.mapping.headerRow;
    mapping.days=matching.mapping.days.map(saved=>({column:saved.column,day:saved.day,type:matching.mapping.typeRow!==null?resolveType(saved.column):''}));
    // Month-specific manual day types must be reconfirmed if no classification row exists.
    if(matching.mapping.typeRow!==null)mapping.typeRow=typeRow;
    // Never carry a previous month's end row.
  }else{
    const values=sheet.rows.slice(mapping.startRow,mapping.startRow+20).flatMap(row=>[...days.map(d=>row[d.column]),...['nt','nn','total'].map(f=>row[mapping.columns[f]])]).filter(Boolean);
    if(values.some(c=>typeof c.v==='number'&&/(?:\[h\]|h{1,2}:mm)/i.test(c.z||'')))mapping.unit='duration';
  }
  return {mapping,score:best.score,ambiguous:best.ambiguous||[],profileId:matching?.id||null,signature:signature(sheet,best.row),kind:days.length?'daily':'summary'};
}
export function detectPeriod(sheet,headerRow,filename=''){
  const months=[],years=[],evidence=[];
  const texts=[];
  for(let r=0;r<Math.min(Math.max(headerRow,1),60);r++)for(let c=0;c<Math.min(sheet.columns,20);c++){const text=cellText(at(sheet,r,c));if(text)texts.push({text,source:`${colName(c)}${r+1}`});}
  texts.push({text:sheet.name,source:'Tên sheet'},{text:filename,source:'Tên file'});
  for(const {text,source} of texts){
    const norm=normalize(text);const patterns=[...norm.matchAll(/(?:^|\s)(?:thang|month|t)\s*(0?[1-9]|1[0-2])(?:\s|$)/g)];
    for(const m of patterns){months.push(Number(m[1]));evidence.push(`${source}: ${text}`);}
    for(const m of norm.matchAll(/\b(20\d{2})\b/g)){years.push(Number(m[1]));evidence.push(`${source}: ${text}`);}
    for(const m of text.matchAll(/\b(0?[1-9]|1[0-2])\s*[\/-]\s*(20\d{2})\b/g)){months.push(Number(m[1]));years.push(Number(m[2]));evidence.push(`${source}: ${text}`);}
  }
  const ms=[...new Set(months)],ys=[...new Set(years)];return {month:ms.length===1?ms[0]:null,year:ys.length===1?ys[0]:null,months:ms,years:ys,evidence:[...new Set(evidence)],conflict:ms.length>1||ys.length>1};
}
export function parseMinutes(cell,unit='hours',required=false){
  if(!cell||(cell.v===undefined||cell.v===null||cell.v==='')){
    if(cell?.f)return {error:'Công thức chưa có giá trị đã tính; hãy tính và lưu lại trong Excel.'};
    return required?{error:'Thiếu giá trị giờ.'}:{minutes:0,empty:true};
  }
  if(cell.t==='e')return {error:'Ô Excel chứa lỗi công thức.'};
  const raw=cell.v;
  let hours;
  if(typeof raw==='number')hours=unit==='duration'?raw*24:raw;
  else{
    const text=String(raw).trim();
    if(/^\d+:\d{2}(?::\d{2})?$/.test(text)){
      const [h,m,s=0]=text.split(':').map(Number);if(m>59||s>59)return {error:'Thời lượng không hợp lệ.'};hours=h+m/60+s/3600;
    }else if(/^[+-]?\d+(?:[.,]\d+)?$/.test(text))hours=Number(text.replace(',','.'))*(unit==='duration'?24:1);
    else return {error:`Giá trị giờ không hợp lệ: ${String(raw).slice(0,40)}`};
  }
  if(!Number.isFinite(hours)||hours<0)return {error:'Số giờ phải là số không âm.'};
  if(hours>100000)return {error:'Số giờ vượt giới hạn xử lý.'};
  return {minutes:Math.round(hours*60),rounded:Math.abs(hours*60-Math.round(hours*60))>0.00001};
}
const summaryLabel = text => /^(tong(?: cong| so)?(?:\s|$)|grand total$|total$|subtotal$)/.test(normalize(text));
export function validateMapping(sheet,mapping){
  const errors=[];const {headerRow,typeRow,startRow,endRow,columns,days}=mapping;
  for(const [key,v] of Object.entries({headerRow,startRow,endRow}))if(!Number.isInteger(v)||v<0||v>=sheet.rows.length)errors.push(`Dòng ${key} không hợp lệ.`);
  if(startRow<=headerRow||endRow<startRow)errors.push('Phạm vi dữ liệu phải nằm sau tiêu đề và có dòng kết thúc hợp lệ.');
  if(typeRow!==null&&(!Number.isInteger(typeRow)||typeRow<headerRow||typeRow>=startRow))errors.push('Dòng loại ngày phải nằm từ tiêu đề đến trước dữ liệu.');
  for(const f of ['name','code'])if(!Number.isInteger(columns[f]))errors.push(`Chưa ánh xạ ${FIELD_LABELS[f]}.`);
  const mapped=Object.values(columns).filter(Number.isInteger);
  if(mapped.some(c=>c<0||c>=sheet.columns)||new Set(mapped).size!==mapped.length)errors.push('Cột định danh/tổng hợp không hợp lệ hoặc bị ánh xạ trùng.');
  if(!['hours','duration'].includes(mapping.unit)||!['auto','daily','summary'].includes(mapping.source))errors.push('Nguồn hoặc đơn vị giờ không hợp lệ.');
  if(days.some(d=>!Number.isInteger(d.column)||d.column<0||d.column>=sheet.columns||!Number.isInteger(d.day)||d.day<1||d.day>31||!['','NT','NN','L'].includes(d.type)))errors.push('Ánh xạ cột ngày không hợp lệ.');
  if(new Set(days.map(d=>d.column)).size!==days.length||new Set(days.map(d=>d.day)).size!==days.length)errors.push('Ngày hoặc cột ngày bị trùng.');
  if(days.some(d=>mapped.includes(d.column)))errors.push('Cột ngày không được trùng cột định danh hoặc tổng hợp.');
  const daily=mapping.source==='daily'||(mapping.source==='auto'&&days.length>0);
  if(daily&&!days.length)errors.push('Chưa ánh xạ cột ngày.');
  if(!daily&&columns.total===undefined&&(columns.nt===undefined||columns.nn===undefined))errors.push('Cần cột tổng hoặc đủ hai cột NT và NN cho mẫu tổng hợp.');
  return errors;
}
export function previewSheet(sheet,mapping,{year,month}){
  const errors=validateMapping(sheet,mapping),warnings=[],records=[],skipped=[];
  if(!Number.isInteger(year)||year<2000||year>2100)errors.push('Bắt buộc chọn năm trong khoảng 2000–2100.');
  if(!Number.isInteger(month)||month<1||month>12)errors.push('Bắt buộc xác nhận tháng 1–12.');
  if(errors.length)return {errors,warnings,records,skipped,canSave:false};
  const maxDay=new Date(Date.UTC(year,month,0)).getUTCDate();
  const daily=mapping.source==='daily'||(mapping.source==='auto'&&mapping.days.length>0);
  const seen=new Map();const {columns}=mapping;
  for(let r=mapping.startRow;r<=mapping.endRow;r++){
    const row=sheet.rows[r]||[];if(!row.some(c=>cellText(c)))continue;
    const name=cellText(row[columns.name]),code=cellText(row[columns.code]).normalize('NFC').trim().toUpperCase();
    if(summaryLabel(name)||(!code&&row.slice(0,3).some(c=>summaryLabel(cellText(c))))){skipped.push({row:r+1,reason:'Dòng tổng'});continue;}
    if(!code&&!name&&row.every(c=>!cellText(c)))continue;
    const record={employeeId:code,name,unit:cellText(row[columns.unit]),sourceRow:r+1,ntMinutes:0,nnMinutes:0,lMinutes:0,totalMinutes:0,unclassifiedMinutes:0,days:[],errors:[],warnings:[],reported:{},source:daily?'daily':'summary'};
    const issue=(message,error=true)=>(error?record.errors:record.warnings).push(message);
    if(!code)issue('Thiếu mã cán bộ.');
    if(!name)issue('Thiếu họ tên.');
    if(code&&seen.has(code))issue(`Mã cán bộ trùng dòng ${seen.get(code)}.`);else if(code)seen.set(code,r+1);
    if(columns.unit===undefined)issue('Chưa ánh xạ đơn vị.',false);else if(!record.unit)issue('Thiếu đơn vị tại thời điểm import.',false);
    if(row[columns.code]?.t==='n'&&!/^0\d/.test(code))issue('Mã cán bộ dạng số; kiểm tra số 0 đầu có bị mất trong Excel.',false);
    for(const field of ['nt','nn','total'])if(columns[field]!==undefined){
      const parsed=parseMinutes(row[columns[field]],mapping.unit);
      if(parsed.error)issue(`${FIELD_LABELS[field]}: ${parsed.error}`,!daily);else if(!parsed.empty)record.reported[field]=parsed.minutes;
    }
    if(daily){
      for(const d of mapping.days){
        const parsed=parseMinutes(row[d.column],mapping.unit);
        if(parsed.error){issue(`${colName(d.column)}${r+1}: ${parsed.error}`);continue;}
        if(parsed.rounded)issue(`Ngày ${d.day}: đã làm tròn đến phút.`,false);
        if(!parsed.minutes)continue;
        if(d.day>maxDay){issue(`Ngày ${d.day} không tồn tại trong tháng ${month}/${year}.`);continue;}
        if(parsed.minutes>1440)issue(`Ngày ${d.day} có OT vượt 24 giờ.`);
        if(!d.type){issue(`Ngày ${d.day} chưa được phân loại NT/NN/L.`);continue;}
        if(d.type==='NT')record.ntMinutes+=parsed.minutes;else record.nnMinutes+=parsed.minutes;
        if(d.type==='L')record.lMinutes+=parsed.minutes;
        record.days.push({date:`${year}-${String(month).padStart(2,'0')}-${String(d.day).padStart(2,'0')}`,type:d.type,minutes:parsed.minutes});
      }
      record.totalMinutes=record.ntMinutes+record.nnMinutes;
      for(const [f,actual] of [['nt',record.ntMinutes],['nn',record.nnMinutes],['total',record.totalMinutes]])if(record.reported[f]!==undefined&&record.reported[f]!==actual)issue(`${FIELD_LABELS[f]} Excel ${record.reported[f]/60}h khác tính theo ngày ${actual/60}h.`,false);
    }else{
      const {nt,nn,total}=record.reported;
      if(nt!==undefined&&nn!==undefined){record.ntMinutes=nt;record.nnMinutes=nn;record.totalMinutes=nt+nn;if(total!==undefined&&total!==nt+nn)issue(`Tổng Excel ${total/60}h khác NT + NN ${(nt+nn)/60}h.`,false);}
      else if(total!==undefined){record.totalMinutes=total;record.unclassifiedMinutes=total;issue('Chỉ có tổng giờ: chưa phân loại đầy đủ NT/NN; không suy đoán phần thiếu.',false);}
      else if(nt===undefined&&nn===undefined&&columns.total!==undefined&&!row[columns.total]?.f){issue('Dòng không có giá trị tổng hợp để nhập.');}
      else issue('Thiếu giá trị NT/NN hoặc tổng giờ.');
      issue('Dữ liệu tổng hợp: chưa xác minh được khai trùng ngày liên dự án.',false);
    }
    if(record.totalMinutes>2400)issue(`OT tháng trong file là ${record.totalMinutes/60}h, vượt 40h.`,false);
    records.push(record);
  }
  if(!records.length)errors.push('Không có dòng cán bộ để nhập.');
  return {errors,warnings,records,skipped,canSave:errors.length===0&&records.every(r=>!r.errors.length),source:daily?'daily':'summary'};
}
export function createProfile(sheet,mapping,projectId){
  const labels={};for(const [f,c] of Object.entries(mapping.columns))labels[f]=cellText(at(sheet,mapping.headerRow,c));
  const typeAliases={};
  if(mapping.typeRow!==null)for(const d of mapping.days){const raw=normalize(cellText(at(sheet,mapping.typeRow,d.column))).toUpperCase();if(raw&&d.type)typeAliases[raw]=d.type;}
  return {typeAliases,id:`${projectId}:${signature(sheet,mapping.headerRow)}`,projectId,version:1,signature:signature(sheet,mapping.headerRow),labels,mapping:structuredClone(mapping),updatedAt:new Date().toISOString()};
}
