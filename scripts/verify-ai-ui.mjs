/** Isolated synthetic browser checks. No real email, photos or cloud writes. */
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
process.env.PORT='4199';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
const {chromium}=await import(pathToFileURL(resolve(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs')));
const browser=await chromium.launch({headless:true,executablePath:resolve(process.env.LOCALAPPDATA,'ms-playwright/chromium_headless_shell-1228/chrome-headless-shell-win64/chrome-headless-shell.exe')});
try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'});
 let offline=false,aiCalls=0;const origin='http://127.0.0.1:4199';
 await context.route('**/*',async route=>{
  const url=new URL(route.request().url());if(url.origin===origin)return route.continue();
  if(url.pathname.endsWith('/shiri-ai')){aiCalls++;return route.fulfill({contentType:'application/json',body:JSON.stringify({answer:'根据你填写的目标，先留出一次阅读时间。'})});}
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
 await page.locator('[data-action="assistant-plan"]').click();await page.locator('#assistant-form [name="goals"]').fill('读完一本书');await page.locator('#assistant-form [name="consent"]').check();await page.locator('#assistant-form button[type="submit"]').click();await page.waitForSelector('.assistant-answer');assert.match(await page.locator('.assistant-answer').innerText(),/阅读时间/);assert.equal(aiCalls,1);assert.ok(!await page.locator('#assistant-form [name="consent"]').isChecked());await page.locator('[data-action="assistant-clear"]').click();assert.equal(await page.locator('.assistant-answer').count(),0);assert.deepEqual(errors,[]);console.log('PASS planning entry, consent, real client fetch with mocked provider response, cleared conversation');
}finally{await browser.close();}process.exit(0);