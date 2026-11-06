import test from 'node:test';
import assert from 'node:assert/strict';
import {EMOTION_GROUPS,displayCategory,feelingLabel,feelingSelection,readFeeling,categoryCanDelete} from '../src/life-expression.mjs';
import {DEFAULT_CATEGORIES,makeReport,validateRecord,summary} from '../src/core.mjs';
import * as views from '../src/views.mjs';
import {sharedRecord} from '../src/sharing.mjs';
import {shareProjection} from '../src/cloudbase-social-api.mjs';
const row=(extra={})=>({id:'r',title:'今日散步',note:'合成测试',date:'2026-10-27',time:'18:00',categoryId:'travel',tags:[],location:'',status:'confirmed',reflection:'',mood:4,...extra});
const state=()=>({data:{records:[],categories:structuredClone(DEFAULT_CATEGORIES),plans:[],learning:[]},categoryFocus:'all',urls:{}});
test('default display aliases retain stable IDs and never replace custom names',()=>{
 const old={id:'travel',name:'出行见闻',builtIn:true};assert.deepEqual(displayCategory(old),{...old,name:'旅途与见闻'});assert.equal(old.name,'出行见闻');
 assert.equal(displayCategory({...old,name:'我的旅行'}).name,'我的旅行');assert.equal(displayCategory({...old,builtIn:false}).name,'出行见闻');
 assert.deepEqual(DEFAULT_CATEGORIES.map(c=>c.id),['daily','travel','learning','spending','wellbeing','fitness','other']);
});
test('legacy numeric feelings remain readable and unchanged without a new selection',()=>{
 assert.equal(feelingLabel(row()),'愉快');assert.equal(feelingSelection(row()).group,'legacy');
 assert.deepEqual(readFeeling(new FormData(),row()),{mood:4,emotion:''});
});
test('grouped and custom feelings are optional single selections, never inferred scores',()=>{
 assert.equal(EMOTION_GROUPS.length,8);
 const form=(group,emotion,custom='')=>new Map([['emotionGroup',group],['emotion',emotion],['customEmotion',custom]]);
 assert.deepEqual(readFeeling(form('warmth','感动'),row()),{emotion:'感动',mood:null});
 assert.deepEqual(readFeeling(form('custom','','emo'),row()),{emotion:'emo',mood:null});
 assert.deepEqual(readFeeling(form('none',''),row()),{emotion:'',mood:null});
 assert.throws(()=>readFeeling(form('warmth','焦虑'),row()));
 assert.throws(()=>readFeeling(form('custom','','x'.repeat(21)),row()));
});
test('new local field validates and appears in reports without changing numeric averages or sharing projection',()=>{
 const mixed=[row(),row({id:'new',emotion:'感动',mood:null})];validateRecord(mixed[1],DEFAULT_CATEGORIES);
 assert.equal(summary(mixed).mood,4);assert.match(makeReport(mixed,DEFAULT_CATEGORIES,'week','2026-10-27'),/感动/);
 assert.throws(()=>validateRecord(row({emotion:42}),DEFAULT_CATEGORIES));
 assert.equal(sharedRecord(mixed[1],DEFAULT_CATEGORIES[1]).emotion,undefined);
 const projected=shareProjection(mixed[1],DEFAULT_CATEGORIES[1]);assert.equal(projected.emotion,undefined);assert.equal(projected.categoryId,'travel');
});
test('empty directory has one prompt per category and a modal creation button, no permanent input',()=>{
 const html=views.categories(state());assert.doesNotMatch(html,/0 条|等待第一个片刻|还没有已确认记录|<input|id="category-form"/);
 assert.match(html,/data-action="new-category"/);assert.equal((html.match(/记录第一个片刻/g)||[]).length,DEFAULT_CATEGORIES.length);
 const s=state();s.data.records=[row()];assert.match(views.categories(s),/1 个片刻/);assert.match(views.categories(s),/最近记录/);
});
test('category deletion refuses referenced or built-in categories',()=>{
 const c={id:'custom',builtIn:false},data={records:[],plans:[],learning:[]};assert.equal(categoryCanDelete(c,data),true);
 for(const key of Object.keys(data))assert.equal(categoryCanDelete(c,{...data,[key]:[{categoryId:'custom'}]}),false);
 assert.equal(categoryCanDelete(DEFAULT_CATEGORIES[0],data),false);
});
