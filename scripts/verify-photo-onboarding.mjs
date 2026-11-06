/** Real Web UI with synthetic Android permissions/photos; NOT a system permission test. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4214';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const origin='http://127.0.0.1:4214',browser=await launchBrowser(),errors=[],uploads=[];
try{
 for(const mode of ['skip','back','deny','partial','full-existing','failure']){
  const context=await browser.newContext({viewport:{width:320,height:740},serviceWorkers:'block'});
  await context.route('**/*',async route=>{
   const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
   if(/shiri-media|shiri-ai/.test(url.pathname)){uploads.push(url.pathname);return route.abort();}
   let data={};
   if(url.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
   if(url.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
   if(url.pathname.endsWith('/signin')||url.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'photo-guide-fixture'};
   if(url.pathname.endsWith('/user/me'))data={sub:'photo-guide-fixture',email:'fixture@example.invalid',nickName:'合成权限测试'};
   if(url.pathname.endsWith('/shiri_social')){let payload={};try{payload=route.request().postDataJSON();}catch{};assert.ok(!/^publish_/.test(payload?.p_action||''));data={friends:[],incoming:[],outgoing:[],blocked:[],mine:[],records:[],hasMore:false};}
   await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(mode=>{
   const key='fixture-photo-permission',configured='fixture-photo-enabled';
   window.permission=localStorage.getItem(key)||(mode==='full-existing'?'full':'none');
   window.enabled=localStorage.getItem(configured)==='true';window.authCalls=0;window.configs=0;window.scans=0;window.settingsCalls=0;window.gpsCalls=[];
   const photo={id:'11111111-1111-4111-8111-111111111111',path:'/synthetic',name:'fixture.png',type:'image/png',date:'2026-10-29',taken:1793239200000,added:1793239200000};let pending=mode==='partial';
   window.shiriNative={platform:'android',photoURL:()=>'/tests/fixtures/test-receipt.png',photos:{
    status:async()=>({permission,enabled,canRequestPermission:mode!=='deny',pending:enabled&&pending?1:0,counts:{},scanComplete:true,time:'22:00'}),
    authorize:async()=>{authCalls++;if(mode==='failure')throw Error('系统授权窗口未能打开，请稍后重试');permission=mode==='partial'?'partial':'none';localStorage.setItem(key,permission);document.dispatchEvent(new Event('visibilitychange'));return {permission:'full'};},
    configure:async args=>{configs++;enabled=args.enabled;localStorage.setItem(configured,String(enabled));return {ok:true};},
    runNow:async()=>{scans++;return {ok:true};},pending:async()=>({photos:enabled&&pending?[photo]:[]}),acknowledge:async()=>{pending=false;},
    openSettings:async()=>{settingsCalls++;if(window.settingsFail)throw Error('请手动打开系统设置中的拾日照片权限');return {opened:true};},
    location:async args=>{gpsCalls.push(args);return {available:true,latitude:31.2,longitude:121.5};},protect:async()=>({ok:true})
   }};
  },mode);
  const page=await context.newPage();page.on('pageerror',error=>errors.push(error.message));await page.goto(origin);
  assert.equal(await page.locator('#photo-onboarding-dialog').isVisible(),false);
  await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('[data-action=note]');
  const guide=page.locator('#photo-onboarding-dialog');
  if(mode==='full-existing'){
   await page.waitForFunction(()=>Object.keys(localStorage).some(k=>k.startsWith('shiri-photo-guide-v1:')));
   assert.equal(await guide.isVisible(),false);assert.deepEqual(await page.evaluate(()=>[authCalls,configs]),[0,0]);
  }else{
   await guide.waitFor({state:'visible'});assert.equal(await page.evaluate(()=>authCalls),0);
   const width=await guide.evaluate(d=>({w:d.scrollWidth,c:d.clientWidth}));assert.ok(width.w<=width.c+1);
   assert.match(await guide.innerText(),/未审核照片不会上传/);
   if(mode==='partial')await page.screenshot({path:'.local/onboarding-guide.png'});
   if(mode!=='skip'&&mode!=='back'){
    await guide.locator('[data-action=photo-guide-enable]').click();
    if(mode==='partial'){
     await guide.waitFor({state:'hidden'});await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已导入 1 张'));
     assert.match(await page.locator('#toast').innerText(),/仅能发现你选定的照片/);
     assert.deepEqual(await page.evaluate(()=>[authCalls,configs,scans]),[1,1,1]);
     const row=await page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()).records[0]);
     assert.equal(row.status,'review');assert.match(row.location,/31.200000, 121.500000/);assert.ok(await page.evaluate(()=>gpsCalls.every(x=>x.requestPermission===false)));
     // Simulate an old review copy with stripped EXIF, then grant metadata access.
     await page.evaluate(async()=>{const db=await import('/src/db.mjs'),d=await db.readAll();await db.put('records',{...d.records[0],location:''});});
     await page.goto(origin+'/#library');await page.reload();await page.waitForSelector('[data-action=edit-record]');await page.locator('[data-action=edit-record]').first().click();
     await page.locator('.record-more summary').click();await page.waitForFunction(()=>document.querySelector('[name=location]')?.value.startsWith('拍摄坐标'));
     await page.locator('[name=location]').fill('');await page.locator('.record-sharing summary').click();await page.locator('[name=visibility]').selectOption('self');await page.locator('#record-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
     await page.reload();await page.waitForSelector('[data-action=edit-record]');await page.locator('[data-action=edit-record]').first().click();assert.equal(await page.locator('[name=location]').inputValue(),'');
     assert.equal((await page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()).records))[0].status,'confirmed');
    }else{
     await page.waitForFunction(()=>document.querySelector('#photo-onboarding-dialog [role=status]')?.textContent.length>0);
     assert.equal(await page.evaluate(()=>configs),0);
     if(mode==='deny'){await guide.locator('[data-action=photo-guide-settings]').click();assert.equal(await page.evaluate(()=>settingsCalls),1);assert.match(await guide.innerText(),/尚未获得照片访问权限/);await page.evaluate(()=>window.settingsFail=true);await guide.locator('[data-action=photo-guide-settings]').click();await page.waitForFunction(()=>document.querySelector('#photo-onboarding-dialog [role=status]').textContent.includes('请手动打开系统设置'));}
    }
   }
   if(mode==='back')await guide.evaluate(d=>d.close());
   else if(mode!=='partial')await guide.locator('[data-action=photo-guide-later]').click();
  }
  await page.goto(origin+'/#dashboard');await page.reload();await page.waitForSelector('[data-action=note]');await page.waitForTimeout(200);assert.equal(await guide.isVisible(),false);
  if(mode==='skip'||mode==='deny'||mode==='failure'){
   await page.locator('[data-action=note]').first().click();await page.locator('[name=title]').fill('未授权也能记录');await page.locator('#record-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
   const data=await page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()));assert.equal(data.records.length,1);assert.equal(data.assets.length,0);
  }
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(uploads,[]);
 console.log('PASS first-login guide, explicit request, skip/reload, denied/failure manual use, verified partial grant and local scan, existing grant suppression, settings link, automatic GPS refill without permission prompts, cleared saved location retained; no upload/AI. Synthetic bridge only.');
}finally{await browser.close();}process.exit(0);
