import {esc} from './ui.mjs';
import {readableTitle} from './friend-timeline.mjs';
export function commentBody(value){
 const body=String(value||'').trim();
 if(!body||Array.from(body).length>300||/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/.test(body))throw Error('评论需为 1–300 字，可包含普通表情。');return body;
}
export function commentsPanel(s,uid){
 if(!s.record)return '';
 const peer=s.threads?.find(t=>t.participantId===s.participant)?.nickname||'好友';
 return `<section class="moment-comments" data-comments-panel aria-label="片刻留言"><div class="section-head"><h3>${esc(readableTitle(s.record))}</h3><button type="button" class="button ghost small-button" data-comments-action="close">关闭</button></div><div data-comment-scroll><p class="small muted">这段交流仅对片刻主人和对应留言者开放。</p>${s.owner?`<div class="comment-threads">${s.threads.map(t=>`<button type="button" class="button ${s.participant===t.participantId?'primary':'ghost'} small-button" data-comments-action="thread" data-participant="${esc(t.participantId)}" ${s.busy?'disabled':''}>${esc(t.nickname)}</button>`).join('')||'<p class="muted">这条片刻还没有留言。</p>'}</div>`:''}<div class="comment-messages">${s.messages.map(m=>`<article class="comment-message"><div class="row"><strong>${esc(m.authorId===uid?'我':s.owner?peer:'片刻主人')}</strong><small class="muted">${esc(new Date(m.createdAt).toLocaleString('zh-CN',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'}))}</small>${m.authorId!==uid?`<button type="button" class="button ghost small-button" data-comments-action="reply">回复</button>`:""}${s.owner||m.authorId===uid?`<button type="button" class="button ghost small-button" data-comments-action="delete" data-id="${esc(m.id)}" ${s.busy?'disabled':''}>删除</button>`:''}</div><p>${esc(m.body)}</p></article>`).join('')}</div>${s.hasMore?`<button type="button" class="button ghost small-button" data-comments-action="more" ${s.busy?'disabled':''}>查看后续留言</button>`:''}${s.error?`<p class="form-error" role="alert">${esc(s.error)}</p>`:''}${s.busy?'<p role="status" class="small muted">正在读取或保存留言…</p>':''}</div>${s.participant?`<form class="comment-composer" data-comments-form><label class="field"><span class="sr-only">写下留言</span><textarea name="comment" rows="1" maxlength="600" placeholder="围绕这个片刻，说一两句话…" required>${esc(s.draft||'')}</textarea></label><button class="button primary small-button" ${s.busy?'disabled':''}>${s.owner?'回复':'留言'}</button></form>`:''}</section>`;
}
// Page-local only: comments never enter personal reports, backups, AI context or analytics.
export function createMomentComments({api,getUserId,redraw,toast,confirm,onDenied=()=>{},onChange=async()=>{}}){
 let sheet=null,opener=null;
 function measure(){if(!sheet)return;const v=window.visualViewport;sheet.style.top=(v?.offsetTop||0)+'px';sheet.style.height=(v?.height||innerHeight)+'px';}
 function draw(){
  if(!sheet||!s.record)return;
  const field=sheet.querySelector('textarea'),focused=document.activeElement===field,selection=field?[field.selectionStart,field.selectionEnd]:null;
  const list=sheet.querySelector('[data-comment-scroll]'),top=list?.scrollTop||0,near=!list||list.scrollHeight-list.clientHeight-top<48;
  sheet.innerHTML=commentsPanel(s,getUserId());measure();
  const next=sheet.querySelector('[data-comment-scroll]');if(next)next.scrollTop=near?next.scrollHeight:top;
  if(focused){const f=sheet.querySelector('textarea');f?.focus({preventScroll:true});if(selection)f?.setSelectionRange(...selection);}
 }
 window.addEventListener('hashchange',()=>clear());window.addEventListener('resize',measure);window.visualViewport?.addEventListener('resize',measure);window.visualViewport?.addEventListener('scroll',measure);
 let epoch=0;const s={record:null,owner:false,participant:'',threads:[],messages:[],draft:'',clientId:null,hasMore:false,offset:0,busy:false,error:''};
 function clear(){epoch++;const previous=sheet;sheet=null;previous?.remove();if(opener?.isConnected)opener.focus({preventScroll:true});opener=null;Object.assign(s,{record:null,participant:'',threads:[],messages:[],draft:'',clientId:null,hasMore:false,offset:0,busy:false,error:''});}
 const payload=()=>({recordId:s.record.id,...(s.owner?{participantId:s.participant}:{})});
 const message=m=>{
  if(!m||typeof m.id!=='string'||typeof m.authorId!=='string'||!Number.isFinite(Date.parse(m.createdAt)))throw Error('留言返回格式异常，请刷新重试');
  return {id:m.id,authorId:m.authorId,body:commentBody(m.body),createdAt:m.createdAt};
 };
 async function run(work){
  if(s.busy)return;s.busy=true;s.error='';const ticket=epoch,user=getUserId(),live=()=>epoch===ticket&&user===getUserId();draw();
  try{await work(live);}catch(error){if(live()){if([401,403,404].includes(error.status)){clear();onDenied();toast('留言访问权限已变化，请刷新近况。');}else s.error=error.message||'留言暂未完成，内容仍保留。';}}
  finally{if(live()){s.busy=false;draw();}else if(!s.record)redraw();}
 }
 async function read(live,reset=false){
  const offset=reset?0:s.offset,result=await api.comments('list',{...payload(),offset});if(!live())return;
  if(!Array.isArray(result?.comments)||result.comments.length>30)throw Error('留言返回格式异常');
  const rows=result.comments.map(message),all=reset?[]:s.messages;
  s.messages=[...new Map([...all,...rows].map(m=>[m.id,m])).values()].sort((a,b)=>a.createdAt.localeCompare(b.createdAt)||a.id.localeCompare(b.id));
  s.offset=offset+rows.length;s.hasMore=result.hasMore===true;
 }
 document.addEventListener('input',event=>{
  if(!event.target.closest('[data-comments-form]'))return;s.draft=event.target.value;s.clientId=null;
 });
 document.addEventListener('submit',event=>{
  if(!event.target.matches('[data-comments-form]'))return;event.preventDefault();
  run(async live=>{
   const body=commentBody(s.draft);s.clientId||=crypto.randomUUID();
   const result=await api.comments('send',{...payload(),body,clientId:s.clientId});if(!live())return;
   const saved=message(result);s.messages=[...s.messages.filter(m=>m.id!==saved.id),saved];if(s.draft===body){s.draft='';s.clientId=null;}toast('留言已保存。');await onChange(s.record.id);
  });
 });
 document.addEventListener('click',event=>{
  const b=event.target.closest('[data-comments-action]');if(!b)return;event.preventDefault();const action=b.dataset.commentsAction;
  if(action==='close'){clear();return;}
  if(action==='reply'){sheet?.querySelector('textarea')?.focus({preventScroll:true});return;}
  run(async live=>{
   if(action==='thread'){s.participant=b.dataset.participant;s.draft='';s.clientId=null;await read(live,true);if(live()){draw();sheet?.querySelector('textarea')?.focus({preventScroll:true});}}
   if(action==='more')await read(live);
   if(action==='delete'){
    if(!await confirm('删除这条留言？','只删除这条留言，片刻和照片保留。')||!live())return;
    await api.comments('delete',{id:b.dataset.id});if(live()){await read(live,true);await onChange(s.record.id);}
   }
  });
 });
 document.addEventListener('visibilitychange',()=>{if(document.hidden)clear();});
 return {get opened(){return !!s.record;},clear,panel:()=>'',async open(record,owner){
  clear();Object.assign(s,{record,owner,participant:owner?'':getUserId()});
  opener=document.activeElement;sheet=document.createElement('dialog');sheet.className='comments-sheet';sheet.setAttribute('aria-label','片刻评论');document.body.append(sheet);draw();sheet.showModal();sheet.addEventListener('close',()=>{if(sheet)clear();});sheet.addEventListener('cancel',event=>{event.preventDefault();clear();});sheet.querySelector('textarea')?.focus({preventScroll:true});
  await run(async live=>{
   if(owner){const result=await api.comments('threads',{recordId:record.id});if(!live())return;if(!Array.isArray(result?.threads)||result.threads.length>100)throw Error('留言参与者返回格式异常');s.threads=result.threads;if(s.threads.length===1)s.participant=s.threads[0].participantId;}
   if(s.participant)await read(live,true);
  });
  // Dialog stays next to the visible viewport; the timeline never jumps to its top.
 }};
}
