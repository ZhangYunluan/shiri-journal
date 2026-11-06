import test from 'node:test';
import assert from 'node:assert/strict';
test('old WebView can fetch authorized friend data and private photos without static abort helpers',async()=>{
 const descriptor=Object.getOwnPropertyDescriptor(AbortSignal,'timeout');Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});
 try{
  const auth={session:{user:{id:'user'}},accessToken:async()=>'user-access-token',refresh:async()=>{}};
  const api=createSocialApi({auth,config,mediaUrl:'https://media.example.invalid/shiri-media',fetcher:async(url,options)=>{
   assert.equal(options.headers.Authorization,'Bearer user-access-token');assert.ok(options.signal instanceof AbortSignal);
   return url.includes('/rpc/')?Response.json({records:[]}):new Response(new Blob(['synthetic JPEG'],{type:'image/jpeg'}));
  }});
  assert.deepEqual(await api.rpc('feed'),{records:[]});assert.equal((await api.photo('11111111-1111-4111-8111-111111111111')).type,'image/jpeg');
 }finally{Object.defineProperty(AbortSignal,'timeout',descriptor);}
});
import {createSocialApi,shareProjection} from '../src/cloudbase-social-api.mjs';
const config={envId:'shiri-test',publishableKey:'e30.'+Buffer.from(JSON.stringify({role:'anon',aud:'shiri-test'})).toString('base64url')+'.public'};
test('RPC uses current user token, refreshes once, and sends no caller UID',async()=>{
  let token='old',refreshes=0;const calls=[];
  const auth={session:{user:{id:'user'}},accessToken:async()=>token,refresh:async()=>{token='new';refreshes++;}};
  const api=createSocialApi({auth,config,fetcher:async(url,opts)=>{calls.push({url,opts});return opts.headers.Authorization==='Bearer old'?Response.json({}, {status:401}):Response.json({ok:true});}});
  assert.deepEqual(await api.rpc('request',{id:'friend'}),{ok:true});assert.equal(refreshes,1);
  assert.equal(calls[1].url,'https://shiri-test.api.tcloudbasegateway.com/v1/rdb/rest/rpc/shiri_social');
  assert.deepEqual(JSON.parse(calls[1].opts.body),{p_action:'request',p_payload:{id:'friend'}});
});
test('unavailable backend, logged-out user, and late response never appear successful',async()=>{
  const auth={session:null};let calls=0;
  let api=createSocialApi({auth,config,fetcher:async()=>{calls++;return Response.json({});}});
  await assert.rejects(()=>api.rpc('feed'),/登录/);assert.equal(calls,0);
  auth.session={user:{id:'user'}};auth.accessToken=async()=>'token';
  api=createSocialApi({auth,config,fetcher:async()=>Response.json({code:'PGRST202'},{status:404})});
  await assert.rejects(()=>api.rpc('feed'),/部署/);
  api=createSocialApi({auth,config,fetcher:async()=>{auth.session=null;return Response.json({records:[]});}});
  await assert.rejects(()=>api.rpc('feed'),/登录状态/);
});
test('sharing explicit allowlist excludes private fields and rejects unconfirmed materials',()=>{
  const r={id:'local',title:'散步',date:'2026-10-11',note:'看到晚霞',categoryId:'daily',status:'confirmed',assetId:'private',location:'家庭住址',amount:200,weight:70,tags:['隐私'],shareApproved:true};
  const p=shareProjection(r,{name:'日常'},{photo:true});
  assert.deepEqual(p,{localId:'local',kind:'record',title:'散步',note:'看到晚霞',date:'2026-10-11',categoryId:'daily',categoryName:'日常',confirmed:true,photo:true});
  assert.throws(()=>shareProjection({...r,status:'review'},{name:'日常'}),/确认/);
  assert.throws(()=>shareProjection({...r,note:'字'.repeat(4001)},{name:'日常'}),/4000/);
});

test('photo upload keeps actionable HTTP status; CORS/network failures are not claimed as offline',async()=>{
 const auth={session:{user:{id:'user'}},accessToken:async()=>'token',refresh:async()=>{}};
 for(const status of [401,403,404,413,415,429,502,503,0]){
   const api=createSocialApi({auth,config,mediaUrl:'https://media.example.invalid/shiri-media',xhrFactory:()=>({upload:{},open(){},setRequestHeader(){},send(){this.status=status;queueMicrotask(()=>status?this.onload():this.onerror());}})});
   await assert.rejects(()=>api.upload('11111111-1111-4111-8111-111111111111',new Blob(['test'],{type:'image/jpeg'})),e=>{
     assert.equal(e.status,status);assert.equal(e.code,status?'MEDIA_HTTP_'+status:'MEDIA_CONNECTION');
     assert.match(e.message,status?new RegExp('HTTP '+status):/网络或跨域/);assert.doesNotMatch(e.message,/重新发布/);return true;
   });
 }
});
