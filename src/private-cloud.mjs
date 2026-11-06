import * as db from './db.mjs';

/** Phase-one safety boundary: previous automatic private upload is retired.
 * Existing local settings/records stay untouched; no photos upload here.
 * Phase three connects explicit confirmed sharing to PG private storage.
 */
export function assertShareable(record){
  if(record?.status!=='confirmed'||record.shareApproved!==true)throw Error('照片必须先确认内容，并逐张明确确认分享');
}
export async function uploadPrivateRecord(record){
  assertShareable(record);throw Error('CloudBase 照片共享阶段尚未完成验收，照片仍保留本机');
}
export function createPrivateCloud({getData,changed,toast,confirm,reviewed=()=>{},revokeRemote=async()=>{}}){
  return {
    panel:()=>'<section class="panel settings-section"><h2>片刻同步与隐私</h2><p>保存片刻后，在好友一次授权范围内自动同步。未审核素材、私人日记、复盘和仅自己可见的片刻保留本机。</p><div class="notice">仅同步去除元数据的压缩照片。断网时保留本地任务，联网或重新打开应用后重试。离线删除或设为私密的撤销请求也会排队，联网完成撤销后服务器拒绝后续访问。</div></section>',
    sync:async()=>{},start:async()=>{},remove:async record=>revokeRemote(record.id),clear:async()=>{}
  };
}
