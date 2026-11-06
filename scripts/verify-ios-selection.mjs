/** Shared Web import flow with a synthetic iOS picker bridge. NOT a Swift/PhotoKit/iPhone test. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4213';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const origin='http://127.0.0.1:4213',browser=await launchBrowser(),forbidden=[],errors=[];
try{
 for(const override of [false,true]){
  const context=await browser.newContext({viewport:{width:393,height:844},timezoneId:'Asia/Shanghai',serviceWorkers:'block'});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin===origin)return route.continue();let data={},body={};try{body=route.request().postDataJSON()||{};}catch{}
   if(u.pathname.includes('shiri-ai')||u.pathname.includes('shiri-media')||/^publish_/.test(body.p_action||'')){forbidden.push(u.pathname);return route.abort();}
   if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
   if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
   if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'ios-picker-fixture'};
   if(u.pathname.endsWith('/user/me'))data={sub:'ios-picker-fixture',email:'fixture@example.invalid',nickName:'合成选图测试'};
   if(u.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],blocked:[],mine:[],records:[],hasMore:false};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  await context.addInitScript(()=>{
   window.pickerMode='cancel';window.pickerCalls=0;window.readCalls=0;window.released=[];
   window.shiriNative={platform:'ios',
    async pickPhotos(){window.pickerCalls++;return window.pickerMode==='cancel'?{cancelled:true}:{cancelled:false,selectionId:'synthetic-selection',failedCount:1,photos:[{path:'file:///synthetic/receipt.png',type:'image/png',name:'合成收据.png',taken:new Date(2026,9,9,9,30).getTime()}]};},
    async readPickedPhoto(photo){
     window.readCalls++;
     // Exercise the actual platform file validator/reader against a local fixture;
     // only native picker return values and convertFileSrc are simulated.
     return (await import('/android-shell/platform-services.mjs')).readPickedPhoto(photo,()=>'/tests/fixtures/test-receipt.png');
    },
    async releasePickedPhotos(selectionId){window.released.push(selectionId);}
   };
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('[data-action=import]');
  const local=()=>page.evaluate(async()=>{const d=await(await import('/src/db.mjs')).readAll();return {records:d.records.map(r=>({id:r.id,date:r.date,time:r.time,status:r.status,assetId:r.assetId,visibility:r.visibility})),assets:d.assets.length};});
  await page.locator('[data-action=import]').first().click();
  await page.locator('[data-action=choose-photos]').click();await page.waitForFunction(()=>window.pickerCalls===1);await page.waitForTimeout(40);
  assert.deepEqual(await local(),{records:[],assets:0},'cancel cannot import or save a photo');
  assert.deepEqual(await page.evaluate(()=>({reads:readCalls,released,collector:!!shiriNative.photos})),{reads:0,released:[],collector:false});
  if(override)await page.locator('#import-date').fill('2026-09-14');
  await page.evaluate(()=>window.pickerMode='selected');await page.locator('[data-action=choose-photos]').click();
  await page.waitForFunction(()=>document.querySelector('#import-progress')?.textContent.includes('已导入 1 张，待审核'));
  await page.waitForFunction(()=>window.released.length===1);
  const result=await local();assert.equal(result.records.length,1);assert.equal(result.assets,1);assert.equal(result.records[0].status,'review');assert.ok(result.records[0].assetId);
  assert.equal(result.records[0].date,override?'2026-09-14':'2026-10-09');if(!override)assert.equal(result.records[0].time,'09:30');
  assert.deepEqual(await page.evaluate(()=>({reads:readCalls,released})),{reads:1,released:['synthetic-selection']});
  assert.match(await page.locator('#toast').innerText(),/1 张照片未能读取/,'partial picker failure stays visible');
  await page.locator('[data-action=finish-import]').click();await page.locator('[data-action=edit-record]').first().click();
  await page.locator('.record-sharing>summary').click();await page.locator('[name=visibility]').selectOption('self');
  await page.locator('#record-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
  const saved=await local();assert.equal(saved.records[0].id,result.records[0].id);assert.equal(saved.records[0].date,result.records[0].date);assert.equal(saved.records[0].status,'confirmed');assert.equal(saved.records[0].visibility,'self');assert.equal(saved.assets,1);
  await page.reload();await page.waitForSelector('#library-search');assert.deepEqual(await local(),saved,'saved photo persists after reload');
  await context.close();
 }
 assert.deepEqual(errors,[]);assert.deepEqual(forbidden,[]);
 console.log('PASS shared Web flow with synthetic iOS picker: cancel/no writes, local review import, actual capture date/time, chosen-date override, partial failure, selection cleanup, private save and reload; no media upload/AI calls. NOT Swift/iOS runtime validation.');
}finally{await browser.close();}process.exit(0);
