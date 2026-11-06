import test from 'node:test';
import assert from 'node:assert/strict';
import {SocialStore} from '../social-server/store.mjs';
const photo='data:image/jpeg;base64,/9j/2Q==';
const draft={id:'native:11111111-1111-4111-8111-111111111111',date:'2026-10-10',time:'20:00',name:'synthetic.jpg',photo};
test('private automatic upload precedes approval; even an all-scope friend cannot read pending photos',()=>{
 const s=new SocialStore(':memory:');
 try {
  const a=s.register('A','long password for A').user.id,b=s.register('B','long password for B').user.id;
  s.request(a,b);s.respond(b,a,true);s.setGrant(a,b,{scope:'all',categories:[]});
  s.privatePut(a,draft);
  assert.equal(s.privateList(a).photos[0].approval,'pending');assert.deepEqual(s.feed(b),[]);
  assert.equal(s.privateGet(a,draft.id).photo,photo);assert.throws(()=>s.privateGet(b,draft.id),/不存在/);
  const row={id:draft.id,kind:'record',status:'confirmed',shareApproved:true,privatePhotoId:draft.id,categoryId:'daily',date:draft.date,title:'A day',note:'',photo};
  assert.throws(()=>s.sync(a,{upserts:[row]}),/确认/);
  s.privateReview(a,draft.id,true);s.sync(a,{upserts:[row]});assert.equal(s.feed(b).length,1);
  s.privateReview(a,draft.id,false);assert.deepEqual(s.feed(b),[]);
  assert.throws(()=>s.privateReview(b,draft.id,true));
 }finally{s.close();}
});
test('private uploads are idempotent, bounded and deletion prevents late retry from resurrecting content',()=>{
 const s=new SocialStore(':memory:');
 try {
  const a=s.register('A','long password for A').user.id;
  s.privatePut(a,draft);s.privateReview(a,draft.id,true);s.privatePut(a,draft);
  assert.equal(s.privateGet(a,draft.id).approval,'approved');
  assert.throws(()=>s.privatePut(a,{...draft,photo:'https://bad.invalid/photo'}));
  s.privateDelete(a,draft.id);assert.equal(s.privateList(a).photos.length,0);
  assert.equal(s.privatePut(a,draft).deleted,true);assert.throws(()=>s.privateGet(a,draft.id));
  assert.throws(()=>s.privatePut(a,{...draft,id:'another',date:'2026-99-99'}));
 }finally{s.close();}
});
test('private library capacity and account deletion cannot leak or leave accessible photos',()=>{
 const s=new SocialStore(':memory:');
 try{
  const a=s.register('A','long password for A'),b=s.register('B','long password for B');
  s.privatePut(a.user.id,draft);s.privatePut(b.user.id,draft);s.privateReview(a.user.id,draft.id,true);
  assert.equal(s.privateGet(b.user.id,draft.id).approval,'pending','same photo ID belongs to separate owners');
  const insert=s.db.prepare("INSERT INTO private_photos VALUES(?,?, '2026-10-10','22:00','fixture',X'FFD8FFD9','fixture','pending',1)");
  s.transaction(()=>{for(let i=0;i<1999;i++)insert.run(a.user.id,'capacity:'+i);});
  assert.throws(()=>s.privatePut(a.user.id,{...draft,id:'over-capacity'}),/容量/);
  assert.equal(s.privateList(a.user.id).photos.length,2000);
  s.deleteAccount(a.user.id,'long password for A');assert.throws(()=>s.authenticate(a.token));
  assert.equal(s.db.prepare('SELECT COUNT(*) n FROM private_photos WHERE owner=?').get(a.user.id).n,0);
  assert.equal(s.privateGet(b.user.id,draft.id).approval,'pending');
 }finally{s.close();}
});
