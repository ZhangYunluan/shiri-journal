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
    for(let i=0;i<24;i++)await db.saveRecord({id:'fixture-'+i,assetId:'asset-'+i,title:'测试照片 '+i,note:'',date:'2026-10-13',time:'18:00',categoryId:'daily',status:'review',tags:[],location:'',mood:null,duration:null,amount:null,weight:null,reflection:'',analysis:{method:'已有识别',labels:[],ocr:''},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},categories,{...base,id:'asset-'+i});
  });
  await page.reload();await page.waitForSelector('[data-action="batch-mode"]');
  await page.evaluate(async()=>{
    const db=await import('/src/db.mjs');const r=await db.get('records','fixture-0');
    await db.saveRecord({...r,kind:'moment',status:'confirmed',visibility:'friends',cloudSync:{state:'pending',revision:'test',stage:'upload',error:'无法连接照片服务，请检查网络或跨域配置。',errorCode:'MEDIA_CONNECTION',errorStatus:0}},(await db.readAll()).categories);
  });
  await page.reload();await page.waitForSelector('[data-action="retry-cloud-sync"]');
  assert.match(await page.locator('.asset-card[data-id="fixture-0"]').innerText(),/同步失败/);
  await page.click('[data-action="edit-record"][data-id="fixture-0"]');
  assert.match(await page.locator('#record-form').innerText(),/上传照片：无法连接照片服务，请检查网络或跨域配置/);
  await page.keyboard.press('Escape');
  await context.setOffline(true);await page.click('[data-action="retry-cloud-sync"]');
  await page.waitForFunction(()=>document.querySelector('.asset-card[data-id="fixture-0"]').innerText.includes('待联网同步'));
  await context.setOffline(false);await page.click('[data-action="retry-cloud-sync"]');
  await page.waitForFunction(()=>document.querySelector('.asset-card[data-id="fixture-0"]').innerText.includes('同步失败'));
  const r=await page.evaluate(async()=>{const db=await import('/src/db.mjs');return db.get('records','fixture-0')});
  assert.equal(r.cloudSync.revision,'test');assert.equal(r.title,'测试照片 0');
  for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/sync-status-0.5.5.png'});
  assert.deepEqual(errors,[]);console.log('PASS: actual IndexedDB and UI error detail, offline/online labels, retry without resave, mobile layout. Isolated synthetic data; no CloudBase account used.');
}finally{await browser.close();}
process.exit(0);
