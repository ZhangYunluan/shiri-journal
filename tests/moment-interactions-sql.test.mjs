import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
test('likes and counts preserve authentication, thread privacy and revoked grants',{timeout:60000},async t=>{
 const pg=new PGlite();t.after(()=>pg.close());
 await pg.exec(`CREATE ROLE anon;CREATE ROLE authenticated;CREATE SCHEMA auth;CREATE SCHEMA storage;
 CREATE FUNCTION auth.uid() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'sub'$$;
 CREATE FUNCTION auth.role() RETURNS text LANGUAGE sql AS $$SELECT current_setting('request.jwt.claims',true)::jsonb->>'role'$$;
 CREATE TABLE storage.buckets(id text PRIMARY KEY,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
 CREATE TABLE storage.objects(id uuid DEFAULT gen_random_uuid(),bucket_id text,name text,metadata jsonb,PRIMARY KEY(bucket_id,name));
 GRANT USAGE ON SCHEMA auth,storage TO anon,authenticated;GRANT ALL ON storage.objects TO anon,authenticated;`);
 for(const f of ['001_social.sql','002_nickname_search.sql','004_moment_comments.sql','005_moment_interactions.sql'])await pg.exec(await readFile(new URL('../cloudbase/migrations/'+f,import.meta.url),'utf8'));
 const call=(rpc,u,a,p={},role='authenticated')=>pg.transaction(async tx=>{
  await tx.query(`SELECT set_config('request.jwt.claims',$1,true)`,[JSON.stringify({sub:u,role})]);await tx.exec(`SET LOCAL ROLE ${role}`);
  return (await tx.query(`SELECT public.${rpc}($1,$2::jsonb) data`,[a,JSON.stringify(p)])).rows[0].data;
 });
 const social=(...a)=>call('shiri_social',...a),interact=(...a)=>call('shiri_interactions',...a),comments=(...a)=>call('shiri_comments',...a);
 for(const u of ['alice','bob','carol','eve'])await social(u,'profile',{nickname:u});
 for(const u of ['bob','carol']){await social(u,'request',{id:'alice'});await social('alice','respond',{id:u,accept:true});await social('alice','grant',{id:u,scope:'all',categories:[]});}
 const rec=await social('alice','publish_begin',{localId:'likes-test',kind:'shared',title:'散步',note:'',date:'2026-10-29',categoryId:'daily',confirmed:true,photo:false});await social('alice','publish_finish',{id:rec.id,publishToken:rec.publishToken});
 await assert.rejects(()=>interact('bob','summary',{ids:Array(51).fill(rec.id)}),/50/);
 await assert.rejects(()=>interact('bob','summary',{ids:[rec.id,crypto.randomUUID()]}),/权限/);
 const summary=u=>interact(u,'summary',{ids:[rec.id]}).then(x=>x.records[0]);
 await assert.rejects(()=>interact('anon','capabilities',{},'anon'),/permission denied/);
 await assert.rejects(()=>interact('eve','set_like',{recordId:rec.id,liked:true}),/权限/);
 await assert.rejects(()=>interact('bob','set_like',{recordId:rec.id,liked:true,userId:'eve'}),/字段/);
 await assert.rejects(()=>interact('bob','set_like',{recordId:rec.id,liked:'true'}),/格式/);
 assert.equal((await summary('bob')).likes,0);
 await interact('bob','set_like',{recordId:rec.id,liked:true});await interact('bob','set_like',{recordId:rec.id,liked:true});
 assert.deepEqual(await summary('bob'),{id:rec.id,liked:true,likes:1,comments:0});
 await pg.query("UPDATE shiri_private.like_limits SET minute_count=60,day_count=500 WHERE user_id='bob'");
 await interact('bob','set_like',{recordId:rec.id,liked:true}); // idempotent retry is free
 await assert.rejects(()=>interact('bob','set_like',{recordId:rec.id,liked:false}),/频繁/);
 await pg.query("UPDATE shiri_private.like_limits SET minute_count=0,day_count=0 WHERE user_id='bob'");
 await interact('carol','set_like',{recordId:rec.id,liked:true});assert.equal((await summary('bob')).likes,2);
 await comments('bob','send',{recordId:rec.id,body:'你好 😊',clientId:crypto.randomUUID()});
 assert.equal((await summary('bob')).comments,1);assert.equal((await summary('carol')).comments,0);assert.equal((await summary('alice')).comments,1);
 await interact('bob','set_like',{recordId:rec.id,liked:false});await interact('bob','set_like',{recordId:rec.id,liked:false});assert.equal((await summary('bob')).likes,1);
 for(const operation of ['grant','block','remove','revoke']){
  if(operation==='grant')await social('alice','grant',{id:'bob',scope:'none',categories:[]});
  if(operation==='block')await social('alice','block',{id:'carol'});
  if(operation==='remove')await social('bob','remove',{id:'alice'});
  if(operation==='revoke')await social('alice','revoke',{id:rec.id});
  const viewer=operation==='block'?'carol':'bob';await assert.rejects(()=>interact(viewer,'set_like',{recordId:rec.id,liked:true}),/权限/);await assert.rejects(()=>summary(viewer),/权限/);
 }
 await pg.exec(await readFile(new URL('../cloudbase/migrations/005_moment_interactions.sql',import.meta.url),'utf8'));
 assert.ok((await pg.query(await readFile(new URL('../cloudbase/migrations/verify_moment_interactions.sql',import.meta.url),'utf8'))).rows.every(r=>r.ok));
 assert.equal((await pg.query('SELECT count(*)::int n FROM public.shiri_moment_comments')).rows[0].n,1);
 await assert.rejects(()=>pg.transaction(async tx=>{await tx.exec('SET LOCAL ROLE authenticated');await tx.query('SELECT * FROM public.shiri_moment_likes');}),/permission denied/);
});
