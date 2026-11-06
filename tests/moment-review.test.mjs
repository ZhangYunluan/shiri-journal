import test from 'node:test';
import assert from 'node:assert/strict';
import {reviewBatch,savedMoment,isSyncable,syncLabel} from '../src/moment-review.mjs';
import {createMomentSync} from '../src/moment-sync.mjs';
import {cleanOcr} from '../src/ocr-filter.mjs';

test('80 candidates: exclude 50, persist/restore, confirm 30 without rerunning models',()=>{
  const records=Array.from({length:80},(_,i)=>({id:'p'+i,assetId:'a'+i,status:'review',analysis:{labels:['existing'],ocr:''}}));
  const excluded=reviewBatch(records,records.slice(0,50).map(r=>r.id),'exclude');
  assert.equal(excluded.filter(r=>r.excluded).length,50);
  const reloaded=JSON.parse(JSON.stringify(excluded));
  const confirmed=reviewBatch(reloaded,reloaded.filter(r=>!r.excluded).map(r=>r.id),'confirm');
  assert.equal(confirmed.filter(isSyncable).length,30);assert.equal(confirmed.filter(r=>r.excluded).length,50);
  assert.ok(confirmed.every(r=>r.assetId&&r.analysis.labels[0]==='existing'));
  assert.equal(reviewBatch(confirmed,['p0'],'restore').find(r=>r.id==='p0').excluded,false);
  assert.equal(reviewBatch(confirmed,['p1'],'confirm').find(r=>r.id==='p1').status,'review');
});
test('historical diary, self-only, pending and excluded never qualify for sync',()=>{
  assert.equal(isSyncable({status:'confirmed'}),false);
  assert.equal(isSyncable(savedMoment({id:'self'},'self')),false);
  assert.equal(isSyncable({...savedMoment({id:'review'}),status:'review'}),false);
  assert.equal(isSyncable({...savedMoment({id:'excluded'}),excluded:true}),false);
});
const fixture=()=>{
  const record=savedMoment({id:'p1',assetId:'a1',title:'散步',note:'',date:'2026-10-13',categoryId:'daily'});
  const rows=new Map([[record.id,record]]),calls=[];let online=true,authorized=true,uploadFail=true;
  const store={list:async()=>[...rows.values()],get:async id=>rows.get(id),patch:async(id,revision,patch)=>{const r=rows.get(id);if(r?.cloudSync.revision===revision)rows.set(id,{...r,cloudSync:{...r.cloudSync,...patch}});},revocations:async()=>[],doneRevocation:async()=>{},asset:async()=>({blob:new Blob(['pixels'])}),categories:async()=>[{id:'daily',name:'日常'}]};
  const api={rpc:async(action,payload)=>{calls.push([action,payload]);if(action==='dashboard')return {friends:authorized?[{scope:'all'}]:[]};if(action==='publish_begin')return {id:'remote',mediaId:'photo',publishToken:'token'};return {ok:true};},upload:async()=>{calls.push(['upload']);if(uploadFail){uploadFail=false;throw Error('offline upload');}}};
  const sync=createMomentSync({store,api,auth:{session:{user:{id:'alice'}}},online:()=>online,jpeg:async()=>new Blob(['jpg'],{type:'image/jpeg'}),changed:()=>{},now:()=>Date.now()});
  return {rows,calls,sync,api,store,setOnline:v=>online=v,setAuthorized:v=>authorized=v};
};
test('offline durable sync, one begin across upload retries, no duplicate on repeated runs',async()=>{
  const f=fixture();f.setOnline(false);await f.sync.run();assert.equal(f.calls.length,0);
  f.setOnline(true);await f.sync.run(true);assert.equal(f.rows.get('p1').cloudSync.state,'pending');
  await f.sync.run(true);assert.equal(f.rows.get('p1').cloudSync.state,'synced');
  assert.equal(f.calls.filter(c=>c[0]==='publish_begin').length,1);assert.equal(f.calls.filter(c=>c[0]==='publish_finish').length,1);
  await f.sync.run(true);assert.equal(f.calls.filter(c=>c[0]==='publish_begin').length,1);
});
test('without a directional friend grant, saved moments remain local',async()=>{
  const f=fixture();f.setAuthorized(false);await f.sync.run(true);assert.equal(f.calls.filter(c=>c[0]==='publish_begin').length,0);
});
test('deleted/privatized record during upload cannot finish and is revoked',async()=>{
  for(const kind of ['delete','private']){
    const f=fixture();await f.sync.run(true);
    f.api.upload=async()=>{if(kind==='delete')f.rows.delete('p1');else f.rows.set('p1',{...f.rows.get('p1'),visibility:'self'});};
    await f.sync.run(true);assert.equal(f.calls.filter(c=>c[0]==='publish_finish').length,0);assert.ok(f.calls.some(c=>c[0]==='revoke_local'));
  }
});
test('OCR rejects low confidence, gibberish and repetitions, keeps reliable receipt words',()=>{
  assert.equal(cleanOcr({text:'自拍乱字',confidence:12}), '');
  assert.equal(cleanOcr({text:'没有置信度的未知片段'}), '');
  assert.equal(cleanOcr({confidence:99,text:'???? |||| aaaaaaaa'}),'');
  assert.equal(cleanOcr({words:[{text:'总计',confidence:95},{text:'58.00',confidence:90},{text:'乱',confidence:12}],confidence:80}), '总计 58.00');
  assert.equal(cleanOcr({words:[{text:'ABCABCABCABCABC',confidence:99}],confidence:99}),'');
});

test('pending labels distinguish offline, queued, service failure and expired session',()=>{
 const r=savedMoment({id:'label'});
 assert.equal(syncLabel(r,true),'已保存 · 待同步');
 assert.equal(syncLabel(r,false),'待联网同步');
 r.cloudSync.error='照片服务处理失败';r.cloudSync.errorStatus=502;
 assert.equal(syncLabel(r,true),'同步失败 · 可重试');
 r.cloudSync.errorStatus=401;assert.equal(syncLabel(r,true),'待重新登录');
 r.cloudSync.state='synced';assert.equal(syncLabel(r,false),'已同步');
});
test('upload failure persists stage/status and clears diagnostics after successful retry',async()=>{
 const f=fixture();f.api.upload=async()=>{throw Object.assign(Error('照片服务配置不完整'),{status:503,code:'MEDIA_HTTP_503'});};
 await f.sync.run(true);let q=f.rows.get('p1').cloudSync;
 assert.equal(q.errorStatus,503);assert.equal(q.errorCode,'MEDIA_HTTP_503');assert.equal(q.stage,'upload');
 f.api.upload=async()=>{};await f.sync.run(true);q=f.rows.get('p1').cloudSync;
 assert.equal(q.state,'synced');assert.equal(q.errorStatus,0);assert.equal(q.errorCode,'');
});
test('dashboard failure is visible on queued moments, never uploads or changes synced ones',async()=>{
 const f=fixture();f.rows.set('done',{...savedMoment({id:'done'}),cloudSync:{state:'synced',revision:'done'}});
 f.api.rpc=async()=>{throw Object.assign(Error('登录已过期'),{status:401});};
 await f.sync.run(true);assert.equal(f.rows.get('p1').cloudSync.errorStatus,401);
 assert.equal(f.rows.get('p1').cloudSync.stage,'prepare');assert.equal(f.rows.get('done').cloudSync.state,'synced');
});
