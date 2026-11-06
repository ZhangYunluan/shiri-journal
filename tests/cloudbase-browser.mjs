import {createAuthVault} from '../src/auth-vault.mjs';
import {createCloudbaseAuth,localCloudSpace} from '../src/cloudbase-auth.mjs';
import {databaseName} from '../src/space.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Dedicated synthetic test origin required');
const out=document.querySelector('#results');out.textContent='';let count=0;
const assert=(value,label)=>{if(!value)throw Error(label);count++;out.textContent+='PASS · '+label+'\n';};
try{
  const vault=createAuthVault();await vault.clear();
  const publicKey='e30.'+btoa(JSON.stringify({role:'anon',aud:'test-environment'}))+'.synthetic';
  const config={envId:'test-environment',publishableKey:publicKey};
  let calls=0;
  // This fixture cannot reach CloudBase: all responses are explicit synthetic data.
  const fetcher=async(url,options)=>{
    const path=new URL(url).pathname;calls++;
    if(path.endsWith('/verification'))return Response.json({verification_id:'test',expires_in:600});
    if(path.endsWith('/verification/verify'))return Response.json({verification_token:'test-verified'});
    if(path.endsWith('/signup'))return Response.json({access_token:'synthetic-access',refresh_token:'synthetic-refresh',expires_in:7200,sub:'test-user'});
    if(path.endsWith('/user/me'))return Response.json({sub:'test-user',email:'synthetic@example.invalid'});
    if(path.endsWith('/signout'))return Response.json({});
    throw Error('Unexpected synthetic route');
  };
  const auth=createCloudbaseAuth({config,vault,fetcher});
  await auth.sendCode('synthetic@example.invalid');await auth.verifyCode('123456');
  assert(auth.session.user.id==='test-user','身份来自认证响应 sub，未生成第二套用户 ID');
  assert((await vault.get()).refreshToken==='synthetic-refresh','浏览器 IndexedDB 会话已持久化');
  assert(!localStorage.getItem('shiri-cloudbase-session'),'凭据未写入 localStorage');
  const restored=createCloudbaseAuth({config,vault:createAuthVault(),fetcher});await restored.restore();
  assert(restored.session.user.id==='test-user','新实例恢复会话并重新请求用户接口');
  const storage=value=>({getItem:()=>value});
  assert(databaseName(storage(null))==='shiri-life-v1','访客历史数据库名不变');
  assert(databaseName(storage(localCloudSpace('test-user')))!==databaseName(storage(localCloudSpace('other-user'))),'两个云端 UID 使用隔离的日记数据库');
  assert(databaseName(storage('SR000000000001'))==='shiri-life-v1-SR000000000001','旧 ID 本地数据仍使用原名称');
  await restored.logout();assert(await vault.get()===null,'退出清除认证库会话');
  assert(calls===6,'测试仅走预期合成认证请求');
  out.textContent+='DONE · '+count+' assertions passed\n';
}catch(error){out.textContent+='FAIL · '+error.stack;}
