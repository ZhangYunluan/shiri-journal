import {interactionControls,mountPhotos} from './friend-timeline.mjs';
import {friendsView,SCOPES} from './cloudbase-friends-view.mjs';
import {createMomentComments} from './moment-comments.mjs';

export function createFriends({auth,api,getData,redraw,toast,confirm,rememberShare=async()=>{},onGrant=()=>{},saveNote=async()=>{throw Error('本机备注存储不可用');}}){
  const s={view:'feed',dashboard:null,feed:[],found:[],searched:false,drafts:{},requestNotes:{},selected:null,grantId:null,
    photos:new Map(),stats:{},likesAvailable:false,busy:false,message:'',error:false,progress:null,retry:null,hasMore:false};
  let epoch=0,knownProfile='',refreshing=null,disposePhotos=()=>{};
  let commentsChecked=false;const likeBusy=new Set();
  function paintStats(){for(const node of document.querySelectorAll('[data-moment-actions]')){const record=s.feed.find(r=>r.id===node.dataset.momentActions);if(record){node.outerHTML=interactionControls(record,s.commentsAvailable,s.stats,s.likesAvailable);}}}
  async function updateStats(ids){
    if(!s.likesAvailable)return;const ticket=epoch;
    for(let i=0;i<ids.length;i+=50){const result=await api.interactions('summary',{ids:ids.slice(i,i+50)});if(ticket!==epoch)return;acceptStats(result);}
    paintStats();
  }
  function acceptStats(result){
    if(!Array.isArray(result?.records)||result.records.length>50)throw Error('互动统计格式异常');
    for(const r of result.records){if(typeof r.id!=='string'||typeof r.liked!=='boolean'||!Number.isSafeInteger(r.likes)||r.likes<0||!Number.isSafeInteger(r.comments)||r.comments<0)throw Error('互动统计格式异常');s.stats[r.id]=r;}
  }
  async function like(id){
    if(likeBusy.has(id)||!s.likesAvailable||!s.feed.some(r=>r.id===id))return;
    likeBusy.add(id);const ticket=epoch;
    for(const node of document.querySelectorAll('[data-friends-action="like"]'))if(node.dataset.id===id)node.disabled=true;
    try{
      if(!s.stats[id])await updateStats([id]);
      if(ticket!==epoch||!s.feed.some(r=>r.id===id))return;
      if(!s.stats[id])throw Error('尚未读取该片刻的互动状态，请刷新后重试。');
      const result=await api.interactions('set_like',{recordId:id,liked:!s.stats[id]?.liked});
      if(ticket===epoch){acceptStats(result);paintStats();}
    }catch(error){if(ticket===epoch){if([401,403,404].includes(error.status)){clear();s.error=true;s.message='互动访问权限已变化，请刷新近况。';redraw();}toast(error.message);}}
    finally{likeBusy.delete(id);paintStats();}
  }
  const comments=createMomentComments({api,getUserId:()=>auth.session?.user.id,redraw,toast,confirm,onChange:async id=>{try{await updateStats([id]);}catch(error){if([401,403,404].includes(error.status))throw error;toast('评论已保存，统计暂未刷新。');}},onDenied:()=>{clearPhotos();s.feed=[];s.stats={};s.dashboard=null;s.error=true;s.message='好友权限已变化，请刷新近况。';}});
  function mount(){disposePhotos();const root=document.querySelector('[data-friends-root]');const current=epoch;if(root)disposePhotos=mountPhotos(root,api,()=>epoch===current&&root.isConnected,!s.error&&!s.busy);}
  const data=()=>getData?.()||{categories:[],records:[],assets:[]};
  window.addEventListener('hashchange',()=>disposePhotos());
  function clearPhotos(){disposePhotos();for(const url of s.photos.values())URL.revokeObjectURL(url);s.photos.clear();}
  function clear(){epoch++;commentsChecked=false;comments.clear();clearPhotos();s.feed=[];s.stats={};s.likesAvailable=false;s.dashboard=null;s.found=[];s.searched=false;s.hasMore=false;}
  async function load(){
    comments.clear();
    disposePhotos();const run=++epoch;if(!auth.session){clear();return;}
    const user=auth.session.user,profileKey=user.id+'|'+user.nickname;
    if(knownProfile!==profileKey){await api.rpc('profile',{nickname:Array.from(user.nickname||'').length>=2?user.nickname:'拾日用户'});if(run!==epoch)return;knownProfile=profileKey;}
    const dashboard=await api.rpc('dashboard');
    const feed=await api.rpc('feed',s.selected?{id:s.selected}:{});
    if(!commentsChecked&&typeof api.comments==='function'){
      try{s.commentsAvailable=(await api.comments('capabilities'))?.version===1;}catch{s.commentsAvailable=false;}
      s.likesAvailable=false;
      if(typeof api.interactions==='function'){try{s.likesAvailable=(await api.interactions('capabilities'))?.version===1;}catch{}}
      commentsChecked=true;
    }
    if(run!==epoch)return;
    clearPhotos();s.dashboard=dashboard;s.feed=feed.records;s.hasMore=feed.hasMore;
    if(s.likesAvailable){try{await updateStats(s.feed.map(r=>r.id));}catch(error){if([401,403].includes(error.status))throw error;toast('互动统计暂时无法读取，可稍后重试。');}}
    if(run!==epoch)return;
    s.message='好友服务已连接 · '+new Date().toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});s.error=false;
  }
  async function refresh(){
    if(s.busy||!auth.session)return;
    if(refreshing)return refreshing;
    refreshing=(async()=>{try{await load();}catch(error){clear();s.message=error.message;s.error=true;}finally{refreshing=null;redraw();}})();
    return refreshing;
  }
  async function run(work){
    if(s.busy)return;s.busy=true;s.error=false;redraw();
    // Finish any earlier refresh before mutations, so stale responses cannot restore old permissions.
    try{if(refreshing)await refreshing;await work();}catch(error){s.message=error.message;s.error=true;toast(error.message);}
    finally{s.busy=false;s.progress=null;redraw();}
  }
  async function revoke(record){
    await api.rpc('revoke',{id:record.id});
    if(record.mediaId){try{await api.photo(record.mediaId,'DELETE');}catch{toast('分享已撤回，云端照片副本暂未清理；好友已无法访问。');}}
    await load();s.message='分享已撤回，本地日记保留。';
  }
  document.addEventListener('input',event=>{
    const form=event.target.closest('[data-friends-form]');
    if(form)s.drafts[form.dataset.friendsForm]=Object.fromEntries(new FormData(form));
    if(event.target.name==='request-note')s.requestNotes[event.target.dataset.requestFor]=event.target.value;
  });
  document.addEventListener('submit',event=>{
    const form=event.target.closest('[data-friends-form]');if(!form)return;event.preventDefault();
    const fields=new FormData(form),values=Object.fromEntries(fields),action=form.dataset.friendsForm,id=form.dataset.id;
    s.drafts[action]=values;
    run(async()=>{
      if(action==='search'){
        s.found=[];s.searched=false;const searchEpoch=epoch;
        const result=await api.rpc('search',{query:(values.query||'').trim()});
        if(searchEpoch!==epoch)return;
        if(!Array.isArray(result?.users))throw Error('昵称搜索接口返回格式不匹配，请核对已部署的 0.5.1 接口。');
        s.found=result.users;s.searched=true;return;
      }
      if(action==='local-note'){
        if(!s.dashboard?.friends.some(f=>f.id===id))throw Error('只能为当前好友设置备注');
        await saveNote(id,values.note||'');s.noteId=null;s.message='备注已保存在本机，仅你可见。';return;
      }
      if(action==='grant'){
        const grant={id,scope:values.scope,categories:fields.getAll('categories'),historyDays:Number(values.historyDays),since:values.since||null};
        if(grant.scope!=='none'&&!await confirm('确认开放范围',`允许这位好友查看：${SCOPES[grant.scope]}。历史范围：${grant.historyDays?'最近 '+grant.historyDays+' 天':'全部已保存历史'}${grant.since?'，不早于 '+grant.since:''}。一次授权后，后续保存的片刻自动对 TA 可见；私人日记、未审核素材与仅自己可见的片刻除外。`))return;
        await api.rpc('grant',grant);s.grantId=null;await load();s.message='已更新这位好友的开放范围。';onGrant();return;
      }

    });
  });
  document.addEventListener('click',event=>{
    const tab=event.target.closest('[data-friends-view]');
    if(tab){event.preventDefault();if(s.busy)return;comments.clear();s.view=tab.dataset.friendsView;redraw();return;}
    const button=event.target.closest('[data-friends-action]');if(!button)return;event.preventDefault();
    const action=button.dataset.friendsAction,id=button.dataset.id;
    if(action==='refresh'){commentsChecked=false;refresh();return;}
    if(action==='like'){like(id);return;}
    if(action==='comments'){const mine=s.dashboard?.mine.find(r=>r.id===id),record=mine||s.feed.find(r=>r.id===id);if(s.commentsAvailable&&record)comments.open(record,!!mine);return;}
    run(async()=>{
      if(action==='discoverability'){await api.rpc('discoverability',{enabled:!s.dashboard?.discoverable});await load();s.message=s.dashboard?.discoverable?'已开启昵称搜索，可被其他登录用户找到。':'已关闭昵称搜索。';return;}
      if(action==='grant-edit'){s.grantId=s.grantId===id?null:id;return;}
      if(action==='note-edit'){if(s.dashboard?.friends.some(f=>f.id===id))s.noteId=s.noteId===id?null:id;return;}
      if(action==='sync'){await onGrant();return;}
      if(action==='photo'){
        const runEpoch=epoch,blob=await api.photo(id);if(runEpoch!==epoch)return;s.photos.set(id,URL.createObjectURL(blob));return;
      }
      if(action==='more'){
        const runEpoch=epoch,result=await api.rpc('feed',{...(s.selected?{id:s.selected}:{}),offset:s.feed.length});
        if(runEpoch===epoch){s.feed.push(...result.records);s.hasMore=result.hasMore;await updateStats(result.records.map(r=>r.id));}return;
      }
      if(action==='profile'||action==='all-feed'){s.selected=action==='profile'?id:null;s.view='feed';await load();return;}
      if(action==='request'){await api.rpc('request',{id,note:s.requestNotes[id]||''});s.found=[];s.searched=false;await load();s.message='好友申请已发送，等待对方接受。';return;}
      if(action==='accept'||action==='reject'){await api.rpc('respond',{id,accept:action==='accept'});await load();if(action==='accept'){s.view='people';s.grantId=id;s.message='已成为好友。请确认一次开放范围；之后保存的片刻自动同步。';}else s.message='已拒绝这条申请。';return;}
      if(action==='remove'||action==='block'){
        if(!await confirm(action==='block'?'屏蔽这位用户':'删除好友','双方好友关系和开放授权会撤销。对方将不能继续查看你的近况。'))return;
        await api.rpc(action,{id});s.selected=null;await load();return;
      }
      if(action==='cancel'||action==='unblock'){await api.rpc(action,{id});await load();return;}
      if(action==='revoke'){
        const record=s.dashboard?.mine.find(r=>r.id===id);if(record&&await confirm('撤回分享','好友将不能继续读取这条近况，本地日记保留。'))await revoke(record);
      }
    });
  });
  return {get showingFeed(){return s.view==='feed'&&!!s.dashboard&&!s.error;},get busy(){return s.busy;},panel:()=>{setTimeout(mount,0);return comments.panel()+friendsView(s,data());},refresh,clear,
    async revokeLocal(localId){await api.rpc('revoke_local',{localId});clear();},
    async clearRemote(){await api.rpc('revoke_all');clear();},
    start(){setInterval(()=>{if(!comments.opened&&!document.hidden&&document.querySelector('[data-friends-root]')&&!document.querySelector('[data-friends-form]:focus-within'))refresh();},60000);}
  };
}
