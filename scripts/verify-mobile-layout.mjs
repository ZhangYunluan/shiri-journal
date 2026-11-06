/** Isolated browser acceptance fixture: synthetic local photos, external requests blocked. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
process.env.PORT='4193';process.env.HOST='127.0.0.1';
await import('../preview-server.mjs');
const {chromium}=await import(pathToFileURL(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')});
try{
  const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
  await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4193'?route.continue():route.abort());
  await context.addInitScript(()=>localStorage.setItem('shiri-space-owner','SRTESTABCDEF12'));
  const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:4193/#library');await page.waitForSelector('[data-action="batch-mode"]');
  await page.evaluate(async()=>{
    const db=await import('/src/db.mjs');await db.clearEverything();
    const {prepareImage}=await import('/src/images.mjs');const blob=await (await fetch('/tests/fixtures/test-receipt.png')).blob();
    const base=await prepareImage(new File([blob],'synthetic.png',{type:'image/png'}));
    const {categories}=await db.readAll();
    for(let i=0;i<24;i++)await db.saveRecord({id:'fixture-'+i,assetId:'asset-'+i,title:'测试照片 '+i,note:'',date:'2026-10-13',time:'18:00',categoryId:'daily',status:'review',tags:[],location:'',mood:null,duration:null,amount:null,weight:null,reflection:'',analysis:{method:'已有识别',labels:[],ocr:''},createdAt:new Date().toISOString(),updatedAt:new Date().toISOString()},categories,{...base,id:'asset-'+i});
  });
  await page.reload();await page.waitForSelector('[data-action="batch-mode"]');
  await page.click('[data-action="batch-mode"]');
  for(const native of [false,true]){
    await page.evaluate(native=>document.body.classList.toggle('native-app',native),native);
    if(native)await page.addStyleTag({content:'.native-app .mobile-nav{padding-bottom:max(10px,env(safe-area-inset-bottom))}'});
    for(const width of [320,390,430,700,1440]){
      await page.setViewportSize({width,height:844});
      await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
      const bounds=await page.evaluate(()=>{
        const bar=document.querySelector('.batch-toolbar').getBoundingClientRect(),nav=document.querySelector('.mobile-nav').getBoundingClientRect();
        return {overflow:document.documentElement.scrollWidth>innerWidth,bar:{top:bar.top,bottom:bar.bottom},navTop:nav.top,buttons:[...document.querySelectorAll('.batch-toolbar button')].map(b=>b.getBoundingClientRect().height)};
      });
      assert.equal(bounds.overflow,false,`overflow ${width}`);
      if(width<=700){assert.ok(bounds.bar.top>=0&&bounds.bar.bottom<=bounds.navTop,JSON.stringify(bounds));assert.ok(bounds.buttons.every(h=>h>=44));}
    }
  }
  await page.setViewportSize({width:390,height:844});
  await page.click('[data-action="batch-all"]');
  await page.evaluate(()=>scrollTo(0,document.documentElement.scrollHeight));
  await page.locator('.asset-item').last().scrollIntoViewIfNeeded();
  await page.waitForTimeout(250);
  await page.screenshot({path:'docs/mobile-toolbar-0.5.4.png'});
  await page.click('[data-action="batch-exclude"]');
  await page.locator('#confirmation button[type="submit"]').click();
  await page.waitForFunction(()=>document.querySelectorAll('.asset-card').length===0);
  for(const view of ['dashboard','library','categories','reports','plans','friends','settings']){
    await page.goto('http://127.0.0.1:4193/#'+view);
    await page.waitForTimeout(150);
    for(const width of [320,390]){
      await page.setViewportSize({width,height:844});
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${view} ${width}`);
    }
  }
  assert.deepEqual(errors,[]);
  console.log('PASS: web/native toolbar visible at bottom, 320/390/430/700px; desktop; 44px targets; actual batch exclusion dialog; all seven pages 320/390px no horizontal overflow.');
}finally{await browser.close();}
process.exit(0);
