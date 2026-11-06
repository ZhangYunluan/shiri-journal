import {readFile} from 'node:fs/promises';
/** Isolated synthetic browser checks. No real email, photos or cloud writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const phase=process.env.UX_PHASE||'after';
process.env.PORT='4199';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
import {launchBrowser} from './browser-test-runtime.mjs';
const browser=await launchBrowser();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let offline=false,aiCalls=0;const origin='http://127.0.0.1:4199';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin){const backup={'/life-app.mjs':'life-app.mjs','/life.css':'life.css','/src/views.mjs':'views.mjs'}[url.pathname];if(phase==='before'&&backup)return route.fulfill({contentType:backup.endsWith('.css')?'text/css':'text/javascript',body:await readFile('releases/ux-phase1-before/'+backup,'utf8')});return route.continue();}
  if(url.pathname.includes('assistant'))aiCalls++;
  if(offline)return route.abort();
  let data={};
  if(url.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(url.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(url.pathname.endsWith('/signin')||url.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'experience-user'};
  if(url.pathname.endsWith('/user/me'))data={sub:'experience-user',email:'fixture@example.invalid',nickName:'测试生活'};
  if(url.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],records:[],profile:{nickname:'测试生活'}};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#plans');await page.waitForSelector('[data-cloud-form="send"]');
 assert.equal(await page.locator('[data-action="new-plan"]').count(),0);
 await page.locator('[name="email"]').fill('fixture@example.invalid');await page.locator('[data-cloud-form="send"] button').first().click();
 await page.locator('[name="code"]').fill('123456');await page.locator('[data-cloud-form="verify"] button').click();
 await page.waitForSelector('[data-action="new-plan"]');

 await page.evaluate(async()=>{const db=await import('/src/db.mjs'),{localDate,addDays}=await import('/src/core.mjs'),{prepareImage}=await import('/src/images.mjs');const {categories}=await db.readAll(),today=localDate();const photo=await(await fetch('/tests/fixtures/test-receipt.png')).blob();for(let i=0;i<18;i++){const asset=await prepareImage(new File([photo],'fixture-'+i+'.png',{type:'image/png'}));await db.saveRecord({id:'ux-'+i,date:i<12?today:addDays(today,-(i-11)),time:'18:00',title:i<12?['午后的一杯茶','路上的小发现','今天的晚餐'][i%3]:['散步的傍晚','读完一章书','和朋友吃饭'][i%3],note:'界面验收用合成记录，不是真实用户数据',categoryId:'daily',status:i<12?'review':'confirmed',kind:'moment',visibility:'self',mood:null,reflection:'',tags:[],location:'',amount:null,duration:null,weight:null,assetId:asset.id,createdAt:today,updatedAt:today},categories,asset);}});
 await page.goto(origin+'/#dashboard');await page.reload();await page.waitForSelector('.daily-actions');
 await page.screenshot({path:'releases/ux-phase1/'+phase+'-home.png',fullPage:true});
 if(phase==='after'){await page.goto(origin+'/#library');await page.locator('#library-search').fill('找不到的旧搜索');await page.goto(origin+'/#dashboard');await page.locator('.journey-primary').click();await page.waitForSelector('.batch-toolbar');assert.equal(await page.locator('#library-search').inputValue(),'');assert.equal(await page.locator('[data-action="batch-select"]').count(),12);}else{await page.goto(origin+'/#library');await page.locator('[data-action="batch-mode"]').click();}await page.locator('[data-action="batch-select"]').nth(0).click();await page.locator('[data-action="batch-select"]').nth(1).click();
 await page.screenshot({path:'releases/ux-phase1/'+phase+'-review.png',fullPage:false});
 if(phase==='after'){
 for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-action="batch-confirm"]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已保存在本机'));
 await page.waitForTimeout(250);await page.screenshot({path:'releases/ux-phase1/after-saved.png',fullPage:false});
 await page.goto(origin+'/#dashboard');await page.waitForSelector('.life-footprints');assert.match(await page.locator('.life-footprints').innerText(),/7/);await page.screenshot({path:'releases/ux-phase1/after-progress.png',fullPage:true});
 const counts=await page.evaluate(async()=>{const d=await(await import('/src/db.mjs')).readAll();return {records:d.records.length,saved:d.records.filter(r=>r.status==='confirmed').length,assets:d.assets.length};});assert.deepEqual(counts,{records:18,saved:8,assets:1});
 await page.reload();await page.waitForSelector('.life-footprints');assert.ok(await page.locator('#toast').isHidden());
 await page.locator('[data-action="note"]').first().click();await page.locator('#record-form [name="title"]').fill('一次新的片刻');await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已保存在本机'));assert.ok(!await page.locator('#editor-dialog').evaluate(d=>d.open));await page.waitForTimeout(250);await page.screenshot({path:'releases/ux-phase1/after-single-save.png'});
 await page.goto(origin+'/#dashboard');await page.waitForSelector('.journey-primary');
 await page.evaluate(async()=>{const db=await import('/src/db.mjs'),backup=await import('/src/backup.mjs');const before=await db.readAll();const restored=await backup.parseBackup(await backup.exportBackup(before));await db.restoreBackup(restored);const after=await db.readAll();if(before.records.length!==after.records.length||before.assets.length!==after.assets.length)throw Error('backup mismatch');});
 await page.emulateMedia({reducedMotion:'reduce'});assert.equal(await page.locator('.journey-primary').evaluate(el=>getComputedStyle(el).animationName),'none');
 }
 assert.deepEqual(errors,[]);console.log('PASS '+phase+' screenshots, isolated synthetic records'+(phase==='after'?', batch save persisted, real growth and responsive layout':''));
}finally{await browser.close();}process.exit(0);
