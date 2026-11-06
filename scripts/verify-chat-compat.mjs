import {readFile} from 'node:fs/promises';
/** Isolated synthetic browser checks. No real email, photos or cloud writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
const phase='after';
process.env.PORT='4203';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
import {launchBrowser} from './browser-test-runtime.mjs';
const browser=await launchBrowser();
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let offline=false,aiCalls=0,hold=false,fail=false,releaseReply;const payloads=[];const origin='http://127.0.0.1:4203';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin){if(url.pathname==='/life.css'&&process.env.LEGACY_CSS==='1'){let css=await readFile('life.css','utf8');css=css.replace(/[^{}]+:has\([^{}]*?\)[^{}]*\{[^{}]*\}/g,'').replace(/[^;{}]*:[^;{}]*dvh[^;{}]*;/g,'');return route.fulfill({contentType:'text/css',body:css});}const backup={'/life-app.mjs':'life-app.mjs','/life.css':'life.css','/src/views.mjs':'views.mjs'}[url.pathname];if(phase==='before'&&backup)return route.fulfill({contentType:backup.endsWith('.css')?'text/css':'text/javascript',body:await readFile('releases/ux-phase1-before/'+backup,'utf8')});return route.continue();}
  if(url.pathname.endsWith('/shiri-ai')){
   aiCalls++;const body=route.request().postDataJSON();payloads.push(body);
   if(hold)await new Promise(resolve=>releaseReply=resolve);
   if(fail)return route.fulfill({status:503,contentType:'application/json',body:'{}'});
   const answer=body.question.includes('长回复')?'长回复开始\n'+('基于真实记录给出可选择的建议。\n'.repeat(110)):'测试回答：'+body.question;
   return route.fulfill({contentType:'application/json',body:JSON.stringify({answer})});
  }
  if(offline)return route.abort();
  let data={};
  if(url.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(url.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(url.pathname.endsWith('/signin')||url.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'experience-user'};
  if(url.pathname.endsWith('/user/me'))data={sub:'experience-user',email:'fixture@example.invalid',nickName:'测试生活'};
  if(url.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],records:[],profile:{nickname:'测试生活'}};
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 await context.addInitScript(()=>{window.clockOffset=0;const real=Date.now;Date.now=()=>real()+window.clockOffset;AbortSignal.timeout=undefined;AbortSignal.any=undefined;});
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#plans');await page.waitForSelector('[data-cloud-form="send"]');
 assert.equal(await page.locator('[data-action="new-plan"]').count(),0);
 await page.locator('[name="email"]').fill('fixture@example.invalid');await page.locator('[data-cloud-form="send"] button').first().click();
 await page.locator('[name="code"]').fill('123456');await page.locator('[data-cloud-form="verify"] button').click();
 await page.waitForSelector('[data-action="new-plan"]');await page.evaluate(()=>AbortSignal.timeout=undefined);

 await page.evaluate(async()=>{const db=await import('/src/db.mjs'),{localDate,addDays}=await import('/src/core.mjs'),{prepareImage}=await import('/src/images.mjs');const {categories}=await db.readAll(),today=localDate();const photo=await(await fetch('/tests/fixtures/test-receipt.png')).blob();for(let i=0;i<18;i++){const asset=await prepareImage(new File([photo],'fixture-'+i+'.png',{type:'image/png'}));await db.saveRecord({id:'ux-'+i,date:i<12?today:addDays(today,-(i-11)),time:'18:00',title:i<12?['午后的一杯茶','路上的小发现','今天的晚餐'][i%3]:['散步的傍晚','读完一章书','和朋友吃饭'][i%3],note:'界面验收用合成记录，不是真实用户数据',categoryId:'daily',status:i<12?'review':'confirmed',kind:'moment',visibility:'self',mood:null,reflection:'',tags:[],location:'',amount:null,duration:null,weight:null,assetId:asset.id,createdAt:today,updatedAt:today},categories,asset);}});


 await page.goto(origin+'/#plans');await page.reload();await page.waitForSelector('[data-action="assistant-toggle"]');
 await page.locator('[data-action="assistant-toggle"]').click();await page.waitForSelector('.chat-page');
 const send=async question=>{await page.evaluate(()=>clockOffset+=61000);await page.locator('[name="question"]').fill(question);await page.locator('[name="consent"]').check();await page.locator('#assistant-form button[type="submit"]').click();};
 const waitDone=()=>page.waitForFunction(()=>!document.querySelector('.chat-wait'));
 hold=true;await send('第一轮问题');await page.waitForFunction(()=>document.querySelector('.from-user')?.textContent.includes('第一轮问题'));await page.waitForFunction(()=>document.querySelector('.chat-wait'));while(!releaseReply)await new Promise(r=>setTimeout(r,10));releaseReply();hold=false;await waitDone();
 for(const question of ['长回复第二轮','第三轮','第四轮']){await send(question);await waitDone();if(question==='长回复第二轮'){const top=await page.locator('.from-assistant').last().boundingBox(),area=await page.locator('.chat-messages').boundingBox();assert.ok(top.y>=area.y-1&&top.y<area.y+area.height,'long answer starts in view');await page.locator('.chat-messages').evaluate(el=>el.scrollTop=el.scrollHeight);assert.ok(await page.locator('.chat-messages').evaluate(el=>el.scrollHeight-el.clientHeight-el.scrollTop<2));}}
 assert.equal(await page.locator('.chat-message').count(),8);assert.match(await page.locator('.chat-messages').innerText(),/第一轮问题/);assert.equal(payloads[3].history.length,6);
 await page.locator('.chat-messages').evaluate(el=>el.scrollTop=0);
 const count=await page.locator('.chat-message').count();await page.locator('[name="question"]').fill('尚未发送的草稿');
 await page.goto(origin+'/#dashboard');await page.waitForSelector('.journey-primary');await page.goto(origin+'/#plans');await page.waitForSelector('.chat-page');assert.equal(await page.locator('.chat-message').count(),count);assert.equal(await page.locator('.chat-messages').evaluate(el=>el.scrollTop),0);assert.equal(await page.locator('[name="question"]').inputValue(),'尚未发送的草稿');
 // The user's reading position wins over a reply arriving in the background.
 hold=true;releaseReply=null;await send('长回复第五轮');while(!releaseReply)await new Promise(r=>setTimeout(r,10));await page.locator('.chat-messages').evaluate(el=>el.scrollTop=0);releaseReply();hold=false;await waitDone();assert.equal(await page.locator('.chat-messages').evaluate(el=>el.scrollTop),0);
 // Failed requests keep the sent question, show an error, and remain readable.
 fail=true;await send('网络失败的问题');await waitDone();assert.match(await page.locator('.from-user').last().innerText(),/网络失败的问题/);assert.match(await page.locator('.assistant-status').last().innerText(),/AI 服务暂不可用/);fail=false;
 await page.locator('.chat-context>summary').click();await page.locator('.assistant-records>summary').click();await page.locator('[data-assistant-record]').first().check();assert.equal(await page.locator('.chat-message').count(),11);await page.locator('.chat-context>summary').click();await send('新摘要继续聊');await waitDone();assert.deepEqual(payloads.at(-1).history,[]);assert.equal(await page.locator('.chat-message').count(),13);
 for(const size of [{width:320,height:568},{width:360,height:480},{width:390,height:844},{width:844,height:390},{width:1280,height:800}]){
  await page.setViewportSize(size);await page.waitForTimeout(80);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'no horizontal overflow '+JSON.stringify(size));
  assert.ok(await page.locator('.chat-messages').evaluate(el=>el.clientHeight>=64));
  const input=await page.locator('[name="question"]').boundingBox();if(input.y+input.height>size.height){console.log(await page.locator('.chat-page').evaluate(el=>({height:el.clientHeight,top:el.getBoundingClientRect().top,composer:el.querySelector('.chat-composer').getBoundingClientRect().toJSON(),log:el.querySelector('.chat-messages').getBoundingClientRect().toJSON()})));await page.screenshot({path:'releases/chat-layout-failure.png'});}assert.ok(input.y+input.height<=size.height,'input fits '+JSON.stringify(size));
 }
 await page.setViewportSize({width:390,height:844});await page.locator('[name="question"]').focus();
 await page.evaluate(()=>{window.testViewport=new EventTarget();testViewport.height=480;testViewport.offsetTop=0;Object.defineProperty(window,'visualViewport',{configurable:true,value:testViewport});window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(80);
 assert.equal(await page.evaluate(()=>document.activeElement.name),'question');const keyboardInput=await page.locator('[name="question"]').boundingBox();assert.ok(keyboardInput.y+keyboardInput.height<=480);
 await page.evaluate(()=>{testViewport.height=844;window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(80);
 await page.addStyleTag({content:'body,button,input,textarea,select,.chat-message{font-size:22px !important}'});await page.evaluate(()=>window.dispatchEvent(new Event('resize')));await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
 await page.screenshot({path:'releases/chat-compat-0.7.3.png'});
 assert.deepEqual(errors,[]);console.log('PASS multi-turn display, long reply scrolling, route restore, reading position, visible failure, context privacy, 5 viewports, keyboard visual viewport, large text, no AbortSignal.timeout. Mock AI only.');
}finally{await browser.close();}process.exit(0);
