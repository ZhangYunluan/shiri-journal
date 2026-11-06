import {test} from 'node:test';
import assert from 'node:assert/strict';
import {once} from 'node:events';
import {SocialStore} from '../social-server/store.mjs';
import {createSocialServer} from '../social-server/server.mjs';
test('HTTP API rejects foreign origins and forged identity; account deletion purges orphaned shares',async()=>{
 const store=new SocialStore(':memory:');
 const server=createSocialServer(store,{origins:['https://localhost']});server.listen(0,'127.0.0.1');await once(server,'listening');
 const base='http://127.0.0.1:'+server.address().port+'/api/';
 async function request(path,token,method='GET',body,origin='https://localhost'){return fetch(base+path,{method,headers:{Origin:origin,...(token?{Authorization:'Bearer '+token}:{}),...(body?{'Content-Type':'application/json'}:{})},...(body?{body:JSON.stringify(body)}:{})});}
 try {
   assert.equal((await request('health',null,'GET',null,'https://attacker.invalid')).status,403);
   const a=store.register('A','a long password 123'),b=store.register('B','b long password 123');
   assert.equal((await request('me',a.user.id)).status,401);
   assert.equal((await request('requests',b.token,'POST',{id:a.user.id,owner:a.user.id})).status,200);
   assert.equal(store.requests(a.user.id)[0].sender,b.user.id);
   await request('requests/respond',a.token,'POST',{id:b.user.id,accept:true});
   await request('grant',a.token,'PUT',{id:b.user.id,scope:'all',categories:[]});
   const photo={id:'native:test-photo',date:'2026-10-10',time:'22:00',name:'test.jpg',photo:'data:image/jpeg;base64,/9j/2Q==',auto:true};
   assert.equal((await request('private/photos',a.token,'POST',photo)).status,403);
   assert.equal((await request('private/config',a.token,'PUT',{enabled:true})).status,200);
   assert.equal((await request('private/photos',a.token,'POST',photo)).status,200);
   assert.equal((await request('private/photo?id='+photo.id,b.token)).status,404);
   assert.equal((await request('private/review',b.token,'PUT',{id:photo.id,approved:true})).status,404);
   assert.equal((await (await request('feed',b.token)).json()).records.length,0);
   store.sync(a.user.id,{upserts:[{id:'r1',kind:'record',status:'confirmed',shareApproved:true,categoryId:'daily',date:'2026-10-10',title:'private',note:''}]});
   assert.equal((await (await request('feed',b.token)).json()).records.length,1);
   assert.equal((await request('account',b.token,'DELETE',{password:'b long password 123'})).status,200);
   assert.equal(store.syncState(a.user.id).records.length,0);
   assert.equal((await request('feed',b.token)).status,401);
 } finally {await new Promise(resolve=>server.close(resolve));store.close();}
});
