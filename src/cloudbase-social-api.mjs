import {validateCloudConfig} from './cloudbase-auth.mjs';
import {MEDIA_API} from './cloudbase-social-config.mjs';
import {requestScope} from './request-scope.mjs';

function apiError(status,data){
  const error=new Error(status===404||data?.code==='PGRST202'||data?.code==='42P01'
    ?'好友接口不可用，请核对当前环境和已部署的接口版本后刷新。'
    :status===401?'登录已过期，请刷新会话或重新登录。'
    :status===429?'操作太频繁，请稍后再试。'
    :data?.message||data?.error||'请求未完成，请重试。');
  error.status=status;return error;
}
// Fixed messages keep server response payloads and credentials out of local diagnostics.
function mediaError(status,kind=''){
  const messages={401:'登录已过期，请到好友页刷新会话或重新登录',403:'照片上传权限已失效，请重试同步；持续失败请检查授权',404:'照片接口未找到，请检查 shiri-media 网关路由',413:'照片超过服务允许的大小',415:'照片格式不受支持',429:'照片请求过于频繁，请稍后重试',502:'照片服务处理失败，请检查云函数与云存储配置',503:'照片服务配置不完整，请检查云函数环境变量'};
  const message=status?(messages[status]||'照片请求失败，请稍后重试')+'（HTTP '+status+'）':kind==='timeout'?'照片上传超时，请稍后重试。':kind==='abort'?'照片上传已取消，可稍后重试。':'无法连接照片服务，请检查网络或跨域配置。';
  return Object.assign(new Error(message),{status,code:status?'MEDIA_HTTP_'+status:'MEDIA_'+(kind?kind.toUpperCase():'CONNECTION')});
}
export function createSocialApi({auth,config,fetcher=globalThis.fetch,mediaUrl=MEDIA_API,xhrFactory=()=>new XMLHttpRequest()}){
  function identity(){if(!auth.session)throw Object.assign(Error('请先登录邮箱账号'),{status:401});return auth.session.user.id;}
  function still(uid){if(auth.session?.user.id!==uid)throw Error('登录状态已改变，请重试');}
  async function rpc(action,payload={},name='shiri_social'){
    const uid=identity(),url=validateCloudConfig(config)+'/v1/rdb/rest/rpc/'+name;
    for(let attempt=0;attempt<2;attempt++){
      const token=await auth.accessToken();still(uid);let res;const scope=requestScope();
      try{
      try{res=await fetcher(url,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+token},
        body:JSON.stringify({p_action:action,p_payload:payload}),credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:scope.signal});}
      catch{throw Error('无法连接好友服务，请检查网络后重试。');}
      still(uid);
      if(res.status===401&&attempt===0){await auth.refresh();continue;}
      let data;try{data=await res.json();}catch{throw Error('好友服务返回格式异常，请检查部署。');}
      if(!res.ok)throw apiError(res.status,data);return data;
      }finally{scope.dispose();}
    }
  }
  function photoUrl(id){
    if(!/^[0-9a-f-]{36}$/i.test(id))throw Error('照片标识无效');
    const url=new URL(mediaUrl);if(url.protocol!=='https:'||url.username||url.password||url.search||url.hash)throw Error('照片接口尚未配置');
    url.searchParams.set('id',id);return url.href;
  }
  async function photo(id,method='GET'){
    const uid=identity();
    for(let attempt=0;attempt<2;attempt++){
      const token=await auth.accessToken();still(uid);
      const scope=requestScope();
      try{
      const res=await fetcher(photoUrl(id),{method,headers:{Authorization:'Bearer '+token},credentials:'omit',cache:'no-store',redirect:'error',referrerPolicy:'no-referrer',signal:scope.signal});
      still(uid);if(res.status===401&&attempt===0){await auth.refresh();continue;}
      if(!res.ok)throw res.status===403?Object.assign(Error('这张照片已撤回或不在授权范围内。'),{status:403}):mediaError(res.status);
      if(method==='DELETE')return;
      const blob=await res.blob();still(uid);
      if(!blob.type.startsWith('image/jpeg')||blob.size>1048576)throw Error('照片响应无效');
      return blob;
      }finally{scope.dispose();}
    }
  }
  async function upload(id,blob,onProgress=()=>{}){
    const uid=identity();
    if(blob.type!=='image/jpeg'||blob.size>1048576)throw Error('分享照片需要小于 1 MiB 的 JPEG');
    for(let attempt=0;attempt<2;attempt++){
      const token=await auth.accessToken();still(uid);
      const status=await new Promise((resolve,reject)=>{
        const xhr=xhrFactory();xhr.open('PUT',photoUrl(id));xhr.timeout=45000;
        xhr.setRequestHeader('Authorization','Bearer '+token);xhr.setRequestHeader('Content-Type','image/jpeg');
        xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.min(99,Math.round(e.loaded/e.total*100)));};
        xhr.onload=()=>resolve(xhr.status);xhr.onerror=()=>reject(mediaError(0));
        xhr.ontimeout=()=>reject(mediaError(0,'timeout'));xhr.onabort=()=>reject(mediaError(0,'abort'));xhr.send(blob);
      });
      still(uid);if(status===401&&attempt===0){await auth.refresh();continue;}
      if(status<200||status>=300)throw mediaError(status);
      onProgress(100);return;
    }
  }
  return {rpc,photo,upload,comments:(action,payload)=>rpc(action,payload,'shiri_comments'),interactions:(action,payload)=>rpc(action,payload,'shiri_interactions')};
}
// Explicit field projection; saved moments use the existing internal publish protocol.
export function shareProjection(record,category,{photo=false}={}){
  if(record.status!=='confirmed')throw Error('请先核对并确认这条本地记录');
  const title=(record.title||'').trim(),note=(record.note||'').trim();
  if(!title||Array.from(title).length>200)throw Error('分享标题需为 1–200 个字');
  if(Array.from(note).length>4000)throw Error('分享笔记最多 4000 个字，请先精简');
  return {localId:record.id,kind:['shared','moment'].includes(record.kind)?'shared':'record',title,note,date:record.date,
    categoryId:record.categoryId,categoryName:category?.name||'',confirmed:true,photo};
}
/** Re-encode pixels, never upload the original file or metadata. */
export async function sharingJpeg(blob){
  const url=URL.createObjectURL(blob);
  try{
    const img=new Image();img.src=url;await img.decode();
    if(img.naturalWidth*img.naturalHeight>70000000)throw Error('照片过大，请缩小后分享');
    const scale=Math.min(1,1280/Math.max(img.naturalWidth,img.naturalHeight));
    const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.naturalWidth*scale));canvas.height=Math.max(1,Math.round(img.naturalHeight*scale));
    canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);
    for(const quality of [.82,.65,.45]){
      const jpg=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',quality));
      if(jpg&&jpg.size<=1048576)return jpg;
    }
    throw Error('照片压缩后仍超过 1 MiB，请缩小后分享');
  }finally{URL.revokeObjectURL(url);}
}
