import test from 'node:test';
import assert from 'node:assert/strict';
import {createCloudbaseAuth,localCloudSpace,validateCloudConfig} from '../src/cloudbase-auth.mjs';

test('older WebViews without AbortSignal static helpers can really send and restore auth requests',async()=>{
 const timeout=Object.getOwnPropertyDescriptor(AbortSignal,'timeout'),any=Object.getOwnPropertyDescriptor(AbortSignal,'any');
 Object.defineProperty(AbortSignal,'timeout',{value:undefined,configurable:true});Object.defineProperty(AbortSignal,'any',{value:undefined,configurable:true});
 try{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');assert.equal(f.calls.length,1);
  await f.auth.verifyCode('123456');await f.auth.restore();assert.equal(f.auth.session.user.id,'cloud-user-1');
  assert.ok(f.calls.some(c=>c.path.endsWith('/user/me')));assert.equal(f.auth.offline,false);
 }finally{Object.defineProperty(AbortSignal,'timeout',timeout);Object.defineProperty(AbortSignal,'any',any);}
});
test('bad packaged configuration is never disguised as a network failure',async()=>{
 const auth=createCloudbaseAuth({config:{...config,envId:''},vault:fixture().vault,fetcher:async()=>{throw Error('must not fetch');}});
 await assert.rejects(auth.sendCode('one@example.cn'),/环境 ID/);
});
test('a received 401 cannot unlock offline records even when its body times out',async t=>{
 const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
 t.mock.timers.enable({apis:['setTimeout']});
 const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async()=>({ok:false,status:401,json:async()=>{t.mock.timers.tick(20001);throw Error('body aborted');}})});
 await assert.rejects(auth.restore({allowOffline:true}));assert.equal(auth.localSession,null);assert.equal(f.saved.size,0);
});

test('offline access requires a previously verified vault session and never supplies cloud credentials',async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  const offline=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async()=>{throw new TypeError('offline');}});
  const restored=await offline.restore({allowOffline:true});
  assert.equal(restored.user.id,'cloud-user-1');assert.equal(offline.localSession.user.id,'cloud-user-1');
  assert.equal(offline.session,null);assert.equal(offline.offline,true);
  await assert.rejects(()=>offline.accessToken(),/联网/);
  await offline.logout({localOnly:true});assert.equal(offline.localSession,null);
  assert.equal(await offline.restore({allowOffline:true}),null);
});

test('server-rejected session cannot fall back to offline access',async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async()=>Response.json({error:'invalid_refresh_token'},{status:401})});
  await assert.rejects(()=>auth.restore({allowOffline:true}));assert.equal(auth.localSession,null);assert.equal(f.saved.size,0);
});

test('a failed network request after explicit profile rejection does not unlock offline records',async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  let tokens=0;
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async url=>{
    if(url.endsWith('/token')&&++tokens===1)return Response.json({access_token:'refreshed',refresh_token:'rotated',expires_in:7200});
    if(url.endsWith('/user/me'))return Response.json({error:'unauthenticated'},{status:401});
    throw new TypeError('offline');
  }});
  await assert.rejects(()=>auth.restore({allowOffline:true}));assert.equal(auth.localSession,null);
});

const key=claims=>['e30',Buffer.from(JSON.stringify(claims)).toString('base64url'),'public'].join('.');
const config={envId:'shiri-dev-real-id',publishableKey:key({role:'anon',aud:'shiri-dev-real-id'})};
function fixture({existing=false,invalid=false,omitIsUser=false,editDenied=false,editNoop=false}={}){
  const calls=[],saved=new Map();let clock=1000,refreshes=0,nickname='拾日用户';
  const vault={get:async()=>saved.get('session')||null,set:async s=>saved.set('session',s),clear:async()=>saved.clear()};
  const request=async(url,options)=>{
    const path=new URL(url).pathname,body=options.body?JSON.parse(options.body):null;calls.push({path,body,headers:options.headers,method:options.method});
    if(path.endsWith('/verification'))return Response.json({verification_id:'challenge',...(omitIsUser?{}:{is_user:existing}),expires_in:600});
    if(path.endsWith('/verification/verify'))return invalid?Response.json({error:'invalid_verification_code',error_description:'验证码错误'},{status:400}):Response.json({verification_token:'verified'});
    if(path.endsWith('/signin')||path.endsWith('/signup'))return Response.json({access_token:'token1',refresh_token:'refresh1',expires_in:20,sub:'cloud-user-1'});
    if(path.endsWith('/token')){refreshes++;return Response.json({access_token:'token2',refresh_token:'refresh2',expires_in:7200,sub:'cloud-user-1'});}
    if(path.endsWith('/user/basic/edit')){
      if(editDenied)return Response.json({error:'permission_denied',error_description:'拒绝修改'},{status:403});
      if(!editNoop)nickname=body.nickname;return Response.json({});
    }
    if(path.endsWith('/user/me'))return Response.json({sub:'cloud-user-1',email:'one@example.cn',name:'旧的登录名',nickName:nickname});
    if(path.endsWith('/signout'))return Response.json({});
    throw Error('Unexpected path '+path);
  };
  return {auth:createCloudbaseAuth({config,vault,fetcher:request,now:()=>clock}),request,vault,calls,saved,setClock:v=>clock=v,getRefreshes:()=>refreshes};
}

test('nickname edit uses official bearer endpoint and preserves verified UID and diary namespace',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  const before=f.auth.session.user.id,space=localCloudSpace(before);
  const user=await f.auth.updateNickname('  拾光旅人  ');
  assert.equal(user.nickname,'拾光旅人');assert.equal(user.id,before);assert.equal(localCloudSpace(user.id),space);
  const edit=f.calls.find(c=>c.path.endsWith('/user/basic/edit'));
  assert.equal(edit.method,'POST');assert.deepEqual(edit.body,{nickname:'拾光旅人'});
  assert.equal(edit.headers.Authorization,'Bearer token2');
  assert.equal(f.saved.get('session').user.nickname,'拾光旅人');
  await f.auth.restore();assert.equal(f.auth.session.user.nickname,'拾光旅人');
});
test('invalid nickname and logged-out edits issue no mutation request',async()=>{
  const f=fixture();await assert.rejects(()=>f.auth.updateNickname('旅人'),/登录/);
  await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  for(const nickname of ['', ' ', '单', '名'.repeat(49), '昵称\n换行'])await assert.rejects(()=>f.auth.updateNickname(nickname),/昵称/);
  assert.ok(!f.calls.some(c=>c.path.endsWith('/user/basic/edit')));
});
test('failed nickname edit keeps the verified old name instead of pretending success',async()=>{
  const f=fixture({editDenied:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  await assert.rejects(()=>f.auth.updateNickname('新昵称'),/拒绝/);
  assert.equal(f.auth.session.user.nickname,'拾日用户');assert.equal(f.saved.get('session').user.nickname,'拾日用户');
});
test('nickname is not reported saved if server still returns the old profile',async()=>{
  const f=fixture({editNoop:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  await assert.rejects(()=>f.auth.updateNickname('新昵称'),/尚未确认/);
  assert.equal(f.auth.session.user.nickname,'拾日用户');assert.equal(f.saved.get('session').user.nickname,'拾日用户');
});
test('nickname edit cannot replace the current account with another profile UID',async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');let edited=false;
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async(url,options)=>{
    if(url.endsWith('/user/basic/edit'))edited=true;
    if(edited&&url.endsWith('/user/me'))return Response.json({sub:'different-user',nickName:'新昵称'});
    return f.request(url,options);
  }});
  await auth.restore();await assert.rejects(()=>auth.updateNickname('新昵称'),/身份不匹配/);
  assert.equal(f.saved.get('session').user.id,'cloud-user-1');assert.equal(auth.session.user.id,'cloud-user-1');
});
test('logout while nickname update waits cannot restore credentials',{timeout:10000},async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  let release,started;const pending=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async(url,options)=>{
    if(url.endsWith('/user/basic/edit')){started();await pending;return Response.json({});}
    return f.request(url,options);
  }});
  await auth.restore();const updating=auth.updateNickname('新昵称');const rejected=assert.rejects(()=>updating,/改变/);
  await ready;await auth.logout({localOnly:true});release();await rejected;
  assert.equal(auth.session,null);assert.equal(f.saved.size,0);
});
test('configuration rejects service-role keys and non-matching environment',()=>{
  assert.throws(()=>validateCloudConfig({...config,publishableKey:key({role:'service_role',aud:config.envId})}),/Publishable/);
  assert.throws(()=>validateCloudConfig({...config,publishableKey:key({role:'anon',aud:'different'})}),/环境/);
});
test('CloudBase signup follows email OTP, verified sub is stable, no password account',async()=>{
  const f=fixture();await f.auth.sendCode('one@example.cn');const s=await f.auth.verifyCode('123456');
  assert.equal(s.user.id,'cloud-user-1');assert.ok(f.calls.some(c=>c.path.endsWith('/signup')));
  assert.deepEqual(f.calls.find(c=>c.path.endsWith('/signup')).body,{email:'one@example.cn',verification_token:'verified'});
  assert.ok(f.saved.get('session').refreshToken);assert.equal(f.calls[0].headers.Authorization,undefined);
});
test('existing email signs in rather than creates a second account',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  assert.ok(f.calls.some(c=>c.path.endsWith('/signin')));assert.ok(!f.calls.some(c=>c.path.endsWith('/signup')));
});
test('new email with omitted optional is_user accepts challenge and follows verified signup',async()=>{
  const f=fixture({omitIsUser:true});
  const challenge=await f.auth.sendCode('one@example.cn');
  assert.equal(challenge.email,'one@example.cn');assert.equal(f.auth.session,null);
  await f.auth.verifyCode('123456');
  assert.ok(f.calls.some(c=>c.path.endsWith('/signup')));
  assert.ok(!f.calls.some(c=>c.path.endsWith('/signin')));
  assert.equal(f.auth.session.user.id,'cloud-user-1');
});
test('malformed challenge never becomes ready for verification or stores a login',async()=>{
  for(const data of [{expires_in:600},{verification_id:'challenge',is_user:'true',expires_in:600}]){
    const f=fixture();let calls=0;
    const auth=createCloudbaseAuth({config,vault:f.vault,fetcher:async()=>{calls++;return Response.json(data);}});
    await assert.rejects(()=>auth.sendCode('one@example.cn'),/挑战/);
    await assert.rejects(()=>auth.verifyCode('123456'),/重新发送/);
    assert.equal(calls,1);assert.equal(f.saved.size,0);assert.equal(auth.session,null);
  }
});
test('invalid OTP cannot create a stored session; verification remains retryable',async()=>{
  const f=fixture({invalid:true});await f.auth.sendCode('one@example.cn');await assert.rejects(()=>f.auth.verifyCode('000000'),/验证码/);
  assert.equal(f.saved.size,0);assert.equal(f.auth.session,null);
});
test('refresh is single-flight, rotates persisted token and does not send expired bearer',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');f.setClock(100000);
  const tokens=await Promise.all([f.auth.accessToken(),f.auth.accessToken(),f.auth.accessToken()]);assert.deepEqual(tokens,['token2','token2','token2']);
  assert.equal(f.getRefreshes(),1);assert.equal(f.saved.get('session').refreshToken,'refresh2');assert.equal(f.calls.find(c=>c.path.endsWith('/token')).headers.Authorization,undefined);
});
test('reload restores and revalidates real profile; logout removes only authentication',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  assert.equal((await f.auth.restore()).user.id,'cloud-user-1');await f.auth.logout();assert.equal(f.saved.size,0);assert.equal(f.auth.session,null);
  assert.ok(f.calls.some(c=>c.path.endsWith('/signout')));
});
test('namespace supports opaque CloudBase UIDs without changing legacy namespaces',()=>{
  assert.equal(localCloudSpace('cloud-user-1'),'CB636c6f75642d757365722d31');
  assert.throws(()=>localCloudSpace(''),/ID/);assert.throws(()=>localCloudSpace('../../bad'),/ID/);
});
test('a Publishable Key profile is anonymous and can never count as an email login',async()=>{
  const saved={envId:config.envId,accessToken:config.publishableKey,refreshToken:'invalid',expiresAt:Date.now()+7200000,user:{id:'anon'}};
  const vault={get:async()=>saved,set:async()=>{},clear:async()=>{}};
  const auth=createCloudbaseAuth({config,vault,fetcher:async()=>Response.json({sub:'anon',name:'anonymous',groups:[{id:'anonymous'}]})});
  await assert.rejects(()=>auth.restore(),/匿名/);assert.equal(auth.session,null);
});
test('offline restore preserves stored session but never reports a verified login',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>1000,fetcher:async()=>{throw Error('offline');}});
  await assert.rejects(()=>auth.restore(),/无法连接/);assert.equal(auth.session,null);assert.equal(f.saved.get('session').refreshToken,'refresh1');
});
test('invalid refresh is terminal and removes credentials without touching diary storage',async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>100000,fetcher:async()=>Response.json({error:'invalid_grant',error_description:'会话已失效'},{status:400})});
  await assert.rejects(()=>auth.restore(),/会话/);assert.equal(auth.session,null);assert.equal(f.saved.size,0);
});
test('logout during a delayed refresh cannot resurrect a session',{timeout:10000},async()=>{
  const f=fixture({existing:true});await f.auth.sendCode('one@example.cn');await f.auth.verifyCode('123456');
  let release,started;const pending=new Promise(resolve=>{release=resolve;}),ready=new Promise(resolve=>{started=resolve;});
  const auth=createCloudbaseAuth({config,vault:f.vault,now:()=>100000,fetcher:async()=>{started();await pending;return Response.json({access_token:'late',refresh_token:'late-refresh',expires_in:7200,sub:'cloud-user-1'});}});
  const rotating=auth.refresh();const rejected=assert.rejects(()=>rotating,/改变/);await ready;const leaving=auth.logout({localOnly:true});release();await leaving;await rejected;
  assert.equal(f.saved.size,0);assert.equal(auth.session,null);
});
