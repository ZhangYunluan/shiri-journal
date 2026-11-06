import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
const migration=()=>readFile(new URL('../cloudbase/migrations/004_moment_comments.sql',import.meta.url),'utf8');
test('comments enforce real identity, private two-person threads, grants, limits and revocation',{timeout:60000},async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'sub'$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'role'$$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,PRIMARY KEY(bucket_id,name));
 GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated;GRANT ALL ON storage.objects TO anon,authenticated;`);
 for(const name of ['001_social.sql','002_nickname_search.sql'])await pg.exec(await readFile(new URL('../cloudbase/migrations/'+name,import.meta.url),'utf8'));
 await pg.exec(await migration());
 const as=(uid,work,role='authenticated')=>pg.transaction(async tx=>{await tx.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:uid,role})]);await tx.exec(`SET LOCAL ROLE ${role}`);return work(tx);});
 const call=(name,u,action,payload={},role)=>as(u,async tx=>(await tx.query(`SELECT public.${name}($1,$2::jsonb) AS data`,[action,JSON.stringify(payload)])).rows[0].data,role);
 const social=(...args)=>call('shiri_social',...args),comments=(...args)=>call('shiri_comments',...args);
 for(const u of ['alice','bob','carol','eve'])await social(u,'profile',{nickname:u});
 for(const u of ['bob','carol']){await social(u,'request',{id:'alice'});await social('alice','respond',{id:u,accept:true});await social('alice','grant',{id:u,scope:'all',categories:[]});}
 const record=await social('alice','publish_begin',{localId:'comment-test',kind:'shared',title:'散步',note:'合成记录',date:'2026-10-28',categoryId:'daily',confirmed:true,photo:false});await social('alice','publish_finish',{id:record.id,publishToken:record.publishToken});
 const send=(u,body,extra={})=>comments(u,'send',{recordId:record.id,body,clientId:crypto.randomUUID(),...extra});
 await t.test('anonymous and direct database access are denied',async()=>{
  await assert.rejects(()=>comments('anon','capabilities',{},'anon'),/permission denied/);
  await assert.rejects(()=>as('bob',tx=>tx.query('SELECT * FROM public.shiri_moment_comments')),/permission denied/);
  await assert.rejects(()=>as('bob',tx=>tx.query('SELECT * FROM shiri_private.comment_limits')),/permission denied/);
  assert.equal((await comments('bob','capabilities')).version,1);
  assert.equal((await pg.query("SELECT relrowsecurity FROM pg_class WHERE oid='public.shiri_moment_comments'::regclass")).rows[0].relrowsecurity,true);
 });
 let bob,reply,carol;
 await t.test('only the actor and owner can read their own thread',async()=>{
  bob=await send('bob','这个地方真好看 😊');
  assert.equal((await comments('bob','list',{recordId:record.id})).comments[0].authorId,'bob');
  assert.equal((await comments('carol','list',{recordId:record.id})).comments.length,0);
  await assert.rejects(()=>comments('carol','list',{recordId:record.id,participantId:'bob'}),/权限/);
  await assert.rejects(()=>comments('eve','list',{recordId:record.id}),/权限/);
  await assert.rejects(()=>send('eve','陌生人'),/权限/);
  await assert.rejects(()=>send('bob','伪造',{authorId:'alice'}),/字段/);
  await assert.rejects(()=>send('alice','无参与者'),/参与/);
  reply=await send('alice','下次再去',{participantId:'bob'});
  assert.deepEqual((await comments('bob','list',{recordId:record.id})).comments.map(r=>r.authorId),['bob','alice']);
  carol=await send('carol','我的独立留言');
  const threads=(await comments('alice','threads',{recordId:record.id})).threads;assert.deepEqual(threads.map(r=>r.participantId).sort(),['bob','carol']);
  assert.equal((await comments('carol','list',{recordId:record.id})).comments.length,1);
 });
 await t.test('safe validation and idempotent retries do not create duplicates',async()=>{
  await assert.rejects(()=>send('bob',' '),/1–300/);await assert.rejects(()=>send('bob','x'.repeat(301)),/1–300/);await assert.rejects(()=>send('bob','bad\u0001'),/格式/);await assert.rejects(()=>send('bob','bad\u0000'));
  await assert.rejects(()=>send('bob',{text:'不能用对象代替正文'}),/格式/);
  const clientId=crypto.randomUUID();const a=await send('bob','重试不重复',{clientId}),b=await send('bob','重试不重复',{clientId});assert.equal(a.id,b.id);
  await assert.rejects(()=>send('carol','抢占',{clientId}),/冲突/);
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.shiri_moment_comments WHERE id=$1',[clientId])).rows[0].n,1);
 });
 await t.test('category and historical limits match the existing moment permissions',async()=>{
  await social('alice','grant',{id:'bob',scope:'categories',categories:['learning']});await assert.rejects(()=>comments('bob','list',{recordId:record.id}),/权限/);
  await social('alice','grant',{id:'bob',scope:'categories',categories:['daily']});assert.ok((await comments('bob','list',{recordId:record.id})).comments.length);
  await social('alice','grant',{id:'bob',scope:'all',categories:[],since:'2200-01-01'});await assert.rejects(()=>comments('bob','list',{recordId:record.id}),/权限/);
  const old=await social('alice','publish_begin',{localId:'old-comment-test',kind:'shared',title:'旧片刻',date:'2000-01-01',categoryId:'daily',confirmed:true,photo:false});await social('alice','publish_finish',{id:old.id,publishToken:old.publishToken});
  await social('alice','grant',{id:'bob',scope:'all',categories:[],since:null,historyDays:7});await assert.rejects(()=>comments('bob','list',{recordId:old.id}),/权限/);
  await social('alice','grant',{id:'bob',scope:'all',categories:[],since:null,historyDays:0});
 });
 await t.test('only the author or moment owner can delete a comment',async()=>{
  await assert.rejects(()=>comments('carol','delete',{id:bob.id}),/无权/);
  await comments('bob','delete',{id:bob.id});await comments('alice','delete',{id:carol.id});
  assert.equal((await comments('carol','list',{recordId:record.id})).comments.length,0);
  await assert.rejects(()=>comments('bob','delete',{id:reply.id}),/无权/);
 });
 await t.test('rate limiting survives deletion',async()=>{
  await pg.query('DELETE FROM shiri_private.comment_limits WHERE user_id=$1',['bob']);
  for(let i=0;i<10;i++){const a=await send('bob','限流测试 '+i);await comments('bob','delete',{id:a.id});}
  await assert.rejects(()=>send('bob','第11条'),/频繁/);
  await pg.query("UPDATE shiri_private.comment_limits SET minute_start=now()-interval '2 minutes',day_count=100 WHERE user_id=$1",['bob']);
  await assert.rejects(()=>send('bob','日限额'),/今日/);
 });
 await t.test('revocation, block, removal and withdrawn moments immediately deny subsequent access',async()=>{
  await social('alice','grant',{id:'bob',scope:'none',categories:[]});
  await assert.rejects(()=>comments('bob','list',{recordId:record.id}),/权限/);await assert.rejects(()=>send('bob','已撤权'),/权限/);
  assert.ok(!(await comments('alice','threads',{recordId:record.id})).threads.some(r=>r.participantId==='bob'));
  await social('alice','block',{id:'carol'});await assert.rejects(()=>comments('carol','list',{recordId:record.id}),/权限/);
  await social('alice','unblock',{id:'carol'});await assert.rejects(()=>send('carol','解除屏蔽不恢复好友'),/权限/);
  await social('carol','request',{id:'alice'});await social('alice','respond',{id:'carol',accept:true});await social('alice','grant',{id:'carol',scope:'all',categories:[]});
  await social('carol','remove',{id:'alice'});await assert.rejects(()=>comments('carol','list',{recordId:record.id}),/权限/);
  await social('bob','remove',{id:'alice'});await social('bob','request',{id:'alice'});await social('alice','respond',{id:'bob',accept:true});await social('alice','grant',{id:'bob',scope:'all',categories:[]});
  await social('alice','revoke',{id:record.id});await assert.rejects(()=>comments('bob','list',{recordId:record.id}),/权限/);
 });
 await t.test('migration rerun preserves existing data and permissions',async()=>{
  const before=(await pg.query('SELECT count(*)::int AS n FROM public.shiri_moment_comments')).rows[0].n;await pg.exec(await migration());
  assert.equal((await pg.query('SELECT count(*)::int AS n FROM public.shiri_moment_comments')).rows[0].n,before);
  const checks=await pg.query(await readFile(new URL('../cloudbase/migrations/verify_moment_comments.sql',import.meta.url),'utf8'));assert.ok(checks.rows.every(r=>r.ok===true));
 });
});
