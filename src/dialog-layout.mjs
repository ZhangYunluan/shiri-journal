// Bound ordinary dialogs to the *visible* viewport. Do not duplicate native insets,
// replace focused inputs, or interfere with the comments/gallery-owned dialogs.
export function installDialogLayout() {
 const dialogs=[...document.querySelectorAll('#editor-dialog,#import-dialog,#confirm-dialog,#photo-onboarding-dialog,#collector-scan-dialog')];
 let frame=0,reveal=false;
 function measure(){
  frame=0;const viewport=window.visualViewport,styles=getComputedStyle(document.documentElement);
  const inset=edge=>parseFloat(styles.getPropertyValue('--safe-area-inset-'+edge)||styles.getPropertyValue('--dialog-safe-'+edge))||0;
  const top=(viewport?.offsetTop||0)+Math.max(8,inset('top'));
  const height=Math.max(0,(viewport?.height||innerHeight)-Math.max(8,inset('top'))-Math.max(8,inset('bottom')));
  for(const dialog of dialogs){
   if(!dialog.open)continue;
   dialog.style.setProperty('--dialog-available',height+'px');
   dialog.style.setProperty('--dialog-top',top+Math.max(0,(height-dialog.getBoundingClientRect().height)/2)+'px');
   const field=document.activeElement,body=dialog.querySelector('.dialog-body');
   if(reveal&&body?.contains(field)){
    const a=field.getBoundingClientRect(),b=body.getBoundingClientRect();
    if(a.top<b.top+8)body.scrollTop-=b.top+8-a.top;
    else if(a.bottom>b.bottom-8)body.scrollTop+=Math.min(a.bottom-b.bottom+8,a.top-b.top-8);
   }
  }
  reveal=false;
 }
 function schedule(focus=false){reveal||=focus;if(!frame)frame=requestAnimationFrame(measure);}
 const resized=()=>schedule(true);
 window.addEventListener('resize',resized);
 window.visualViewport?.addEventListener('resize',resized);
 window.visualViewport?.addEventListener('scroll',resized);
 document.addEventListener('focusin',event=>{if(dialogs.some(d=>d.contains(event.target)))schedule(true);});
 const observer=new MutationObserver(()=>schedule());
 for(const dialog of dialogs)observer.observe(dialog,{attributes:true,attributeFilter:['open'],childList:true,subtree:true});
 schedule();
}
