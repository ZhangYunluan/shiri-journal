import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {CLOUDBASE} from '../src/cloudbase-config.mjs';
import {MEDIA_API} from '../src/cloudbase-social-config.mjs';
import {ASSISTANT_CONFIG} from '../src/life-assistant.mjs';

test('public snapshot has no live cloud or model endpoint by default',()=>{
  assert.equal(CLOUDBASE.envId,'');
  assert.equal(CLOUDBASE.publishableKey,'');
  assert.equal(CLOUDBASE.friendsEnabled,false);
  assert.equal(MEDIA_API,'');
  assert.equal(ASSISTANT_CONFIG.endpoint,'');
});

test('demo uses an isolated store and preserves exclusion and saved state',async()=>{
  const {loadDemo,writeDemo,DEMO_KEY}=await import('../demo/store.mjs');
  const values=new Map([['unrelated-user-diary','keep']]);
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  const initial=loadDemo(storage,'2026-11-06');
  const {reviewBatch}=await import('../src/moment-review.mjs');
  const pending=initial.records.filter(r=>r.status==='review');
  assert.ok(pending.length>=3);
  initial.records=reviewBatch(initial.records,[pending[0].id],'exclude');
  initial.records=reviewBatch(initial.records,[pending[1].id],'confirm');
  writeDemo(storage,initial);
  const restored=loadDemo(storage,'2026-11-06');
  assert.equal(restored.records.find(r=>r.id===pending[0].id).excluded,true);
  assert.equal(restored.records.find(r=>r.id===pending[1].id).status,'confirmed');
  assert.equal(restored.records.find(r=>r.id===pending[1].id).visibility,'self');
  assert.equal(values.get('unrelated-user-diary'),'keep');
  assert.deepEqual([...values.keys()].sort(),[DEMO_KEY,'unrelated-user-diary'].sort());
});

test('public demo is explicit about synthetic data and disables external requests',async()=>{
  const html=await readFile(new URL('../demo/index.html',import.meta.url),'utf8');
  assert.match(html,/示例数据/);
  assert.match(html,/connect-src 'none'/);
  assert.match(html,/form-action 'none'/);
});
