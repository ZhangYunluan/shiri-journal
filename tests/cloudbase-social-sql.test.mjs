import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {createMomentSync} from '../src/moment-sync.mjs';
import {savedMoment} from '../src/moment-review.mjs';

// Real PostgreSQL engine; only the provider-owned Auth/Storage schemas are test fixtures.
async function database(){
  const pg=new PGlite();
  await pg.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE SCHEMA auth; CREATE SCHEMA storage;
    CREATE TABLE auth.users(id bigint PRIMARY KEY);
    INSERT INTO auth.users VALUES (100000000000000001),(100000000000000002),(100000000000000003);
    CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb->>'sub' $$;
    CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$ SELECT current_setting('request.jwt.claims',true)::jsonb->>'role' $$;
    CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
    CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,PRIMARY KEY(bucket_id,name));
    GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated;
    GRANT ALL ON storage.objects TO anon,authenticated;
    ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
    CREATE POLICY existing_broad_policy ON storage.objects FOR ALL TO authenticated USING(true) WITH CHECK(true);`);
  await pg.exec(await readFile(new URL('../cloudbase/migrations/001_social.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../cloudbase/migrations/002_nickname_search.sql',import.meta.url),'utf8'));
  const as=async(uid,work,role='authenticated')=>pg.transaction(async tx=>{
    await tx.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);
    await tx.exec(`SET LOCAL ROLE ${role}`);return work(tx);
  });
  const rpc=(uid,action,payload={},role)=>as(uid,async tx=>(await tx.query('SELECT public.shiri_social($1,$2::jsonb) AS data',[action,JSON.stringify(payload)])).rows[0].data,role);
  for(const id of ['alice','bob','eve'])await rpc(id,'profile',{nickname:id});
  return {pg,rpc,as};
}
test('PostgreSQL friends, directional consent, history, revocation and private storage',{timeout:60000},async t=>{
  const {pg,rpc,as}=await database();t.after(()=>pg.close());
  await t.test('anonymous RPC and direct profile/relationship enumeration denied',async()=>{
    await assert.rejects(()=>rpc('anon','dashboard',{},'anon'),/permission denied/);
    await assert.rejects(()=>as('eve',tx=>tx.query('SELECT * FROM public.shiri_profiles')),/permission denied/);
    await assert.rejects(()=>as('eve',tx=>tx.query('INSERT INTO public.shiri_friendships(low_id,high_id) VALUES (\'alice\',\'eve\')')),/permission denied/);
  });
  await t.test('nickname opt-in, duplicates, ranking and no private data leakage',async()=>{
    assert.deepEqual((await rpc('alice','search',{query:'bo'})).users,[]);
    await rpc('bob','discoverability',{enabled:true});
    const result=await rpc('alice','search',{query:'bo'});
    assert.equal(result.users[0].id,'bob');assert.equal(result.users[0].nickname,'bob');assert.equal(result.users[0].email,undefined);
    assert.equal((await rpc('bob','dashboard')).discoverable,true);
    await rpc('eve','profile',{nickname:'bob'});
    await rpc('eve','discoverability',{enabled:true});
    assert.equal((await rpc('alice','search',{query:'bob'})).users.length,2);
    await rpc('alice','profile',{nickname:'拾光',owner:'bob'});
    await rpc('alice','discoverability',{enabled:true});
    assert.equal((await rpc('bob','search',{query:'拾光'})).users[0].nickname,'拾光');
    await rpc('eve','discoverability',{enabled:false});
    assert.equal((await rpc('alice','search',{query:'bob'})).users.length,1);
    await assert.rejects(()=>rpc('alice','search',{query:'b'}),/2–48/);
    await assert.rejects(()=>rpc('eve','discoverability',{enabled:'yes'}),/明确选择/);
  });
  await t.test('nickname results rank exact names first, cap at ten and treat wildcard characters literally',async()=>{
    await rpc('searcher','profile',{nickname:'搜索测试者'});
    for(let i=0;i<12;i++){
      const id='rank-'+i;await rpc(id,'profile',{nickname:i===0?'LuNa':i===1?'山间Luna':'Luna'+i});
      await rpc(id,'discoverability',{enabled:true});
    }
    const result=await rpc('searcher','search',{query:'luna'});
    assert.equal(result.users.length,10);assert.equal(result.users[0].id,'rank-0');
    assert.ok(result.users.every(user=>user.nickname.toLowerCase().includes('luna')));
    assert.deepEqual(Object.keys(result.users[0]).sort(),['id','isFriend','nickname']);
    await rpc('literal','profile',{nickname:'%_记录'});await rpc('literal','discoverability',{enabled:true});
    assert.deepEqual((await rpc('searcher','search',{query:'%_'})).users.map(user=>user.id),['literal']);
    await assert.rejects(()=>rpc('anon','search',{query:'luna'},'anon'),/permission denied/);
  });
  await t.test('nickname search is limited by authenticated UID and private counters are inaccessible',async()=>{
    await rpc('rate-user','profile',{nickname:'限流测试'});
    for(let i=0;i<20;i++)await rpc('rate-user','search',{query:'bob'});
    await assert.rejects(()=>rpc('rate-user','search',{query:'bob'}),/太频繁/);
    await assert.rejects(()=>as('rate-user',tx=>tx.query('SELECT * FROM shiri_private.search_limits')),/permission denied/);
    await pg.query("UPDATE shiri_private.search_limits SET window_start=now()-interval '2 minutes' WHERE user_id=$1",['rate-user']);
    assert.equal((await rpc('rate-user','search',{query:'bob'})).users.length,1);
  });
  await t.test('duplicate/reverse requests do not grant friendship; only recipient accepts',async()=>{
    await rpc('alice','request',{id:'bob',note:'你好'});await rpc('alice','request',{id:'bob'});
    await assert.rejects(()=>rpc('bob','request',{id:'alice'}),/请先处理/);
    await assert.rejects(()=>rpc('eve','respond',{id:'alice',accept:true}),/申请/);
    assert.equal((await rpc('bob','dashboard')).incoming.length,1);
    await rpc('bob','respond',{id:'alice',accept:true});
    assert.equal((await rpc('alice','dashboard')).friends.length,1);
    assert.equal((await rpc('alice','dashboard')).friends[0].scope,'none');
  });
  const row={localId:'note-1',kind:'shared',title:'今天散步',note:'傍晚去公园',date:'2026-10-11',categoryId:'daily',categoryName:'日常',confirmed:true,photo:false};let record;
  await t.test('draft and default-none invisible; publishing never trusts supplied owner',async()=>{
    record=await rpc('alice','publish_begin',{...row,owner:'bob'});
    assert.equal((await rpc('bob','feed')).records.length,0);
    await rpc('alice','publish_finish',{id:record.id,publishToken:record.publishToken});
    assert.equal((await rpc('bob','feed')).records.length,0);
    assert.equal((await rpc('eve','feed')).records.length,0);
    await assert.rejects(()=>rpc('bob','publish_finish',{id:record.id,publishToken:record.publishToken}),/记录/);
  });
  await t.test('grant scope, historical start and friend homepage checked on server',async()=>{
    await rpc('alice','grant',{id:'bob',scope:'shared',categories:[],since:'2026-10-12'});
    assert.equal((await rpc('bob','feed')).records.length,0);
    await rpc('alice','grant',{id:'bob',scope:'categories',categories:['learning'],since:null});
    assert.equal((await rpc('bob','feed')).records.length,0);
    await rpc('alice','grant',{id:'bob',scope:'all',categories:[],since:null});
    const feed=await rpc('bob','feed',{id:'alice'});assert.equal(feed.records.length,1);assert.equal(feed.records[0].ownerId,'alice');
    assert.equal((await rpc('eve','feed',{id:'alice'})).records.length,0);
    assert.equal((await rpc('alice','feed',{id:'bob'})).records.length,0);
  });
  await t.test('photo remains private until upload exists; no direct storage even broad existing policy',async()=>{
    const photo=await rpc('alice','publish_begin',{...row,localId:'photo-1',kind:'record',photo:true});
    await assert.rejects(()=>rpc('alice','publish_finish',{id:photo.id,publishToken:photo.publishToken}),/照片/);
    await assert.rejects(()=>rpc('bob','media_write',{id:photo.mediaId}),/照片/);
    const info=await rpc('alice','media_write',{id:photo.mediaId});
    await pg.query('INSERT INTO storage.objects(bucket_id,name,metadata) VALUES ($1,$2,$3)', ['shiri-shared',info.path,{size:100,mimetype:'image/jpeg'}]);
    await rpc('alice','publish_finish',{id:photo.id,publishToken:photo.publishToken});
    assert.equal((await rpc('bob','media_read',{id:photo.mediaId})).path,info.path);
    assert.equal((await as('bob',tx=>tx.query('SELECT * FROM storage.objects'))).rows.length,0);
    assert.equal((await as('alice',tx=>tx.query('SELECT * FROM storage.objects'))).rows.length,0);
    await assert.rejects(()=>rpc('eve','media_read',{id:photo.mediaId}),/照片/);
    await rpc('alice','revoke',{id:photo.id});
    await assert.rejects(()=>rpc('bob','media_read',{id:photo.mediaId}),/照片/);
  });
  await t.test('revoke, remove, block and unblock do not resurrect grants',async()=>{
    await rpc('alice','revoke',{id:record.id});assert.equal((await rpc('bob','feed')).records.length,0);
    await assert.rejects(()=>rpc('alice','publish_finish',{id:record.id,publishToken:record.publishToken}),/撤回|失效/);
    record=await rpc('alice','publish_begin',row);
    await rpc('alice','publish_finish',{id:record.id,publishToken:record.publishToken});await rpc('bob','remove',{id:'alice'});
    assert.equal((await rpc('bob','feed')).records.length,0);
    await rpc('alice','request',{id:'bob'});await rpc('bob','respond',{id:'alice',accept:true});
    assert.equal((await rpc('bob','feed')).records.length,0);
    await rpc('alice','block',{id:'bob'});
    assert.equal((await rpc('alice','dashboard')).friends.length,0);
    assert.equal((await rpc('bob','search',{query:'拾光'})).users.length,0);
    await assert.rejects(()=>rpc('bob','request',{id:'alice'}),/用户/);
    await rpc('alice','unblock',{id:'bob'});assert.equal((await rpc('alice','dashboard')).friends.length,0);
  });
  await t.test('reject and cancel are actor-limited and visible as real statuses',async()=>{
    await rpc('eve','request',{id:'alice'});await rpc('alice','respond',{id:'eve',accept:false});
    assert.equal((await rpc('eve','dashboard')).outgoing[0].status,'rejected');
    await rpc('eve','request',{id:'bob'});await rpc('eve','cancel',{id:'bob'});
    assert.equal((await rpc('bob','dashboard')).incoming.length,0);
  });
  await t.test('migration is repeatable without deleting users or records',async()=>{
    await pg.exec(await readFile(new URL('../cloudbase/migrations/001_social.sql',import.meta.url),'utf8'));
  await pg.exec(await readFile(new URL('../cloudbase/migrations/002_nickname_search.sql',import.meta.url),'utf8'));
    assert.ok((await rpc('alice','dashboard')).mine.length>=2);
    await pg.exec(await readFile(new URL('../cloudbase/migrations/002_nickname_search.sql',import.meta.url),'utf8'));
    assert.equal((await rpc('alice','dashboard')).discoverable,true);
  });
});

test('saved-moment queue uses real PostgreSQL RPC: friend reads after one save, stranger/revocation/delete denied',{timeout:60000},async t=>{
  const {pg,rpc}=await database();t.after(()=>pg.close());
  await rpc('alice','request',{id:'bob'});await rpc('bob','respond',{id:'alice',accept:true});
  await rpc('alice','grant',{id:'bob',scope:'all',categories:[],historyDays:0,since:null});
  await rpc('bob','grant',{id:'alice',scope:'all',categories:[],historyDays:0,since:null});
  const row=savedMoment({id:'auto-saved',title:'一次保存的散步',note:'个人生活',date:'2026-10-13',categoryId:'daily'});
  const rows=new Map([[row.id,row],[ 'private',savedMoment({...row,id:'private'},'self')]]);let jobs=[];
  const store={list:async()=>[...rows.values()],get:async id=>rows.get(id),categories:async()=>[{id:'daily',name:'日常'}],asset:async()=>null,
    patch:async(id,rev,patch)=>{const r=rows.get(id);if(r?.cloudSync.revision===rev)rows.set(id,{...r,cloudSync:{...r.cloudSync,...patch}});},revocations:async()=>jobs,doneRevocation:async id=>{jobs=jobs.filter(j=>j.id!==id);}};
  const sync=createMomentSync({store,auth:{session:{user:{id:'alice'}}},api:{rpc:(action,payload)=>rpc('alice',action,payload)},online:()=>true,changed:()=>{}});
  await sync.run(true);assert.equal(rows.get(row.id).cloudSync.state,'synced');
  assert.equal((await rpc('bob','feed',{id:'alice'})).records[0].title,row.title);
  assert.equal((await rpc('eve','feed',{id:'alice'})).records.length,0);
  await sync.run(true);assert.equal((await rpc('bob','feed')).records.length,1);
  assert.equal((await pg.query("SELECT count(*)::int n FROM public.shiri_records WHERE owner_id='alice'")).rows[0].n,1);
  await rpc('alice','grant',{id:'bob',scope:'none',categories:[]});assert.equal((await rpc('bob','feed')).records.length,0);
  await rpc('alice','grant',{id:'bob',scope:'all',categories:[]});rows.delete(row.id);jobs=[{id:row.id}];await sync.run(true);
  assert.equal((await rpc('bob','feed')).records.length,0);assert.equal(jobs.length,0);
});
