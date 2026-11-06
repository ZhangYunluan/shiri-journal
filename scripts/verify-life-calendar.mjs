/** Synthetic account and local assets; no production writes or real model requests. */
import assert from 'node:assert/strict';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4208';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const browser=await launchBrowser(),origin='http://127.0.0.1:4208';
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),cloud=[];
 await context.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.origin===origin)return route.continue();cloud.push(u.pathname);let data={};
  if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
  if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
  if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'calendar-fixture'};
  if(u.pathname.endsWith('/user/me'))data={sub:'calendar-fixture',email:'fixture@example.invalid',nickName:'合成测试'};
  if(u.pathname.endsWith('/shiri_social')){
   const {p_action}=route.request().postDataJSON();
   data=p_action==='dashboard'?{friends:[{id:'friend-123',nickname:'原昵称',scope:'none',categories:[]}],incoming:[],outgoing:[],blocked:[],mine:[],discoverable:false}:p_action==='feed'?{records:[{id:'remote-1',ownerId:'friend-123',nickname:'原昵称',date:'2026-10-28',title:'朋友的散步',note:'合成文字'}],hasMore:false}:{};
  }
  assert.ok(!u.pathname.endsWith('/shiri-ai'),'No model calls');
  await route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
 });
 const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(origin);await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('.home-experience');
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),{prepareImage}=await import('/src/images.mjs');const data=await db.readAll();
  const blob=await(await fetch('/tests/fixtures/test-receipt.png')).blob();const a=await prepareImage(new File([blob],'test.png',{type:'image/png'}));
  for(const [id,date,status] of [['photo-a','2026-10-28','confirmed'],['photo-b','2026-10-27','confirmed'],['pending','2026-10-26','review']])await db.saveRecord({id,date,time:'18:00',title:'合成生活片刻 '+id,note:'当天的真实记录字段（合成测试）',categoryId:'daily',assetId:a.id,status,kind:'moment',visibility:'self',mood:4,emotion:'开心',reflection:'',tags:[],location:'',createdAt:date,updatedAt:date},data.categories,a);
 });
 await page.reload();await page.waitForSelector('.home-experience');await page.locator('[data-action=calendar-toggle]').click();await page.locator('#calendar-year').fill('2026');await page.locator('#calendar-year').press('Tab');await page.locator('#calendar-month').selectOption('10');await page.locator('[data-action=calendar-day][data-date="2026-10-28"]').click();
 assert.equal(await page.locator('.calendar-entry').count(),1);await page.waitForSelector('[data-local-photo] img');
 await page.locator('[data-action=daily-feeling]').click();await page.locator('[data-action=daily-preset][data-word="疲惫"]').click();await page.locator('#daily-feeling-form [type=submit]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 assert.match(await page.locator('.calendar-day.selected').innerText(),/😴/);
 assert.equal(await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('records','photo-a')).emotion),'开心');
 await page.reload();await page.waitForSelector('.home-experience');await page.locator('[data-action=calendar-toggle]').click();await page.locator('[data-action=calendar-day][data-date="2026-10-28"]').click();assert.match(await page.locator('.calendar-day.selected').innerText(),/😴/);
 await page.locator('[data-local-photo]').first().click();await page.waitForSelector('.friend-lightbox figure img');await page.locator('.friend-lightbox [data-close]').click();
 await page.locator('[data-action=daily-feeling]').click();await page.locator('.daily-custom summary').click();await page.locator('[name=emotionGroup]').selectOption('custom');await page.locator('[name=customEmotion]').fill('摸鱼');await page.locator('[name=dailyEmoji]').selectOption('💭');await page.locator('#daily-feeling-form [type=submit]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});
 const own=await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('settings','daily-feeling:2026-10-28')));assert.equal(own.emotion,'摸鱼');
 await page.locator('[data-action=daily-feeling]').click();await page.locator('[data-action=clear-daily-feeling]').click();await page.waitForSelector('#editor-dialog:not([open])',{state:'attached'});assert.equal(await page.evaluate(async()=> (await(await import('/src/db.mjs')).get('settings','daily-feeling:2026-10-28'))),undefined);
 await page.locator('#calendar-year').fill('2024');await page.locator('#calendar-year').press('Tab');await page.locator('#calendar-month').selectOption('02');assert.equal(await page.locator('[data-date="2024-02-29"]').count(),1);
 await page.goto(origin+'/#reports');await page.locator('#report-date').fill('2026-10-28');await page.locator('#report-date').press('Tab');await page.locator('[data-action=period][data-id=week]').click();await page.waitForSelector('.photo-recall [data-local-photo] img');assert.equal(await page.locator('.photo-recall [data-local-photo]').count(),2);
 await page.locator('.photo-recall [data-local-photo]').first().click();await page.waitForSelector('.friend-lightbox figure img');await page.locator('.friend-lightbox [data-next]').click();await page.waitForFunction(()=>document.querySelector('[data-position]')?.textContent==='2 / 2');await page.locator('.friend-lightbox [data-close]').click();
 await page.goto(origin+'/#friends');await page.waitForSelector('[data-friends-root]');await page.locator('[data-friends-view=people]').click();await page.locator('[data-friends-action=note-edit]').click();await page.locator('[data-friends-form=local-note] [name=note]').fill('高中同桌');await page.locator('[data-friends-form=local-note] button').click();await page.waitForFunction(()=>document.querySelector('.cloud-friends')?.textContent.includes('高中同桌'));
 await page.locator('[data-friends-action=profile]').click();assert.match(await page.locator('.friend-profile-heading').innerText(),/高中同桌/);await page.reload();await page.waitForSelector('[data-friends-root]');await page.locator('[data-friends-view=people]').click();assert.match(await page.locator('.cloud-friends').innerText(),/高中同桌/);
 await page.evaluate(async()=>{
  const db=await import('/src/db.mjs'),b=await import('/src/backup.mjs'),cal=await import('/src/life-calendar.mjs');await db.put('settings',cal.makeDailyFeeling('2026-10-28','温暖','🥰'));
  const tables=await b.parseBackup(await b.exportBackup(await db.readAll()));db.validateBackupTables(tables);
  await db.remove('settings','daily-feeling:2026-10-28');await db.remove('settings','friend-note:friend-123');await db.restoreBackup(tables);
  if((await db.get('settings','daily-feeling:2026-10-28')).emotion!=='温暖'||(await db.get('settings','friend-note:friend-123')).note!=='高中同桌')throw Error('Private settings ZIP restore failed');
 });
 await page.goto(origin+'/#dashboard');await page.reload();await page.waitForSelector('.home-experience');await page.locator('#dashboard-date').fill('2026-10-28');await page.locator('#dashboard-date').press('Tab');await page.waitForSelector('.life-calendar');for(const width of [320,390,1280]){await page.setViewportSize({width,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'No horizontal overflow '+width);}
 await page.setViewportSize({width:390,height:844});await page.evaluate(()=>document.activeElement?.blur());await page.screenshot({path:'releases/life-calendar-0.8.0.png',fullPage:true});await page.locator('.life-calendar').screenshot({path:'releases/calendar-panel-0.8.0.png'});assert.deepEqual(errors,[]);
 console.log('PASS calendar/leap-year/daily feelings/custom/clear/local photo gallery/report range/swipe/friend note/restart/ZIP/three widths. Synthetic only.');
}finally{await browser.close();}process.exit(0);
