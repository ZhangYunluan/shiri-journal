import {createSocial} from './social-client-fixture.mjs';
import * as db from '../src/db.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Dedicated localhost test origin required');
const results=document.querySelector('#results');results.textContent='';
const assert=(value,text)=>{if(!value)throw Error(text);results.textContent+='PASS · '+text+'\n';};
const id='SRSOCIALTEST12',peer='SRPEERABCDEF12';
localStorage.setItem('shiri-space-owner',id);localStorage.setItem('shiri-social-session',JSON.stringify({user:{id,nickname:'合成测试用户'},token:'synthetic-test-token'}));
let grant={id:peer,nickname:'合成朋友',scope:'none',categories:[]},saved=[],confirmations=[],requests=0,controller,data;
window.fetch=async(input,options={})=>{
 const url=new URL(input);if(url.origin!=='https://social.test.invalid')throw Error('Unexpected request');
 const path=url.pathname,body=options.body?JSON.parse(options.body):{};requests++;
 let response={};
 if(path==='/api/me')response={friends:[grant],requests:[]};
 else if(path==='/api/feed')response={records:[]};
 else if(path==='/api/sync'&&options.method==='GET')response={grants:grant.scope==='none'?[]:[grant],records:saved.map(r=>({id:r.id,digest:''}))};
 else if(path==='/api/sync'){saved=saved.filter(r=>!(body.deleteIds||[]).includes(r.id));for(const r of body.upserts||[]){saved=saved.filter(old=>old.id!==r.id);saved.push(r);}}
 else if(path==='/api/grant'){grant={...grant,...body};if(grant.scope==='none')saved=[];}
 else throw Error('Unexpected test API '+path);
 return new Response(JSON.stringify(response),{status:200,headers:{'Content-Type':'application/json'}});
};
let ready;
const settle=()=>new Promise(resolve=>{ready=resolve;});
function redraw(){document.querySelector('#main').innerHTML=controller.panel();ready?.();ready=null;}
try {
 await db.clearEverything();
 data=await db.readAll();
 const stamp=new Date().toISOString();
 await db.saveRecord({id:'synthetic-record',date:'2026-10-10',time:'20:00',title:'合成散步',note:'仅用于测试',categoryId:'daily',tags:[],location:'',mood:null,duration:10,amount:null,weight:null,reflection:'',assetId:null,status:'confirmed',shareApproved:true,analysis:{method:'test',labels:[],ocr:'never upload raw OCR'},createdAt:stamp,updatedAt:stamp},data.categories);
 data=await db.readAll();
 controller=createSocial({getData:()=>data,changed:async()=>{},toast:text=>{results.textContent+='NOTICE · '+text+'\n';},confirm:async(title,text)=>{confirmations.push(text);return true;},redraw});
 let done=settle();controller.start();await done;
 assert(saved.length===0,'好友默认无授权，不上传生活记录');
 assert(document.querySelector('[data-social-form="grant"]'),'已登录好友授权表单可以渲染');
 let form=document.querySelector('[data-social-form="grant"]');form.elements.scope.value='all';done=settle();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await done;
 assert(confirmations[0].includes('历史及未来')&&confirmations[0].includes('逐张确认'),'全部开放仍需逐张确认，说明历史与未来范围');
 assert(saved.length===1&&saved[0].status==='confirmed'&&saved[0].shareApproved===true&&!('analysis' in saved[0]),'仅同步白名单字段和本人已确认开放的记录');
 form=document.querySelector('[data-social-form="grant"]');form.elements.scope.value='none';done=settle();form.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true}));await done;
 assert(saved.length===0&&grant.scope==='none','撤销操作更新服务端授权并清除不再允许的共享副本');
 assert(requests>0,'测试请求全部由本页模拟，未接触真实账号服务');
 const snapshot=await db.readAll();snapshot.settings.push({id:'social-shares',records:[{id:'share:33333333-3333-4333-8333-333333333333',kind:'shared',status:'confirmed',date:'2026-10-10',categoryId:'daily',title:'合成备份近况',note:'需要恢复的文本'}]});
 await db.restoreBackup(snapshot);await db.restoreBackup(snapshot);
 const restored=(await db.readAll()).settings.find(s=>s.id==='social-shares');
 assert(restored.records.length===1&&restored.records[0].note==='需要恢复的文本','手动近况可以从备份恢复，重复恢复不产生重复内容');
 results.textContent+='DONE · 7 assertions passed\n';
}catch(error){results.textContent+='FAIL · '+error.stack;}
