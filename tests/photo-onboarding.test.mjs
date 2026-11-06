import test from 'node:test';
import assert from 'node:assert/strict';
import {createPhotoAccess} from '../src/photo-onboarding.mjs';
import {resolveCaptureLocation} from '../src/photo-metadata.mjs';
const storage=()=>{const data=new Map();return {getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
test('first Android visit is offered once per local account; skip and existing grants persist',async()=>{
 const store=storage();let owner='CB61',permission='none';
 const make=()=>createPhotoAccess({storage:store,owner:()=>owner,native:{platform:'android',photos:{status:async()=>({permission})}}});
 assert.equal(await make().needed(),true);make().remember('skipped');assert.equal(await make().needed(),false);
 owner='CB62';assert.equal(await make().needed(),true);permission='partial';assert.equal(await make().needed(),false);permission='none';assert.equal(await make().needed(),false);
 assert.equal(await createPhotoAccess({storage:store,owner:()=>owner,native:{platform:'ios'}}).needed(),false);
});
test('permission grant is verified before enabling; denial cannot configure collection',async()=>{
 for(const permission of ['none','partial','full']){
  let configured=0,permissionNow='none';
  const photos={status:async()=>({permission:permissionNow,enabled:configured>0}),authorize:async()=>{permissionNow=permission;return {permission:'full'};},configure:async()=>{configured++;}};
  const flow=createPhotoAccess({storage:storage(),owner:()=> 'CB61',native:{platform:'android',photos}});
  assert.equal((await flow.enable('22:00')).permission,permission);assert.equal(configured,permission==='none'?0:1);
 }
});
test('metadata fills review candidates only; no prompt/current location or overwrite of saved/user locations',async()=>{
 const calls=[],photos={location:async args=>{calls.push(args);return {available:true,latitude:31.2,longitude:121.5};}};
 const record={id:'native:source',source:'native-auto',status:'review',location:''};
 assert.equal(await resolveCaptureLocation(record,{},photos),'拍摄坐标：31.200000, 121.500000');assert.deepEqual(calls,[{id:'source',requestPermission:false}]);
 for(const r of [{...record,status:'confirmed'},{...record,location:'家'},{...record,source:'photo'}])assert.equal(await resolveCaptureLocation(r,{},photos),'');
 assert.equal(calls.length,1);
 assert.equal(await resolveCaptureLocation(record,{}, {location:async()=>({available:false,latitude:1,longitude:1})}), '');
 assert.equal(await resolveCaptureLocation(record,{}, {location:async()=>{throw Error('no permission')}}),'');
});
test('configuration failure is never reported as enabled, and permission errors do not block the app',async()=>{
 const flow=createPhotoAccess({storage:storage(),owner:()=> 'CB61',native:{photos:{authorize:async()=>{},status:async()=>({permission:'full',enabled:false}),configure:async()=>({ok:true})}}});
 await assert.rejects(flow.enable(),/尚未确认开启/);assert.equal(flow.requesting,false);
 assert.equal(await createPhotoAccess({native:{photos:{status:async()=>{throw Error('unavailable')}}},storage:storage()}).needed(),false);
});
