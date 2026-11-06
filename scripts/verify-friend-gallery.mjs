// Browser-only regression using synthetic photos and an authenticated-API test double.
import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
process.env.PORT='4202';process.env.HOST='127.0.0.1';await import('../preview-server.mjs');
import {launchBrowser} from './browser-test-runtime.mjs';
const browser=await launchBrowser();
try{
 const page=await browser.newPage({viewport:{width:390,height:844},serviceWorkers:'block'});
 await page.route('**/tests/cloudbase-friends-panel.mjs',route=>route.fulfill({contentType:'text/javascript',body:''}));
 const errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto('http://127.0.0.1:4202/tests/cloudbase-friends-panel.html');
 await page.evaluate(async()=>{
  const {timeline,mountPhotos}=await import('/src/friend-timeline.mjs');
  window.liveURLs=new Map();window.hold=false;window.waiting=[];window.photoCalls=0;window.denied=false;
  const create=URL.createObjectURL.bind(URL),revoke=URL.revokeObjectURL.bind(URL);
  URL.createObjectURL=blob=>{const url=create(blob);liveURLs.set(url,blob.ticket||'thumbnail');return url;};
  URL.revokeObjectURL=url=>{liveURLs.delete(url);revoke(url);};
  const source=await(await fetch('/tests/fixtures/test-receipt.png')).blob();
  document.body.innerHTML='<main id="fixture">'+timeline([{date:'2026-10-26',title:'IMG202610261100',mediaId:'a'},{date:'2026-10-26',title:'晚饭',note:'一起吃饭',mediaId:'b'},{date:'2026-10-25',title:'旧照片',mediaId:'c'}],'friend')+'</main>';
  const root=document.querySelector('#fixture');
  window.clean=mountPhotos(root,{photo:async id=>{
   window.photoCalls++;if(window.denied)throw Object.assign(Error('denied'),{status:403});
   if(window.hold)return new Promise(resolve=>waiting.push(ticket=>{const b=source.slice();b.ticket=ticket;resolve(b);}));
   return source;
  }},()=>root.isConnected);
 });
 await page.waitForFunction(()=>document.querySelectorAll('.friend-thumbnail img').length===3);
 assert.equal(await page.locator('.friend-day').count(),2);
 assert.equal(await page.locator('.friend-day').first().locator('.friend-thumbnail').count(),2);
 assert.equal(await page.locator('text=IMG202610261100').count(),0);
 await page.locator('.friend-thumbnail').first().click();await page.waitForSelector('dialog img');
 await page.locator('[data-close]').click();await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(await page.evaluate(()=>liveURLs.size),3,'closing the gallery must release its full-size image');
 await page.evaluate(()=>hold=true);
 await page.locator('.friend-thumbnail').first().click();
 await page.locator('[data-next]').click();await page.locator('[data-prev]').click();
 await page.waitForFunction(()=>waiting.length===3);
 await page.evaluate(()=>waiting[2]('newest'));await page.waitForSelector('dialog img');
 await page.evaluate(()=>{waiting[1]('middle');waiting[0]('oldest');});await page.waitForTimeout(60);
 assert.equal(await page.locator('dialog img').evaluate(img=>liveURLs.get(img.src)),'newest','late same-index responses cannot overwrite current image');
 assert.equal(await page.evaluate(()=>liveURLs.size),4,'only one full-size object URL may survive navigation');
 await page.locator('[data-close]').click();assert.equal(await page.evaluate(()=>liveURLs.size),3);
 // Closing while a request is pending must not insert an image or leak its URL.
 await page.locator('.friend-thumbnail').first().click();await page.waitForFunction(()=>waiting.length===4);
 await page.locator('[data-close]').click();await page.evaluate(()=>waiting[3]('closed'));await page.waitForTimeout(60);
 assert.equal(await page.evaluate(()=>liveURLs.size),3);
 await page.evaluate(()=>{hold=false;denied=true;});await page.locator('.friend-thumbnail').first().click();
 await page.waitForFunction(()=>!document.querySelector('dialog[open]'));
 assert.equal(await page.evaluate(()=>liveURLs.size),0);assert.equal(await page.locator('.friend-thumbnail img').count(),0);
 const calls=await page.evaluate(()=>photoCalls);await page.locator('.friend-thumbnail').first().click();assert.equal(await page.evaluate(()=>photoCalls),calls);
 await page.evaluate(()=>clean());assert.deepEqual(errors,[]);
 console.log('PASS date groups, direct thumbnails, same-index request race, close/pending cleanup, denied-access cleanup and no further restricted requests. Synthetic API only.');
}finally{await browser.close();}process.exit(0);
