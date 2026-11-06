/** Isolated landing-page QA. No APP data access, registration, download or feedback submission. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {mkdir,writeFile} from 'node:fs/promises';
import assert from 'node:assert/strict';
import config from '../website/site.config.mjs';
const {chromium}=await import(pathToFileURL(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const origin='http://127.0.0.1:4201',url=origin+'/website/dist/index.html',out=resolve('releases/website-check');
await mkdir(out,{recursive:true});
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')});
const results=[];
try{
 const context=await browser.newContext({viewport:{width:1440,height:1000},permissions:['clipboard-read','clipboard-write']});
 const errors=[],requests=[];const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));page.on('request',r=>requests.push(r.url()));
 const response=await page.goto(url);assert.equal(response.status(),200);await page.waitForSelector('.phone img');
 assert.equal(await page.locator('h1').count(),1);assert.match(await page.locator('#release-note').innerText(),new RegExp(config.productVersion.replaceAll('.','\\.')));assert.doesNotMatch(await page.locator('#release-note').innerText(),/待更新|0\.5\.6/);
 assert.equal(await page.locator('html').evaluate(e=>e.classList.contains('motion-on')),true);
 const orbit=page.locator('.orbit-track i');
 const before=await orbit.evaluate(e=>getComputedStyle(e).transform);await page.waitForTimeout(150);assert.notEqual(await orbit.evaluate(e=>getComputedStyle(e).transform),before);
 await page.locator('.hero-visual').hover({position:{x:80,y:80}});assert.notEqual(await page.locator('.hero-visual').evaluate(e=>e.style.getPropertyValue('--lean-y')),'');
 await page.locator('#motion-toggle').click();assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'),'true');
 assert.equal(await page.locator('.ribbon-track').evaluate(e=>getComputedStyle(e).animationName),'none');
 await page.locator('#motion-toggle').click();assert.equal(await page.locator('#motion-toggle').getAttribute('aria-pressed'),'false');
 for(const width of [320,360,390,540,768,1024,1440]){
  await page.setViewportSize({width,height:900});await page.waitForTimeout(100);
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'horizontal overflow '+width);
  assert.ok(await page.locator('.hero-actions [data-download]').isVisible());
 }
 await page.setViewportSize({width:1440,height:1000});await page.evaluate(()=>scrollTo(0,0));await page.waitForTimeout(1300);await page.screenshot({path:resolve(out,'desktop.png'),fullPage:true});await page.screenshot({path:resolve(out,'desktop-hero.png')});
 await page.setViewportSize({width:390,height:844});await page.screenshot({path:resolve(out,'mobile.png'),fullPage:true});await page.screenshot({path:resolve(out,'mobile-hero.png')});
 assert.ok(await page.evaluate(()=>[...document.images].every(i=>i.complete&&i.naturalWidth>0)));
 const missing=await page.evaluate(()=>[...document.querySelectorAll('a[href^="#"]')].filter(a=>!document.getElementById(a.getAttribute('href').slice(1))).map(a=>a.getAttribute('href')));assert.deepEqual(missing,[]);
 for(const link of await page.locator('[data-download]').all())assert.equal(await link.getAttribute('href'),config.downloadUrl);
 await page.locator('#about').scrollIntoViewIfNeeded();await page.waitForTimeout(250);assert.ok(await page.locator('.mobile-download').isVisible());
 assert.equal(await orbit.evaluate(e=>getComputedStyle(e).animationPlayState),'paused');
 await page.locator('.mobile-download a').click();await page.waitForTimeout(450);assert.ok(await page.locator('.mobile-download').isHidden());
 await page.locator('.footer a[href="#privacy-policy"]').click();assert.equal(await page.locator('#privacy-policy').getAttribute('open'),'');
 await page.locator('#copy-contact').click();assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),config.wechat);
 await page.locator('#feedback-template').fill('问题类型：安装与注册问题\n我填写的体验意见');await page.locator('#feedback-kind').selectOption('使用体验');assert.match(await page.locator('#feedback-template').inputValue(),/问题类型：使用体验\n我填写的体验意见/);
 await page.locator('#copy-feedback').click();assert.match(await page.evaluate(()=>navigator.clipboard.readText()),/我填写的体验意见/);
 page.once('dialog',d=>d.dismiss());await page.locator('#reset-feedback').click();assert.match(await page.locator('#feedback-template').inputValue(),/我填写的体验意见/);
 await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async()=>{throw Error('denied');}}}));
 await page.locator('#copy-feedback').click();assert.match(await page.locator('#copy-status').innerText(),/未允许自动复制/);assert.ok(await page.locator('#feedback-template').evaluate(e=>e.selectionEnd>e.selectionStart));
 await page.evaluate(()=>document.querySelector('textarea').blur());
 assert.deepEqual(errors,[]);assert.ok(requests.every(r=>r.startsWith(origin)),'unexpected third-party request');
 results.push('PASS: 7 viewport widths, images, anchors, download URLs, sticky CTA, privacy disclosure, contact/feedback copy, denied-copy fallback, non-destructive category switch/reset, no external requests or JS errors.');
 const reduced=await browser.newContext({reducedMotion:'reduce',viewport:{width:390,height:844}}),rp=await reduced.newPage();await rp.goto(url);assert.equal(await rp.locator('html').evaluate(e=>getComputedStyle(e).scrollBehavior),'auto');assert.ok(await rp.locator('#motion-toggle').isDisabled());assert.equal(await rp.locator('.ribbon-track').evaluate(e=>getComputedStyle(e).animationName),'none');await rp.keyboard.press('Tab');assert.equal(await rp.evaluate(()=>document.activeElement.className),'skip');
 const plain=await browser.newContext({javaScriptEnabled:false,viewport:{width:390,height:844}}),np=await plain.newPage();await np.goto(url);assert.equal(await np.locator('.hero-actions [data-download]').getAttribute('href'),config.downloadUrl);assert.match(await np.locator('#feedback').innerText(),new RegExp(config.wechat));assert.ok(await np.locator('noscript').isVisible());
 results.push('PASS: motion pause/resume, reduced motion, keyboard skip link, current channel version, useful page and real download/contact without JavaScript.');
 await writeFile(resolve(out,'results.txt'),results.join('\n')+'\n');console.log(results.join('\n'));
}finally{await browser.close();}
