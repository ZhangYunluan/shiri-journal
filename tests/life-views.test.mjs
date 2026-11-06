import test from 'node:test';
import assert from 'node:assert/strict';
import * as views from '../src/views.mjs';
import {DEFAULT_CATEGORIES} from '../src/core.mjs';
const record=(id,status,categoryId='daily')=>({id,status,categoryId,title:id,note:'记录正文',date:'2026-10-12',time:'18:00',tags:[],location:''});
const state=()=>({data:{categories:DEFAULT_CATEGORIES,records:[record('已确认的散步','confirmed'),record('待核对账单','review'),record('训练记录','confirmed','fitness')]},urls:{},filterCategory:'all',filterStatus:'all',search:'',categoryFocus:'all'});
test('materials retain collection and review actions with explicit status queues',()=>{
  const html=views.library(state());assert.match(html,/素材整理/);assert.match(html,/data-action="library-status"/);assert.match(html,/待核对账单/);assert.match(html,/已确认的散步/);assert.match(html,/library-grid/);
});
test('category directory summarizes confirmed records instead of repeating the material grid',()=>{
  const html=views.categories(state());assert.match(html,/主题目录/);assert.match(html,/data-action="open-category"/);assert.doesNotMatch(html,/library-grid|library-search|status-filter|待核对账单|id="category-form"/);assert.match(html,/data-action="new-category"/);
});
test('category history is independent of material filters and excludes unconfirmed content',()=>{
  const s=state();s.categoryFocus='daily';s.filterCategory='fitness';s.filterStatus='review';s.search='找不到';
  const html=views.categories(s);assert.match(html,/已确认的散步/);assert.doesNotMatch(html,/待核对账单|训练记录/);assert.match(html,/data-action="review-category"/);assert.match(html,/category-history/);
});
test('empty custom categories remain navigable and user text is escaped',()=>{
  const s=state();s.data.categories=[...DEFAULT_CATEGORIES,{id:'custom',name:'<script>自定义</script>',icon:'layers',color:'#adc4a3'}];s.categoryFocus='custom';
  const html=views.categories(s);assert.match(html,/记录第一个片刻/);assert.match(html,/&lt;script&gt;/);assert.doesNotMatch(html,/<script>/);
});
test('batch UI offers restore/undo and hidden candidates do not leak into daily overview',()=>{
  const s=state();s.batchMode=true;s.batchSelected=new Set();s.excludedUndo=['hidden'];s.showExcluded=false;
  s.data.records.push({...record('hidden','review'),assetId:'asset-hidden',excluded:true});
  const html=views.library(s);assert.match(html,/批量管理|退出批量管理/);assert.match(html,/batch-confirm/);assert.match(html,/batch-undo/);assert.doesNotMatch(html,/data-id="hidden"/);
  s.showExcluded=true;assert.match(views.library(s),/batch-restore/);
});

test('material sync error and retry are accessible without resaving the record',()=>{
 const s=state();s.data.records[0]={...s.data.records[0],kind:'moment',visibility:'friends',cloudSync:{state:'pending',error:'照片服务失败 <unsafe>',stage:'upload',errorStatus:502}};
 const html=views.library(s);assert.match(html,/同步失败/);assert.match(html,/data-action="retry-cloud-sync"/);
 const form=views.recordForm(s,s.data.records[0],null);assert.match(form,/照片服务失败 &lt;unsafe&gt;/);assert.match(form,/上传照片/);
});
