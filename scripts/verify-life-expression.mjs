/** Isolated synthetic accounts/data. All cloud requests are mocked. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4206';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const browser=await launchBrowser(),origin='http://127.0.0.1:4206';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();let data={};
  if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'expression-fixture'};
  if(u.pathname.endsWith('/user/me'))data={sub:'expression-fixture',email:'fixture@example.invalid',nickName:'合成测试'};
  if(u.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],records:[],profile:{nickname:'合成测试'}};
  assert.ok(!u.pathname.endsWith('/shiri-ai'),'No model calls allowed');
  return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin+'/#categories');await page.locator('[name="email"]').fill('fixture@example.invalid');await page.locator('[data-cloud-form="send"] button').first().click();
 await page.locator('[name="code"]').fill('123456');await page.locator('[data-cloud-form="verify"] button').click();await page.waitForSelector('.topic-directory');
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),{DEFAULT_CATEGORIES}=await import('/src/core.mjs');
  await db.put('categories',{...DEFAULT_CATEGORIES.find(c=>c.id==='travel'),name:'出行见闻'});
  await db.put('records',{id:'legacy-feeling',title:'旧版心情',note:'合成记录',date:'2026-10-27',time:'18:00',categoryId:'travel',mood:4,tags:[],location:'',status:'confirmed',reflection:'',kind:'diary',visibility:'self',createdAt:'2026-10-27',updatedAt:'2026-10-27'});
 });
 await page.reload();await page.waitForSelector('.topic-directory');
 assert.match(await page.locator('.topic-directory').innerText(),/旅途与见闻/);assert.doesNotMatch(await page.locator('.topic-directory').innerText(),/0 条|等待第一个片刻|还没有已确认记录/);
 assert.equal(await page.locator('#category-form').count(),0);
 assert.equal(await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('categories','travel')).name),'出行见闻');
 await page.locator('[data-action="new-category"]').click();await page.locator('#category-form [name="name"]').fill('家人与牵挂');await page.locator('#category-form [type="submit"]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 const id=await page.evaluate(async()=> (await(await import('/src/db.mjs')).readAll()).categories.find(c=>c.name==='家人与牵挂').id);
 await page.locator(`[data-action="open-category"][data-id="${id}"]`).click();await page.locator('[data-action="note"]').click();
 await page.locator('#record-form [name="title"]').fill('家人的晚餐');await page.locator('[name="emotionGroup"]').selectOption('warmth');await page.locator('[name="emotion"]').selectOption('感动');
 await page.locator('#record-form [type="submit"]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 let saved=await page.evaluate(async()=> (await(await import('/src/db.mjs')).readAll()).records.find(r=>r.title==='家人的晚餐'));
 assert.equal(saved.emotion,'感动');assert.equal(saved.mood,null);assert.equal(saved.categoryId,id);
 const savedId=saved.id;
 await page.locator('[data-action="edit-category"]').click();await page.locator('#category-form [name="name"]').fill('和家人在一起');await page.locator('#category-form [type="submit"]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 assert.equal(await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('categories',document.querySelector('[data-action="edit-category"]').dataset.id)).name),'和家人在一起');
 await page.locator('[data-action="edit-category"]').click();await page.locator('[data-action="delete-category"]').click();assert.match(await page.locator('#toast').innerText(),/关联记录/);await page.locator('[data-action="close-editor"]').first().click();
 await page.locator('[data-action="open-category"][data-id="all"]').click();await page.locator('[data-action="open-category"][data-id="travel"]').click();await page.locator('[data-action="edit-record"][data-id="legacy-feeling"]').click();
 assert.equal(await page.locator('[name="emotionGroup"]').inputValue(),'legacy');await page.locator('#record-form [type="submit"]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 assert.equal(await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('records','legacy-feeling')).mood),4);
 await page.locator('[data-action="edit-record"][data-id="legacy-feeling"]').click();await page.locator('[name="emotionGroup"]').selectOption('custom');await page.locator('[name="customEmotion"]').fill('emo');await page.locator('#record-form [type="submit"]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 await page.reload();await page.waitForSelector('.topic-directory');await page.locator('[data-action="open-category"][data-id="travel"]').click();await page.waitForSelector('.category-history');await page.locator('[data-action="edit-record"][data-id="legacy-feeling"]').click();assert.equal(await page.locator('[name="customEmotion"]').inputValue(),'emo');await page.locator('[data-action="close-editor"]').first().click();
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),backup=await import('/src/backup.mjs'),data=await db.readAll();
  const restored=await backup.parseBackup(await backup.exportBackup(data));db.validateBackupTables(restored);await db.restoreBackup(restored);
  const records=(await db.readAll()).records;if(records.length!==2||!records.some(r=>r.emotion==='emo')||!records.some(r=>r.emotion==='感动'))throw Error('Feelings did not survive ZIP merge restore');
  await db.put('categories',{id:'unused-test',name:'可删除测试',builtIn:false,color:'#a9bd9f',icon:'layers'});await db.deleteCategory('unused-test');
  try{await db.deleteCategory('travel');throw Error('Deleted built-in category');}catch(e){if(e.message==='Deleted built-in category')throw e;}
  const c=data.categories.find(c=>c.builtIn===false);let denied=false;try{await db.deleteCategory(c.id);}catch{denied=true;}if(!denied)throw Error('Deleted referenced category');
 });
 await page.goto(origin+'/#categories');await page.locator('[data-action="open-category"][data-id="all"]').click();
 for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:'releases/emotions-categories-0.7.4.png',fullPage:true});
 assert.deepEqual(errors,[]);assert.ok(savedId);console.log('PASS grouped/custom/legacy feelings, stable category aliases, modal create/rename, safe deletion, ZIP restore and 3 widths. Synthetic only.');
}finally{await browser.close();}process.exit(0);
