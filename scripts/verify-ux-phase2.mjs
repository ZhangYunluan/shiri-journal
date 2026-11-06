import {readFile} from 'node:fs/promises';
/** Isolated synthetic browser checks. No real email, photos or cloud writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const phase='after';
process.env.PORT='4200';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
import {launchBrowser} from './browser-test-runtime.mjs';
const browser=await launchBrowser();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let offline=false,aiCalls=0;const origin='http://127.0.0.1:4200';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin){const backup={'/life-app.mjs':'life-app.mjs','/life.css':'life.css','/src/views.mjs':'views.mjs'}[url.pathname];if(phase==='before'&&backup)return route.fulfill({contentType:backup.endsWith('.css')?'text/css':'text/javascript',body:await readFile('releases/ux-phase1-before/'+backup,'utf8')});return route.continue();}
  if(url.pathname.endsWith('/shiri-ai')){aiCalls++;const body=route.request().postDataJSON();assert.equal(body.consent,true);assert.deepEqual(body.records,[]);return route.fulfill({contentType:'application/json',body:JSON.stringify({answer:'测试服务回复：可以先留出十分钟散步。'})});}
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

 await page.goto(origin+'/#library');await page.reload();await page.waitForSelector('.photo-add');
 await page.screenshot({path:'releases/ux-phase2/photos.png'});
 await page.locator('.photo-add').click();const chooser=page.waitForEvent('filechooser');await page.locator('[data-action=choose-photos]').click();await chooser;await page.locator('[data-action=close-import]').click();
 await page.goto(origin+'/#plans');await page.locator('[data-action="assistant-toggle"]').click();
 await page.waitForSelector('.chat-page');assert.equal(await page.locator('[data-action="new-plan"]').count(),0);
 for(const width of [320,390,430,1280]){await page.setViewportSize({width,height:844});await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));const b=await page.locator('[name="question"]').boundingBox();const bottom=await page.evaluate(()=>{const nav=document.querySelector('#mobile-nav');return nav&&getComputedStyle(nav).display!=='none'?nav.getBoundingClientRect().top:innerHeight;});assert.ok(b.y+b.height<=bottom,'composer above visible navigation at '+width);}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'releases/ux-phase2/chat.png'});
 await page.locator('[name="question"]').fill('想安排一次散步');await page.locator('#assistant-form button[type="submit"]').click();await page.waitForFunction(()=>document.querySelector('.assistant-status').textContent.includes('同意'));assert.equal(aiCalls,0);
 await page.locator('[name="consent"]').check();await page.locator('#assistant-form button[type="submit"]').click();await page.waitForSelector('.from-assistant');assert.equal(aiCalls,1);
 assert.equal(await page.locator('.chat-messages .from-user').count(),1);assert.equal(await page.locator('.chat-messages .from-assistant').count(),1);assert.equal(await page.locator('[name="question"]').inputValue(),'');
 await page.screenshot({path:'releases/ux-phase2/chat-reply.png'});
 await page.locator('.chat-context>summary').click();await page.locator('.assistant-records>summary').click();await page.locator('[data-assistant-record]').first().check();assert.equal(await page.locator('[name="consent"]').isChecked(),false);assert.equal(await page.locator('.from-assistant').count(),1);assert.equal(aiCalls,1);
 await page.locator('[data-action="assistant-toggle"]').click();await page.goto(origin+'/#reports');await page.waitForSelector('.review-footprint');await page.screenshot({path:'releases/ux-phase2/reports.png',fullPage:true});
 await page.goto(origin+'/#plans');await page.screenshot({path:'releases/ux-phase2/plans.png'});
 assert.deepEqual(errors,[]);console.log('PASS phase 2: photo picker, 4 responsive widths, consent, mocked reply, context reset, reports/plans. No real model calls.');
}finally{await browser.close();}process.exit(0);
