const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{createHash}=require('node:crypto'),{existsSync,readFileSync}=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const root=path.resolve(__dirname,'../..'),base='http://127.0.0.1:4190/',url=route=>base+'?shared=1#/'+route;
const tables=Object.fromEntries(['Employees','Projects','OTRecords','OTDetails','Imports','ImportHistory','AuditLogs','periods','mappingProfiles','Metadata'].map(k=>[k,[]]));tables.Metadata=[{key:'revision',value:1}];
const backup={format:'ot-management',schemaVersion:3,exportedAt:new Date().toISOString(),tables};backup.checksum=createHash('sha256').update(JSON.stringify({format:backup.format,schemaVersion:backup.schemaVersion,tables})).digest('hex');
const fake={data:{format:'ot-management-shared',schemaVersion:1,initialized:true,revision:'initialized-empty',updatedAt:new Date().toISOString(),backup},version:1,writes:0,mode:''};
const sha=()=>fake.version.toString(16).padStart(40,'0'),headers={'access-control-allow-origin':'*','access-control-allow-headers':'authorization,content-type,x-github-api-version,accept','access-control-allow-methods':'GET,PUT,OPTIONS','content-type':'application/json'};
(async()=>{const server=spawn('python3',['-m','http.server','4190','--bind','127.0.0.1'],{cwd:root,stdio:'ignore'});let browser;
try{
 for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
 async function device(){const context=await browser.newContext({viewport:{width:1440,height:1000}});await context.route(u=>u.hostname==='api.github.com',async route=>{
  const r=route.request(),method=r.method(),reply=(body,status=200,extra={})=>route.fulfill({status,headers:{...headers,...extra},body:JSON.stringify(body)});
  if(method==='OPTIONS')return route.fulfill({status:204,headers,body:''});
  if(method==='GET'){
   if(fake.mode==='expired-read'){fake.mode='';return reply({message:'Bad credentials'},401);}
   const text=JSON.stringify(fake.data);return reply({type:'file',sha:sha(),size:Buffer.byteLength(text),encoding:'base64',content:Buffer.from(text).toString('base64')});
  }
  if(method!=='PUT')return reply({},405);
  if(r.headers().authorization!=='Bearer SYNTH_PROJECT_WRITE')return reply({message:'Resource not accessible by personal access token'},403);
  if(fake.mode==='rate'){fake.mode='';return reply({message:'API rate limit exceeded'},403,{'x-ratelimit-remaining':'0','retry-after':'1'});}
  if(fake.mode==='validation'){fake.mode='';return reply({message:'Validation Failed',errors:[{resource:'Commit',field:'content',code:'invalid'}]},422);}
  if(fake.mode==='protected'){fake.mode='';return reply({message:'Changes must be made through a pull request'},403);}
  if(fake.mode==='conflict'){fake.mode='';fake.version++;fake.data={...fake.data,revision:'external-change'};return reply({},409);}
  if(fake.mode==='hold'){fake.mode='';await new Promise(resolve=>{fake.release=resolve;fake.held();});}
  const body=r.postDataJSON();if(body.sha!==sha())return reply({},409);
  fake.data=JSON.parse(Buffer.from(body.content,'base64').toString('utf8'));fake.version++;fake.writes++;return reply({content:{sha:sha()}});
 });const page=await context.newPage();return {context,page};}
 const {page}=await device(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(url('projects'));await page.locator('h1').waitFor();
 await page.locator('[data-action="add-project"]').click();await page.locator('#github-token').waitFor();assert.match(await page.locator('#modal').innerText(),/thêm dự án/);
 await page.locator('#github-token').fill('SYNTH_PROJECT_WRITE');await page.locator('#github-connect-form button').click();await page.locator('#project-form').waitFor();assert.equal(fake.writes,0);
 const save=()=>page.getByRole('button',{name:'Lưu dự án',exact:true}).click();
 const fill=async(code,name='Dự án giả lập '+code)=>{await page.locator('#project-code').fill(code);await page.locator('#project-name').fill(name);};
 const open=async()=>{await page.goto(url('projects'));await page.locator('[data-action="add-project"]').click();await page.locator('#project-form').waitFor();};
 const saved=()=>page.locator('dialog[open]').waitFor({state:'hidden'});
 const db=()=>page.evaluate(async()=>{const api=await import('/src/db/import-store.mjs');return api.readImportState();});
 const state=()=>page.evaluate(async()=>{const {sharedStore}=await import('/src/sync/shared-store.mjs?v=0.7.1');return sharedStore.status();});
 await fill('BIDC A');await save();assert(await page.locator('#project-form-error').isVisible());assert.match(await page.locator('#project-form-error').innerText(),/khoảng trắng/);assert.equal(fake.writes,0);
 await fill('bidc','BIDC giả lập');await save();await saved();assert.equal(fake.writes,1);assert.equal(fake.data.backup.tables.Projects[0].id,'BIDC');
 await open();await fill('BIDC','Khác giả lập');await save();assert.match(await page.locator('#project-form-error').innerText(),/Mã dự án đã tồn tại/);assert.equal(fake.writes,1);
 await fill('LVB',' bidc giả lập ');await save();assert.match(await page.locator('#project-form-error').innerText(),/Tên dự án đã tồn tại/);assert.equal(fake.writes,1);
 await fill('LVB','LVB giả lập');await save();await saved();assert.equal(fake.writes,2);
 console.log('PASS: initialized empty GitHub workspace creates its first project without a dummy publish; connect resumes Add project; localized code/name validation is visible in the dialog and duplicate entries never publish.');
 // Expired read credentials must clear the session and preserve every form field during reconnection.
 await open();await fill('EXPIRE');await page.locator('#project-manager').fill('Phụ trách giả lập');await page.locator('#project-description').fill('Mô tả cần giữ');fake.mode='expired-read';await save();await page.waitForFunction(()=>document.querySelector('#project-form-error')?.textContent.includes('hết hạn'));
 assert.equal((await state()).writer,false);assert.equal((await db()).projects.some(p=>p.id==='EXPIRE'),false);
 await page.locator('#project-resolve-access').click();await page.locator('#github-token').fill('SYNTH_PROJECT_WRITE');await page.locator('#github-connect-form button').click();await page.locator('#project-form').waitFor();assert.equal(await page.locator('#project-code').inputValue(),'EXPIRE');assert.equal(await page.locator('#project-manager').inputValue(),'Phụ trách giả lập');assert.equal(await page.locator('#project-description').inputValue(),'Mô tả cần giữ');await save();await saved();
 // A read-only token can read the repository; only the PUT response proves write permission.
 await page.locator('[data-shared-action="settings"]').first().click();await page.locator('#github-disconnect').click();await page.locator('#github-token').fill('SYNTH_PROJECT_READ');await page.locator('#github-connect-form button').click();await page.waitForFunction(()=>!document.querySelector('#github-token'));await page.locator('#modal [data-shared-action="close"]').click();
 await open();await fill('DENIED');const beforeDenied=fake.writes;await save();await page.waitForFunction(()=>document.querySelector('#project-form-error')?.textContent.includes('Contents: Read and write'));assert(await page.locator('#project-form-error').isVisible());assert.equal((await state()).writer,false);assert.equal(fake.writes,beforeDenied);assert.equal((await db()).projects.some(p=>p.id==='DENIED'),false);
 await page.locator('#project-resolve-access').click();await page.locator('#github-token').fill('SYNTH_PROJECT_WRITE');await page.locator('#github-connect-form button').click();await page.locator('#project-form').waitFor();assert.equal(await page.locator('#project-code').inputValue(),'DENIED');await save();await saved();
 console.log('PASS: 401 and write-denied 403 clear invalid credentials, show errors above the modal backdrop, roll back unsaved projects and reconnect back to the same filled form.');
 for(const [mode,id,expected] of [['rate','LIMITED','giới hạn'],['validation','INVALID','không chấp nhận'],['protected','POLICY','Nhánh GitHub']]){
  await open();await fill(id);fake.mode=mode;const before=fake.writes;await save();await page.waitForFunction(text=>document.querySelector('#project-form-error')?.textContent.includes(text),expected);assert.equal(fake.writes,before);assert.equal((await db()).projects.some(p=>p.id===id),false);assert.equal((await state()).writer,true);assert.equal((await state()).pending,false);assert.equal((await state()).conflict,false);assert.equal(await page.locator('#project-code').inputValue(),id);if(mode==='rate')await page.waitForTimeout(1100);await save();await saved();assert.equal(fake.writes,before+1);
 }
 await open();await fill('STALE');fake.mode='conflict';await save();await page.waitForFunction(()=>document.querySelector('#project-form-error')?.textContent.includes('không ghi đè'));await page.locator('#project-resolve-access').click();await page.locator('#github-refresh-settings').click();await page.locator('#project-form').waitFor();assert.equal(await page.locator('#project-code').inputValue(),'STALE');await save();await saved();
 console.log('PASS: rate limits retain the valid token; 422 validation and branch restrictions are not mislabeled as conflicts; corrected requests and refreshed SHA recover without duplicate projects or lost input.');
 await open();await fill('ONCE');fake.mode='hold';const held=new Promise(resolve=>fake.held=resolve),beforeDouble=fake.writes;await save();await held;assert(await page.locator('#project-submit').isDisabled());assert(await page.getByRole('button',{name:'Hủy',exact:true}).isDisabled());await page.locator('#project-form').evaluate(form=>form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));fake.release();await saved();assert.equal(fake.writes,beforeDouble+1);assert.equal(fake.data.backup.tables.Projects.filter(p=>p.id==='ONCE').length,1);
 await page.goto(url('upload'));await page.locator('#real-year').selectOption('2026');await page.locator('#real-month').selectOption('10');await page.locator('[data-import="create-project"]').click();await fill('UPLOAD-C');await save();await saved();assert.equal(await page.locator('#real-project').inputValue(),'UPLOAD-C');assert.equal(await page.locator('#real-year').inputValue(),'2026');assert.equal(await page.locator('#real-month').inputValue(),'10');
 // Clearing an expired token on refresh should allow anonymous reading and direct reconnect.
 fake.mode='expired-read';await page.locator('[data-shared-action="refresh"]').first().click();await page.waitForFunction(()=>document.querySelector('#shared-status')?.textContent.includes('hết hạn'));assert.equal((await state()).writer,false);assert.equal((await state()).offline,false);await page.locator('[data-shared-action="refresh"]').first().click();await page.waitForFunction(()=>!document.querySelector('#shared-status')?.textContent.includes('hết hạn'));assert.equal((await state()).writer,false);
 console.log('PASS: duplicate submit is disabled, upload-created project is selected without losing the period, and expired-session refresh can recover public viewing.');
 const other=await device(),q=other.page;q.on('pageerror',e=>errors.push(e.message));await q.goto(base);await q.locator('h1').waitFor();await q.evaluate(async()=>{const api=await import('/src/db/import-store.mjs');await api.createProject({id:'LOCAL',name:'Dự án cục bộ giả lập',status:'active',color:'green'});});await q.goto(url('projects'));await q.locator('[data-action="add-project"]').click();await q.locator('#github-token').fill('SYNTH_PROJECT_WRITE');await q.locator('#github-connect-form button').click();await q.locator('#github-pull-confirm').waitFor();assert.equal(await q.locator('#project-form').count(),0);await q.locator('#github-pull-confirm').check();const [download]=await Promise.all([q.waitForEvent('download'),q.locator('#github-pull-replace').click()]);await q.locator('#project-form').waitFor();assert.equal(JSON.parse(readFileSync(await download.path(),'utf8')).tables.Projects[0].id,'LOCAL');await q.getByRole('button',{name:'Hủy',exact:true}).click();
 await q.setViewportSize({width:390,height:844});await q.locator('[data-action="add-project"]').click();await q.locator('#project-code').fill('NOT VALID');await q.locator('#project-name').fill('Tên giả lập');await q.getByRole('button',{name:'Lưu dự án',exact:true}).click();assert(await q.locator('#project-form-error').isVisible());assert(await q.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
 assert.equal(JSON.stringify(fake.data).includes('SYNTH_PROJECT_'),false);
 console.log('PASS: explicit local-data resolution backs up the old workspace and resumes Add project; mobile error messages are visible and shared data contains no token.');
}finally{fake.release?.();await browser?.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
