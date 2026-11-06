// Share business code, not platform-specific permissions or media identities.
export function platformServices(platform,register,owner){
 if(!['android','ios'].includes(platform))return {};
 const auth=Object.fromEntries(['get','set','clear'].map(method=>[method,args=>register('AuthVault')[method](args||{})]));
 if(platform==='ios')return {auth,
  pickPhotos:()=>register('ShiriPhotoPicker').pick({limit:50}),
  releasePickedPhotos:selectionId=>register('ShiriPhotoPicker').cleanup({selectionId})};
 return {auth,photos:{
  ...Object.fromEntries(['status','authorize','openSettings','configure','configureCloud','runNow','pending','acknowledge','clearQueue'].map(method=>[method,args=>register('PhotoCollector')[method]({...args,owner})])),
  ...Object.fromEntries(['location','protect','deleteOriginals','originalsCapabilities'].map(method=>[method,args=>register('PhotoOriginals')[method]({...args,owner})]))
 }};
}
export async function readPickedPhoto(photo,convert,fetcher=globalThis.fetch){
 if(!photo||!/^file:\/\//.test(photo.path||'')||!['image/jpeg','image/png','image/webp','image/gif'].includes(photo.type))throw Error('所选照片格式不受支持，请从系统相册导出 JPEG 后重试。');
 const response=await fetcher(convert(photo.path));
 if(!response.ok)throw Error('无法读取所选照片，请重新选择。');
 const blob=await response.blob();
 if(!blob.size||blob.size>20*1024*1024)throw Error('照片为空或超过 20 MiB，请选择较小的副本。');
 const taken=Number.isFinite(photo.taken)&&photo.taken>0&&photo.taken<=Date.now()+86400000?photo.taken:undefined;
 const file=new File([blob],String(photo.name||'照片.jpg').replace(/[\\/]/g,'_'),{type:photo.type,lastModified:taken||Date.now()});
 if(taken)Object.defineProperty(file,'captureTime',{value:taken});
 return file;
}
