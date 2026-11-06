import test from 'node:test';
import assert from 'node:assert/strict';
import {dailySteps} from '../src/views.mjs';
const state=records=>({date:'2026-10-22',data:{records}});
const row=(date,status='confirmed',extra={})=>({date,status,...extra});
test('journey never counts unreviewed or excluded photos as saved progress',()=>{
 const html=dailySteps(state([row('2026-10-22','review'),row('2026-10-22','confirmed',{excluded:true})]));
 assert.match(html,/1 份待核对/);assert.doesNotMatch(html,/条已保存|已保存个人复盘/);
});
test('journey counts actual distinct days in selected week and keeps all steps accessible',()=>{
 const html=dailySteps(state([row('2026-10-22'),row('2026-10-22'),row('2026-10-20'),row('2026-10-18')]));
 assert.match(html,/2 条已保存/);assert.match(html,/data-action="journey-report"/);assert.match(html,/data-action="note"/);assert.doesNotMatch(html,/disabled|连续|积分/);
});
