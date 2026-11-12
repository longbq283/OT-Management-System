import {openDatabase,readTables} from './database.mjs';
import {employeeCode,employeeMetrics,dayConflicts} from '../domain/overtime.mjs';
export async function listEmployees(){return (await readTables(['Employees'])).Employees;}
export async function listProjects(){return (await readTables(['Projects'])).Projects;}
export async function queryOTRecords({employeeId,projectId,year,month,includeArchived=false}={}){
  if(employeeId!==undefined)employeeId=employeeCode(employeeId);
  const db=await openDatabase();return new Promise((resolve,reject)=>{const tx=db.transaction('OTRecords'),store=tx.objectStore('OTRecords');let request;
    if(employeeId!==undefined&&Number.isInteger(year))request=store.index('employeePeriod').getAll(month===undefined?IDBKeyRange.bound([employeeId,year,1],[employeeId,year,12]):[employeeId,year,month]);
    else if(projectId!==undefined&&Number.isInteger(year))request=store.index('projectPeriod').getAll(month===undefined?IDBKeyRange.bound([projectId,year,1],[projectId,year,12]):[projectId,year,month]);
    else request=store.getAll();
    tx.oncomplete=()=>resolve(request.result.filter(r=>(includeArchived||r.status==='active')&&(employeeId===undefined||r.employeeId===employeeId)&&(projectId===undefined||r.projectId===projectId)&&(year===undefined||r.year===year)&&(month===undefined||r.month===month)));tx.onabort=()=>reject(tx.error);
  });
}
export async function getEmployeeOTSummary(employeeId,year,month){const records=await queryOTRecords({employeeId,year});return {...employeeMetrics(records,employeeId,year,month),dayWarnings:dayConflicts(records).filter(c=>c.date.startsWith(`${year}-${String(month).padStart(2,'0')}`))};}

export async function getOTReport({year,month=0,projectId='all',query=''}){const {buildOTReport}=await import('../domain/reports.mjs?v=0.6.0');const t=await readTables(['OTRecords','Employees','Projects']);return buildOTReport({records:t.OTRecords,employees:t.Employees,projects:t.Projects,year,month,projectId,query});}
export async function getEmployeeOTHistory(employeeId,{includeArchived=true}={}){return (await queryOTRecords({employeeId,includeArchived})).sort((a,b)=>b.year-a.year||b.month-a.month||a.projectId.localeCompare(b.projectId));}
