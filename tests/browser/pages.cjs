const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync,readFileSync}=require('node:fs');
const path=require('node:path');
const {chromium}=require('playwright');
const {bidc,binary,XLSX}=require('../fixtures/workbooks.cjs');
(async()=>{
 const root=path.resolve(__dirname,'../..'),base=`http://127.0.0.1:4179/${encodeURIComponent(path.basename(root))}/`;
 const server=spawn('python3',['-m','http.server','4179','--bind','127.0.0.1'],{cwd:path.dirname(root),stdio:'ignore'});let browser;
 try{
  for(let i=0;i<40;i++){if(server.exitCode!==null)throw Error('HTTP server failed');try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});page.on('response',r=>{if(r.status()>=400)errors.push(`${r.status()}: ${r.url()}`);});
  await page.goto(`${base}#/dashboard`);await page.getByRole('heading',{name:'Tổng quan',exact:true}).waitFor();await page.locator('#workspace-mode').selectOption('demo');assert.equal(await page.locator('.stat').count(),6);assert.equal(await page.locator('main table').first().locator('tbody tr').count(),48);assert.match(await page.locator('main').innerText(),/Vượt 40h\/tháng/);
  const api=await page.evaluate(async base=>{const db=await import(`${base}assets/js/database.js`),calc=await import(`${base}assets/js/ot-calculator.js`),excel=await import(`${base}assets/js/excel-importer.js`);return {database:db.DB_NAME,limit:calc.MONTH_LIMIT_MINUTES,reader:typeof excel.readExcel};},base);assert.deepEqual(api,{database:'ot-management',limit:2400,reader:'function'});
  await page.evaluate(async base=>{const {createProject}=await import(`${base}src/db/import-store.mjs`);await createProject({id:'BIDC',name:'BIDC',status:'active',color:'green'});},base);await page.locator('#workspace-mode').selectOption('imported');await page.goto(`${base}#/upload`);await page.locator('#real-project').selectOption('BIDC');await page.locator('#real-year').fill('2026');await page.locator('#real-month').selectOption('10');await page.locator('#real-excel-file').setInputFiles({name:'SYNTH_BIDC.xlsx',mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:binary(bidc({year:true}))});await page.locator('[data-import="review"]').waitFor();await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();assert.equal(await page.locator('.import-preview tbody tr').count(),39);assert.equal(await page.locator('[data-import="commit"]').isDisabled(),false);
  await page.goto(`${base}#/reports`);await page.getByRole('heading',{name:'Báo cáo tháng',exact:true}).waitFor();const [file]=await Promise.all([page.waitForEvent('download'),page.locator('[data-action="export-excel"]').click()]);const workbook=XLSX.read(readFileSync(await file.path()),{type:'buffer'});assert.equal(workbook.SheetNames.length,3);
  await page.setViewportSize({width:390,height:844});await page.goto(`${base}#/dashboard`);await page.getByRole('heading',{name:'Tổng quan',exact:true}).waitFor();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS: GitHub Pages subpath: public modules/CSS, dashboard roster, Excel Worker and XLSX export; no 404/CSP/JavaScript errors.');
 }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
