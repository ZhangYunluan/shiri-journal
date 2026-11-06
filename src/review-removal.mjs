import {reviewBatch} from './moment-review.mjs';
export function removalPlan(records,ids){
 const selected=new Set(ids),candidates=records.filter(r=>selected.has(r.id)&&r.assetId&&r.status==='review'&&!r.excluded);
 const protectedAssets=new Set(records.filter(r=>r.status==='confirmed').map(r=>r.assetId));
 const originals=candidates.filter(r=>!r.originalDeleted&&r.source==='native-auto'&&/^native:[a-f0-9-]{36}$/.test(r.id)&&/^[a-f0-9]{64}$/.test(r.assetId)&&!protectedAssets.has(r.assetId));
 return {candidates,originals,blocked:candidates.filter(r=>!originals.includes(r))};
}
/** Local-only exclusion is the default. System deletion never implies saving or uploading. */
export async function removeCandidates({records,ids,mode='exclude',native,persist}){
 const plan=removalPlan(records,ids);let targets=plan.candidates,failed=[],cancelled=false;
 if(mode==='originals'){
  if(!native?.deleteOriginals)throw Error('此环境不支持系统删除，请仅从拾日排除。');
  if(plan.blocked.length)throw Error('所选照片包含已保存片刻使用的文件或没有可核验的相册关联，请仅排除或重新选择。');
  const protectedIds=records.filter(r=>r.status==='confirmed'&&r.id.startsWith('native:')).map(r=>r.id.slice(7));
  for(let i=0;i<protectedIds.length;i+=300)await native.protect({ids:protectedIds.slice(i,i+300)});
  const result=await native.deleteOriginals({photos:targets.map(r=>({id:r.id.slice(7),sha256:r.assetId}))});
  if(result?.cancelled)return {rows:[],failed:[],cancelled:true};
  const allowed=new Set(targets.map(r=>r.id.slice(7)));
  if(!Array.isArray(result?.deleted)||result.deleted.some(id=>!allowed.has(id))||new Set(result.deleted).size!==result.deleted.length)throw Error('系统删除结果无法确认，候选列表保留。');
  const deleted=new Set(result.deleted);targets=targets.filter(r=>deleted.has(r.id.slice(7)));
  failed=plan.candidates.filter(r=>!deleted.has(r.id.slice(7))).map(r=>({id:r.id,reason:result.failed?.find(f=>f.id===r.id.slice(7))?.reason||'未确认删除，请重试或仅排除。'}));
 }else if(mode!=='exclude')throw Error('未知移除操作');
 const targetIds=targets.map(r=>r.id);
 const rows=reviewBatch(records,targetIds,'exclude').filter(r=>targetIds.includes(r.id)).map(r=>mode==='originals'?{...r,originalDeleted:true}:r);
 if(rows.length)await persist(rows);
 return {rows,failed,cancelled};
}
export function chooseRemoval(count,canDelete){
 return new Promise(resolve=>{
  const dialog=document.querySelector('#confirm-dialog');let settled=false;
  const finish=mode=>{if(settled)return;settled=true;dialog.close();resolve(mode);};
  dialog.innerHTML=`<form id="confirmation"><div class="dialog-head"><h2 id="confirm-title">移除 ${count} 张待审核照片</h2></div><div class="dialog-body"><label class="removal-option"><input type="radio" name="mode" value="exclude" checked>仅从拾日排除<span class="small muted">保留系统相册原图，可撤销排除。</span></label><label class="removal-option"><input type="radio" name="mode" value="originals" ${canDelete?'':'disabled'}>同时删除手机相册原图<span class="small muted">将请求 Android 确认删除这 ${count} 张原图；撤销排除无法恢复原图。</span></label>${canDelete?'':'<p class="small muted">原图删除仅支持 Android 11+ 中可核验的采集照片；已保存片刻关联的文件受保护。</p>'}</div><div class="dialog-foot"><button type="button" class="button" id="confirm-cancel">取消</button><button type="submit" class="button primary">仅排除选中</button></div></form>`;
  const form=dialog.querySelector('form'),submit=form.querySelector('[type=submit]');
  form.onchange=()=>{const deleting=form.elements.mode.value==='originals';submit.textContent=deleting?`确认删除 ${count} 张原图`:'仅排除选中';submit.className='button '+(deleting?'danger':'primary');};
  form.onsubmit=e=>{e.preventDefault();finish(form.elements.mode.value);};dialog.querySelector('#confirm-cancel').onclick=()=>finish(null);
  dialog.oncancel=e=>{e.preventDefault();finish(null);};dialog.onclose=()=>{if(!dialog.open)finish(null);};dialog.showModal();dialog.querySelector('#confirm-cancel').focus();
 });
}
