// Lightweight motion, no libraries or network. Never hide essential content before JS runs.
const root=document.documentElement;
const reduced=matchMedia('(prefers-reduced-motion: reduce)');
const fine=matchMedia('(hover: hover) and (pointer: fine)');
const toggle=document.querySelector('#motion-toggle');
const visual=document.querySelector('.hero-visual');
const progress=document.querySelector('.reading-progress');
const steps=[...document.querySelectorAll('.steps li')];
let paused=false,frame=0;
const enabled=()=>!paused&&!reduced.matches&&!document.hidden;
function resetTilt(){visual.style.removeProperty('--lean-x');visual.style.removeProperty('--lean-y');visual.style.removeProperty('--shift');}
function applyPreference(){
 const on=!paused&&!reduced.matches;
 root.classList.toggle('motion-on',on);root.classList.toggle('motion-off',!on);
 toggle.hidden=false;toggle.disabled=reduced.matches;
 toggle.setAttribute('aria-pressed',String(!on));
 toggle.textContent=reduced.matches?'已遵循减少动态设置':paused?'开启动效 ▷':'暂停动效 Ⅱ';
 if(!on)resetTilt();schedule();
}
toggle.addEventListener('click',()=>{paused=!paused;applyPreference();});
reduced.addEventListener('change',applyPreference);
document.addEventListener('visibilitychange',()=>{root.classList.toggle('page-hidden',document.hidden);if(!document.hidden)schedule();});
// One rAF per scroll event batch; no perpetual JS animation loop.
function paint(){
 frame=0;const max=Math.max(1,document.documentElement.scrollHeight-innerHeight);
 progress.style.transform=`scaleX(${Math.min(1,Math.max(0,scrollY/max))})`;
 const box=document.querySelector('.steps').getBoundingClientRect();
 const active=Math.min(4,Math.max(0,Math.ceil((innerHeight*.9-box.top)/Math.max(1,box.height+innerHeight*.25)*4)));
 steps.forEach((step,i)=>step.classList.toggle('is-active',i<active));
 if(enabled()&&fine.matches){const rect=visual.getBoundingClientRect();if(rect.bottom>0&&rect.top<innerHeight)visual.style.setProperty('--shift',`${Math.min(18,Math.max(-18,scrollY*.035))}px`);}
}
function schedule(){if(!frame)frame=requestAnimationFrame(paint);}
addEventListener('scroll',schedule,{passive:true});addEventListener('resize',schedule,{passive:true});
visual.addEventListener('pointermove',event=>{
 if(!enabled()||!fine.matches)return;
 const r=visual.getBoundingClientRect();
 visual.style.setProperty('--lean-y',`${((event.clientX-r.left)/r.width-.5)*9}deg`);
 visual.style.setProperty('--lean-x',`${(.5-(event.clientY-r.top)/r.height)*7}deg`);
});
visual.addEventListener('pointerleave',resetTilt);
if('IntersectionObserver' in window){
 const observer=new IntersectionObserver(entries=>entries.forEach(entry=>{if(entry.isIntersecting){entry.target.classList.add('has-entered');observer.unobserve(entry.target);}}),{threshold:.12});
 document.querySelectorAll('.value,.download-copy').forEach(el=>observer.observe(el));
 // Stop continuous hero motion when it is offscreen, while keeping the ribbon independent.
 new IntersectionObserver(([e])=>visual.classList.toggle('page-hidden',!e.isIntersecting)).observe(visual);
 const ribbon=document.querySelector('.life-ribbon');
 new IntersectionObserver(([e])=>ribbon.classList.toggle('page-hidden',!e.isIntersecting)).observe(ribbon);
}
applyPreference();
