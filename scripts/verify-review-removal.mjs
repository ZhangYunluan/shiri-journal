/** Synthetic browser/native bridge only. Real system confirmation needs a phone. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4211';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const browser=await launchBrowser(),origin='http://127.0.0.1:4211';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();let data={};
  if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'review-fixture'};
  if(u.pathname.endsWith('/user/me'))data={sub:'review-fixture',email:'fixture@example.invalid',nickName:'合成测试'};
  if(u.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],blocked:[],mine:[],records:[],hasMore:false};
  assert.ok(!u.pathname.endsWith('/shiri-ai'));await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
 await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('[data-action=note]');
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),{prepareImage}=await import('/src/images.mjs'),{localDate}=await import('/src/core.mjs'),{categories}=await db.readAll();
  for(let i=1;i<=3;i++){
   const canvas=document.createElement('canvas');canvas.width=100;canvas.height=100;const g=canvas.getContext('2d');g.fillStyle=['#55775f','#a0b080','#c2a170'][i-1];g.fillRect(0,0,100,100);
   const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg'));const asset=await prepareImage(new File([blob],`fixture-${i}.jpg`,{type:'image/jpeg'}));
   await db.saveRecord({id:'native:'+`${i}`.repeat(8)+'-1111-4111-8111-'+`${i}`.repeat(12),source:'native-auto',date:localDate(),time:'12:00',title:'合成片刻 '+i,note:'',categoryId:'daily',status:'review',kind:'moment',visibility:'friends',mood:null,reflection:'',tags:[],location:'',assetId:asset.id},categories,asset);
  }
 });
 await page.addInitScript(()=>{
  window.__deletions=0;window.__deleteMode='cancel';window.__protected=[];
  window.shiriNative={photos:{status:async()=>({enabled:false,permission:'full',counts:{},pending:0}),pending:async()=>({photos:[]}),originalsCapabilities:async()=>({supported:true}),
   protect:async({ids})=>{window.__protected.push(...ids);},location:async()=>({available:true,latitude:31.2,longitude:121.5}),
   deleteOriginals:async({photos})=>{window.__deletions++;return window.__deleteMode==='cancel'?{cancelled:true,deleted:[]}:{cancelled:false,deleted:[photos[0].id],failed:photos.slice(1).map(p=>({id:p.id,reason:'合成失败'}))};}}};
 });
 await page.goto(origin+'/#library');await page.reload();await page.waitForSelector('[data-action=batch-mode]');await page.locator('[data-action=batch-mode]').click();
 const select=async()=>{await page.locator('[data-action=batch-select]').nth(0).click();await page.locator('[data-action=batch-select]').nth(1).click();};
 const records=()=>page.evaluate(async()=>(await(await import('/src/db.mjs')).readAll()).records);
 await select();await page.locator('[data-action=batch-exclude]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});assert.equal(await page.locator('[name=mode][value=exclude]').isChecked(),true);await page.locator('#confirmation [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已排除 2 张'));assert.equal(await page.evaluate(()=>window.__deletions),0);assert.equal((await records()).filter(r=>r.excluded).length,2);
 await page.locator('[data-action=batch-undo]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已撤销'));
 await select();await page.locator('[data-action=batch-exclude]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('[name=mode][value=originals]').check();assert.match(await page.locator('#confirmation [type=submit]').innerText(),/2 张原图/);await page.locator('#confirmation [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('已取消系统删除'));assert.equal((await records()).filter(r=>r.excluded).length,0);
 await page.evaluate(()=>window.__deleteMode='partial');await page.locator('[data-action=batch-exclude]').click();await page.locator('#confirm-dialog').waitFor({state:'visible'});await page.locator('[name=mode][value=originals]').check();await page.locator('#confirmation [type=submit]').click();await page.waitForFunction(()=>document.querySelector('#toast')?.textContent.includes('系统确认删除 1 张'));assert.equal((await records()).filter(r=>r.originalDeleted&&r.excluded).length,1);assert.match(await page.locator('#batch-count').innerText(),/1 张/);
 await page.reload();await page.waitForSelector('[data-action=batch-mode]');assert.equal((await records()).filter(r=>r.excluded).length,1);
 await page.locator('[data-action=edit-record]').first().click();await page.locator('.record-more summary').click();await page.locator('[data-action=photo-location]').click();assert.match(await page.locator('[name=location]').inputValue(),/31.200000, 121.500000/);await page.locator('[name=location]').fill('');await page.locator('#record-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);assert.equal((await records()).filter(r=>r.status==='confirmed'&&r.location==='').length,1);
 assert.equal((await records()).length,3);assert.deepEqual(errors,[]);console.log('PASS default no-delete, cancel, partial results, persisted exclusions, EXIF coordinate edit/clear and saved records. Synthetic bridge only.');
}finally{await browser.close();}process.exit(0);
