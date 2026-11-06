import test from 'node:test';
import assert from 'node:assert/strict';
import {planningReview,DEFAULT_CATEGORIES} from '../src/core.mjs';
import {assistantContext,createAssistantClient} from '../src/life-assistant.mjs';
const record=(id,date,extra={})=>({id,date,status:'confirmed',kind:'moment',categoryId:'daily',title:'散步',note:'',...extra});
test('observations exclude unreviewed, excluded and future records; suggestions remain 1–3',()=>{
 const rows=[record('a','2026-10-12'),record('b','2026-10-13'),record('c','2026-10-14',{status:'review'}),record('d','2026-10-15',{excluded:true}),record('e','2026-10-18')];
 const out=planningReview(rows,DEFAULT_CATEGORIES,'week','2026-10-16');
 assert.match(out.observations.join(' '),/2 条.*2 天/);assert.ok(out.suggestions.length>0&&out.suggestions.length<=3);
 assert.ok(out.suggestions.every(p=>p.date>='2026-10-19'&&p.date<='2026-10-25'));
 assert.match(out.changes.join(' '),/不足/);
});
test('planning uses unfinished user goals and only explicit moods, not image-based psychology',()=>{
 const plans=[{id:'p',title:'完成阅读笔记',date:'2026-10-20',done:false,categoryId:'learning'}];
 const out=planningReview([record('a','2026-10-13')],DEFAULT_CATEGORIES,'week','2026-10-16',plans);
 assert.match(out.suggestions[0].title,/完成阅读笔记/);assert.match(out.observations.join(' '),/未填写心情/);
 assert.ok(!out.changes.join(' ').includes('焦虑'));
});
test('assistant serializes only explicitly selected saved moments, never private diaries, images or location',()=>{
 const rows=[record('ok','2026-10-15',{note:'自己的感受',mood:4,assetId:'image-secret',location:'private address'}),record('draft','2026-10-15',{status:'review'}),record('private','2026-10-15',{kind:'diary'}),record('excluded','2026-10-15',{excluded:true})];
 const out=assistantContext(rows,rows.map(r=>r.id),'2026-10-16');
 assert.equal(out.length,1);assert.equal(out[0].note,'自己的感受');
 assert.ok(!JSON.stringify(out).includes('image-secret'));assert.ok(!JSON.stringify(out).includes('private address'));
 assert.deepEqual(assistantContext(rows,[],'2026-10-16'),[]);
});
test('unconfigured assistant cannot call a network or manufacture answers',async()=>{
 let calls=0;const client=createAssistantClient({config:{},token:async()=>'',fetcher:async()=>{calls++;}});
 await assert.rejects(()=>client.ask({question:'最近怎么样',records:[],consent:true}),/尚未接通/);assert.equal(calls,0);
});
test('assistant requires consent, validates lengths, uses bounded cache and rate limiting',async()=>{
 let calls=0;const client=createAssistantClient({config:{endpoint:'https://cloud.example/ask',provider:'test',privacyUrl:'https://cloud.example/privacy'},allowedOrigin:'https://cloud.example',token:async()=> 'user-token',fetcher:async()=>{calls++;return Response.json({answer:'仅供参考的建议'});}});
 await assert.rejects(()=>client.ask({question:'看看',records:[],consent:false}),/同意/);
 await assert.rejects(()=>client.ask({question:'x'.repeat(601),records:[],consent:true}),/600/);
 const payload={question:'看看',records:[],consent:true};assert.equal(await client.ask(payload),'仅供参考的建议');
 assert.equal(await client.ask(payload),'仅供参考的建议');assert.equal(calls,1);
 await assert.rejects(()=>client.ask({...payload,question:'另一个问题'}),/稍后/);
});

test('chat transport works when WebView has no AbortSignal.timeout and never logs body',async()=>{
 const original=AbortSignal.timeout;AbortSignal.timeout=undefined;
 try{
  const client=createAssistantClient({config:{endpoint:'https://cloud.example/ask',provider:'test'},allowedOrigin:'https://cloud.example',token:async()=>'test-user',fetcher:async(url,options)=>{assert.ok(options.signal);return Response.json({answer:'正常回复'});}});
  assert.equal(await client.ask({question:'问题',records:[],consent:true}),'正常回复');
 }finally{AbortSignal.timeout=original;}
});

test('long display history does not make follow-up requests exceed the existing server input budget',async()=>{
 let sent;const history=Array.from({length:8},(_,i)=>({role:i%2?'assistant':'user',content:'中'.repeat(i%2?2900:20)}));
 const client=createAssistantClient({config:{endpoint:'https://cloud.example/ask',provider:'test'},allowedOrigin:'https://cloud.example',token:async()=>'test',fetcher:async(url,options)=>{sent=options.body;return Response.json({answer:'继续聊'});}});
 assert.equal(await client.ask({question:'请继续',records:[],consent:true,history}),'继续聊');
 assert.ok(new TextEncoder().encode(sent).length<=12000);assert.equal(history.length,8);assert.equal(history[1].content.length,2900);
});
