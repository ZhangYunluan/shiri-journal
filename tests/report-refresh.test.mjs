import test from 'node:test';
import assert from 'node:assert/strict';
import {reportData,reports,library} from '../src/views.mjs';
import {makeReport,signature,DEFAULT_CATEGORIES} from '../src/core.mjs';
const rows=Array.from({length:4},(_,i)=>({id:'r'+i,date:'2026-10-'+(12+i),time:'19:00',status:'confirmed',title:'第'+(i+1)+'天',categoryId:'daily',updatedAt:String(i),tags:[],note:''}));
function fixture(source){const s={period:'week',reportDate:'2026-10-15',reportStyle:'brief',data:{categories:DEFAULT_CATEGORIES,records:structuredClone(rows),reports:[]}};s.data.reports.push({id:'week:2026-10-12:brief',text:makeReport(rows.slice(0,1),DEFAULT_CATEGORIES,'week',s.reportDate),recordSignature:signature(rows.slice(0,1)),...(source?{source}:{})});return s;}
test('old one-day weekly snapshot previews four days without deleting saved original',()=>{
 const s=fixture(),original=s.data.reports[0].text;const r=reportData(s);
 assert.match(r.text,/4 条记录，覆盖 4 天/);assert.equal(r.preservedText,original);assert.equal(s.data.reports[0].text,original);
 assert.match(reports(s),/查看保留的原文/);
});
test('automatic reports update after additions, deletion, date movement and editing',()=>{
 const s=fixture('auto');assert.match(reportData(s).text,/4 条记录/);
 s.data.records.splice(0,1);assert.match(reportData(s).text,/3 条记录/);
 s.data.records[0].date='2026-10-11';assert.match(reportData(s).text,/2 条记录/);
 s.data.records[1].title='更新标题';assert.match(reportData(s).text,/更新标题/);
});
test('manual report text remains intact with up-to-date source counts',()=>{
 const s=fixture('manual');s.data.reports[0].text='我的手写复盘';
 assert.equal(reportData(s).text,'我的手写复盘');assert.match(reports(s),/4<small>天生活<\/small>.*4<small>条记录<\/small>/);assert.match(reports(s),/手写内容已保留/);
});
test('review/excluded/outside-week records are not counted; private records still count',()=>{
 const s=fixture('auto');s.data.records[0].status='review';s.data.records[1].excluded=true;s.data.records[2].date='2026-10-11';s.data.records[3].visibility='self';
 assert.match(reportData(s).text,/1 条记录，覆盖 1 天/);assert.match(reportData(s).text,/第4天/);
});
test('all report periods and styles use current records and preserve legacy text',()=>{
 for(const period of ['day','week','month','year'])for(const style of ['brief','deep']){
  const s=fixture();s.period=period;s.reportStyle=style;const initial=reportData(s);s.data.reports=[{id:initial.id,text:'旧版原文',recordSignature:'old'}];
  assert.notEqual(reportData(s).text,'旧版原文');assert.equal(reportData(s).preservedText,'旧版原文');
 }
});
test('three material management actions share one group',()=>{
 const s={data:{records:[],categories:DEFAULT_CATEGORIES},urls:{},filterCategory:'all',filterStatus:'all',search:'',excludedUndo:['old']};
 assert.match(library(s),/class="material-actions"[^>]*>.*batch-mode.*excluded-view.*batch-undo/s);
});
