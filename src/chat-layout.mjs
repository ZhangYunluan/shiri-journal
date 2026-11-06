// Measure the visible viewport rather than assuming a particular WebView or keyboard.
// Resize updates CSS only: never replace inputs or blur the focused field.
export function createChatLayout(){
 let saved=null,frame=null;
 const log=()=>document.querySelector('.chat-messages');
 function capture(){
  const el=log();if(!el)return saved;
  const input=document.activeElement;
  saved={top:el.scrollTop,nearEnd:el.scrollHeight-el.clientHeight-el.scrollTop<48,
   count:el.querySelectorAll('.chat-message').length,
   focus:input?.closest('#assistant-form')?{name:input.name,start:input.selectionStart,end:input.selectionEnd}:null};
  return saved;
 }
 function measure(){
  const page=document.querySelector('.chat-page');if(!page)return;
  const viewport=window.visualViewport;
  const bottom=viewport?viewport.offsetTop+viewport.height:window.innerHeight;
  const nav=document.querySelector('#mobile-nav'),rect=nav?.getBoundingClientRect();
  const navOverlap=rect&&getComputedStyle(nav).display!=='none'&&rect.top<bottom&&rect.bottom>0?bottom-Math.max(0,rect.top):0;
  const scale=page.offsetWidth?page.getBoundingClientRect().width/page.offsetWidth:1;
  const height=Math.max(120,(bottom-page.getBoundingClientRect().top-navOverlap-12)/(scale||1));
  page.style.setProperty('--chat-height',height+'px');
 }
 function restore(previous){
  const el=log();if(!el)return;
  measure();const messages=el.querySelectorAll('.chat-message'),last=messages[messages.length-1];
  if(!previous||previous.nearEnd){
   // Start at the beginning of a long reply, rather than jumping past its text.
   if(last&&(!previous||messages.length>previous.count)&&last.offsetHeight>el.clientHeight-24)
    el.scrollTop+=last.getBoundingClientRect().top-el.getBoundingClientRect().top-8;
   else el.scrollTop=el.scrollHeight;
  }else el.scrollTop=previous.top;
  if(previous?.focus){
   const field=[...document.querySelectorAll('#assistant-form [name]')].find(e=>e.name===previous.focus.name);
   if(field&&!field.disabled){field.focus({preventScroll:true});if(typeof previous.focus.start==='number')field.setSelectionRange?.(previous.focus.start,previous.focus.end);}
  }
 }
 function resize(){
  if(frame!==null)cancelAnimationFrame(frame);
  frame=requestAnimationFrame(()=>{frame=null;const previous=capture();measure();const el=log();if(el&&previous){el.scrollTop=previous.nearEnd?el.scrollHeight:previous.top;}});
 }
 window.addEventListener('resize',resize);
 window.visualViewport?.addEventListener('resize',resize);
 window.visualViewport?.addEventListener('scroll',resize);
 return {capture,restore,reset(){saved=null;},forceLatest(){saved=null;restore(null);}};
}
