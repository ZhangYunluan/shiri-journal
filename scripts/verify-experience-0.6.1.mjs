/** Isolated synthetic browser checks. No real email, photos or cloud writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
process.env.PORT='4199';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const {chromium}=await import(pathToFileURL(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let offline=false,aiCalls=0;const origin='http://127.0.0.1:4199';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
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
 await page.goto(origin+'/#dashboard');assert.match(await page.locator('.timeline-empty').innerText(),/添加一张照片/);
 assert.equal(await page.locator('.home-details[open]').count(),0);
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),{localDate,addDays}=await import('/src/core.mjs');const {categories}=await db.readAll();
  const today=localDate();
  for(let i=0;i<4;i++)await db.saveRecord({id:'experience-'+i,date:addDays(today,-i),time:'18:00',title:['公园散步','和家人吃饭','读完一章','整理书桌'][i],note:'测试记录：感觉不错',categoryId:'daily',status:'confirmed',kind:'moment',visibility:'self',mood:i===0?4:null,reflection:i===0?'highlight':i===1?'regret':'',tags:[],location:'',amount:null,duration:null,weight:null,assetId:null,createdAt:today,updatedAt:today},categories);
  const {prepareImage}=await import('/src/images.mjs');const photo=await (await fetch('/tests/fixtures/test-receipt.png')).blob();const asset=await prepareImage(new File([photo],'test.png',{type:'image/png'}));const row=await db.get('records','experience-0');await db.saveRecord({...row,assetId:asset.id},categories,asset);
  await db.put('plans',{id:'goal',title:'写读书笔记',date:addDays(today,3),categoryId:'learning',horizon:'week',done:false,order:0,reason:''});
 });
 await page.goto(origin+'/#dashboard');await page.reload();await page.waitForSelector('.daily-actions');
 assert.equal(await page.locator('text=以自己的生活节奏为中心').count(),0);
 for(const width of [320,390,430,1280]){
  await page.setViewportSize({width,height:844});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'home width '+width);
 }
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'docs/experience-0.6.1-home.png',fullPage:true});
 await page.goto(origin+'/#library');await page.locator('[data-action="library-status"][data-id="confirmed"]').click();assert.ok(await page.locator('.asset-photo').count());
 await page.evaluate(()=>document.documentElement.dataset.theme='light');await page.screenshot({path:'docs/experience-0.6.1-library-light.png',fullPage:true});
 await page.goto(origin+'/#settings');await page.locator('#usage-guide summary').click();assert.match(await page.locator('#usage-guide').innerText(),/保存片刻[\s\S]*好友[\s\S]*隐私/);
 await page.goto(origin+'/#settings');assert.ok(!await page.locator('#beta-consent').isChecked());
 await page.locator('#beta-consent').check();await page.locator('#confirmation button[type="submit"]').click();
 await page.waitForFunction(()=>document.querySelector('#beta-consent')?.checked);
 await page.goto(origin+'/#dashboard');await page.locator('[data-action="note"]').first().click();
 await page.locator('#record-form [name="title"]').fill('不应进入统计的私人内容');await page.locator('#record-form [name="recordKind"]').selectOption('diary');
 await page.locator('#record-form button[type="submit"]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
 await page.goto(origin+'/#reports');await page.waitForTimeout(150);
 await page.goto(origin+'/#friends');await page.waitForSelector('[data-friends-root]');assert.equal(await page.locator('.account-details[open]').count(),0);assert.match(await page.locator('[data-friends-root]').innerText(),/从一位亲近的人开始/);
 await page.waitForTimeout(150);
 const counters=await page.evaluate(async()=>{const db=await import('/src/db.mjs');return db.get('settings','beta-analytics-v1');});
 assert.ok(counters.events.some(e=>e.name==='subsequent_save'));assert.ok(counters.events.some(e=>e.name==='report_view'));assert.ok(counters.events.some(e=>e.name==='friend_view'));assert.ok(!JSON.stringify(counters).includes('私人内容'));
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),backup=await import('/src/backup.mjs');const before=await db.readAll(),restored=await backup.parseBackup(await backup.exportBackup(before));
  if(restored.settings.some(r=>r.id==='beta-analytics-v1'))throw Error('telemetry leaked into backup');
  if(restored.assets[0].blob.size!==before.assets[0].blob.size)throw Error('photo backup changed');
  await db.restoreBackup(restored);const after=await db.readAll();if(after.records.length!==before.records.length||after.assets.length!==before.assets.length)throw Error('restore did not preserve existing IDs');
 });
 await page.goto(origin+'/#settings');await page.locator('#beta-consent').uncheck();await page.waitForFunction(()=>!document.querySelector('#beta-consent')?.checked);
 await page.goto(origin+'/#plans');await page.click('[data-action="suggest-plans"]');
 assert.match(await page.locator('.planning-review').innerText(),/最近生活观察[\s\S]*值得关注的变化/);
 assert.equal(await page.locator('.plan-row').count(),1);const before=await page.locator('.suggestion-row').count();
 await page.locator('[data-action="adopt-suggestion"]').first().click();await page.waitForFunction(()=>document.querySelectorAll('.plan-row').length===2);
 assert.equal(await page.locator('.suggestion-row').count(),before-1);
 await page.locator('[data-action="edit-suggestion"]').first().click();await page.locator('#plan-form [name="title"]').fill('自己修改的下一步');await page.locator('#plan-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelectorAll('.plan-row').length===3);
 if(await page.locator('[data-action="ignore-suggestion"]').count())await page.locator('[data-action="ignore-suggestion"]').first().click();
 await page.click('[data-action="assistant-toggle"]');assert.match(await page.locator('.assistant-panel').innerText(),/尚未接通/);
 await page.locator('.assistant-records summary').click();await page.locator('[data-assistant-record]').first().check();
 await page.locator('.assistant-preview summary').click();assert.match(await page.locator('.assistant-summary').innerText(),/散步/);
 assert.ok(await page.locator('#assistant-form button[type="submit"]').isDisabled());assert.equal(aiCalls,0);
 for(const width of [320,390,430]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'planning width '+width);}
 await page.setViewportSize({width:390,height:844});await page.locator('#assistant-form textarea').focus();await page.screenshot({path:'docs/experience-0.6.1-plans.png',fullPage:true});
 offline=true;await page.reload();await page.waitForSelector('[data-action="new-plan"]');assert.equal(await page.locator('.plan-row').count(),3);
 await page.goto(origin+'/#friends');await page.waitForSelector('[data-cloud-auth="logout"]');assert.match(await page.locator('#main').innerText(),/离线记录模式/);
 offline=false;await page.click('[data-cloud-auth="restore"]');await page.waitForSelector('.account-details summary');await page.locator('.account-details summary').click();await page.waitForSelector('[data-cloud-auth="edit-name"]');
 await page.click('[data-cloud-auth="logout"]');await page.waitForSelector('[data-cloud-form="send"]');
 assert.equal(await page.locator('.nav-link').count(),0);
 assert.deepEqual(errors,[]);console.log('PASS: analytics opt-in/save/views/opt-out, content-free events, backup restore with photo and stable IDs, collapsed friends account, empty home/feed; login gate, mocked OTP, home widths, local guide, explicit suggestion adoption/ignore, assistant privacy selection/unconfigured no requests, offline restore, online restore and logout.');
}finally{await browser.close();}
process.exit(0);
