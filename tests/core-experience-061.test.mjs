import test from 'node:test';
import assert from 'node:assert/strict';
import {planningReview,makeReport,DEFAULT_CATEGORIES} from '../src/core.mjs';
const row=(id,date,extra={})=>({id,date,time:'18:00',status:'confirmed',categoryId:'daily',title:id,note:'',tags:[],...extra});
test('planning uses event chronology rather than database key order',()=>{
 const out=planningReview([row('new','2026-10-15',{reflection:'highlight'}),row('old','2026-10-12',{reflection:'highlight'})],DEFAULT_CATEGORIES,'week','2026-10-16');
 assert.match(out.suggestions[0].title,/new/);assert.doesNotMatch(out.suggestions[0].title,/old/);
});
test('many photos on a single day do not become evidence for a mood trend',()=>{
 const rows=Array.from({length:8},(_,i)=>row('current'+i,'2026-10-14',{mood:4})).concat(Array.from({length:8},(_,i)=>row('previous'+i,'2026-10-07',{mood:2})));
 const out=planningReview(rows,DEFAULT_CATEGORIES,'week','2026-10-16');
 assert.match(out.changes.join(''),/不足/);assert.doesNotMatch(out.changes.join(''),/均值从/);
});
test('deep report anchors prompts in actual latest records and admits sparse evidence',()=>{
 const text=makeReport([row('公园散步','2026-10-14')],DEFAULT_CATEGORIES,'week','2026-10-16','deep');
 assert.match(text,/最近保存的是 2026-10-14 的「公园散步」/);assert.match(text,/记录天数较少/);assert.match(text,/1 条记录/);assert.doesNotMatch(text,/情绪稳定|占用了什么/);
});
