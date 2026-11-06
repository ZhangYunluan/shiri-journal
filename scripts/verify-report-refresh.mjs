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
    for(let i=0;i<6;i++)await db.saveRecord({id:'fixture-'+i,assetId:'asset-'+i,title:'测试照片 '+i,note:'',date:'2026-10-'+(12+i),time:'18:00',categoryId:'daily',status:i<4?'confirmed':'review',tags:[],location:'',mood:null,duration:null,amount:null,weight:null,reflection:'',analysis:{method:'已有识别',labels:[],ocr:''},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},categories,{...base,id:'asset-'+i});
  });
  await page.reload();await page.waitForSelector('[data-action="batch-mode"]');
  await page.evaluate(async()=>{
    const db=await import('/src/db.mjs'),core=await import('/src/core.mjs');const d=await db.readAll(),one=d.records.filter(r=>r.id==='fixture-0');
    await db.put('reports',{id:'week:2026-10-12:brief',period:'week',start:'2026-10-12',end:'2026-10-18',style:'brief',text:core.makeReport(one,d.categories,'week','2026-10-15'),recordSignature:core.signature(one)});
  });
  async function week(){await page.goto('http://127.0.0.1:4193/#reports');await page.click('[data-action="period"][data-id="week"]');await page.locator('#report-date').fill('2026-10-15');await page.locator('#report-date').dispatchEvent('change');}
  await page.reload();
  await week();assert.match(await page.locator('.report-paper').innerText(),/4 条记录，覆盖 4 天/);
  await page.click('[data-action="save-report"]');
  let saved=await page.evaluate(async()=>{const db=await import('/src/db.mjs');return db.get('reports','week:2026-10-12:brief')});
  assert.equal(saved.source,'auto');assert.match(saved.preservedText,/1 条记录/);
  await page.goto('http://127.0.0.1:4193/#library');await page.click('[data-action="edit-record"][data-id="fixture-4"]');
  await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
  saved=await page.evaluate(async()=>{const db=await import('/src/db.mjs');return db.get('reports','week:2026-10-12:brief')});
  assert.match(saved.text,/5 条记录，覆盖 5 天/);assert.match(saved.preservedText,/1 条记录/);
  await week();await page.click('[data-action="edit-report"]');await page.locator('#report-editor').fill('我的手写复盘，不要覆盖');await page.click('[data-action="save-report"]');
  await page.evaluate(async()=>{const db=await import('/src/db.mjs');const d=await db.readAll();await db.saveRecord({...d.records[0],id:'extra',date:'2026-10-17',title:'新增第六天',assetId:null,status:'confirmed'},d.categories)});
  await page.reload();await page.click('[data-action="period"][data-id="week"]');await page.locator('#report-date').fill('2026-10-15');await page.locator('#report-date').dispatchEvent('change');
  assert.match(await page.locator('.report-paper').innerText(),/我的手写复盘，不要覆盖/);assert.match(await page.locator('.report-version').innerText(),/6 条已确认记录 · 6 天/);
  await page.screenshot({path:'docs/report-refresh-0.5.6.png'});
  await page.goto('http://127.0.0.1:4193/#library');await page.click('[data-action="batch-mode"]');await page.click('[data-action="batch-select"][data-id="fixture-5"]');await page.click('[data-action="batch-exclude"]');await page.click('#confirmation button[type="submit"]');
  await page.waitForSelector('[data-action="batch-undo"]');await page.click('[data-action="batch-mode"]');
  for(const width of [320,390,430]){
    await page.setViewportSize({width,height:844});await page.locator('.material-actions').scrollIntoViewIfNeeded();
    const buttons=await page.locator('.material-actions button').evaluateAll(bs=>bs.map(b=>{const r=b.getBoundingClientRect();return {y:r.y,h:r.height}}));
    assert.equal(buttons.length,3);assert.ok(buttons.every(b=>Math.abs(b.y-buttons[0].y)<1&&b.h>=44));
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  }
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/material-actions-0.5.6.png'});
  assert.deepEqual(errors,[]);console.log('PASS: legacy 1-day → live 4-day report; saved auto report updates to 5 days via record form; manual text and legacy original retained after additions; three actions one row at 320/390/430px.');
}finally{await browser.close();}
process.exit(0);
