import test from 'node:test';
import assert from 'node:assert/strict';
import {SocialStore} from '../social-server/store.mjs';

test('ID is not a login credential; sessions expire and can be revoked', () => {
  let now=100000;
  const s=new SocialStore(':memory:',()=>now);
  try {
    const a=s.register('Alice','a strong password 123');
    assert.match(a.user.id,/^SR[A-Z0-9]{12}$/);
    assert.throws(()=>s.authenticate(a.user.id));
    assert.throws(()=>s.login(a.user.id,'wrong password'));
    assert.equal(s.authenticate(a.token),a.user.id);
    s.logout(a.token); assert.throws(()=>s.authenticate(a.token));
    const session=s.login(a.user.id,'a strong password 123');
    now+=31*86400000; assert.throws(()=>s.authenticate(session.token));
  } finally { s.close(); }
});

test('friendship never grants access; grants are directional and enforce categories', () => {
  const s=new SocialStore(':memory:');
  try {
    const a=s.register('A','A password long enough'),b=s.register('B','B password long enough'),c=s.register('C','C password long enough');
    const aid=a.user.id,bid=b.user.id,cid=c.user.id;
    s.request(aid,bid);
    assert.throws(()=>s.respond(cid,aid,true));
    s.respond(bid,aid,true);
    assert.deepEqual(s.feed(bid),[]);
    assert.throws(()=>s.setGrant(aid,cid,{scope:'all',categories:[]}));
    s.setGrant(aid,bid,{scope:'categories',categories:['daily']});
    const daily={id:'daily-1',kind:'record',categoryId:'daily',title:'Walk',note:'hello',date:'2026-10-09',status:'confirmed',shareApproved:true};
    const secret={...daily,id:'secret-1',categoryId:'spending',note:'private amount'};
    assert.throws(()=>s.sync(aid,{upserts:[daily,secret],deleteIds:[]}));
    assert.deepEqual(s.feed(bid),[], 'failed batch commits nothing');
    s.sync(aid,{upserts:[daily],deleteIds:[]});
    assert.equal(s.feed(bid)[0].title,'Walk');
    assert.deepEqual(s.feed(aid),[]);
    assert.deepEqual(s.feed(cid),[]);
    s.setGrant(aid,bid,{scope:'all',categories:[]});
    s.sync(aid,{upserts:[secret],deleteIds:[]});
    assert.equal(s.feed(bid).length,2);
    s.setGrant(aid,bid,{scope:'none',categories:[]});
    assert.deepEqual(s.feed(bid),[]);
    assert.deepEqual(s.syncState(aid).records,[], 'unneeded shared copies purged after last grant revoked');
  } finally {s.close();}
});

test('decline, removal, delete sync and manual-only permissions protect records', () => {
  const s=new SocialStore(':memory:');
  try {
    const a=s.register('A','A password long enough').user.id,b=s.register('B','B password long enough').user.id;
    s.request(a,b); s.respond(b,a,false); assert.deepEqual(s.friends(a),[]);
    s.request(a,b); s.respond(b,a,true);
    s.setGrant(a,b,{scope:'shared',categories:[]});
    const draft={id:'r1',kind:'record',categoryId:'daily',title:'Private',note:'',date:'2026-10-09',status:'review'};
    assert.throws(()=>s.sync(a,{upserts:[draft],deleteIds:[]}));
    const published={...draft,kind:'shared',status:'confirmed',shareApproved:true};
    s.sync(a,{upserts:[published],deleteIds:[]});
    assert.equal(s.feed(b).length,1);
    s.sync(a,{upserts:[],deleteIds:['r1']}); assert.deepEqual(s.feed(b),[]);
    s.sync(a,{upserts:[published],deleteIds:[]});
    s.removeFriend(b,a); assert.deepEqual(s.feed(b),[]); assert.deepEqual(s.syncState(a).records,[]);
    assert.throws(()=>s.sync(a,{upserts:[{...published,photo:'https://attacker.invalid/track'}],deleteIds:[]}));
  } finally {s.close();}
});
