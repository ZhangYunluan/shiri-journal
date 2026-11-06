import assert from 'node:assert/strict';
import {resolve} from 'node:path';
import {readFile} from 'node:fs/promises';
import {launchBrowser} from './browser-test-runtime.mjs';
const root=process.cwd(),web=resolve(root,'android-shell/www');
assert.equal(JSON.parse(await readFile(resolve(web,'shiri-build-profile.json'),'utf8')).profile,'debug');
const browser=await launchBrowser();
process.chdir(web);process.env.PORT='4205';process.env.HOST='127.0.0.1';
await import('../preview-server.mjs');
try{
 const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage(),errors=[],external=[];
 page.on('pageerror',e=>errors.push(e.message));
 await context.route('**/*',async route=>{const u=new URL(route.request().url());if(u.origin==='http://127.0.0.1:4205')return route.continue();external.push(u.origin);return route.abort();});
 await page.goto('http://127.0.0.1:4205/');
 await page.waitForFunction(()=>document.body.innerText.includes('登录'));
 await page.waitForTimeout(500);
 assert.deepEqual(errors,[]);assert.deepEqual(external,[]);
 assert.match(await page.locator('body').innerText(),/未配置|尚未配置/);
 console.log('Development assets: login rendered, no JS exceptions, no external requests.');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{await browser.close();process.exit(process.exitCode||0);}
