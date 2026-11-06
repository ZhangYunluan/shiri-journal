// Run only on an isolated localhost test origin. No gallery, user account or external server is used.
import {createCollector} from '../src/auto-collect.mjs';
import * as db from '../src/db.mjs';
if(!['localhost','127.0.0.1'].includes(location.hostname)||location.port!=='4182')throw Error('Use dedicated test origin on port 4182');
localStorage.setItem('shiri-space-owner','SRTESTABCDEF12');
const results=document.querySelector('#results');results.textContent='';
const assert=(value,text)=>{if(!value)throw Error(text);results.textContent+='PASS · '+text+'\n';};
let queue=[{id:'11111111-1111-4111-8111-111111111111',path:'/tests/fixtures/test-receipt.png',name:'synthetic-receipt.png',type:'image/png',added:new Date('2026-10-10T18:30:00').getTime(),date:'2026-10-10'}],failAck=true,reads=0;
window.shiriNative={photoURL:path=>{reads++;return path;},photos:{pending:async()=>({photos:[...queue]}),status:async()=>({enabled:true,time:'22:00',permission:'partial',pending:queue.length,summaries:[{date:'2026-10-10',text:'合成采集小结'}]}),acknowledge:async({id})=>{if(failAck){failAck=false;throw Error('synthetic interrupted acknowledgement');}queue=queue.filter(p=>p.id!==id);},clearQueue:async()=>{queue=[];}}};
let collector;
collector=createCollector({changed:async()=>{document.querySelector('#panel').innerHTML=collector.panel();},toast:()=>{},confirm:async()=>true});
try {
 await db.clearEverything();await collector.start();
 let data=await db.readAll();
 assert(data.records.length===1&&data.assets.length===1,'图片和记录成功提交到 IndexedDB');
 assert(data.records[0].time==='18:30'&&data.records[0].status==='review','按加入时间归档，并标记待确认');
 assert(queue.length===1,'确认暂存队列失败时仍可重试');
 await collector.start();data=await db.readAll();
 assert(data.records.length===1&&queue.length===0&&reads===1,'重试不重读已提交照片，不产生重复记录');
 assert(document.querySelector('#panel').textContent.includes('2026-10-10'),'基础小结正确显示日期');
 queue=[{id:'22222222-2222-4222-8222-222222222222',path:'/missing-test-photo',name:'missing.png',type:'image/png',added:Date.now(),date:'2026-10-10'}];
 await collector.start();
 assert(queue.length===1&&(await db.readAll()).records.length===1,'无法读取的照片保留队列且不写入空记录');
 assert(document.querySelector('[data-collector="discard"]'),'失败照片提供跳过入口');
 results.textContent+='DONE · 7 assertions passed\n';
}catch(error){results.textContent+='FAIL · '+error.stack;}
