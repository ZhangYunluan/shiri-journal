/** Isolated browser acceptance fixture: synthetic local photos, external requests blocked. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
process.env.PORT='4193';process.env.HOST='127.0.0.1';
await import('../preview-server.mjs');
const {chromium}=await import(pathToFileURL(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4193'?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('shiri-space-owner','SRTESTABCDEF12'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4193/#library');await page.waitForSelector('[data-action="batch-mode"]');
  await page.evaluate(async()=>{
    const db=await import('/src/db.mjs');await db.clearEverything();
    const {prepareImage}=await import('/src/images.mjs');const blob=await (await fetch('/tests/fixtures/test-receipt.png')).blob();
    const base=await prepareImage(new File([blob],'synthetic.png',{type:'image/png'}));
    const {categories}=await db.readAll();
    for(let i=0;i<80;i++)await db.saveRecord({id:'fixture-'+i,assetId:'asset-'+i,title:'测试照片 '+i,note:'',date:'2026-10-13',time:'18:00',categoryId:'daily',status:'review',tags:[],location:'',mood:null,duration:null,amount:null,weight:null,reflection:'',analysis:{method:'已有识别',labels:[],ocr:''},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},categories,{...base,id:'asset-'+i});
  });
  await page.reload();await page.waitForSelector('[data-action="batch-mode"]');
  assert.equal(await page.locator('.asset-card').count(),80);
  await page.click('[data-action="batch-mode"]');
  for(let i=0;i<50;i++)await page.click(`[data-action="batch-select"][data-id="fixture-${i}"]`);
  assert.equal(await page.locator('#batch-count').innerText(),'已选 50 张');
  await page.click('[data-action="batch-exclude"]');await page.click('#confirmation button[type="submit"]');
  await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===30);
  await page.reload();await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===30);
  await page.click('[data-action="batch-mode"]');await page.click('[data-action="batch-all"]');
  assert.equal(await page.locator('#batch-count').innerText(),'已选 30 张');
  await page.click('[data-action="batch-confirm"]');
  await page.waitForFunction(async()=>{const db=await import('/src/db.mjs');return (await db.readAll()).records.filter(r=>r.status==='confirmed').length===30;});
  const stored=await page.evaluate(async()=>{const {readAll}=await import('/src/db.mjs');const d=await readAll();return {excluded:d.records.filter(r=>r.excluded).length,confirmed:d.records.filter(r=>r.status==='confirmed').length,pending:d.records.filter(r=>r.cloudSync?.state==='pending').length,assets:d.assets.length,learning:d.learning.length,reports:d.reports.length};});
  assert.deepEqual({...stored,reports:undefined},{excluded:50,confirmed:30,pending:30,assets:80,learning:30,reports:undefined});assert.ok(stored.reports>=4);
  await page.click('[data-action="excluded-view"]');await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===50);
  await page.click('[data-action="batch-all"]');await page.click('[data-action="batch-restore"]');
  await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===0);
  await page.click('[data-action="excluded-view"]');await page.click('[data-action="library-status"][data-id="review"]');
  await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===50);
  await page.click('[data-action="edit-record"][data-id="fixture-0"]');
  assert.equal(await page.locator('#record-form [name="categoryId"]').inputValue(),'daily');
  assert.equal(await page.locator('#record-form [name="visibility"]').inputValue(),'friends');
  assert.match(await page.locator('#record-form').innerText(),/未检测到清晰文字/);await page.keyboard.press('Escape');
  for(const width of [390,1440]){await page.setViewportSize({width,height:900});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/batch-review-0.5.3.png'});
  const ocr=await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=480;const ctx=canvas.getContext('2d');ctx.fillStyle='#ddd';ctx.fillRect(0,0,640,480);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const {analyzeImage}=await import('/src/local-ai.mjs');return analyzeImage({blob,thumbnail:blob},{ocrEnabled:true,aiEnabled:false},[],()=>{});
  });assert.equal(ocr.ocr,'');console.log('PASS: real local Tesseract on an image without text returns empty OCR.');
  const collected=await page.evaluate(async()=>{
    const db=await import('/src/db.mjs');await db.clearEverything();const {createCollector}=await import('/src/auto-collect.mjs');
    const input=Array.from({length:80},(_,i)=>({id:'00000000-0000-4000-8000-'+i.toString(16).padStart(12,'0'),path:'/tests/fixtures/test-receipt.png',name:'same-converted-bytes.png',type:'image/png',added:new Date('2026-10-13T20:00:00').getTime(),taken:new Date('2026-10-12T15:00:00').getTime(),date:'2026-10-12'}));
    let queue=[...input],reads=0;
    window.shiriNative={photoURL:path=>{reads++;return path;},photos:{status:async()=>({enabled:true,permission:'partial',pending:queue.length,summaries:[]}),pending:async()=>({photos:queue.slice(0,30)}),acknowledge:async({id})=>{queue=queue.filter(p=>p.id!==id);}}};
    const collector=createCollector({changed:async()=>{},toast:()=>{},confirm:async()=>true});await collector.start();
    let data=await db.readAll();if(data.records.length!==80||queue.length)throw Error('Native pagination missed photos');
    const {reviewBatch}=await import('/src/moment-review.mjs');await db.saveReviewBatch(reviewBatch(data.records,data.records.slice(0,50).map(r=>r.id),'exclude'),data.categories);
    queue=[...input];await collector.start();data=await db.readAll();
    if(data.records.length!==80||data.assets.length!==1||data.records.filter(r=>r.excluded).length!==50||reads!==80)throw Error('Rescan revived exclusions or collapsed distinct MediaStore records');
    if(data.records[0].time!=='15:00')throw Error('Capture time not retained');
    return {records:data.records.length,assets:data.assets.length,excluded:50,sourceReads:reads};
  });console.log('PASS: native bridge fixture, all 80 across 30-item pages, same converted bytes retain distinct records; rescan keeps exclusion; capture date/time.',JSON.stringify(collected));
  assert.deepEqual(errors,[]);console.log('PASS: actual UI + IndexedDB: 80 → exclude 50 → reload → confirm 30; local reports; restore; single preview; 390/1440px. Synthetic data only.');
}finally{await browser.close();}
process.exit(0);
