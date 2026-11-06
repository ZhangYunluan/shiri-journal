/** UI-only synthetic CloudBase responses; SQL permission tests run separately in PGlite. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4209';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const browser=await launchBrowser(),origin='http://127.0.0.1:4209',friendId='10000000-0000-4000-8000-000000000001',ownId='10000000-0000-4000-8000-000000000002';
let enabled=true,denied=false,failOnce=false,likeCalls=0;const liked=new Set();const messages=new Map(),sent=[];
const key=p=>p.recordId+'|'+(p.participantId||'bob-fixture');
messages.set(friendId+'|bob-fixture',[{id:'20000000-0000-4000-8000-000000000001',authorId:'friend-123',body:'<img onerror=alert(1)> 合成留言 😊',createdAt:'2026-10-28T09:00:00Z'}]);
messages.set(ownId+'|friend-123',[{id:'20000000-0000-4000-8000-000000000002',authorId:'friend-123',body:'合成的好友留言',createdAt:'2026-10-28T09:00:00Z'}]);
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();let data={};
  if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'bob-fixture'};
  if(u.pathname.endsWith('/user/me'))data={sub:'bob-fixture',email:'fixture@example.invalid',nickName:'合成测试'};
  if(u.pathname.endsWith('/shiri_social')){
   const {p_action}=route.request().postDataJSON();data=p_action==='dashboard'?{friends:[{id:'friend-123',nickname:'合成好友',scope:'all',categories:[]}],incoming:[],outgoing:[],blocked:[],mine:[{id:ownId,localId:'own-local',title:'我的合成片刻',date:'2026-10-28',shared:true}],discoverable:false}:p_action==='feed'?{records:denied?[]:[{id:friendId,ownerId:'friend-123',nickname:'合成好友',title:'合成散步',note:'测试内容',date:'2026-10-28'}],hasMore:false}:{};
  }
  if(u.pathname.endsWith('/shiri_interactions')){
   const {p_action:a,p_payload:p}=route.request().postDataJSON();assert.equal(route.request().headers().authorization,'Bearer test-token');
   if(!enabled)return route.fulfill({status:404,contentType:'application/json',body:'{}'});
   if(denied)return route.fulfill({status:403,contentType:'application/json',body:'{"message":"权限已撤销"}'});
   if(a==='capabilities')data={version:1};
   else {if(a==='set_like'){likeCalls++;p.liked?liked.add(p.recordId):liked.delete(p.recordId);}
    data={records:(p.ids||[p.recordId]).map(id=>({id,likes:liked.has(id)?1:0,liked:liked.has(id),comments:(messages.get(id+'|bob-fixture')||[]).length}))};}
  }
  if(u.pathname.endsWith('/shiri_comments')){
   assert.equal(route.request().headers().authorization,'Bearer test-token');const {p_action:a,p_payload:p}=route.request().postDataJSON();
   if(!enabled)return route.fulfill({status:404,contentType:'application/json',body:JSON.stringify({code:'PGRST202'})});
   if(a==='capabilities')data={version:1,maxLength:300};
   else if(denied)return route.fulfill({status:403,contentType:'application/json',body:JSON.stringify({message:'权限已撤销'})});
   else if(a==='threads')data={threads:[{participantId:'friend-123',nickname:'合成好友'},{participantId:'other-456',nickname:'另一位合成好友'}]};
   else if(a==='list')data={comments:(messages.get(key(p))||[]).slice(p.offset||0,(p.offset||0)+30),hasMore:false};
   else if(a==='send'){
    sent.push(p);const list=messages.get(key(p))||[];let m=list.find(m=>m.id===p.clientId);
    if(!m){m={id:p.clientId,authorId:'bob-fixture',body:p.body,createdAt:new Date().toISOString()};list.push(m);messages.set(key(p),list);}data=m;
    if(failOnce){failOnce=false;return route.abort('failed');}
   }else if(a==='delete'){for(const [k,list]of messages)messages.set(k,list.filter(m=>m.id!==p.id));data={ok:true};}
  }
  assert.ok(!u.pathname.endsWith('/shiri-ai'),'No AI requests');await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(origin+'/#friends');
 await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();
 await page.waitForSelector('[data-friends-action=comments]');
 await page.locator('[data-friends-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-friends-action=like]')?.getAttribute('aria-pressed')==='true');
 assert.match(await page.locator('[data-friends-action=like]').innerText(),/已赞 1/);
 await page.locator('[data-friends-action=like]').click();await page.waitForFunction(()=>document.querySelector('[data-friends-action=like]')?.getAttribute('aria-pressed')==='false');assert.equal(likeCalls,2);
 await page.locator('[data-friends-action=comments]').first().scrollIntoViewIfNeeded();const scrollBefore=await page.evaluate(()=>scrollY);
 await page.locator('[data-friends-action=comments]').first().click();await page.waitForSelector('.comment-message');
 assert.equal(await page.locator('.comments-sheet').count(),1);assert.equal(await page.locator('[data-comments-form] textarea').evaluate(el=>el===document.activeElement),true);
 assert.ok(Math.abs((await page.evaluate(()=>scrollY))-scrollBefore)<2,'timeline must not jump');
 await page.setViewportSize({width:390,height:450});await page.waitForFunction(()=>document.querySelector('.comment-composer')?.getBoundingClientRect().bottom<=innerHeight+1); assert.ok(await page.locator('.comment-composer').evaluate(el=>el.getBoundingClientRect().bottom<=innerHeight+1));
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'releases/comments-sheet-0.8.1.png'});
 assert.match(await page.locator('.comment-message p').innerText(),/<img onerror/);assert.equal(await page.locator('.comment-message img').count(),0);
 await page.locator('[data-comments-form] textarea').fill('我的合成留言 😊');failOnce=true;await page.locator('[data-comments-form] button').click();await page.waitForSelector('[data-comments-panel] [role=alert]');assert.equal(await page.locator('[data-comments-form] textarea').inputValue(),'我的合成留言 😊');
 await page.locator('[data-comments-form] button').click();await page.waitForFunction(()=>document.querySelector('[data-comments-form] textarea')?.value==='');assert.equal(sent.length,2);assert.equal(sent[0].clientId,sent[1].clientId);assert.equal(await page.locator('.comment-message').count(),2);assert.match(await page.locator('[data-friends-action=comments]').first().innerText(),/评论 2/);
 await page.locator('[data-comments-action=delete]').click();await page.locator('#confirmation [type=submit]').click();await page.waitForFunction(()=>document.querySelectorAll('.comment-message').length===1);
 await page.locator('[data-comments-action=close]').click();await page.locator('[data-friends-view=publish]').click();await page.locator('[data-friends-action=comments]').click();await page.waitForSelector('.comment-threads');assert.equal(await page.locator('[data-comments-form]').count(),0);
 await page.locator('[data-comments-action=thread][data-participant="friend-123"]').click();await page.waitForSelector('[data-comments-form]');await page.locator('[data-comments-form] textarea').fill('主人的合成回复');await page.locator('[data-comments-form] button').click();await page.waitForFunction(()=>document.querySelectorAll('.comment-message').length===2);assert.equal(sent.at(-1).participantId,'friend-123');
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.locator('[data-comments-form] textarea').fill('权限变化后的尝试');denied=true;await page.locator('[data-comments-form] button').click();await page.waitForFunction(()=>!document.querySelector('[data-comments-panel]'));assert.match(await page.locator('#main').innerText(),/权限已变化/);
 enabled=false;await page.reload();await page.waitForSelector('[data-friends-root]');assert.equal(await page.locator('[data-friends-action=comments]').count(),0);assert.deepEqual(errors,[]);
 console.log('PASS bottom-sheet focus/viewport/scroll, real-response like/unlike counts, private thread UI, escaped body, preserved failed draft, stable retry ID, delete, owner reply, widths, denied-access cleanup and undeployed RPC fallback. Synthetic only.');
}finally{await browser.close();}process.exit(0);
