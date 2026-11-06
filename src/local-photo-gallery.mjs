import {mountPhotos} from './friend-timeline.mjs';
// Reuses the existing modal/swipe renderer. No original is read until a photo is opened.
export function mountLocalPhotos(root,{getAsset,isCurrent}){
 const items=[...root.querySelectorAll('[data-local-photo]')];if(!items.length)return ()=>{};
 const allowed=new Set(items.map(el=>el.dataset.localPhoto));
 for(const el of items)el.dataset.privatePhoto=el.dataset.localPhoto;
 const read=async(id,thumbnail)=>{
  if(!allowed.has(id)||!isCurrent())throw Error('照片已离开当前回顾');
  const asset=await getAsset(id),blob=thumbnail?asset?.thumbnail:asset?.blob;
  if(!(blob instanceof Blob)||!isCurrent())throw Error('本机照片暂不可用');return blob;
 };
 return mountPhotos(root,{local:true,photo:id=>read(id,false),thumbnail:id=>read(id,true)},isCurrent,false);
}
