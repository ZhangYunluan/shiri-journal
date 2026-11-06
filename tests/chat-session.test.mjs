import test from 'node:test';
import assert from 'node:assert/strict';
import {beginTurn,finishTurn,changeContext} from '../src/chat-session.mjs';
const state=()=>({assistantHistory:[],assistantContextStart:0,assistantPendingId:null});
test('visible chat retains every turn while model receives only the last three pairs',()=>{
 const s=state();for(let i=0;i<5;i++){const turn=beginTurn(s,'问题'+i);assert.equal(s.assistantHistory.at(-1).content,'问题'+i);assert.ok(turn.history.length<=6);finishTurn(s,turn.id,{answer:'回答'+i});}
 assert.equal(s.assistantHistory.length,10);assert.equal(s.assistantHistory[0].content,'问题0');
});
test('failure retains sent question; context change preserves readable history but never forwards old context',()=>{
 const s=state(),first=beginTurn(s,'网络失败的问题');finishTurn(s,first.id,{error:'网络连接失败，请重试'});
 assert.equal(s.assistantHistory[0].status,'failed');assert.match(s.assistantError,/网络/);
 changeContext(s);assert.equal(s.assistantHistory.length,1);const next=beginTurn(s,'新摘要的问题');assert.deepEqual(next.history,[]);
 finishTurn(s,next.id,{answer:'新回答'});assert.equal(s.assistantHistory.length,3);
});
test('stale reply after clearing or logging out cannot reappear in a new session',()=>{
 const s=state(),old=beginTurn(s,'旧问题');s.assistantHistory=[];s.assistantPendingId=null;
 assert.equal(finishTurn(s,old.id,{answer:'旧账号回复'}),false);assert.equal(s.assistantHistory.length,0);
});
