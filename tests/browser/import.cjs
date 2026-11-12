const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const {existsSync,mkdtempSync}=require('node:fs');
const {tmpdir}=require('node:os');
const path=require('node:path');
const {chromium}=require('playwright');
const {bidc,bookFrom,binary}=require('../fixtures/workbooks.cjs');

(async()=>{
  const server=spawn('python3',['-m','http.server','4176','--bind','127.0.0.1'],{cwd:path.resolve(__dirname,'../..'),stdio:'ignore'});
  const base='http://127.0.0.1:4176';let browser;
  try{
    for(let i=0;i<40;i++){if(server.exitCode!==null)throw Error('HTTP server failed');try{if((await fetch(base)).ok)break;}catch{}await new Promise(r=>setTimeout(r,100));}
    browser=await chromium.launch({executablePath:process.env.BROWSER_EXECUTABLE||(existsSync('/usr/bin/chromium')?'/usr/bin/chromium':undefined),headless:true});
    const context=await browser.newContext({viewport:{width:1440,height:1000}});const page=await context.newPage();const errors=[];
    page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text());});
    await page.goto(base);await page.locator('h1').waitFor();await page.evaluate(async()=>{const {createProject}=await import('/src/db/import-store.mjs');for(const id of ['BIDC','LVB'])await createProject({id,name:id,status:'active',color:'green'});});await page.locator('#workspace-mode').selectOption('imported');
    const upload=async(book,name='BIDC.xlsx')=>{await page.goto(`${base}/#/dashboard`);await page.goto(`${base}/#/upload`);await page.locator('#real-project').selectOption('BIDC');await page.locator('#real-year').fill('2026');await page.locator('#real-month').selectOption('10');await page.locator('#real-excel-file').setInputFiles({name,mimeType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',buffer:binary(book)});await page.locator('[data-import="review"]').waitFor();};
    await upload(bidc());
    assert.equal(await page.locator('#header-row').inputValue(),'6');assert.equal(await page.locator('#type-row').inputValue(),'7');assert.equal(await page.locator('#real-month').inputValue(),'10');assert.equal(await page.locator('#real-year').inputValue(),'2026');
    await page.locator('#real-year').fill('');await page.locator('[data-import="review"]').click();await page.getByRole('alert').waitFor();assert.match(await page.getByRole('alert').innerText(),/Bắt buộc chọn năm/);
    await page.locator('#real-year').fill('2026');await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();assert.equal(await page.locator('.import-preview tbody tr').count(),39);assert.match(await page.locator('.panel-body').first().innerText(),/47/);assert.match(await page.locator('.import-preview tbody tr').first().innerText(),/4h/);
    await page.locator('[data-import="commit"]').click();assert.match(await page.locator('#toast').innerText(),/xác nhận tháng/);await page.locator('#real-confirm-period').check();await page.locator('[data-import="commit"]').click();await page.waitForURL('**/#/history');
    let db=await page.evaluate(async()=>{const {readImportState}=await import('/src/db/import-store.mjs');return readImportState();});assert.equal(db.imports.length,1);assert.equal(db.imports[0].records.length,39);assert.equal(db.imports[0].records.some(r=>r.employeeId.startsWith('DEMO')),false);
    await page.goto(`${base}/#/dashboard`);assert.equal(await page.locator('#workspace-mode').inputValue(),'imported');assert.equal(await page.locator('.stat-value').first().innerText(),'39');assert.match(await page.locator('.stat-value').nth(2).innerText(),/156/);
    await page.reload();await page.locator('#workspace-mode').selectOption('imported');await page.locator('[data-filter="month"]').selectOption('10');await page.waitForFunction(()=>document.querySelector('.stat-value')?.textContent==='39');
    console.log('PASS: real XLSX in Worker, BIDC 39 staff, year required, preview, persistent save, no demo seeding.');
    await upload(bidc({shift:3,reorder:true}),'shifted.xlsx');assert.equal(await page.locator('#header-row').inputValue(),'9');assert.equal(await page.locator('#field-code').inputValue(),'2');
    await page.locator('#real-year').fill('2026');await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();assert(await page.locator('[data-import="commit"]').isDisabled());assert.match(await page.locator('.panel-body').first().innerText(),/đã có dữ liệu/);
    await page.locator('[data-import="replace-period"]').click();await page.locator('#confirm-replace').waitFor();assert.equal(await page.locator('[data-import="commit"]').isDisabled(),false);await page.locator('[data-import="abort-import"]').click();await page.waitForURL('**/#/history');const cancelled=await page.evaluate(async()=>{const {readImportState}=await import('/src/db/import-store.mjs');return readImportState();});assert.equal(cancelled.imports.length,1);assert.equal(cancelled.importHistory.some(h=>h.action==='CANCEL_IMPORT'),true);
    console.log('PASS: changed layout/reordered columns detected; replacement offered; cancel preserves OT and logs history.');
    await page.goto(`${base}/#/dashboard`);await page.goto(`${base}/#/upload`);assert.equal(await page.locator('#real-mode option[value="supplement"]').count(),0);
    // Unknown labels are assigned manually and recognized next time by saved profile.
    const custom=bookFrom([['BẢNG THÁNG 9 NĂM 2026'],[],['Người thực hiện','Định danh nội bộ','Tổng kết giờ'],['Giả lập thủ công','MANUAL001',8]]);
    await upload(custom,'custom.xlsx');if(await page.locator('#mapping-advanced').getAttribute('open')===null)await page.locator('#mapping-advanced > summary').click();await page.locator('#header-row').fill('3');await page.locator('#data-start').fill('4');await page.locator('#field-name').selectOption('0');await page.locator('#field-code').selectOption('1');await page.locator('#field-total').selectOption('2');await page.locator('#real-month').selectOption('9');await page.locator('#real-year').fill('2026');await page.locator('[data-import="save-profile"]').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Đã lưu mapping'));
    await upload(custom,'custom.xlsx');assert.equal(await page.locator('#header-row').inputValue(),'3');assert.equal(await page.locator('#field-code').inputValue(),'1');
    console.log('PASS: supplement duplicates blocked; unfamiliar manual mapping persisted and reused.');
    await page.goto(`${base}/#/dashboard`);await page.goto(`${base}/#/upload`);await page.locator('#real-project').selectOption('BIDC');await page.locator('#real-year').fill('2026');await page.locator('#real-month').selectOption('10');await page.locator('[data-import="sample"]').click();await page.locator('#real-year').fill('2026');await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();assert(await page.locator('[data-import="commit"]').isDisabled());assert.match(await page.locator('[data-import="commit"]').innerText(),/chỉ xem trước/);
    // Transaction revision, replacements and daily conflicts are exercised against isolated browser DB.
    const transactionResult=await page.evaluate(async()=>{
      const {readImportState,saveImport,fingerprint,assessImport,activeImports}=await import('/src/db/import-store.mjs');
      const first=(await readImportState()).imports[0];
      const make=async(changes)=>{const r={...first,...changes};delete r.id;r.contentHash=await fingerprint(r.records);r.databaseRevision=(await readImportState()).databaseRevision;return r;};
      const conflict=await make({projectId:'LVB',mode:'initial',revision:0});const before=(await readImportState()).imports.length;
      let conflictBlocked=false;try{await saveImport(conflict);}catch{conflictBlocked=true;}
      const after=(await readImportState()).imports.length;
      const changed=structuredClone(first.records);changed[0].ntMinutes+=60;changed[0].totalMinutes+=60;changed[0].days[0].minutes+=60;
      const replacement=await make({records:changed,mode:'replace',revision:1});await saveImport(replacement);
      let staleBlocked=false;try{await saveImport({...replacement,revision:1,contentHash:'different'});}catch{staleBlocked=true;}
      const snapshot=await readImportState();return {conflictBlocked,before,after,staleBlocked,activeCount:activeImports(snapshot).length,historyCount:snapshot.imports.length};
    });
    assert.equal(transactionResult.conflictBlocked,false);assert.equal(transactionResult.after,transactionResult.before+1);assert.equal(transactionResult.staleBlocked,true);assert.equal(transactionResult.activeCount,2);assert.equal(transactionResult.historyCount,3);
    console.log('PASS: synthetic sample cannot be saved; day conflicts warn and preserve records; replacement and stale revision checks.');
    // Verify .xls reader too, and formula strings remain inert when displayed.
    const xls=bookFrom([['THÁNG 8 NĂM 2026'],[],['Họ tên','Mã CB','Giờ NT','Giờ NN','Tổng giờ'],['<img src=x onerror=alert(1)>','XLS001',2,1,3]]);
    await page.goto(`${base}/#/dashboard`);await page.goto(`${base}/#/upload`);await page.locator('#real-project').selectOption('BIDC');await page.locator('#real-year').fill('2026');await page.locator('#real-month').selectOption('8');await page.locator('#real-excel-file').setInputFiles({name:'legacy.xls',mimeType:'application/vnd.ms-excel',buffer:binary(xls,'xls')});await page.locator('[data-import="review"]').waitFor();await page.locator('[data-import="review"]').click();await page.locator('#real-confirm-period').waitFor();assert.equal(await page.locator('.import-preview img').count(),0);assert.match(await page.locator('.import-preview tbody').innerText(),/onerror/);
    const artifact=mkdtempSync(path.join(tmpdir(),'ot-import-'));await page.screenshot({path:path.join(artifact,'preview-desktop.png'),fullPage:true});
    await page.setViewportSize({width:390,height:844});assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.screenshot({path:path.join(artifact,'preview-mobile.png'),fullPage:true});assert.deepEqual(errors,[]);
    console.log('PASS: legacy XLS, escaped Excel content, mobile layout and no browser errors.');console.log('Screenshots:',artifact);
  }finally{await browser?.close();server.kill();}
})().catch(e=>{console.error(e);process.exitCode=1;});
