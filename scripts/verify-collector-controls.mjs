/** Synthetic native bridge; does not prove Android permission/WorkManager/device behavior. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4215';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const origin='http://127.0.0.1:4215',browser=await launchBrowser(),errors=[],forbidden=[];
try{
 const context=await browser.newContext({viewport:{width:393,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();let data={};
  if(/shiri-media|shiri-ai/.test(url.pathname)){forbidden.push(url.pathname);return route.abort();}
  if(url.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(url.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(url.pathname.endsWith('/signin')||url.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'collector-fixture'};
  if(url.pathname.endsWith('/user/me'))data={sub:'collector-fixture',email:'fixture@example.invalid',nickName:'合成采集测试'};
  if(url.pathname.endsWith('/shiri_social')){let p={};try{p=route.request().postDataJSON();}catch{}assert.ok(!/^publish_/.test(p.p_action||''));data={friends:[],incoming:[],outgoing:[],records:[],mine:[],blocked:[],hasMore:false};}
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{
  const prefs=JSON.parse(localStorage.getItem('fixture-collector')||'{"enabled":true,"permission":"full","time":"21:30"}');
  window.fixture=prefs;window.calls=[];window.queue=[];window.seen=new Set(JSON.parse(localStorage.getItem('fixture-seen')||'[]'));window.mode='new';window.canRequest=true;window.authorizeResult='partial';window.holdManual=false;window.failConfigure=false;
  const save=()=>localStorage.setItem('fixture-collector',JSON.stringify(fixture));
  window.shiriNative={platform:'android',photoURL:()=>'/tests/fixtures/test-receipt.png',photos:{
   status:async()=>{const snapshot={...fixture,requested:fixture.enabled,scheduled:fixture.enabled,canReselect:true,canRequestPermission:canRequest,scanComplete:true,pending:queue.length,counts:{pending:queue.length,imported:seen.size},lastRun:fixture.lastRun||0};if(window.holdStatus){holdStatus=false;window.releaseStatus=()=>window.statusResolve(snapshot);return new Promise(resolve=>window.statusResolve=resolve);}return snapshot;},
   configure:async args=>{calls.push(['configure',args]);if(failConfigure)throw Error('合成持久化失败');fixture.enabled=args.enabled;fixture.time=args.time;save();return {ok:true};},
   authorize:async()=>{calls.push(['authorize']);fixture.permission=authorizeResult;save();return {};},
   openSettings:async()=>{calls.push(['settings']);return {opened:true};},
   runNow:async args=>{calls.push(['scan',args]);if(holdManual&&!args.automatic)await new Promise(resolve=>window.releaseManual=resolve);if(args.automatic)return {found:0,staged:0,existing:0,failed:0,unsupported:0,complete:true,until:1};
    if(mode==='error')throw Error('合成相册读取失败');
    let staged=0;for(let i=1;i<=2;i++){const id=String(i).repeat(8)+'-1111-4111-8111-'+String(i).repeat(12);if(!seen.has(id)){seen.add(id);queue.push({id,path:'/synthetic',name:'fixture-'+i+'.png',type:'image/png',date:'2026-10-29',taken:1793239200000,added:1793239200000});staged++;}}
    localStorage.setItem('fixture-seen',JSON.stringify([...seen]));fixture.lastRun=Date.now();save();return {found:4,staged,existing:4-staged,failed:0,unsupported:0,complete:true,until:1};},
   pending:async()=>({photos:queue.slice(0,30)}),acknowledge:async({id})=>{queue=queue.filter(p=>p.id!==id);},location:async()=>({available:false})
  }};
 });
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#settings');await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('[data-collector=enable]');await page.locator('[data-collector=enable]').click();await page.waitForSelector('[data-collector=disable]');await page.waitForFunction(()=>!document.querySelector('[data-collector=now]').disabled);
 const panel=page.locator('#collector-panel'),guide=page.locator('#collector-scan-dialog');
 // Delayed pre-pause status must not overwrite the successful pause response.
 await page.evaluate(()=>{window.holdStatus=true;document.dispatchEvent(new Event('shiri-native-resume'));});await page.waitForFunction(()=>!!window.releaseStatus);
 await page.locator('[data-collector=disable]').click();await page.waitForFunction(()=>document.querySelector('#collector-panel').textContent.includes('自动采集已暂停'));
 await page.evaluate(()=>releaseStatus());await page.waitForTimeout(200);assert.match(await panel.innerText(),/自动采集已暂停/);assert.equal(await page.evaluate(()=>fixture.permission),'full');
 await page.reload();await page.waitForSelector('[data-collector=enable]');assert.match(await panel.innerText(),/自动采集已暂停/);
 await page.locator('[data-collector=now]').click();await guide.waitFor({state:'visible'});await guide.locator('[value="7"]').check();await guide.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.scan-result').textContent.includes('导入待审核 2 张'));
 assert.equal(await page.evaluate(()=>fixture.enabled),false);assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='scan'&&!c[1].automatic).at(-1)[1].days),7);
 let records=await page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()).records);assert.equal(records.length,2);assert.ok(records.every(r=>r.status==='review'&&r.shareApproved===false));
 await guide.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.scan-status').textContent.includes('没有发现新的待审核照片'));assert.equal((await page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()).records)).length,2);
 await page.evaluate(()=>window.mode='error');await guide.locator('[type=submit]').click();await page.waitForFunction(()=>document.querySelector('.scan-status').textContent.includes('合成相册读取失败'));assert.doesNotMatch(await guide.locator('.scan-status').innerText(),/^没有发现/);await page.evaluate(()=>window.mode='new');
 for(const width of [320,360,393,412]){await page.setViewportSize({width,height:740});assert.ok(await guide.evaluate(d=>d.scrollWidth<=d.clientWidth+1));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));}
 await guide.locator('[data-collector=close-scan]').click();await panel.locator('summary').click();const scans=await page.evaluate(()=>calls.filter(c=>c[0]==='scan').length);await page.locator('[data-collector=refresh]').click();await page.waitForFunction(()=>!document.querySelector('[data-collector=now]').disabled);assert.equal(await page.evaluate(()=>calls.filter(c=>c[0]==='scan').length),scans);
 await panel.locator('summary').evaluate(el=>el.parentElement.open=true);await page.locator('[data-collector=authorize]').click();await page.waitForFunction(()=>calls.some(c=>c[0]==='settings'));assert.equal(await page.evaluate(()=>calls.some(c=>c[0]==='authorize')),false);
 await page.evaluate(()=>{fixture.permission='partial';localStorage.setItem('fixture-collector',JSON.stringify(fixture));document.dispatchEvent(new Event('shiri-native-resume'));});await page.waitForFunction(()=>document.querySelector('.collection-status').textContent.includes('部分照片'));assert.match(await panel.innerText(),/已暂停/);
 await panel.locator('summary').evaluate(el=>el.parentElement.open=true);await page.locator('[data-collector=authorize]').click();await page.waitForFunction(()=>calls.some(c=>c[0]==='authorize'));
 await page.locator('#collector-time').fill('19:45');await page.locator('#collector-time').dispatchEvent('change');await page.waitForFunction(()=>fixture.time==='19:45');assert.equal(await page.evaluate(()=>fixture.enabled),false);
 await page.locator('[data-collector=enable]').click();await page.waitForFunction(()=>!!document.querySelector('[data-collector=disable]'));assert.equal(await page.evaluate(()=>fixture.time),'19:45');
 await page.evaluate(()=>window.holdManual=true);await page.locator('[data-collector=now]').click();await guide.locator('[type=submit]').click();await page.waitForFunction(()=>!!window.releaseManual);assert.equal(await guide.locator('[type=submit]').isDisabled(),true);await guide.locator('[data-collector=close-scan]').click();await page.locator('[data-collector=disable]').click();await page.waitForFunction(()=>fixture.enabled===false);await page.evaluate(()=>releaseManual());await page.waitForFunction(()=>!document.querySelector('[data-collector=now]').disabled);assert.match(await panel.innerText(),/已暂停/);
 await page.evaluate(()=>{window.failConfigure=true;});await page.locator('[data-collector=enable]').click();await page.waitForFunction(()=>document.querySelector('#collector-panel [role=status]').textContent.includes('合成持久化失败'));assert.match(await panel.innerText(),/已暂停/);await page.evaluate(()=>{window.failConfigure=false;fixture.permission='none';window.canRequest=false;document.dispatchEvent(new Event('shiri-native-resume'));});await page.waitForFunction(()=>document.querySelector('.collection-status').textContent.includes('未授权'));
 await page.locator('[data-collector=now]').click();assert.equal(await guide.locator('[type=submit]').isDisabled(),true);await guide.locator('[data-collector=scan-authorize]').click();await page.waitForFunction(()=>document.querySelector('.scan-status').textContent.includes('系统应用设置'));assert.equal(await page.evaluate(()=>fixture.enabled),false);
 await page.evaluate(()=>{window.canRequest=true;window.authorizeResult='none';});await guide.locator('[data-collector=scan-authorize]').click();await page.waitForFunction(()=>document.querySelector('.scan-status').textContent.includes('尚未获得'));assert.equal(await guide.locator('[type=submit]').isDisabled(),true);
 await page.evaluate(()=>window.authorizeResult='partial');await guide.locator('[data-collector=scan-authorize]').click();await page.waitForFunction(()=>!document.querySelector('#collector-scan-form [type=submit]').disabled);assert.equal(await page.evaluate(()=>fixture.enabled),false);
 await page.screenshot({path:'.local/collector-controls.png'});
 await guide.locator('[data-collector=close-scan]').click();await page.evaluate(()=>{fixture.lastError='合成后台读取失败';document.dispatchEvent(new Event('shiri-native-resume'));});await page.waitForFunction(()=>document.querySelector('#collector-panel [role=status]').textContent.includes('合成后台读取失败'));assert.doesNotMatch(await panel.locator('[role=status]').innerText(),/没有发现/);
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 console.log('PASS pause persistence/stale-status race, independent manual ranges, truthful counts/empty/failure, dedup/local review, permission settings/reselection/denial/resume, time preservation, pause during scan, duplicate-click guard, four widths. Synthetic Android only; no upload or AI.');
}finally{await browser.close();}process.exit(0);
