import {spaceId} from './space.mjs';
import {button} from './ui.mjs';
const KEY='shiri-photo-guide-v1:';
const granted=s=>['full','partial'].includes(s?.permission);

// Choice is local to this installation/account; no journal or cloud schema changes.
export function createPhotoAccess({native=globalThis.window?.shiriNative,storage=globalThis.localStorage,owner=spaceId}={}){
 const seen=new Set();let requesting=false;
 function handled(){try{return seen.has(owner())||!!storage?.getItem(KEY+owner());}catch{return seen.has(owner());}}
 function remember(choice){seen.add(owner());try{storage?.setItem(KEY+owner(),choice);}catch{/* Memory still avoids repeated prompts this session. */}}
 async function needed(){
  if(!native?.photos||native.platform==='ios'||handled())return false;
  try{const s=await native.photos.status();if(granted(s)){remember('existing');return false;}return s?.permission==='none';}catch{return false;}
 }
 async function enable(time){
  if(requesting)throw Error('请先完成当前系统授权。');
  requesting=true;
  try{
   let s=await native.photos.status();
   if(!granted(s)){await native.photos.authorize();s=await native.photos.status();}
   // Already-granted access does not need another system permission prompt.
   if(!granted(s))return s;
   await native.photos.configure({enabled:true,time:time||s.time||'22:00'});
   const active=await native.photos.status();
   if(!active?.enabled||!granted(active))throw Error('照片访问已授权，但自动发现尚未确认开启。请在设置中重试。');
   return active;
  }finally{requesting=false;}
 }
 return {needed,remember,enable,get requesting(){return requesting;}};
}

export function createPhotoOnboarding({canShow,enable,onGranted,toast}){
 const native=window.shiriNative,access=createPhotoAccess({native});
 const dialog=document.querySelector('#photo-onboarding-dialog');
 let requested=false,checking=false,busy=false,own='';
 function close(){dialog?.close();}
 function controls(disabled){dialog.querySelectorAll('button').forEach(b=>b.disabled=disabled);}
 function skip(){if(busy)return;access.remember('skipped');requested=false;close();}
 async function offer(){
  if(!requested||checking||busy||!canShow()||document.querySelector('dialog[open]'))return;
  checking=true;const account=spaceId();
  try{
   if(!await access.needed()||!requested||!canShow()||spaceId()!==account||document.querySelector('dialog[open]'))return;
   own=account;
   dialog.innerHTML=`<div class="dialog-head"><h2 id="photo-guide-title">让拾日帮你整理生活</h2></div><div class="dialog-body"><p>授权访问照片后，拾日可以帮你发现新增照片。先在本机审核，只有保存为片刻的内容才会按照你的好友权限同步。</p><p class="small muted" style="margin-top:12px">默认晚间 22:00 整理，可在设置中修改；系统省电可能推迟任务。未审核照片不会上传。</p><p class="form-error" role="status" aria-live="polite"></p></div><div class="dialog-foot">${button('photo-guide-later','稍后再说')}${button('photo-guide-enable','开启照片访问','image','button primary')}</div>`;
   dialog.showModal();
  }finally{checking=false;}
 }
 dialog?.addEventListener('cancel',event=>{event.preventDefault();skip();});
 dialog?.addEventListener('close',()=>{if(requested){access.remember('skipped');requested=false;}});
 dialog?.addEventListener('click',async event=>{
  const action=event.target.closest('[data-action]')?.dataset.action;if(!action||busy)return;
  if(action==='photo-guide-later'){skip();return;}
  if(action==='photo-guide-settings'){
   try{await native.photos.openSettings?.();}
   catch(error){dialog.querySelector('[role=status]').textContent=error?.message||'请从手机系统设置打开拾日，调整照片访问权限。';}
   return;
  }
  if(action!=='photo-guide-enable')return;
  busy=true;controls(true);access.remember('attempted');
  try{
   const s=await enable();
   if(!canShow()||spaceId()!==own){close();return;}
   if(granted(s)){
    requested=false;close();toast(s.permission==='partial'?'已开启，仅能发现你选定的照片；新增照片可在设置中补充授权。':'照片访问已开启，正在本机发现新增照片。');
    await onGranted();
   }else{
    dialog.querySelector('[role=status]').textContent='尚未获得照片访问权限。你仍可手动添加照片，之后可到设置中开启。';
    if(s?.canRequestPermission===false&&native.photos.openSettings&&!dialog.querySelector('[data-action=photo-guide-settings]'))dialog.querySelector('.dialog-foot').insertAdjacentHTML('afterbegin',button('photo-guide-settings','去系统设置'));
   }
  }catch(error){if(dialog.open)dialog.querySelector('[role=status]').textContent=error?.message||'授权未完成，可稍后从设置重试。';}
  finally{busy=false;controls(false);}
 });
 document.addEventListener('close',()=>{if(requested)setTimeout(()=>{void offer();},0);},true);
 return {start(){requested=true;void offer();},stop(){requested=false;close();}};
}
