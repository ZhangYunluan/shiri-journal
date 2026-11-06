import {SOCIAL_API} from './social-config.mjs';
import {spaceId} from './space.mjs';
import {esc} from './ui.mjs';
import * as db from './db.mjs';
import {canShare,sharedRecord,recordDigest} from './sharing.mjs';
import {localDate} from './core.mjs';

export function createSocial({getData,changed,toast,confirm,redraw,isBusy=()=>false}) {
  const endpoint=SOCIAL_API.replace(/\/$/,'');
  const configured=/^https:\/\/[^/]+(?:\/[^?#]*)?$/.test(endpoint);
  let session=null,me=null,feed=[],found=null,message='',syncing=false,syncAgain=false,timer;
  try {session=JSON.parse(localStorage.getItem('shiri-social-session')||'null');}catch{}
  if(session?.user?.id!==spaceId()||!session?.token)session=null;
  const b=(action,label,id='')=>`<button class="button small-button" data-social="${action}" data-id="${esc(id)}">${label}</button>`;
  const scopeNames={none:'不开放',shared:'仅手动发布的近况',categories:'指定分类',all:'全部开放'};
  async function api(path,method='GET',body) {
    if(!configured)throw Error('好友服务尚未部署');
    const response=await fetch(endpoint+'/api/'+path,{method,cache:'no-store',credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(20000),headers:{...(body?{'Content-Type':'application/json'}:{}),...(session?{Authorization:'Bearer '+session.token}:{})},...(body?{body:JSON.stringify(body)}:{})});
    const data=await response.json();if(!response.ok)throw Error(data.error||'请求未完成');return data;
  }
  async function update() {
    if(!session||!configured)return;
    try {me=await api('me');feed=(await api('feed')).records;message='近况读取于 '+new Date().toLocaleString('zh-CN');}
    catch(error){feed=[];message=error.message;throw error;}finally{redraw();}
  }
  const dataURL=blob=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>resolve(r.result);r.onerror=()=>reject(r.error);r.readAsDataURL(blob);});
  async function sync() {
    if(!configured||!session||session.user.id!==spaceId())return;
    if(syncing){syncAgain=true;return;}
    syncing=true;
    try {
      const remote=await api('sync'),data=await db.readAll();
      const records=[...data.records,...(data.settings.find(s=>s.id==='social-shares')?.records||[])].map(r=>({...r,kind:r.kind||'record'})).filter(r=>remote.grants.some(g=>canShare(g,r)));
      const ids=new Set(records.map(r=>r.id));const deleted=remote.records.filter(r=>!ids.has(r.id)).map(r=>r.id);
      for(let i=0;i<deleted.length;i+=100)await api('sync','POST',{deleteIds:deleted.slice(i,i+100)});
      const known=new Map(remote.records.map(r=>[r.id,r.digest]));let upserts=[];
      for(const record of records) {
        const asset=data.assets.find(a=>a.id===record.assetId);
        const photo=asset?.thumbnail?await dataURL(asset.thumbnail):null;
        if(photo&&photo.length>400000)throw Error('一张预览图超过分享限制，请缩小后重试');
        const row=sharedRecord(record,data.categories.find(c=>c.id===record.categoryId),photo);
        if(known.get(row.id)!==await recordDigest(row))upserts.push(row);
        if(upserts.length===10){await api('sync','POST',{upserts});upserts=[];}
      }
      if(upserts.length)await api('sync','POST',{upserts});
      await update();
    }catch(error){message='同步未完成：'+error.message;redraw();}finally{syncing=false;if(syncAgain){syncAgain=false;scheduleSync();}}
  }
  function scheduleSync(){clearTimeout(timer);timer=setTimeout(sync,1200);}
  function panel() {
    const data=getData();
    const heading='<div class="page-heading"><div><div class="eyebrow">CLOSE, AT YOUR PACE</div><h1>好友近况</h1><p>各自忙碌，也能在获得授权后看见彼此的生活。</p></div></div>';
    const privacy='<div class="notice">加好友不会自动开放记录。你决定每位好友能看什么，也可以随时收回授权。逐张确认开放且属于授权范围的生活记录，才会展示给好友。私人自动上传是独立设置，未确认照片仅本人可见；相册原图留在本机。收回后停止后续访问，但无法撤回对方已保存或截图的内容。</div>';
    if(!configured)return heading+`<section class="panel settings-section"><h2>好友服务尚未上线</h2><p>用户 ID、好友申请与分级授权已接入代码。目前还没有配置你名下的国内 HTTPS 服务，因此暂不能注册或跨手机查看近况。</p><p class="muted">微信、手机号、邮箱登录也需要对应服务账号配置。当前 APK 可以继续使用本地生活日志。</p><a class="button" href="docs/国内上线注册指引.md">查看国内上线注册指引</a></section>`+privacy;
    if(!session)return heading+`<div class="settings-grid"><form class="panel settings-section" data-social-form="register"><h2>创建用户 ID</h2><label class="field">昵称<input name="nickname" maxlength="40" required autocomplete="nickname"></label><label class="field">密码（12–128 个字符）<input name="password" type="password" minlength="12" maxlength="128" autocomplete="new-password" required></label><p class="muted small">注册后生成唯一 ID。暂未接通找回密码，请自行妥善保存。</p><button class="button primary">注册</button></form><form class="panel settings-section" data-social-form="login"><h2>登录 ID</h2><label class="field">用户 ID<input name="id" required autocomplete="username" placeholder="SR…"></label><label class="field">密码<input name="password" type="password" required autocomplete="current-password"></label><button class="button primary">登录</button></form></div><p class="muted">登录后进入该 ID 独立的本地空间，访客记录保留在访客空间。需要迁移时请先导出备份。登录本身不会上传生活记录。</p>`+privacy;
    return heading+`<section class="panel settings-section"><div class="row"><div><h2>${esc(session.user.nickname)}</h2><p>我的 ID：<strong>${esc(session.user.id)}</strong></p></div>${b('copy','复制 ID')}${b('refresh','同步与刷新')}${b('logout','退出登录')}</div><p class="small muted" role="status">${esc(message||'尚未同步')}</p><form class="row" data-social-form="search"><label class="field">搜索用户 ID<input name="id" required placeholder="输入完整 SR 用户 ID"></label><button class="button">搜索</button></form>${found?`<p>${esc(found.nickname)} · ${esc(found.id)} ${b('request','申请好友',found.id)}</p>`:''}</section>`+privacy+
    `<div class="settings-grid"><section class="panel settings-section"><h2>好友申请</h2>${(me?.requests||[]).map(r=>`<p>${esc(r.nickname)} · ${esc(r.sender)} ${b('accept','通过',r.sender)} ${b('reject','拒绝',r.sender)}</p>`).join('')||'<p class="muted">暂无待处理申请</p>'}</section><section class="panel settings-section"><h2>手动发布近况</h2><form data-social-form="publish"><label class="field">标题<input name="title" maxlength="200" required></label><label class="field">想分享的事<textarea name="note" maxlength="20000" required></textarea></label><label class="field">分类<select name="categoryId">${data.categories.map(c=>`<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('')}</select></label><p class="small muted">只有获得对应权限的好友可以查看。没有授权时仅保存本机草稿。</p><button class="button">保存并同步近况</button></form>${(data.settings.find(s=>s.id==='social-shares')?.records||[]).map(r=>`<p>${esc(r.title)} ${b('unpublish','删除近况',r.id)}</p>`).join('')}</section></div>`+
    `<section class="panel settings-section"><h2>我的好友 · 我向对方开放的范围</h2>${(me?.friends||[]).map(f=>`<form class="friend-card" data-social-form="grant" data-id="${esc(f.id)}"><h3>${esc(f.nickname)} <small>${esc(f.id)}</small></h3><label class="field">亲密权限<select name="scope">${Object.entries(scopeNames).map(([key,label])=>`<option value="${key}" ${f.scope===key?'selected':''}>${label}</option>`).join('')}</select></label><div class="category-grants">${data.categories.map(c=>`<label><input type="checkbox" name="categories" value="${esc(c.id)}" ${f.categories.includes(c.id)?'checked':''}>${esc(c.name)}</label>`).join('')}</div><p class="small muted">分类选择仅在“指定分类”时生效。对方能看你的范围，由你设置。</p><button class="button primary">保存授权</button> ${b('remove','删除好友',f.id)}</form>`).join('')||'<p class="muted">搜索 ID，向朋友发出邀请。</p>'}</section>`+
    `<section class="panel settings-section"><h2>朋友的近况</h2><p class="small muted">显示最近同步的 50 条，照片经本人逐张确认开放后同步；后台私人上传不会直接成为好友近况。</p>${feed.map(r=>`<article class="friend-card"><p>${esc(r.owner.nickname)} · ${esc(r.date)} · ${esc(r.categoryName||r.categoryId)}${r.status==='review'?' · 待本人确认':''}</p><h3>${esc(r.title)}</h3>${r.photo?`<img class="friend-photo" src="${esc(r.photo)}" alt="好友授权的照片预览" loading="lazy">`:''}<p class="pre-wrap">${esc(r.note)}</p><p class="small muted">${[['地点',r.location],['金额',r.amount],['体重',r.weight],['时长',r.duration],['心情分值',r.mood]].filter(([,v])=>v!=null&&v!=='').map(([k,v])=>esc(k+'：'+v)).join(' · ')}</p><p class="small muted">同步于 ${esc(new Date(r.syncedAt).toLocaleString('zh-CN'))}</p></article>`).join('')||'<p class="muted">还没有可查看的近况，等待好友授权并同步。</p>'}</section><details class="panel settings-section"><summary>账号管理</summary><form data-social-form="delete-account"><p>注销会删除服务端账号、好友关系和共享副本。本机日志仍留在该 ID 的空间，请先导出备份。</p><label class="field">确认当前密码<input name="password" type="password" required autocomplete="current-password"></label><button class="button danger">注销账号</button></form></details>`;
  }
  async function leave() {
    await window.shiriNative?.photos?.configureCloud?.({enabled:false});
    await window.shiriNative?.photos?.configure({enabled:false,time:'22:00'});
    localStorage.removeItem('shiri-social-session');localStorage.removeItem('shiri-space-owner');location.reload();
  }
  document.addEventListener('submit',async event=>{
    const form=event.target.closest('[data-social-form]');if(!form)return;event.preventDefault();
    const data=new FormData(form),action=form.dataset.socialForm,values=Object.fromEntries(data);
    const submit=form.querySelector('button[type="submit"],button:not([type])');if(submit?.disabled)return;if(submit)submit.disabled=true;
    try {
      if(action==='login'||action==='register') {
        if(isBusy())throw Error('照片正在处理，请完成后再切换账号');
        const result=await api('auth/'+action,'POST',values);
        await window.shiriNative?.photos?.configure({enabled:false,time:'22:00'});
        localStorage.setItem('shiri-social-session',JSON.stringify(result));localStorage.setItem('shiri-space-owner',result.user.id);location.reload();return;
      }
      if(action==='search'){found=(await api('users?id='+encodeURIComponent(values.id.trim().toUpperCase()))).user;redraw();return;}
      if(action==='grant') {
        if(values.scope!=='none'&&!await confirm('确认向这位好友开放','开放范围：'+scopeNames[values.scope]+'。这会同步对应历史及未来记录的文字、照片预览、位置、情绪、消费与身体数据；“全部开放”也只包括你已逐张确认开放的照片，待确认素材始终不可见。原图不上传，可以随时改为“不开放”。'))return;
        await api('grant','PUT',{id:form.dataset.id,scope:values.scope,categories:data.getAll('categories')});
      }
      if(action==='publish') {
        const all=await db.readAll(),row=all.settings.find(s=>s.id==='social-shares')||{id:'social-shares',records:[]};
        row.records.push({id:'share:'+crypto.randomUUID(),kind:'shared',status:'confirmed',shareApproved:true,date:localDate(),title:values.title,note:values.note,categoryId:values.categoryId});await db.put('settings',row);await changed();
      }
      if(action==='delete-account') {
        if(isBusy())throw Error('照片正在处理，请完成后再注销账号');
        if(!await confirm('注销账号','将删除服务端账号、好友关系和共享副本，不能撤销。请确认已导出本机记录。',{danger:true}))return;
        await api('account','DELETE',{password:values.password});await leave();return;
      }
      await sync();
    }catch(error){toast(error.message);}finally{if(submit)submit.disabled=false;}
  });
  document.addEventListener('click',async event=>{
    const target=event.target.closest('[data-social]');if(!target)return;event.preventDefault();
    const action=target.dataset.social,id=target.dataset.id;target.disabled=true;
    try {
      if(action==='copy'){await navigator.clipboard.writeText(session.user.id);toast('已复制用户 ID');return;}
      if(action==='logout'){
        if(isBusy())throw Error('照片正在处理，请完成后再退出');
        try{await api('auth/logout','POST',{});}catch(error){if(!await confirm('离线退出本机','服务端暂不可达，无法撤销远端会话。仍可清除本机登录凭据并停止此空间的采集任务，远端会话将在到期后失效。'))return;}
        await leave();return;
      }
      if(action==='request'){await api('requests','POST',{id});toast('已发送好友申请');}
      if(action==='accept'||action==='reject')await api('requests/respond','POST',{id,accept:action==='accept'});
      if(action==='remove'){if(!await confirm('删除好友','双方好友关系和互相授权都会撤销。'))return;await api('friends','DELETE',{id});}
      if(action==='unpublish'){if(!await confirm('删除这条近况','删除本机发布内容并移除服务端副本。'))return;const all=await db.readAll(),row=all.settings.find(s=>s.id==='social-shares');row.records=row.records.filter(r=>r.id!==id);await db.put('settings',row);await changed();}
      await sync();
    }catch(error){toast(error.message);}finally{target.disabled=false;}
  });
  return {panel,scheduleSync,start:()=>{sync();setInterval(()=>{if(!document.hidden)sync();},60000);},
    async clearRemote(){if(!session||!configured)return;const state=await api('sync');for(const g of state.grants)await api('grant','PUT',{id:g.id,scope:'none',categories:[]});}
  };
}
