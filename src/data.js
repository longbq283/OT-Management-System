// Dữ liệu giả lập cho giao diện. Không ghi vào IndexedDB, localStorage hoặc máy chủ.
export const projects = [
  {id:'BIDC',name:'Ngân hàng BIDC',description:'Hệ thống ngân hàng lõi',color:'green',manager:'Cán bộ Demo 01',status:'active'},
  {id:'LVB',name:'Ngân hàng Liên Việt',description:'Nền tảng ngân hàng số',color:'blue',manager:'Cán bộ Demo 02',status:'active'},
  {id:'MB',name:'Mobile Banking',description:'Ứng dụng ngân hàng di động',color:'purple',manager:'Cán bộ Demo 03',status:'active'},
  {id:'CORE',name:'Core Banking',description:'Hiện đại hóa hệ thống lõi',color:'orange',manager:'Cán bộ Demo 04',status:'active'},
];
export const employees = Array.from({length:48},(_,i)=>({
  id:`DEMO${String(i+1).padStart(3,'0')}`,name:`Cán bộ Demo ${String(i+1).padStart(2,'0')}`,
  unit:['Phát triển ứng dụng','Vận hành hệ thống','Kiểm thử chất lượng','Phân tích nghiệp vụ'][i%4],
  initials:`D${String(i+1).padStart(2,'0')}`,color:['green','blue','purple','orange'][i%4],
}));
export const entries=[];
for(let month=1;month<=11;month++){
  employees.forEach((employee,i)=>{
    const target=month===11 ? [38,37,36,35,34,33,42,41,44,43,46,45][i]??(8+(i*7)%23) : 7+(i*3+month*2)%11;
    const project=projects[(i+month)%4];
    const nt=Math.round(target*.7*2)/2;
    entries.push({employeeId:employee.id,projectId:project.id,year:2026,month,nt,nn:target-nt});
    if(i<6 && month===11){
      const current=entries[entries.length-1];
      current.nt-=7; current.nn-=3;
      entries.push({employeeId:employee.id,projectId:projects[(i+month+1)%4].id,year:2026,month,nt:7,nn:3});
    }
    if(i<6 && month<11)entries.push({employeeId:employee.id,projectId:projects[(i+month+1)%4].id,year:2026,month,nt:4,nn:2});
  });
}
export const history=[
  {id:'IMP-008',projectId:'BIDC',filename:'DEMO_BIDC_T11_2026.xlsx',month:11,year:2026,date:'2026-11-12T09:42:00+07:00',type:'initial',count:12,status:'active',actor:'Bạn'},
  {id:'IMP-007',projectId:'LVB',filename:'DEMO_LVB_T11_2026_v2.xlsx',month:11,year:2026,date:'2026-11-12T09:28:00+07:00',type:'replace',count:12,status:'active',actor:'Bạn'},
  {id:'IMP-006',projectId:'MB',filename:'DEMO_MB_T11_2026.xlsx',month:11,year:2026,date:'2026-11-11T16:15:00+07:00',type:'initial',count:12,status:'active',actor:'Bạn'},
  {id:'IMP-005',projectId:'CORE',filename:'DEMO_CORE_T11_2026.xlsx',month:11,year:2026,date:'2026-11-11T14:32:00+07:00',type:'initial',count:12,status:'active',actor:'Bạn'},
  {id:'IMP-004',projectId:'LVB',filename:'DEMO_LVB_T11_2026.xlsx',month:11,year:2026,date:'2026-11-10T10:08:00+07:00',type:'initial',count:12,status:'replaced',actor:'Bạn'},
  {id:'IMP-003',projectId:'BIDC',filename:'DEMO_BIDC_T10_2026.xlsx',month:10,year:2026,date:'2026-10-31T16:20:00+07:00',type:'initial',count:12,status:'active',actor:'Bạn'},
];
