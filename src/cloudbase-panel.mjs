import {CLOUDBASE} from './cloudbase-config.mjs';
import {createCloudbaseAuth,localCloudSpace} from './cloudbase-auth.mjs';
import {createAuthVault} from './auth-vault.mjs';
import {spaceId} from './space.mjs';
import {esc} from './ui.mjs';
import {createSocialApi} from './cloudbase-social-api.mjs';
import {createFriends} from './cloudbase-friends.mjs';
import * as db from './db.mjs';
import {makeFriendNote,NOTE_PREFIX} from './life-calendar.mjs';
import {createMomentSync} from './moment-sync.mjs';

/** Reuses the existing friends route; local diary UI and data are unaffected. */
export function createSocial({getData,toast,confirm,redraw,changed=()=>{},isBusy=()=>false}){
  const auth=createCloudbaseAuth({config:CLOUDBASE,vault:createAuthVault()});
  const api=createSocialApi({auth,config:CLOUDBASE});
  const sync=createMomentSync({auth,api,changed:()=>changed(),store:{
    list:async()=>(await db.readAll()).records,get:id=>db.get('records',id),asset:id=>db.get('assets',id),categories:async()=>getData().categories,
    patch:db.patchSync,revocations:async()=>((await db.get('settings','moment-revocations'))?.ids||[]).map(id=>({id})),doneRevocation:id=>db.editRevocations(id,false)
  }});
  const shareLedger=new Set(getData?.()?.settings?.find(row=>row.id==='cloudbase-share-ledger')?.localIds||[]);
  const friends=getData?createFriends({auth,api,getData,toast,confirm,redraw,onGrant:()=>sync.run(true),
    saveNote:async(id,note)=>{
      const row=makeFriendNote(id,note),data=getData();
      if(row)await db.put('settings',row);else await db.remove('settings',NOTE_PREFIX+id);
      data.settings=data.settings.filter(s=>s.id!==NOTE_PREFIX+id);if(row)data.settings.push(row);
    },
    rememberShare:async id=>{
      // Data loads after this controller is constructed; preserve the persisted ledger.
      for(const known of getData?.()?.settings?.find(row=>row.id==='cloudbase-share-ledger')?.localIds||[])shareLedger.add(known);
      shareLedger.add(id);await db.put('settings',{id:'cloudbase-share-ledger',localIds:[...shareLedger]});
    }}):null;
  let restoring=true,busy=false,message='',email='',challenge=false,editingName=false,nicknameDraft='',restoreFlight,accessVerified=false;
  const canUseLocal=()=>accessVerified&&!!auth.localSession&&localCloudSpace(auth.localSession.user.id)===spaceId();
  const loginHeading='<div class="page-heading"><div><div class="eyebrow">拾日 · 私人生活日志</div><h1>登录，拾起自己的日常</h1><p>先用邮箱登录，再开始记录与复盘。已登录后可离线记录。</p></div></div>';
  const heading='<div class="page-heading"><div><div class="eyebrow">CLOSE, AT YOUR PACE</div><h1>好友近况</h1></div></div>';
  const privacy='<div class="notice">新保存的片刻在好友授权后自动同步。仅自己可见的片刻、私人日记、未审核照片和复盘报告保留本机。双方分别设置一次开放范围，之后无需逐条分享。访客和旧 ID 的记录保留。</div>';
  function accountPanel(){
    if(!auth.configured)return heading+'<section class="panel settings-section"><h2>CloudBase 连接尚未配置</h2><p>需要 shiri-dev 的实际环境 ID 和 Publishable Key。应用不会使用模拟账号冒充登录成功。</p><p>连接恢复并登录后即可继续使用，本地记录仍保留。</p><a class="button" href="docs/cloudbase-deployment.md">查看接入说明</a></section>'+privacy;
    if(restoring)return heading+'<section class="panel settings-section"><p role="status">正在验证 CloudBase 登录状态…</p></section>'+privacy;
    if(auth.offline)return heading+`<section class="panel settings-section"><h2>${esc(auth.localSession.user.nickname)}</h2><p role="status">离线记录模式：你已登录过此账号。本机记录可继续使用，好友和云端同步需联网验证。</p><div class="settings-buttons"><button class="button" data-cloud-auth="restore">联网恢复登录</button><button class="button" data-cloud-auth="logout">退出登录</button></div><p class="muted">${esc(message)}</p></section>`+privacy;
    if(auth.session)return heading+`<details class="panel settings-section account-details" ${editingName?'open':''}><summary>${esc(auth.session.user.nickname)} · 账号与昵称</summary><div class="settings-buttons"><button class="button ghost" data-cloud-auth="edit-name">修改昵称</button></div>${editingName?`<form data-cloud-form="nickname"><label class="field">显示昵称<input name="nickname" value="${esc(nicknameDraft)}" required maxlength="96" autocomplete="nickname" aria-describedby="nickname-help"></label><p id="nickname-help" class="small muted">2–48 个字，支持中文，可以与别人重名。</p><div class="settings-buttons"><button class="button primary" ${busy?'disabled':''}>保存昵称</button><button type="button" class="button ghost" data-cloud-auth="cancel-name">取消</button></div></form>`:''}<p>邮箱：${esc(auth.session.user.email)}</p><p>账号 ID（固定）：<strong>${esc(auth.session.user.id)}</strong></p><p class="small muted">改昵称不会改变账号 ID，也不会移动或删除本地日记。</p><div class="settings-buttons"><button class="button" data-cloud-auth="copy">复制 ID</button><button class="button" data-cloud-auth="refresh">刷新会话</button><button class="button" data-cloud-auth="logout">退出登录</button></div><p role="status" class="muted">${esc(message||'已通过 CloudBase 验证。你的本机记录保持私密。')}</p></details>`;
    return heading+`<section class="panel settings-section"><h2>邮箱验证码登录 / 注册</h2><form data-cloud-form="send"><label class="field">邮箱<input type="email" name="email" maxlength="254" required autocomplete="email" value="${esc(email)}" ${challenge?'readonly':''}></label><button class="button" ${busy?'disabled':''}>发送验证码</button>${challenge?'<button type="button" class="button ghost" data-cloud-auth="change">更换邮箱</button>':''}</form>${challenge?'<form data-cloud-form="verify"><label class="field">邮箱验证码<input name="code" required inputmode="numeric" pattern="[0-9]{4,8}" minlength="4" maxlength="8" autocomplete="one-time-code"></label><button class="button primary">验证并登录</button></form>':''}<p class="small muted">验证码由腾讯云发送。新邮箱经验证后注册；已有邮箱登录原账号。不设置拾日独立密码。</p><p class="muted" role="status">${esc(message)}</p><button class="button ghost" data-cloud-auth="restore">重试恢复登录</button></section>`+privacy;
  }
  function panel(){return accountPanel()+(auth.session&&friends?friends.panel():'');}
  async function stopCollection(){
    if(friends?.busy||sync.busy)throw Error('好友操作或同步正在处理中，请完成后再切换账号');
    if(isBusy())throw Error('照片正在处理，请完成后再切换账号');
    await window.shiriNative?.photos?.configure({enabled:false,time:'22:00'});
  }
  async function enter(session){
    const owner=localCloudSpace(session.user.id);
    if(owner===spaceId())return;
    await stopCollection();localStorage.setItem('shiri-space-owner',owner);location.reload();
  }
  function restore(){
    if(restoreFlight)return restoreFlight;
    restoreFlight=(async()=>{
      restoring=true;redraw();
      try{const session=await auth.restore({allowOffline:true});accessVerified=!!session;if(session)await enter(session);message=auth.offline?'已恢复本机记录权限；联网后再验证并同步。':session?'已恢复并验证云端会话。':'尚未登录邮箱账号。';}
      catch(error){accessVerified=false;message=error.message;}
      finally{restoring=false;redraw();}
    })().finally(()=>{restoreFlight=null;});
    return restoreFlight;
  }
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-cloud-form]');if(!form)return;event.preventDefault();if(busy)return;
    busy=true;const values=Object.fromEntries(new FormData(form));
    try{
      if(form.dataset.cloudForm==='nickname'){nicknameDraft=values.nickname;await auth.updateNickname(nicknameDraft);editingName=false;message='昵称已保存到云端。';toast(message);await friends?.refresh();}
      else if(isBusy())throw Error('照片正在处理，请完成后再登录');
      else if(form.dataset.cloudForm==='send'){
        const sent = await auth.sendCode(values.email);
        email = sent.email;
        challenge=true;message='验证码已发送，请在邮箱中查看；不要把验证码发在聊天里。';
      }
      else{const session=await auth.verifyCode(values.code.trim());accessVerified=true;message='CloudBase 已验证登录。';await enter(session);}
    }catch(error){message=error.message;toast(message);}finally{busy=false;redraw();}
  });
  document.addEventListener('click',async event=>{
    const button=event.target.closest('[data-cloud-auth]');if(!button)return;event.preventDefault();if(busy)return;
    busy=true;button.disabled=true;
    try{
      const action=button.dataset.cloudAuth;
      if(action==='edit-name'){editingName=true;nicknameDraft=auth.session.user.nickname;}
      if(action==='cancel-name'){editingName=false;nicknameDraft='';}
      if(action==='change'){challenge=false;message='重新发送需等待一分钟。';}
      if(action==='copy'){await navigator.clipboard.writeText(auth.session.user.id);toast('已复制 CloudBase 用户 ID');}
      if(action==='refresh'){await auth.refresh();await restore();if(auth.session)await friends?.refresh();}
      if(action==='restore')await restore();
      if(action==='logout'){
        await stopCollection();
        try{await auth.logout();}catch(error){
          if(!await confirm('离线退出本机',error.message+'。当前无法撤销云端会话，是否仅清除本机凭据？本地照片和日记保留。'))return;
          await auth.logout({localOnly:true});
        }
        friends?.clear();localStorage.removeItem('shiri-space-owner');location.reload();
      }
    }catch(error){message=error.message;toast(message);}finally{busy=false;button.disabled=false;redraw();}
  });
  return {panel,get showingFeed(){return !!auth.session&&!!friends?.showingFeed;},assistantToken:()=>{if(!auth.session)throw Error('请联网恢复登录后再使用 AI');return auth.accessToken();},get canUseLocal(){return canUseLocal();},loginPanel:()=>accountPanel().replace(heading,loginHeading),scheduleSync:()=>{if(!restoring)sync.run();},syncNow:()=>sync.run(true),
    leave:()=>friends?.clear(),
    revokeLocal:async id=>{
      const local=await db.get('records',id);
      if(local?.kind==='moment'||local?.cloudSync){
        await db.editRevocations(id);
        // Invalidate the in-flight queue before any network work, even while offline.
        if(local.cloudSync)await db.patchSync(id,local.cloudSync.revision,{revision:crypto.randomUUID(),state:'local'});
        if(auth.session&&navigator.onLine){try{await api.rpc('revoke_local',{localId:id});await db.editRevocations(id,false);}catch{toast('已保留撤销任务，联网成功后停止云端访问。');}}
        return;
      }
      const known=shareLedger.has(id)||getData?.()?.settings?.find(row=>row.id==='cloudbase-share-ledger')?.localIds?.includes(id);
      if(!known)return;
      if(!auth.session||!friends)throw Error('这条记录曾尝试云端分享，请先恢复登录以撤回云端内容。');
      await friends.revokeLocal(id);
    },
    clearRemote:async()=>{if(auth.session&&friends)await friends.clearRemote();},start:async()=>{
    await restore();
    if(auth.session){await friends?.refresh();sync.run(true);}friends?.start();
    window.addEventListener('online',async()=>{await restore();if(auth.session){sync.run(true);await friends?.refresh();}});
    window.addEventListener('offline',()=>changed());
    setInterval(()=>{if(!document.hidden)sync.run();},30000);
    document.addEventListener('visibilitychange',async()=>{friends?.clear();if(!document.hidden&&auth.localSession){await restore();sync.run(true);if(document.querySelector('[data-friends-root]'))await friends?.refresh();}redraw();});
  }};
}
