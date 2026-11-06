import {createPrivateCloud} from './private-cloud-fixture.mjs';
import * as db from '../src/db.mjs';
import {recordForm} from '../src/views.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Dedicated test origin required');
const output=document.querySelector('#results');output.textContent='';
let count=0;const assert=(value,text)=>{if(!value)throw Error(text);count++;output.textContent+='PASS · '+text+'\n';};
const owner='SRPRIVATETEST1';localStorage.setItem('shiri-space-owner',owner);localStorage.setItem('shiri-social-session',JSON.stringify({user:{id:owner,nickname:'合成用户'},token:'synthetic-token'}));
let remote=[],deleted=[],enabled=true,data,uploads=0;
window.fetch=async(input,options={})=>{
 const url=new URL(input);if(url.origin!=='https://social.test.invalid')throw Error('Unexpected network');
 if(options.headers.Authorization!=='Bearer synthetic-token')throw Error('Missing owner session');
 const path=url.pathname,method=options.method||'GET',body=options.body?JSON.parse(options.body):null;let response={ok:true};
 if(path==='/api/private/photos'&&method==='GET')response={photos:remote,deletedIds:deleted,enabled};
 else if(path==='/api/private/photos'&&method==='POST'){uploads++;if(deleted.includes(body.id))response.deleted=true;else if(!remote.some(r=>r.id===body.id))remote.push({...body,approval:'pending'});}
 else if(path==='/api/private/review'){const r=remote.find(r=>r.id===body.id);if(!r)throw Error('No private photo');r.approval=body.approved?'approved':'private';}
 else if(path==='/api/private/photo'&&method==='DELETE'){deleted.push(body.id);remote=remote.filter(r=>r.id!==body.id);}
 else throw Error('Unexpected endpoint '+path);
 return new Response(JSON.stringify(response),{headers:{'Content-Type':'application/json'}});
};
try{
 await db.clearEverything();data=await db.readAll();const stamp=new Date().toISOString();
 const canvas=document.createElement('canvas');canvas.width=4;canvas.height=4;canvas.getContext('2d').fillRect(0,0,4,4);const thumbnail=await new Promise(resolve=>canvas.toBlob(resolve,'image/jpeg'));
 const asset={id:'synthetic-photo',name:'test.jpg',thumbnail,blob:thumbnail,type:'image/jpeg',size:thumbnail.size};
 const record={id:'private-test',date:'2026-10-10',time:'22:00',title:'合成片刻',note:'仅用于测试',categoryId:'daily',tags:[],location:'',mood:null,duration:null,amount:null,weight:null,reflection:'',status:'review',shareApproved:false,assetId:asset.id,createdAt:stamp,updatedAt:stamp};
 await db.saveRecord(record,data.categories,asset);await db.put('settings',{id:'private-cloud',enabled:true});data=await db.readAll();
 const cloud=createPrivateCloud({getData:()=>data,changed:async()=>{data=await db.readAll();},toast:()=>{},confirm:async()=>true,redraw:()=>{}});
 await cloud.sync();assert(uploads===0&&remote.length===0,'旧版自动上传设置也不能发送未分享照片');
 assert((await db.readAll()).records[0].shareApproved===false,'采集素材保留私密状态');
 let rejected=false;try{await cloud.approve(record,true);}catch{rejected=true;}assert(rejected,'尚未核对的素材不能直接开放');
 document.querySelector('#main').innerHTML=recordForm({data},record,null);assert(document.querySelector('[data-private="approve"]').disabled,'待核对照片的开放按钮禁用');
 record.status='confirmed';await db.saveRecord(record,data.categories);data=await db.readAll();
 document.querySelector('#main').innerHTML=recordForm({data},record,null);assert(!document.querySelector('[data-private="approve"]').disabled,'保存个人日志后可独立决定开放');
 await cloud.approve(record,true);assert(uploads===0&&data.records[0].shareApproved===true,'明确逐张意愿仅保存本机，共享验收前不上传');
 await cloud.approve(data.records[0],false);assert(uploads===0&&!data.records[0].shareApproved,'收回分享意愿不发送照片');
 const snapshot=await db.readAll();snapshot.records[0].id='restore-test';snapshot.records[0].shareApproved=true;snapshot.learning=[];await db.restoreBackup(snapshot);data=await db.readAll();assert(!data.records.find(r=>r.id==='restore-test').shareApproved,'恢复备份不自动恢复分享审批');
 await cloud.remove(record);await db.deleteRecord(record);await cloud.sync();assert(uploads===0&&!(await db.readAll()).records.some(r=>r.id===record.id),'删除本地记录后同步仍不上传其他照片');
 output.textContent+='DONE · '+count+' assertions passed\n';
}catch(error){output.textContent+='FAIL · '+error.stack;}
