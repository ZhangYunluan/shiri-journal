import {esc,icon} from './ui.mjs';
export function readableTitle(r){const t=(r.title||'').trim();return !t||/^(?:\d{6,}|IMG[_\d-]|Screenshot[_\d-]|mmexport|[a-f\d]{24,})/i.test(t)?`${r.date} 的片刻`:t;}
export function interactionControls(r,comments,stats={},likes=false){
 const v=stats[r.id],count=(key)=>Number.isSafeInteger(v?.[key])?' '+v[key]:'';
 return `<div class="moment-actions" data-moment-actions="${esc(r.id)}">${comments?`<button type="button" class="button ghost small-button" data-friends-action="like" data-id="${esc(r.id)}" aria-pressed="${!!v?.liked}" ${likes?'':'disabled title="点赞服务尚未启用"'}>${icon('heart',17)} ${v?.liked?'已赞':'赞'}${count('likes')}</button><button type="button" class="button ghost small-button" data-friends-action="comments" data-id="${esc(r.id)}">${icon('comment',17)} 评论${count('comments')}</button>`:''}</div>`;
}
export function timeline(records,selected,comments=false,stats={},likes=false){
 const groups=new Map();for(const r of [...records].sort((a,b)=>String(b.date).localeCompare(String(a.date)))){const key=r.date;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(r);}
 return [...groups].map(([date,rows])=>`<section class="friend-day"><h3>${esc(date)}</h3><div class="friend-grid">${rows.map(r=>`<article class="friend-moment">${!selected?`<button class="button ghost small-button" data-friends-action="profile" data-id="${esc(r.ownerId||r.userId||'')}">${esc(r.nickname)}</button>`:''}${r.mediaId?`<button class="friend-thumbnail" data-private-photo="${esc(r.mediaId)}" aria-label="查看 ${esc(readableTitle(r))}"><span>照片加载中</span></button>`:''}<strong>${esc(readableTitle(r))}</strong>${r.note?`<details><summary>${esc(r.note.slice(0,65))}${r.note.length>65?'…':''}</summary><p>${esc(r.note)}</p></details>`:''}${interactionControls(r,comments,stats,likes)}</article>`).join('')}</div></section>`).join('');
}
// Each image request goes through the existing authenticated media API. No public URLs.
export function mountPhotos(root,api,isCurrent,canMore=true){
 let stopped=false,active=0;const queue=[],urls=new Set();let dialog=null,index=0,touch=0,galleryRequest=0,fullURL=null;
 const items=[...root.querySelectorAll('[data-private-photo]')];
 const discardURL=url=>{if(url){URL.revokeObjectURL(url);urls.delete(url);}};
 function closeGallery(){galleryRequest++;discardURL(fullURL);fullURL=null;const previous=dialog;dialog=null;previous?.remove();}
 const release=()=>{stopped=true;queue.length=0;observer.disconnect();closeGallery();for(const url of urls)URL.revokeObjectURL(url);urls.clear();};
 const urlFor=async (id,thumbnail=false)=>{let blob;try{blob=thumbnail&&api.thumbnail?await api.thumbnail(id):await api.photo(id);}catch(e){if([401,403,404].includes(e.status)){release();for(const el of items){el.replaceChildren(document.createTextNode('权限已变化，请刷新'));el.onclick=null;}}throw e;}if(stopped||!isCurrent())return null;if(thumbnail&&!api.thumbnail){const image=await createImageBitmap(blob);try{const ratio=Math.min(1,480/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*ratio));canvas.height=Math.max(1,Math.round(image.height*ratio));canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg',.8));if(!blob)throw Error('thumbnail failed');}finally{image.close();}}if(stopped||!isCurrent())return null;const url=URL.createObjectURL(blob);urls.add(url);return url;};
 async function show(i){
  if(stopped||!dialog||!isCurrent())return;
  index=(i+items.length)%items.length;const ticket=++galleryRequest,viewer=dialog;
  discardURL(fullURL);fullURL=null;viewer.querySelector('figure').textContent=api.local?'正在读取本机照片…':'正在验证照片权限…';
  viewer.querySelector('[data-position]').textContent=`${index+1} / ${items.length}`;
  try{
   const url=await urlFor(items[index].dataset.privatePhoto);
   // A unique request ticket also rejects old replies after next → previous returns to the same index.
   if(!url||ticket!==galleryRequest||dialog!==viewer){discardURL(url);return;}
   fullURL=url;const img=new Image();img.src=url;img.alt=items[index].getAttribute('aria-label')||'好友授权照片';viewer.querySelector('figure').replaceChildren(img);
  }catch{if(!stopped&&ticket===galleryRequest&&dialog===viewer)viewer.querySelector('figure').textContent='照片暂不可用或访问权限已撤销';}
 }
 function open(i){
  if(stopped||!isCurrent())return;
  closeGallery();dialog=document.createElement('dialog');dialog.className='friend-lightbox';dialog.setAttribute('aria-label',api.local?'生活照片':'好友授权照片');
  dialog.innerHTML='<button data-close aria-label="关闭照片">关闭</button><figure></figure><div><button data-prev>上一张</button><span data-position role="status"></span><button data-next>下一张</button></div>';
  const viewer=dialog;document.body.append(viewer);
  viewer.querySelector('[data-close]').onclick=closeGallery;
  viewer.addEventListener('close',()=>{if(dialog===viewer)closeGallery();});
  viewer.querySelector('[data-prev]').onclick=()=>show(index-1);viewer.querySelector('[data-next]').onclick=()=>show(index+1);
  for(const button of viewer.querySelectorAll('[data-prev],[data-next]'))button.disabled=items.length<2;
  viewer.onkeydown=e=>{if(e.key==='ArrowLeft'){e.preventDefault();show(index-1);}if(e.key==='ArrowRight'){e.preventDefault();show(index+1);}};
  viewer.ontouchstart=e=>touch=e.changedTouches[0].clientX;viewer.ontouchend=e=>{const dx=e.changedTouches[0].clientX-touch;if(Math.abs(dx)>50)show(index+(dx<0?1:-1));};
  viewer.showModal();show(i);
 }
 async function pump(){if(stopped||!isCurrent())return;while(active<2&&queue.length){const el=queue.shift();active++;(async()=>{try{const url=await urlFor(el.dataset.privatePhoto,true);if(!url)return;const img=new Image();img.alt='好友授权照片';img.loading='lazy';img.decoding='async';img.src=url;img.onerror=()=>el.textContent='加载失败，点击重试';el.replaceChildren(img);el.onclick=()=>open(items.indexOf(el));}catch{if(!stopped){el.textContent='暂不可用 · 点击重试';el.onclick=()=>{el.textContent='正在重试';queue.push(el);pump();};}}finally{active--;pump();}})();}}
 const observer=new IntersectionObserver(entries=>{for(const e of entries)if(e.isIntersecting){observer.unobserve(e.target);if(e.target.matches('[data-friends-action="more"]'))e.target.click();else queue.push(e.target);}pump();},{rootMargin:'160px'});
 for(const el of items)observer.observe(el);const more=root.querySelector('[data-friends-action="more"]');if(more&&canMore)observer.observe(more);return release;
}
