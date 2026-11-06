import {requestScope} from './request-scope.mjs';
/** CloudBase official Auth HTTP API. No independent password/ID issuing system.
 * https://docs.cloudbase.net/http-api/auth/auth-send-verification
 * Authentication is verified by CloudBase, never by decoding a JWT locally.
 */
export function localCloudSpace(uid) {
  if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(uid))throw Error('CloudBase 用户 ID 无效');
  return 'CB'+Array.from(new TextEncoder().encode(uid),b=>b.toString(16).padStart(2,'0')).join('');
}
export function validateCloudConfig(config) {
  if(!/^[A-Za-z0-9-]{3,80}$/.test(config?.envId||''))throw Error('尚未配置 CloudBase 环境 ID');
  try {
    const part=config.publishableKey.split('.')[1];
    const claims=JSON.parse(atob(part.replace(/-/g,'+').replace(/_/g,'/')));
    // This only prevents accidentally packaging privileged configuration.
    // It is not token verification; the cloud gateway remains the authority.
    if(claims.role!=='anon')throw Error('必须使用 Publishable Key，禁止 API Key / service_role');
    if(claims.aud!==config.envId&&claims.project_id!==config.envId)throw Error('公开密钥与环境 ID 不匹配');
  } catch(error) {
    if(error.message.includes('Publishable')||error.message.includes('环境'))throw error;
    throw Error('需要控制台的 Publishable Key（公开密钥）');
  }
  return `https://${config.envId}.api.tcloudbasegateway.com`;
}
export class CloudbaseError extends Error {
  constructor(message,status,code){super(message);this.name='CloudbaseError';this.status=status;this.code=code;}
}
const terminal=error=>error.status===401||['invalid_grant','invalid_refresh_token','refresh_token_expired','token_invalid','unauthenticated','user_not_found'].includes(error.code);

function normalizeEmail(value) {
  if (typeof value !== 'string') throw Error('请输入有效邮箱');
  const email = value.trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw Error('请输入有效邮箱');
  const at = email.lastIndexOf('@');
  // Preserve the local part until the hosted provider's case rules are verified.
  return email.slice(0, at + 1) + email.slice(at + 1).toLowerCase();
}

export function createCloudbaseAuth({config,vault,fetcher=globalThis.fetch,now=Date.now,locks=globalThis.navigator?.locks}) {
  let session=null,offlineSession=null,challenge=null,refreshing=null,generation=0,otpBusy=false;
  const origin=()=>validateCloudConfig(config);
  const lock=work=>locks?.request?locks.request('shiri-auth-'+config.envId,work):work();
  async function request(path,{method='POST',body,token}={}) {
    // Local config/API errors are not proof that the network is offline.
    const url=origin()+'/auth/v1/'+path,scope=requestScope();
    try{
    let response;
    try {response=await fetcher(url,{
      method,cache:'no-store',credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',
      signal:scope.signal,headers:{Accept:'application/json',...(body?{'Content-Type':'application/json'}:{}),...(token?{Authorization:'Bearer '+token}:{})},
      ...(body?{body:JSON.stringify(body)}:{})
    });} catch(error) {
      if(error instanceof CloudbaseError)throw error;
      throw new CloudbaseError(scope.timedOut||error.name==='TimeoutError'?'认证请求超时，请重试':'无法连接 CloudBase 认证服务，请切换网络重试；若浏览器能访问测试地址，请检查系统 WebView 或认证接口跨域配置。',0,'network_error');
    }
    let data;try{data=await response.json();}catch{
      // A known server rejection remains authoritative even if its body stalls.
      const timeout=scope.timedOut&&response.ok;
      throw new CloudbaseError(timeout?'认证请求超时，请重试':'认证服务返回格式异常',timeout?0:response.status,timeout?'network_error':'bad_response');
    }
    if(!response.ok||data.error){
      const code=typeof data.error==='string'?data.error:String(data.error_code||'auth_error');
      const verificationMessages = {
        invalid_verification_code: '验证码错误，请核对当前邮箱收到的验证码。',
        verification_expired: '验证码已过期，请重新发送。',
        verification_code_expired: '验证码已过期，请重新发送。',
        verification_token_expired: '验证凭据已过期，请重新发送验证码。',
      };
      const message=code.includes('captcha')?'CloudBase 要求人机图形验证，请通过已配置的官方登录页完成验证；入口未配置时请联系开发者。':
        response.status===429||['rate_limit_exceeded','resource_exhausted'].includes(code)?'操作太频繁，请稍后再试。':
        verificationMessages[code]||data.error_description||data.message||'认证未完成，请重试';
      throw new CloudbaseError(message,response.status,code);
    }
    return data;
    }finally{scope.dispose();}
  }
  function tokenSession(tokens,user) {
    if(!tokens.access_token||!tokens.refresh_token||!Number.isFinite(Number(tokens.expires_in))||Number(tokens.expires_in)<=0)throw Error('CloudBase 未返回完整会话');
    localCloudSpace(user.id);
    return {envId:config.envId,accessToken:tokens.access_token,refreshToken:tokens.refresh_token,expiresAt:now()+Number(tokens.expires_in)*1000,user};
  }
  async function profile(token) {
    const data=await request('user/me',{method:'GET',token});
    if(data.sub==='anon'||data.is_anonymous===true||data.groups?.some(g=>g.id==='anonymous'))throw new CloudbaseError('匿名凭证不是邮箱登录会话',403,'unauthenticated');
    localCloudSpace(data.sub);
    if(data.status&&data.status!=='ACTIVE')throw new CloudbaseError('账号当前不可用',401,'account_disabled');
    return {id:data.sub,nickname:data.nickName||data.nickname||data.name||'拾日用户',email:data.email||''};
  }
  async function refresh(force=false) {
    if(refreshing)return refreshing;
    const run=generation;
    refreshing=lock(async()=>{
      const stored=await vault.get();
      if(!stored||stored.envId!==config.envId)throw new CloudbaseError('请先登录邮箱账号',401,'no_session');
      if(!force&&stored.expiresAt>now()+60000){if(run===generation)session=stored;return stored.accessToken;}
      try {
        // Refresh is a PUBLIC auth endpoint: never attach an expired bearer.
        const tokens=await request('token',{body:{grant_type:'refresh_token',refresh_token:stored.refreshToken}});
        if(tokens.sub&&tokens.sub!==stored.user.id)throw new CloudbaseError('会话身份不匹配，请重新登录',401,'token_invalid');
        const next=tokenSession(tokens,stored.user);
        if(run!==generation)throw Error('登录状态已改变，请重试');
        // Save the rotated refresh token before further requests; old token is invalid.
        await vault.set(next);session=next;return next.accessToken;
      } catch(error) {if(terminal(error)&&run===generation){session=null;offlineSession=null;await vault.clear();}throw error;}
    }).finally(()=>{refreshing=null;});
    return refreshing;
  }
  return {
    get configured(){try{origin();return true;}catch{return false;}},
    get session(){return offlineSession?null:session;},
    // Local access never substitutes for authenticated cloud access.
    get localSession(){return offlineSession||session;},
    get offline(){return !!offlineSession;},
    async sendCode(email) {
      email = normalizeEmail(email);
      if (otpBusy) throw Error('邮箱验证正在处理中，请稍候。');
      if(challenge&&now()<challenge.resendAt)throw Error('验证码已发送，请稍后再重新发送');
      otpBusy = true;
      const run = generation;
      try {
        const data = await request('verification', {body: {email, target: 'ANY'}});
        if (run !== generation) throw Error('登录状态已改变，请重新发送验证码。');
        // Only explicit is_user=true selects signin, as specified by CloudBase.
        if (!data.verification_id || (data.is_user != null && typeof data.is_user !== 'boolean')) {
          throw Error('验证码服务未返回有效挑战');
        }
        challenge = {
          email, id: data.verification_id, isUser: data.is_user === true,
          expiresAt: now() + Number(data.expires_in || 600) * 1000,
          resendAt: now() + 60000,
        };
        return {email, expiresAt: challenge.expiresAt};
      } finally {
        otpBusy = false;
      }
    },
    async verifyCode(code) {
      if (otpBusy) throw Error('邮箱验证正在处理中，请稍候。');
      const current=challenge,run=generation;
      if(!current||current.expiresAt<=now())throw Error('请重新发送邮箱验证码');
      if(!/^\d{4,8}$/.test(code))throw Error('请输入邮箱收到的验证码');
      otpBusy = true;
      try {
        const verified = await request('verification/verify', {body: {verification_id: current.id, verification_code: code}});
        if (run !== generation) throw Error('登录状态已改变，请重新发送验证码。');
        if (!verified.verification_token) throw Error('验证码服务未返回验证凭据');
        challenge = null;
        const tokens = await request(current.isUser ? 'signin' : 'signup', {
          body: {...(current.isUser ? {} : {email: current.email}), verification_token: verified.verification_token},
        });
        if (run !== generation) throw Error('登录状态已改变，请重新发送验证码。');
        const user = await profile(tokens.access_token);
        if (tokens.sub && tokens.sub !== user.id) throw Error('CloudBase 会话与用户不匹配');
        const next = tokenSession(tokens, user);
        await lock(async () => {
          if (run !== generation) throw Error('登录状态已改变');
          await vault.set(next);
          session = next;
          offlineSession = null;
        });
        return next;
      } finally {
        otpBusy = false;
      }
    },
    async restore({allowOffline=false}={}) {
      origin();
      const saved=await vault.get();if(!saved||saved.envId!==config.envId){session=null;offlineSession=null;return null;}
      const run=generation;let rejected=false;
      try {
        let token=await refresh();let user;
        try{user=await profile(token);}catch(error){if(error.status!==401)throw error;rejected=true;token=await refresh(true);user=await profile(token);}
        if(run!==generation)return null;
        if(user.id!==session.user.id)throw new CloudbaseError('会话身份不匹配',401,'token_invalid');
        session={...session,user};offlineSession=null;return session;
      } catch(error){
        if(run!==generation)return null;
        session=null;offlineSession=null;
        if(terminal(error)||rejected)await lock(()=>vault.clear());
        else if(allowOffline&&error.code==='network_error'&&saved.user?.id!=='anon'&&saved.user?.email&&saved.accessToken&&saved.refreshToken&&Number.isFinite(saved.expiresAt)){
          localCloudSpace(saved.user.id);
          // Vault sessions originate from official user/me verification, never a local login flag.
          offlineSession=saved;return saved;
        }
        throw error;
      }
    },
    async updateNickname(value) {
      if(!session)throw new CloudbaseError('请先登录邮箱账号',401,'no_session');
      const nickname=typeof value==='string'?value.trim().normalize('NFC'):'';
      const length=Array.from(nickname).length;
      if(length<2||length>48||/[\u0000-\u001f\u007f]/.test(nickname))throw Error('昵称需要 2–48 个字，不能包含换行或控制字符');
      const run=generation,uid=session.user.id;
      let token=await refresh();
      if(run!==generation)throw Error('登录状态已改变，请重试');
      try {await request('user/basic/edit',{body:{nickname},token});}
      catch(error){if(error.status!==401)throw error;token=await refresh(true);if(run!==generation)throw Error('登录状态已改变，请重试');await request('user/basic/edit',{body:{nickname},token});}
      if(run!==generation)throw Error('登录状态已改变，请重试');
      // Only a confirmed server profile may become the displayed/persisted name.
      let user;
      try{user=await profile(token);}catch(error){if(error.status!==401)throw error;token=await refresh(true);user=await profile(token);}
      if(user.id!==uid)throw new CloudbaseError('会话身份不匹配，请重新登录',401,'token_invalid');
      if(user.nickname!==nickname)throw Error('改名已提交，但云端尚未确认新昵称，请刷新会话后查看');
      await lock(async()=>{
        const latest=await vault.get();
        if(run!==generation||!latest||latest.envId!==config.envId||latest.user.id!==uid)throw Error('登录状态已改变，请重试');
        const next={...latest,user};await vault.set(next);session=next;
      });
      return user;
    },
    accessToken:()=>offlineSession?Promise.reject(new CloudbaseError('请联网恢复登录后再同步',0,'network_error')):refresh(),
    refresh:()=>refresh(true),
    async logout({localOnly=false}={}) {
      if(!localOnly){const token=await refresh();await request('user/signout',{body:{},token});}
      generation++;challenge=null;
      // Wait for pending rotation before clearing, preventing late writes after logout.
      await lock(async()=>{await vault.clear();session=null;offlineSession=null;});
    },
  };
}
