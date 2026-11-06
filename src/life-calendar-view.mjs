import {localDate} from './core.mjs';
import {monthDays,savedOn,photosIn,dailyFeeling} from './life-calendar.mjs';
import {readableTitle} from './friend-timeline.mjs';
import {esc,button} from './ui.mjs';

const photo=r=>`<button class="friend-thumbnail" data-local-photo="${esc(r.assetId)}" aria-label="查看 ${esc(readableTitle(r))}"><span>正在读取照片…</span></button>`;
export function calendarView(s){
 const month=s.calendarMonth||s.date.slice(0,7),[year,m]=month.split('-'),settings=s.data.settings||[];
 const counts=new Map();for(const r of s.data.records)if(r.status==='confirmed'&&!r.excluded&&r.date?.startsWith(month))counts.set(r.date,(counts.get(r.date)||0)+1);
 const feelings=new Map(settings.filter(r=>r.id.startsWith('daily-feeling:')).map(r=>[r.date,r]));
 const cells=monthDays(month).map(date=>{
  if(!date)return '<span class="calendar-blank" aria-hidden="true"></span>';
  const feeling=feelings.get(date),count=counts.get(date)||0;
  return `<button class="calendar-day ${date===s.date?'selected':''} ${date===localDate()?'is-today':''}" data-action="calendar-day" data-date="${date}" aria-pressed="${date===s.date}" aria-label="${date}${feeling?'，'+esc(feeling.emotion):''}${count?'，有已保存记录':''}"><span>${Number(date.slice(-2))}</span>${feeling?`<span class="calendar-emoji" aria-hidden="true">${esc(feeling.emoji)}</span>`:''}${count?'<i class="calendar-dot" aria-hidden="true"></i>':''}</button>`;
 }).join('');
 const rows=savedOn(s.data.records,s.date),shown=rows.slice(0,s.calendarLimit||20),feeling=dailyFeeling(settings,s.date);
 return `<section class="life-calendar panel panel-padding" aria-label="生活足迹月历"><div class="calendar-toolbar">${button('calendar-shift','','left','button ghost icon-only','data-offset="-1" aria-label="上个月"')}<label><span class="sr-only">年份</span><input id="calendar-year" type="number" min="1900" max="2200" value="${year}" inputmode="numeric" aria-label="日历年份"></label><label><span class="sr-only">月份</span><select id="calendar-month" aria-label="日历月份">${Array.from({length:12},(_,i)=>`<option value="${String(i+1).padStart(2,'0')}" ${i+1===Number(m)?'selected':''}>${i+1}月</option>`).join('')}</select></label>${button('calendar-shift','','right','button ghost icon-only','data-offset="1" aria-label="下个月"')}</div><div class="calendar-weekdays" aria-hidden="true">${['一','二','三','四','五','六','日'].map(d=>'<span>'+d+'</span>').join('')}</div><div class="calendar-grid">${cells}</div><div class="calendar-detail"><div class="section-head"><h3>${esc(s.date)}</h3>${button('daily-feeling',feeling?esc(feeling.emoji+' '+feeling.emotion):'留下今天的感受','','button ghost small-button')}</div><div class="calendar-entries" data-local-gallery>${shown.length?shown.map(r=>`<article class="calendar-entry">${r.assetId?photo(r):''}<div><button class="calendar-record-title" data-action="edit-record" data-id="${esc(r.id)}">${esc(readableTitle(r))}</button>${r.note?(r.note.length>160?`<details><summary>${esc(r.note.slice(0,100))}…</summary><p>${esc(r.note)}</p></details>`:`<p>${esc(r.note)}</p>`):''}<small class="muted">${esc(s.data.categories.find(c=>c.id===r.categoryId)?.name||'生活碎片')}${r.emotion?' · '+esc(r.emotion):''}</small></div></article>`).join(''):'<p class="muted calendar-empty">这一天，还没有留下片刻。</p>'}</div>${rows.length>shown.length?button('calendar-more','继续回看','','button ghost'):''}</div></section>`;
}
export function photoRecall(s,range){
 const rows=photosIn(s.data.records,range),shown=rows.slice(0,s.recallLimit||24);if(!shown.length)return '';
 return `<section class="panel panel-padding photo-recall" aria-label="照片回顾"><div class="section-head"><h2>照片回顾</h2><small class="muted">${rows.length} 个有照片的片刻</small></div><div class="recall-grid" data-local-gallery>${shown.map(r=>`<figure>${photo(r)}<figcaption><strong>${esc(readableTitle(r))}</strong><small class="muted">${esc(r.date)}</small></figcaption></figure>`).join('')}</div>${rows.length>shown.length?button('recall-more','继续回看','','button ghost'):''}</section>`;
}
