import assert from 'node:assert/strict';
import {mkdir,copyFile,readFile} from 'node:fs/promises';
import {chromium} from 'playwright';
import {freshDemo,DEMO_KEY} from '../demo/store.mjs';
process.env.PORT=process.env.PORT||'4190';
await import('../demo/server.mjs');
const origin=`http://127.0.0.1:${process.env.PORT}`;
const entry=process.env.SHIRI_DEMO_DIRECTORY?'/index.html':'/demo/';
await mkdir('docs/images',{recursive:true});
await mkdir('demo-captures',{recursive:true});
const browser=await chromium.launch({headless:true,...(process.env.SHIRI_BROWSER_PATH?{executablePath:process.env.SHIRI_BROWSER_PATH}:{})});
const errors=[],external=[],failed=[];
try{
  const context=await browser.newContext({viewport:{width:393,height:852},reducedMotion:'reduce',serviceWorkers:'block',recordVideo:{dir:'demo-captures',size:{width:393,height:852}}});
  await context.addInitScript(({key,data})=>{
    if(!localStorage.getItem(key))localStorage.setItem(key,JSON.stringify(data));
    localStorage.setItem('shiri-production-sentinel','unchanged');
  },{key:DEMO_KEY,data:freshDemo('2026-11-06')});
  await context.route('**/*',route=>{
    if(new URL(route.request().url()).origin!==origin){external.push(route.request().url());return route.abort();}
    return route.continue();
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  page.on('response',res=>{if(res.status()>=400)failed.push(new URL(res.url()).pathname);});
  await page.goto(origin);await page.waitForSelector('.demo-notice');
  assert.match(await page.locator('.demo-notice').innerText(),/示例数据/);
  await page.setViewportSize({width:1280,height:960});
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
  await page.screenshot({path:'docs/images/overview.png'});
  for(const width of [320,360,393,412,1280]){
    await page.setViewportSize({width,height:852});
    for(const view of ['dashboard','library','categories','reports']){
      await page.goto(origin+entry+`#${view}`);await page.waitForSelector('#demo-main > *');
      assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`overflow ${view} ${width}`);
    }
  }
  await page.setViewportSize({width:393,height:852});
  await page.goto(origin+entry+'#library');
  await page.locator('[data-action="batch-mode"]').click();
  const candidates=page.locator('[data-action="batch-select"]');
  await candidates.first().click();await candidates.nth(1).click();
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
  await page.screenshot({path:'docs/images/review.png'});
  await page.locator('[data-action="batch-exclude"]').click();
  assert.equal(await page.locator('[data-action="batch-select"]').count(),1);
  await page.reload();await page.waitForSelector('[data-action="batch-mode"]');
  assert.match(await page.locator('.material-actions').innerText(),/已排除 · 2/);
  await page.locator('[data-action="batch-mode"]').click();
  await page.locator('[data-action="batch-all"]').click();
  await page.locator('[data-action="batch-confirm"]').click();
  await page.waitForSelector('.demo-toast:not([hidden])');
  assert.match(await page.locator('.demo-toast').innerText(),/已保存在本机/);
  assert.match(await page.locator('.material-status').innerText(),/已确认 · 5/);
  await page.locator('.demo-nav a[href="#dashboard"]').click();
  await page.waitForSelector('.record-route');
  assert.match(await page.locator('.record-route').innerText(),/1 条已保存/);
  await page.locator('.demo-nav a[href="#reports"]').click();
  await page.waitForSelector('.report-paper');
  assert.equal(await page.locator('.recall-grid figure').count(),4);
  await page.waitForSelector('.demo-toast[hidden]',{state:'attached'});
  await page.evaluate(()=>{document.activeElement?.blur();scrollTo(0,0);});
  await page.screenshot({path:'docs/images/review-report.png'});
  await page.locator('[data-action="edit-report"]').click();
  const edited='# 我的演示复盘\n\n保留这一段自己写下的文字。';
  await page.locator('#report-editor').fill(edited);
  await page.locator('[data-action="save-report"]').click();
  const downloadPromise=page.waitForEvent('download');
  await page.locator('[data-action="download-report"]').click();
  const download=await downloadPromise;
  assert.match(download.suggestedFilename(),/\.md$/);
  assert.equal(await readFile(await download.path(),'utf8'),edited);
  await page.locator('.demo-nav a[href="#dashboard"]').click();
  await page.locator('[data-action="calendar-toggle"]').click();
  await page.locator('[data-action="daily-feeling"]').click();
  await page.locator('#demo-feeling select').selectOption('开心');
  await page.locator('#demo-feeling button[type="submit"]').click();
  assert.equal(await page.locator('.calendar-emoji').count(),1);
  await page.reload();await page.waitForSelector('.demo-nav');
  await page.locator('[data-action="calendar-toggle"]').click();
  assert.equal(await page.locator('.calendar-emoji').count(),1);
  await page.addStyleTag({content:'html{font-size:20px} body{font-size:20px}'});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'enlarged text overflow');
  assert.equal((await context.request.get(origin+'/.git/config')).status(),404);
  assert.equal((await context.request.get(origin+'/cloudbase/.env')).status(),404);
  page.once('dialog',dialog=>dialog.accept());await page.locator('#reset-demo').click();
  assert.equal(await page.evaluate(()=>localStorage.getItem('shiri-production-sentinel')),'unchanged');
  assert.equal(await page.evaluate(key=>JSON.parse(localStorage.getItem(key)).records.filter(r=>r.excluded).length,DEMO_KEY),0);
  const video=page.video();await context.close();
  await copyFile(await video.path(),'docs/images/demo.webm');
  await copyFile('docs/images/overview.png','website/assets/app-home.png');
  assert.deepEqual(external,[]);assert.deepEqual(errors,[]);assert.deepEqual(failed,[]);
  console.log(JSON.stringify({result:'passed',widths:[320,360,393,412,1280],checks:['render','batch exclusion','persistent review','save feedback','rule report','photo recall','Markdown download','daily feeling','reset isolation','no external requests','private path denial'],screenshots:'docs/images',realDevice:false},null,2));
}catch(error){console.error(error);process.exitCode=1;}
finally{await browser.close();}
process.exit(process.exitCode||0);
