import test from 'node:test';
import assert from 'node:assert/strict';
import {assistantPanel} from '../src/views.mjs';
const state={assistantOpen:true,assistantReady:true,data:{records:[],categories:[]},assistantHistory:[{role:'user',content:'我的问题'},{role:'assistant',content:'服务返回的回答'}]};
test('conversation appears before composer, without a hidden transcript or duplicate answer',()=>{
 const html=assistantPanel({...state,assistantAnswer:'服务返回的回答'});
 assert.ok(html.indexOf('chat-messages')<html.indexOf('name="question"'));
 assert.equal(html.split('服务返回的回答').length-1,1);
 assert.match(html,/class="chat-context"/);
 assert.doesNotMatch(html,/<summary>本次对话/);
 assert.match(html,/name="consent"/);
});
test('unconfigured service is explicit and message content is escaped',()=>{
 const html=assistantPanel({...state,assistantReady:false,assistantHistory:[{role:'user',content:'<img src=x onerror=alert(1)>'}]});
 assert.match(html,/服务未接通/);assert.match(html,/&lt;img/);assert.doesNotMatch(html,/<img src=x/);
});
