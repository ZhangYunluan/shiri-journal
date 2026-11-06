import {localDate,addDays,DEFAULT_CATEGORIES} from '../src/core.mjs';

// Independent from production IndexedDB, login sessions and user settings.
export const DEMO_KEY='shiri-public-demo-v1';
export function sampleRecord(index,date,status='review'){
  const examples=[
    ['晚风里走了一会儿','绕着公园走了一圈，给自己留一点慢下来的时间。','daily','sunset','轻松'],
    ['把读到的句子记下来','读完一小节，留下了两句想再看看的话。','learning','reading','平静'],
    ['周末一起做饭','试了一道新菜，想把这份日常留下来。','daily','table','满足'],
  ];
  const [title,note,categoryId,assetId,emotion]=examples[index%examples.length];
  return {id:`demo-${date}-${index}`,date,time:`${17+index%3}:30`,title,note,categoryId,
    assetId,emotion,mood:null,tags:[],location:'',kind:status==='confirmed'?'moment':'photo',
    status,excluded:false,visibility:'self',cloudSync:{state:'local'},updatedAt:new Date().toISOString()};
}
export function freshDemo(date=localDate()){
  return {version:1,date,categories:structuredClone(DEFAULT_CATEGORIES),records:[0,1,2].map(i=>sampleRecord(i,date)).concat(
    [1,2,4,6].map((day,i)=>sampleRecord(i+3,addDays(date,-day),'confirmed'))),reports:[],settings:[]};
}
export function loadDemo(storage,date=localDate()){
  try{
    const data=JSON.parse(storage.getItem(DEMO_KEY));
    if(data?.version===1&&Array.isArray(data.records)&&Array.isArray(data.reports)&&Array.isArray(data.settings))return data;
  }catch{/* Unavailable storage or an incompatible demo snapshot uses new sample data. */}
  return freshDemo(date);
}
export function writeDemo(storage,data){storage.setItem(DEMO_KEY,JSON.stringify(data));}
