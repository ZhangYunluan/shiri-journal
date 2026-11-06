import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp, writeFile, rm, rmdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createDownloadServer} from '../android-shell/scripts/serve-apk.mjs';

test('APK download serves only the named package, supports resume and never exposes project files', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'shiri-download-'));
  const apk = join(directory, 'preview.apk');
  await writeFile(apk, Buffer.from('PK-test-apk'));
  const server = await createDownloadServer(apk);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  try {
    const head = await fetch(base + '/shiri-0.3.0-preview.apk', {method:'HEAD'});
    assert.equal(head.status, 200);
    assert.equal(head.headers.get('content-type'), 'application/vnd.android.package-archive');
    assert.equal(head.headers.get('content-length'), '11');
    const resumed = await fetch(base + '/shiri-0.3.0-preview.apk', {headers:{range:'bytes=3-6'}});
    assert.equal(resumed.status, 206);
    assert.equal(await resumed.text(), 'test');
    const invalid = await fetch(base + '/shiri-0.3.0-preview.apk', {headers:{range:'bytes=99-'}});
    assert.equal(invalid.status, 416);
    for (const path of ['/android-shell/.signing/signing.properties','/README.md','/%2e%2e/.signing','/preview.apk'])
      assert.equal((await fetch(base + path)).status, 404);
    assert.equal((await fetch(base + '/', {method:'POST'})).status, 405);
    const landing = await (await fetch(base)).text();
    assert.match(landing, /shiri-0.3.0-preview.apk/);
    assert.match(landing, /局域网/);
  } finally {
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
    await rm(apk);
    await rmdir(directory);
  }
});
test('new auth preview download page clearly separates email code from unverified sharing',async()=>{
  const directory=await mkdtemp(join(tmpdir(),'shiri-auth-download-'));
  const apk=join(directory,'auth-preview.apk');await writeFile(apk,Buffer.from('PK-test-apk'));
  const server=await createDownloadServer(apk,{name:'shiri-0.4.0-auth-preview.apk',version:'0.4.0',authConnected:true});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  try{
    assert.equal((await fetch(base+'/shiri-0.4.0-auth-preview.apk')).status,200);
    assert.equal((await fetch(base+'/shiri-0.3.0-preview.apk')).status,404);
    const html=await(await fetch(base)).text();assert.match(html,/邮箱验证码/);assert.match(html,/尚未启用/);
  }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve));await rm(apk);await rmdir(directory);}
});
