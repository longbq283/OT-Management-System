const assert=require('node:assert/strict'),{spawn}=require('node:child_process'),{existsSync}=require('node:fs'),path=require('node:path'),{chromium}=require('playwright');
const {monthlyTemplate,binary}=require('../fixtures/workbooks.cjs');
(async()=>{const base='http://127.0.0.1:4186',server=spawn('python3',['-m','http.server','4186','--bind','127.0.0.1'],{cwd:path.resolve(__dirname,'../..'),stdio:'ignore'});let browser;
try{
  for(let i=0;i<40;i++){try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
  browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base);
  await page.evaluate(async()=>{const {createProject}=await import('/src/db/import-store.mjs');await createProject({id:'BIDC',name:'BIDC',status:'active',color:'green'});});
  await page.reload();await page.locator('h1').waitFor();
  async function upload(month,changedName=false){
    await page.goto(base+'/#/dashboard');await page.goto(base+'/#/upload');await page.locator('#real-project').selectOption('BIDC');await page.locator('#real-year').selectOption('2026');await page.locator('#real-month').selectOption(String(month));
    const book=monthlyTemplate({month});if(changedName)book.Sheets.Sheet1.A8={t:'s',v:'Họ tên giả lập đã thay đổi'};
    await page.locator('#real-excel-file').setInputFiles({name:`SYNTH_month_${month}.xlsx`,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:binary(book)});
    await page.locator('#recognized-mapping').waitFor();assert.match(await page.locator('#recognized-mapping').innerText(),/Mã cán bộ\s+Cột B/);assert.match(await page.locator('#recognized-mapping').innerText(),/Họ tên\s+Cột A/);assert.match(await page.locator('#recognized-mapping').innerText(),/Đơn vị\s+Cột C/);
    assert.equal(await page.locator('#mapping-advanced').getAttribute('open'),null);assert.equal(await page.locator('#data-end').inputValue(),'47');assert.equal(await page.locator('#field-total').inputValue(),'36');
    await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();
    assert.equal(await page.locator('.import-preview tbody tr').count(),39);assert.equal(await page.locator('.row-error').count(),0);assert.match(await page.locator('.import-preview tbody tr').first().innerText(),/000001/);assert.match(await page.locator('.import-preview tbody tr').first().innerText(),/4h/);
  }
  async function commit(){await page.locator('#real-confirm-period').check();if(await page.locator('#accept-warnings').count())await page.locator('#accept-warnings').check();await page.locator('[data-import="commit"]').click();await page.waitForURL('**/#/history');}
  await upload(10);assert.equal(await page.locator('#accept-warnings').count(),0);await commit();
  await upload(11,true);assert.match(await page.locator('.panel-body').first().innerText(),/họ tên khác dữ liệu đang có/);await commit();
  const stored=await page.evaluate(async()=>{const {readImportState}=await import('/src/db/import-store.mjs');const s=await readImportState();return {employees:s.employees.length,records:s.otRecords.length,minutes:s.otRecords.reduce((n,r)=>n+r.totalMinutes,0),codes:s.employees.map(e=>e.employeeId),names:s.otRecords.filter(r=>r.employeeId==='000001').map(r=>r.name)};});
  assert.equal(stored.employees,39);assert.equal(stored.records,78);assert.equal(stored.minutes,39*4*60*2);assert(stored.codes.every(c=>/^0000\d{2}$/.test(c)));assert.equal(new Set(stored.names).size,2);
  await page.goto(base+'/#/lookup');await page.reload();await page.locator('#employee-search').fill('000001');assert.equal(await page.locator('[data-filter="month"]').inputValue(),'11');assert.equal(await page.locator('#employee-results tbody tr').count(),1);assert.match(await page.locator('#employee-results').innerText(),/000001/);
  await upload(11,true);assert(await page.locator('[data-import="commit"]').isDisabled());assert.match(await page.locator('.panel-body').first().innerText(),/Kỳ đã có dữ liệu/);await page.locator('[data-import="abort-import"]').click();await page.waitForURL('**/#/history');
  assert.equal(await page.evaluate(async()=>{const {readImportState}=await import('/src/db/import-store.mjs');return (await readImportState()).otRecords.length;}),78);
  await page.setViewportSize({width:390,height:844});await page.goto(base+'/#/upload');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));assert.deepEqual(errors,[]);
  console.log('PASS: monthly form auto-maps all fields, excludes signatures, calculates cached totals, preserves zero-prefixed codes, matches 39 staff over two months, warns on renamed staff, prevents duplicates and reveals persisted lookup.');
}finally{await browser?.close();server.kill();}})().catch(e=>{console.error(e);process.exitCode=1;});
