import {coordinateLabel} from './photo-metadata.mjs';
import {esc,button} from './ui.mjs';
import * as db from './db.mjs';
import {prepareImage} from './images.mjs';
import {createPhotoAccess} from './photo-onboarding.mjs';
import {mergeScan} from './collector-state.mjs';

/** One scanner/queue, separate timer controls. Nothing here saves or uploads a moment. */
export function createCollector({changed,toast,confirm,onDiscard=async()=>{},isBusy=()=>false,setBusy=()=>{}}){
 const native=window.shiriNative,photos=native?.photos,access=createPhotoAccess({native});
 let status=null,busy=false,controlBusy=false,problem=null,message='',error=false,result=null,revision=0,draftTime='',resumeTimer;
 const permission=()=>({full:'全部照片',partial:'部分照片',none:'未授权'})[status?.permission]||'正在读取';
 const b=(action,text,primary=false,disabled=false)=>`<button class="button ${primary?'primary':''}" data-collector="${action}" ${disabled?'disabled':''}>${text}</button>`;
 const resultText=()=>result?`${result.scanned?`本次扫描发现 ${result.found} 张 · 已存在 ${result.existing} 张 · `:''}导入待审核 ${result.imported} 张（含此前暂存） · 失败 ${result.failed+result.unsupported+result.importFailed} 张` : '';
 const panel=()=>`<section class="panel settings-section collector-panel" id="collector-panel"><h2>照片自动采集</h2>${!photos?'<p class="muted">当前平台请通过“添加照片”选择照片并审核。Android 版支持授权范围内的定时发现。</p>':`
 <div class="collection-status"><strong>${!status?'正在读取采集状态…':status.enabled?'自动采集已开启':'自动采集已暂停'}</strong><span>相册权限：${permission()}</span></div>
 <label class="field">每日采集时间<input id="collector-time" type="time" value="${esc(draftTime||status?.time||'22:00')}" ${controlBusy?'disabled':''}></label>
 <p class="small muted">上次采集：${status?.lastRun?esc(new Date(status.lastRun).toLocaleString('zh-CN')):'尚未采集'}</p>
 <div class="settings-buttons">${b(status?.enabled?'disable':'enable',controlBusy?'正在保存…':status?.enabled?'暂停自动采集':'开启自动采集',!status?.enabled,controlBusy||!status)}${b('now','立即采集照片',true,busy)}</div>
 <p class="${error?'form-error':'small muted'}" role="status" aria-live="polite">${esc(message|| (status?.requested&&!status?.enabled?'系统任务未建立，请重新开启自动采集。':status?.running?'系统正在发现照片…':''))}</p>
 ${result?`<p class="small">${esc(resultText())}</p>`:''}
 <details class="collector-more"><summary>更多设置与采集详情</summary><div class="settings-buttons">${b('authorize','调整相册权限',false,controlBusy)}${b('refresh','继续导入与刷新',false,busy)}${status?.permission==='none'&&photos.openSettings?b('system-settings','打开系统设置'):''}</div>
 <p class="small muted">继续导入：把已发现的本机暂存照片加入待审核列表，不重新扫描相册。</p>${status?.lastError?`<p class="form-error">上次采集未完成：${esc(status.lastError)}</p>`:''}<p class="small muted">已发现 ${Object.values(status?.counts||{}).reduce((a,n)=>a+Number(n),0)} 张 · 待导入 ${status?.pending||0} 张 · 已导入 ${(status?.counts?.imported||0)+(status?.counts?.saved||0)} 张。历史统计含已排除及已保存的照片，与本次结果不同。</p>
 <p class="small muted">暂停只停止定时发现，保留照片权限和全部记录；仍可立即采集。未审核照片只在本机，不上传。仅授权部分照片时，新照片需补充授权。省电、锁屏或后台限制可能推迟采集。</p>${problem?`<p class="form-error">${esc(problem.message)}</p>${b('discard','跳过这张待导入照片')}`:''}</details>`}</section>`;
 function draw(){
  const old=document.querySelector('#collector-panel');if(old){const open=old.querySelector('details')?.open,holder=document.createElement('div');holder.innerHTML=panel();if(open)holder.querySelector('details').open=true;old.replaceWith(holder.firstElementChild);}
  const dialog=document.querySelector('#collector-scan-dialog');if(!dialog?.open)return;
  dialog.querySelector('.scan-permission').innerHTML=`相册权限：${permission()}${status?.permission==='none'?'<p>先允许照片访问即可手动采集，自动采集可保持暂停。</p>'+b('scan-authorize','开启照片访问',true,controlBusy):''}${status?.permission==='partial'?'<p>仅扫描你已授权的照片；其他照片无法发现。</p>':''}`;
  dialog.querySelector('.scan-status').textContent=message;
  dialog.querySelector('.scan-result').textContent=resultText();
  dialog.querySelector('fieldset').disabled=busy;dialog.querySelector('[type=submit]').disabled=busy||controlBusy||!['full','partial'].includes(status?.permission);
 }
 function tell(text,failed=false){message=text;error=failed;draw();toast(text);}
 async function refresh(){if(!photos)return;const ticket=++revision,fresh=await photos.status();if(ticket===revision){status=fresh;draftTime||=fresh.time||'22:00';}return status;}
 async function permissionAction(adjust=false){
  await refresh();const s=status;
  if((adjust&&s.permission==='full')||(adjust&&s.permission==='partial'&&s.canReselect===false)||(s.permission==='none'&&s.canRequestPermission===false)){
   if(!photos.openSettings)throw Error('请在手机系统设置中找到拾日，调整照片权限。');
   await photos.openSettings();tell('已打开系统应用设置。调整照片权限后返回拾日，状态会自动刷新。');return;
  }
  tell('正在打开系统照片授权…');await photos.authorize();await refresh();
  tell(status.permission==='none'?'尚未获得照片权限，仍可手动添加照片；可从系统设置调整。':status.permission==='partial'?'已允许部分照片，新增照片需补充选择。':'已允许访问照片。');
 }
 async function run(options){
  if(!photos)return;if(busy||isBusy()){tell('照片正在处理中，请稍候再操作。');return;}
  busy=true;setBusy(true);problem=null;result=null;error=false;message=options?'正在扫描已授权照片…':'正在导入本机暂存照片…';draw();
  let imported=0,importFailed=0,summary=null,lastScan=null,nextScan=!!options,polling=false;
  const poll=setInterval(async()=>{if(polling||controlBusy)return;polling=true;try{await refresh();if(status?.running){message=`正在发现照片… 已检查 ${status.processed||0} 张`;draw();}}catch{}finally{polling=false;}},1000);
  try{
   const data=await db.readAll();let finished=false;
   for(let rounds=0;rounds<100;rounds++){
    if(nextScan){lastScan=await photos.runNow({...options,...(summary?.until?{until:summary.until}:{})});summary=mergeScan(summary,lastScan);nextScan=false;}
    const {photos:pending}=await photos.pending();
    if(!pending.length){
     if(options&&lastScan?.complete===false&&!lastScan.failed&&lastScan.staged>0&&(!options.automatic||status?.enabled)){nextScan=true;continue;}
     finished=true;break;
    }
    for(const photo of pending){
     try{
      const id='native:'+photo.id;
      if(!data.records.some(r=>r.id===id)){
       const response=await fetch(native.photoURL(photo.path));if(!response.ok)throw Error('暂存照片无法读取');
       const asset=await prepareImage(new File([await response.blob()],photo.name,{type:photo.type,lastModified:photo.added}));
       const stamp=new Date().toISOString(),taken=new Date(photo.taken||photo.added);
       const gps=asset.captureLocation?null:await photos.location?.({id:photo.id,requestPermission:false}).catch(()=>null);
       const record={id,date:photo.date,time:String(taken.getHours()).padStart(2,'0')+':'+String(taken.getMinutes()).padStart(2,'0'),title:photo.name.replace(/\.[^.]+$/,'').slice(0,200)||'自动采集照片',note:'',categoryId:data.categories.some(c=>c.id==='other')?'other':data.categories[0].id,tags:[],location:asset.captureLocation||coordinateLabel(gps),mood:null,duration:null,amount:null,weight:null,reflection:'',assetId:asset.id,status:'review',shareApproved:false,source:'native-auto',analysis:{method:'自动采集 · 可按需进行本地识别',labels:[],ocr:''},createdAt:stamp,updatedAt:stamp};
       await db.saveRecord(record,data.categories,asset);data.records.push(record);imported++;
      }
      await photos.acknowledge({id:photo.id});
     }catch(e){importFailed++;problem={id:photo.id,message:`${photo.name}：${e.message}。本机暂存副本保留，可重试或跳过。`};break;}
    }
    message=`已导入 ${imported} 张，正在本机整理…`;draw();if(problem)break;
    await new Promise(resolve=>setTimeout(resolve,0));
   }
   await refresh();
   result={...(summary||{found:0,staged:0,existing:0,failed:0,unsupported:0,complete:true}),imported,importFailed,scanned:!!options};
   if(!finished||problem)result.complete=false;
   const failed=result.failed+result.unsupported+importFailed;
   const text=!options&&status?.lastError?`上次采集未完成：${status.lastError}`:imported?`已导入 ${imported} 张照片，请在素材库确认。`:failed||!result.complete?'有照片未处理完成，可重试。':options?'没有发现新的待审核照片。':'没有待导入的照片。';
   tell(text+(!result.complete?'本批未全部完成，可继续采集。':'')+(status?.permission==='partial'?'仅能发现你选定的照片；新增照片需在设置中补充授权。':''),!!failed||!!(!options&&status?.lastError));
   await changed();
  }catch(e){tell(`采集未完成：${e.message}。已导入的记录保留，可稍后重试。`,true);await changed();}
  finally{clearInterval(poll);busy=false;setBusy(false);draw();}
 }
 async function start(){
  if(!photos||busy||controlBusy||access.requesting||isBusy())return;
  try{await refresh();await run(status?.enabled&&status?.permission!=='none'?{automatic:true,days:7}:null);}catch(e){tell(e.message,true);}
 }
 async function openScan(){
  await refresh();const dialog=document.querySelector('#collector-scan-dialog');
  dialog.innerHTML=`<form id="collector-scan-form"><div class="dialog-head"><h2 id="collector-scan-title">立即采集照片</h2>${button('close-collector-scan','','close','button ghost icon-only','aria-label="关闭采集面板"')}</div><div class="dialog-body"><div class="scan-permission small"></div><fieldset class="scan-ranges"><legend>采集范围</legend><label><input type="radio" name="days" value="1" checked>今天的照片</label><label><input type="radio" name="days" value="7">重新扫描最近 7 天</label></fieldset><p class="small muted">只扫描已授权照片，按拍摄日期归档，并兼顾最近导入的照片。结果先进入本机待审核，不自动保存或上传。</p><p class="scan-status" role="status" aria-live="polite"></p><p class="scan-result small"></p></div><div class="dialog-foot"><button type="button" class="button" data-collector="close-scan">收起</button><button type="submit" class="button primary">${busy?'正在采集…':'开始采集'}</button></div></form>`;
  dialog.showModal();draw();
 }
 document.addEventListener('click',async event=>{
  const action=event.target.closest('[data-collector]')?.dataset.collector;
  if(event.target.closest('[data-action=close-collector-scan]')){document.querySelector('#collector-scan-dialog').close();return;}
  if(!action||!photos)return;
  if(action==='close-scan'){document.querySelector('#collector-scan-dialog').close();return;}
  if(controlBusy){toast('系统操作正在处理中，请稍候。');return;}
  if(action==='now'){try{await openScan();}catch(e){tell(e.message,true);}return;}
  if(action==='refresh'){await startImport();return;}
  controlBusy=true;revision++;draw();
  try{
   if(action==='disable'){
    tell('正在暂停自动采集…');await photos.configure({enabled:false,time:draftTime||status?.time||'22:00'});await refresh();
    if(status?.enabled||status?.requested)throw Error('暂停状态未能确认，请重试');tell('自动采集已暂停，照片权限和已有记录保留。');
   }else if(action==='enable'){
    await refresh();
    if(status?.permission==='none'&&status.canRequestPermission===false){await permissionAction();return;}
    const granted=await access.enable(draftTime||status?.time||'22:00');await refresh();
    tell(granted?.enabled?'自动采集已开启。':'未获得照片权限，自动采集未开启。');
   }else if(action==='authorize')await permissionAction(true);
   else if(action==='scan-authorize')await permissionAction();
   else if(action==='system-settings'){await photos.openSettings();tell('已打开系统设置，返回后会刷新权限。');}
   else if(action==='discard'&&problem){if(await confirm('跳过这张照片','仅移除本机暂存副本，手机相册原图保留。')){await onDiscard({id:'native:'+problem.id,assetId:true});await photos.acknowledge({id:problem.id,discard:true});problem=null;await refresh();tell('已跳过，手机相册原图保留。');}}
  }catch(e){try{await refresh();}catch{}tell(`操作未能确认：${e.message}`,true);}
  finally{controlBusy=false;draw();}
 });
 async function startImport(){if(controlBusy)return;await run(null);}
 document.addEventListener('submit',async event=>{if(event.target.id!=='collector-scan-form')return;event.preventDefault();if(controlBusy)return;try{await refresh();if(status.permission==='none'){tell('请先允许照片访问。');return;}await run({days:Number(new FormData(event.target).get('days'))});}catch(e){tell(`采集未能开始：${e.message}`,true);}});
 document.addEventListener('change',async event=>{if(event.target.id!=='collector-time')return;const time=event.target.value;if(!/^([01]\d|2[0-3]):[0-5]\d$/.test(time)){tell('请选择有效采集时间。',true);return;}if(controlBusy){toast('请稍候再修改时间。');return;}controlBusy=true;draftTime=time;revision++;draw();try{await photos.configure({enabled:!!status?.enabled,time});await refresh();if(status?.time!==time)throw Error('时间未保存');tell('采集时间已保存。');}catch(e){draftTime='';await refresh().catch(()=>{});tell(e.message,true);}finally{controlBusy=false;draw();}});
 const resume=()=>{clearTimeout(resumeTimer);resumeTimer=setTimeout(async()=>{if(document.hidden||controlBusy||access.requesting)return;try{await refresh();draw();if(!busy)await startImport();}catch(e){tell(e.message,true);}},150);};
 document.addEventListener('visibilitychange',resume);document.addEventListener('shiri-native-resume',resume);
 return {panel,start,enable:access.enable,clear:async()=>{if(busy||controlBusy)throw Error('照片正在处理，请稍候再清空');await photos?.clearQueue();await refresh();}};
}
