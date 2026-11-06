/** Pure transitions: exclusion never deletes an asset or a system gallery file. */
export function savedMoment(record,visibility='friends'){
  return {...record,kind:'moment',status:'confirmed',excluded:false,visibility,
    updatedAt:new Date().toISOString(),cloudSync:{revision:crypto.randomUUID(),state:visibility==='self'?'local':'pending',attempts:0}};
}
export const isSyncable=r=>r?.kind==='moment'&&r.status==='confirmed'&&!r.excluded&&r.visibility==='friends';
export function reviewBatch(records,ids,action){
  const selected=new Set(ids);
  return records.map(r=>{
    if(!selected.has(r.id)||!r.assetId||r.status!=='review')return r;
    if(action==='confirm')return r.excluded?r:savedMoment(r,r.visibility||'friends');
    if(action==='exclude'||action==='restore')return {...r,excluded:action==='exclude',updatedAt:new Date().toISOString()};
    throw Error('无效审核操作');
  });
}
export function syncLabel(r,online=globalThis.navigator?.onLine!==false){
  if(r.excluded)return '已排除';if(r.status==='review')return '已导入 · 待审核';
  if(!isSyncable(r))return '已保存 · 仅自己';
  if(r.cloudSync?.state==='pending'){
    if(!online)return '待联网同步';
    if(r.cloudSync.errorStatus===401)return '待重新登录';
    return r.cloudSync.error?'同步失败 · 可重试':'已保存 · 待同步';
  }
  return ({pending:'已保存 · 待同步',waiting:'已保存 · 待好友授权',syncing:'同步中',synced:'已同步',local:'已保存'})[r.cloudSync?.state]||'已保存';
}

export function syncDetail(r){
  const q=r.cloudSync;if(!isSyncable(r)||q?.state!=='pending'||!q.error)return '';
  const stage={prepare:'连接账号与好友服务',begin:'准备云端记录',compress:'压缩照片',upload:'上传照片',finish:'确认云端保存'}[q.stage];
  return (stage?stage+'：':'')+q.error;
}
