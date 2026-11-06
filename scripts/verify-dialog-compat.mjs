/** Synthetic Chromium layout regression; viewport changes are not a real Android IME. */
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {launchBrowser} from './browser-test-runtime.mjs';
process.env.PORT='4212';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const origin='http://127.0.0.1:4212',browser=await launchBrowser();
const failures=[],cases=[],errors=[];
const capture=process.env.DIALOG_BASELINE==='1',output='.local/dialog-compat';await mkdir(output,{recursive:true});
async function record(page,label,selector,{field,actions=[],internal=false}={}){
 const info=await page.locator(selector).evaluate((dialog,{field,actions,internal})=>{
  const box=el=>{const r=el?.getBoundingClientRect();return r?{x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}:null;};
  const v=window.visualViewport,top=v?.offsetTop||0,bottom=top+(v?.height||innerHeight),r=box(dialog),body=dialog.querySelector('.dialog-body');
  const visible=el=>{const b=box(el);return b&&b.width>0&&b.height>0&&b.x>=-1&&b.right<=innerWidth+1&&b.y>=top-1&&b.bottom<=bottom+1;};
  const issues=[];
  if(r.x<0||r.right>innerWidth+1||dialog.scrollWidth>dialog.clientWidth+1)issues.push('dialog horizontal overflow');
  if(document.documentElement.scrollWidth>innerWidth+1)issues.push('page horizontal overflow');
  for(const action of actions)if(!visible(dialog.querySelector(action)))issues.push('action outside visible viewport: '+action);
  if(field){const el=dialog.querySelector(field),b=box(el),s=el&&getComputedStyle(el);if(!visible(el))issues.push('input outside visible viewport: '+field);
   if(el?.type==='date'){
    if(el.value!=='2026-10-09')issues.push('incorrect date value');
    const c=document.createElement('canvas').getContext('2d');c.font=`${s.fontSize} ${s.fontFamily}`;
    const room=b.width-parseFloat(s.paddingLeft)-parseFloat(s.paddingRight)-2;
    // Conservative width budget for all date digits/separators plus the native picker icon.
    if(room<c.measureText('2026/10/09').width+28)issues.push('date digits/picker lack horizontal room');
   }
  }
  if(internal&&body&&!(body.scrollHeight>body.clientHeight+5&&/auto|scroll/.test(getComputedStyle(body).overflowY)))issues.push('long content has no internal scrolling region');
  return {issues,viewport:{width:innerWidth,top,bottom},dialog:r,body:body?{client:body.clientHeight,scroll:body.scrollHeight}:null,date:box(dialog.querySelector('input[type=date]'))};
 },{field,actions,internal});
 cases.push({label,...info});for(const error of info.issues)failures.push(label+': '+error);
 if(capture&&info.issues.length&&cases.filter(x=>x.issues.length).length<=3)await page.screenshot({path:output+'/before-'+cases.length+'.png'});
}
try{
 for(const dpr of [1,3]){
  const context=await browser.newContext({viewport:{width:393,height:844},deviceScaleFactor:dpr,serviceWorkers:'block'});
  await context.route('**/*',route=>{
   const u=new URL(route.request().url());if(u.origin===origin)return route.continue();let data={};
   if(u.pathname.endsWith('/verification'))data={verification_id:'test',is_user:true};
   if(u.pathname.endsWith('/verification/verify'))data={verification_token:'test'};
   if(u.pathname.endsWith('/signin')||u.pathname.endsWith('/token'))data={access_token:'test-token',refresh_token:'test-refresh',expires_in:7200,sub:'dialog-fixture'};
   if(u.pathname.endsWith('/user/me'))data={sub:'dialog-fixture',email:'fixture@example.invalid',nickName:'合成布局测试'};
   if(u.pathname.endsWith('/shiri_social'))data={friends:[],incoming:[],outgoing:[],blocked:[],mine:[],records:[],hasMore:false};
   return route.fulfill({contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));await page.goto(origin);
  await page.locator('[name=email]').fill('fixture@example.invalid');await page.locator('[data-cloud-form=send] button').first().click();await page.locator('[name=code]').fill('123456');await page.locator('[data-cloud-form=verify] button').click();await page.waitForSelector('[data-action=note]');
  for(const width of [320,360,393,412])for(const scale of [1,1.5]){
   const label=`${width}px DPR${dpr} font${scale}`;await page.setViewportSize({width,height:844});
   await page.evaluate(()=>document.querySelector('#test-large-font')?.remove());
   if(scale>1)await page.addStyleTag({content:'body,button,input,textarea,select,label.field{font-size:21px!important}h2{font-size:25.5px!important}'}).then(h=>h.evaluate(e=>e.id='test-large-font'));
   await page.goto(origin+'/#dashboard');await page.locator('[data-action=import]').first().click();
   await page.locator('#import-date').fill('2026-10-09');await page.waitForTimeout(70);
   await record(page,label+' import','#import-dialog',{field:'#import-date',actions:['[data-action=close-import]']});
   await page.locator('#import-dialog [data-action=close-import]').click();
   await page.locator('[data-action=note]').first().click();await page.locator('#record-form [name=date]').fill('2026-10-09');await page.locator('#record-form [name=title]').fill('合成布局测试');await page.waitForTimeout(70);
   await record(page,label+' editor date','#editor-dialog',{field:'[name=date]',actions:['[data-action=close-editor]','[type=submit]']});
   try{await page.locator('.record-more summary').click({timeout:5000});}catch(error){
    console.log(label,await page.locator('#editor-dialog').evaluate(d=>[d,...d.querySelectorAll('form,.dialog-head,.dialog-body,.dialog-foot,.record-more')].map(e=>({tag:e.id||e.className,rect:e.getBoundingClientRect().toJSON(),max:getComputedStyle(e).maxHeight,min:getComputedStyle(e).minHeight,overflow:getComputedStyle(e).overflowY,scroll:e.scrollHeight,client:e.clientHeight}))));
    await page.screenshot({path:output+'/layout-error.png'});throw error;
   }await page.locator('#record-form [name=note]').fill('合成的长文字，不是用户数据。'.repeat(30));
   await page.locator('#editor-dialog .dialog-body').evaluate(e=>e.scrollTop=e.scrollHeight);await page.waitForTimeout(30);
   await record(page,label+' editor long','#editor-dialog',{actions:['[data-action=close-editor]','[type=submit]'],internal:true});
   await page.locator('#record-form [name=location]').focus();
   await page.evaluate(()=>{window.testDialogViewport=new EventTarget();testDialogViewport.height=430;testDialogViewport.offsetTop=0;testDialogViewport.width=innerWidth;Object.defineProperty(window,'visualViewport',{configurable:true,value:testDialogViewport});window.dispatchEvent(new Event('resize'));testDialogViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
   await record(page,label+' keyboard','#editor-dialog',{field:'[name=location]',actions:['[data-action=close-editor]','[type=submit]']});
   assert.equal(await page.evaluate(()=>document.activeElement.name),'location','resize preserves input focus');
   await page.evaluate(()=>{testDialogViewport.height=844;window.dispatchEvent(new Event('resize'));testDialogViewport.dispatchEvent(new Event('resize'));});await page.waitForTimeout(70);
   // Discard only this synthetic unsaved form via the existing confirmation.
   await page.locator('#editor-dialog [data-action=close-editor]').first().click();
   if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirmation [type=submit]').click();
   await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
   await page.goto(origin+'/#plans');await page.locator('[data-action=new-plan]').first().click();await page.locator('#plan-form [name=date]').fill('2026-10-09');await page.waitForTimeout(70);
   await record(page,label+' plan','#editor-dialog',{field:'[name=date]',actions:['[data-action=close-editor]','[type=submit]']});
   await page.locator('#editor-dialog [data-action=close-editor]').first().click();if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirmation [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
  }
  // Exercise the normal save path too: layout must not change submitted dates or records.
  await page.goto(origin+'/#dashboard');await page.locator('[data-action=note]').first().click();
  await page.locator('#record-form [name=title]').fill('日期保存合成测试');await page.locator('#record-form [name=date]').fill('2026-10-09');
  await page.locator('#record-form [name=title]').focus();
  await page.evaluate(()=>{document.documentElement.classList.add('native-app');document.documentElement.style.setProperty('--safe-area-inset-top','24px');document.documentElement.style.setProperty('--safe-area-inset-bottom','20px');testDialogViewport.height=430;testDialogViewport.offsetTop=20;window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(100);
  await record(page,`DPR${dpr} native safe-area + viewport offset`,'#editor-dialog',{field:'[name=title]',actions:['[data-action=close-editor]','[type=submit]']});
  const safeDialog=await page.locator('#editor-dialog').boundingBox();assert.ok(safeDialog.y>=44&&safeDialog.y+safeDialog.height<=431,'native inset respected once inside visible viewport');
  if(!capture&&dpr===1)await page.screenshot({path:output+'/after-keyboard.png'});
  await page.evaluate(()=>{testDialogViewport.height=844;testDialogViewport.offsetTop=0;window.dispatchEvent(new Event('resize'));});await page.waitForTimeout(70);
  if(!capture&&dpr===1)await page.screenshot({path:output+'/after-editor.png'});
  await page.locator('#record-form [type=submit]').click();await page.waitForFunction(()=>!document.querySelector('#editor-dialog').open);
  assert.deepEqual(await page.evaluate(async()=>{const {records}=await(await import('/src/db.mjs')).readAll();return records.map(r=>({date:r.date,title:r.title,status:r.status}));}),[{date:'2026-10-09',title:'日期保存合成测试',status:'confirmed'}]);
  await context.close();
 }
 await writeFile(output+'/'+(capture?'before':'after')+'.json',JSON.stringify({cases,failures,errors},null,2));
 assert.deepEqual(errors,[]);assert.equal(failures.length,0,`${failures.length} layout violations; details in ${output}:\n${failures.slice(0,12).join('\n')}`);
 console.log(`PASS ${cases.length} dialog checks: 320/360/393/412 CSS px, DPR1/3, normal/150% text, date values/width, internal scrolling, close/save, simulated keyboard. No cloud or native-device test.`);
}finally{await writeFile(output+'/'+(capture?'before':'after')+'.json',JSON.stringify({cases,failures,errors},null,2));await browser.close();}
process.exit(0);
