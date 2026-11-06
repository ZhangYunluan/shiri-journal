import * as views from '../src/views.mjs';
import {DEFAULT_CATEGORIES,DEFAULT_SETTINGS,localDate,addDays} from '../src/core.mjs';
import {reviewBatch,savedMoment} from '../src/moment-review.mjs';
import {saveFeedback} from '../src/record-journey.mjs';
import {shiftMonth,makeDailyFeeling,DAILY_PRESETS} from '../src/life-calendar.mjs';
import {esc,icon} from '../src/ui.mjs';
import {loadDemo,writeDemo,freshDemo,sampleRecord} from './store.mjs';

const images=Object.fromEntries(['sunset','reading','table'].map(name=>[name,new URL(`./assets/${name}.svg`,import.meta.url).href]));
let data=loadDemo(localStorage);
const state={data:{...data,categories:data.categories||DEFAULT_CATEGORIES,plans:[],learning:[]},settings:DEFAULT_SETTINGS,
  date:data.date||localDate(),reportDate:data.date||localDate(),period:'week',reportStyle:'brief',
  calendarOpen:false,calendarMonth:(data.date||localDate()).slice(0,7),urls:images,
  view:'dashboard',filterCategory:'all',filterStatus:'all',categoryFocus:'all',search:'',
  batchMode:false,batchSelected:new Set(),showExcluded:false,excludedUndo:[],libraryLimit:80,reportEditing:false};
const main=document.querySelector('#demo-main'),dialog=document.querySelector('#demo-dialog');
let toastTimer;
function toast(message){
  const box=document.querySelector('.demo-toast');
  box.textContent=message;box.hidden=false;clearTimeout(toastTimer);
  toastTimer=setTimeout(()=>{box.hidden=true;},3400);
}
function persist(){
  try{writeDemo(localStorage,{version:1,date:state.date,records:state.data.records,reports:state.data.reports,settings:state.data.settings,categories:state.data.categories});}
  catch{toast('浏览器存储不可用，本次演示仅保留到页面关闭。');}
}
function render(){
  document.querySelectorAll('.demo-nav a').forEach(a=>{
    if(a.hash===`#${state.view}`)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');
  });
  main.innerHTML=views[state.view](state);
  main.querySelectorAll('[data-local-photo]').forEach(button=>{
    const image=document.createElement('img');image.src=images[button.dataset.localPhoto];image.alt='原创示意图片';image.loading='lazy';button.replaceChildren(image);
  });
}
function navigate(view){location.hash=view;}
function modal(title,body){
  dialog.innerHTML=`<div class="demo-dialog-head"><h2 id="demo-dialog-title">${esc(title)}</h2><button class="button ghost icon-only" data-action="close-dialog" aria-label="关闭">${icon('close')}</button></div>${body}`;
  dialog.showModal();
}
function edit(record){
  modal(record.status==='confirmed'?'回看这个片刻':'留下这个片刻',`<form id="moment-form" data-id="${esc(record.id)}">
    ${record.assetId?`<img class="demo-preview" src="${images[record.assetId]}" alt="原创示意图片">`:''}
    <label class="field">标题<input name="title" maxlength="100" required value="${esc(record.title)}"></label>
    <label class="field">写下一点感受<textarea name="note" maxlength="2000" rows="3">${esc(record.note)}</textarea></label>
    <label class="field">生活分类<select name="categoryId">${views.catOptions(state,record.categoryId)}</select></label>
    <p class="small muted">演示片刻仅保存在当前浏览器。</p><button type="submit" class="button primary">保存片刻</button></form>`);
}
function saveRows(next,ids){
  const before=state.data.records;
  state.data.records=next;
  const feedback=saveFeedback(before,next,next.filter(r=>ids.includes(r.id)),state.date);
  persist();render();toast(feedback.title+' · 已保存在本机');
}
function downloadReport(){
  const text=views.reportData(state).text;
  const url=URL.createObjectURL(new Blob([text],{type:'text/markdown;charset=utf-8'}));
  const link=document.createElement('a');link.href=url;link.download=`shiri-demo-${state.period}-${state.reportDate}.md`;link.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function picker(){
  modal('选择一张示意图片',`<p class="muted">用示例体验整理流程。系统相册能力请在 Android APP 中测试。</p><div class="demo-picker">${Object.entries(images).map(([name,url],index)=>`<button data-action="sample-add" data-index="${index}"><img src="${url}" alt="${name}"><span>${['晚风','阅读','日常'][index]}</span></button>`).join('')}</div>`);
}
document.addEventListener('click',async event=>{
  const photo=event.target.closest('[data-local-photo]');
  if(photo){modal('照片回顾',`<img class="demo-full-image" src="${images[photo.dataset.localPhoto]}" alt="原创示意图片">`);return;}
  const target=event.target.closest('[data-action]');if(!target)return;
  const action=target.dataset.action,id=target.dataset.id;
  const record=state.data.records.find(r=>r.id===id);
  if(action==='close-dialog'){dialog.close();return;}
  if(action==='import'){picker();return;}
  if(action==='sample-add'){
    const row={...sampleRecord(Number(target.dataset.index),state.date),id:crypto.randomUUID()};
    state.data.records.push(row);persist();dialog.close();navigate('library');render();toast('已加入待审核，尚未保存为片刻');return;
  }
  if(action==='note'){
    const row={...sampleRecord(0,state.date),id:crypto.randomUUID(),assetId:null,title:'今天的一件小事',note:'',kind:'note'};
    // A cancelled note is not inserted into the store.
    edit(row);dialog.querySelector('form').dataset.draft=JSON.stringify(row);return;
  }
  if(action==='edit-record'&&record){edit(record);return;}
  if(action==='review-today'){state.filterStatus='review';state.reviewDate=state.date;navigate('library');render();return;}
  if(action==='journey-report'){state.reportDate=state.date;state.period='day';navigate('reports');render();return;}
  if(action==='batch-mode'){state.batchMode=!state.batchMode;state.batchSelected.clear();}
  else if(action==='batch-select'){if(state.batchSelected.has(id))state.batchSelected.delete(id);else state.batchSelected.add(id);}
  else if(action==='batch-all'){
    const ids=views.reviewCandidates(state).map(r=>r.id);
    state.batchSelected=new Set(ids.every(key=>state.batchSelected.has(key))?[]:ids);
  }
  else if(['batch-confirm','batch-exclude','batch-restore'].includes(action)){
    const ids=[...state.batchSelected];if(!ids.length){toast('先选择需要整理的图片');return;}
    const operation={'batch-confirm':'confirm','batch-exclude':'exclude','batch-restore':'restore'}[action];
    if(operation==='exclude')state.excludedUndo=ids;
    const next=reviewBatch(state.data.records,ids,operation);state.batchSelected.clear();
    if(operation==='confirm'){saveRows(next,ids);return;}
    state.data.records=next;persist();toast(operation==='exclude'?'已从候选列表排除，可以撤销':'已恢复为待审核');
  }
  else if(action==='batch-undo'){state.data.records=reviewBatch(state.data.records,state.excludedUndo,'restore');state.excludedUndo=[];persist();toast('已撤销排除');}
  else if(action==='excluded-view'){state.showExcluded=!state.showExcluded;state.batchSelected.clear();}
  else if(action==='library-status'){state.filterStatus=id;state.showExcluded=false;state.batchSelected.clear();}
  else if(action==='review-all-dates')state.reviewDate='';
  else if(action==='library-more')state.libraryLimit+=80;
  else if(action==='calendar-toggle')state.calendarOpen=!state.calendarOpen;
  else if(action==='calendar-shift')state.calendarMonth=shiftMonth(state.calendarMonth,Number(target.dataset.offset));
  else if(action==='calendar-day'||action==='select-day')state.date=target.dataset.date;
  else if(action==='prev-day'||action==='next-day')state.date=addDays(state.date,action==='prev-day'?-1:1);
  else if(action==='today')state.date=localDate();
  else if(action==='calendar-more')state.calendarLimit=(state.calendarLimit||20)+20;
  else if(action==='recall-more')state.recallLimit=(state.recallLimit||24)+24;
  else if(action==='period')state.period=id;
  else if(action==='download-report'){downloadReport();return;}
  else if(action==='copy-report'){
    try{await navigator.clipboard.writeText(views.reportData(state).text);toast('复盘文本已复制');}catch{toast('浏览器未允许复制，可以导出 Markdown。');}return;
  }
  else if(action==='save-report'){
    const report=views.reportData(state);state.data.reports=state.data.reports.filter(r=>r.id!==report.id);
    const edited=main.querySelector('#report-editor')?.value;
    state.data.reports.push({id:report.id,...report.range,text:edited??report.text,source:edited===undefined?'rules':'manual',recordSignature:report.signature,userReviewedAt:new Date().toISOString()});state.reportEditing=false;persist();toast('这份回顾已保存在演示空间');
  }
  else if(action==='edit-report')state.reportEditing=!state.reportEditing;
  else if(action==='regenerate-report'){
    const report=views.reportData(state);
    if(report.manual&&!confirm('用当前示例记录生成的报告替换手写内容？'))return;
    state.data.reports=state.data.reports.filter(r=>r.id!==report.id);state.reportEditing=false;persist();toast('已按当前演示记录重新整理');
  }
  else if(action==='open-category'){state.categoryFocus=id;}
  else if(action==='review-category'){state.filterCategory=id;state.filterStatus='review';navigate('library');render();return;}
  else if(action==='new-category'||action==='edit-category'){
    modal('演示分类',views.categoryForm(state.data.categories.find(c=>c.id===id)));return;
  }
  else if(action==='close-editor'){dialog.close();return;}
  else if(action==='daily-feeling'){
    modal('今天的整体感受',`<form id="demo-feeling"><label class="field">这一天的感受<select name="feeling"><option value="">暂不记录</option>${DAILY_PRESETS.map(([word,emoji])=>`<option value="${word}">${emoji} ${word}</option>`).join('')}</select></label><p class="muted small">仅代表这一天，不改变各个片刻的感受。</p><button class="button primary" type="submit">保存感受</button></form>`);return;
  }
  else {toast('此入口需要完整 APP，演示保留本地记录与回顾流程。');return;}
  render();
});
document.addEventListener('submit',event=>{
  event.preventDefault();const form=event.target,fields=new FormData(form);
  if(form.id==='moment-form'){
    const current=state.data.records.find(r=>r.id===form.dataset.id)||JSON.parse(form.dataset.draft);
    const row=savedMoment({...current,title:String(fields.get('title')).trim(),note:String(fields.get('note')).trim(),categoryId:fields.get('categoryId')},'self');
    if(!row.title)return;
    const next=state.data.records.filter(r=>r.id!==row.id).concat(row);
    dialog.close();saveRows(next,[row.id]);
  }else if(form.id==='demo-feeling'){
    const word=String(fields.get('feeling')||'');
    state.data.settings=state.data.settings.filter(r=>r.id!==`daily-feeling:${state.date}`);
    const row=makeDailyFeeling(state.date,word);if(row)state.data.settings.push(row);
    persist();dialog.close();render();toast('这一天的感受已保存');
  }else if(form.id==='category-form'){
    const name=String(fields.get('name')||'').trim();if(!name||name.length>30)return;
    const id=form.dataset.id||crypto.randomUUID();
    state.data.categories=state.data.categories.filter(c=>c.id!==id).concat({id,name,color:'#adc4a3',icon:'layers',builtIn:false});
    persist();dialog.close();render();toast('演示分类已保存');
  }
});
document.addEventListener('change',event=>{
  const {id,value}=event.target;
  if(id==='category-filter')state.filterCategory=value;
  else if(id==='report-date')state.reportDate=value;
  else if(id==='report-style')state.reportStyle=value;
  else if(id==='dashboard-date')state.date=value;
  else if(id==='calendar-year')state.calendarMonth=value+'-'+state.calendarMonth.slice(5);
  else if(id==='calendar-month')state.calendarMonth=state.calendarMonth.slice(0,4)+'-'+value;
  else return;
  render();
});
document.addEventListener('input',event=>{
  if(event.target.id==='library-search'){
    state.search=event.target.value;const cursor=event.target.selectionStart;render();const input=main.querySelector('#library-search');input.focus();input.setSelectionRange(cursor,cursor);
  }
});
document.querySelector('#reset-demo').addEventListener('click',()=>{
  if(!confirm('重置当前演示的示例记录？'))return;
  data=freshDemo();state.data={...state.data,...data};state.date=data.date;state.reportDate=data.date;
  state.batchSelected.clear();state.excludedUndo=[];state.showExcluded=false;state.reviewDate='';persist();render();toast('演示已重置');
});
function route(){
  const requested=location.hash.slice(1);
  state.view=['dashboard','library','categories','reports'].includes(requested)?requested:'dashboard';render();window.scrollTo(0,0);
}
window.addEventListener('hashchange',route);route();
