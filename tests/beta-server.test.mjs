import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const {validate,createTelemetryServer}=createRequire(import.meta.url)('../cloudbase/functions/shiri-telemetry/index.js');
const now=Date.parse('2026-10-18T12:00:00Z'),payload={version:'0.6.1',events:[{name:'first_save',day:'2026-10-18',count:1}]};
test('strict schema rejects content, UIDs, unknown events, invalid dates and excessive counts',()=>{
 assert.equal(validate(payload,now).events[0].count,1);
 for(const bad of [{...payload,uid:'spoofed'}, {...payload,events:[{...payload.events[0],note:'private'}]}, {...payload,events:[{...payload.events[0],name:'raw_photo'}]}, {...payload,events:[{...payload.events[0],count:10001}]}, {...payload,events:[{...payload.events[0],day:'2026-02-30'}]}])assert.throws(()=>validate(bad,now));
});
test('HTTP receiver rejects anonymous/read/foreign origin; validated counts only reach admin logs',async t=>{
 const logs=[],server=createTelemetryServer({authOrigin:'https://auth.example',origins:['https://localhost'],corsOwner:'function'},{now:()=>now,log:s=>logs.push(JSON.parse(s)),fetcher:async(url,options)=>{assert.equal(url,'https://auth.example/auth/v1/user/me');const auth=options.headers.Authorization;return auth==='Bearer invalid'?new Response(null,{status:401}):Response.json({sub:auth==='Bearer anon'?'anon':auth==='Bearer user-b'?'user-b':'user-a',email:'private@example.invalid',status:'ACTIVE'});}});
 await new Promise(r=>server.listen(0,'127.0.0.1',r));t.after(()=>new Promise(r=>server.close(r)));const url=`http://127.0.0.1:${server.address().port}`;
 const post=(token='user-a',body=payload,origin='https://localhost')=>fetch(url,{method:'POST',headers:{'Content-Type':'application/json',Origin:origin,...(token?{Authorization:'Bearer '+token}:{})},body:JSON.stringify(body)});
 assert.equal((await post('')).status,401);assert.equal((await post('anon')).status,403);assert.equal((await post('invalid')).status,401);assert.equal((await post('user-a',payload,'https://evil.example')).status,403);
 assert.equal((await post('user-a',{...payload,userId:'victim'})).status,400);
 assert.equal((await post()).status,204);assert.equal((await post()).status,429);assert.equal((await post('user-b')).status,204);
 for(const token of ['user-a','user-b'])assert.equal((await fetch(url+'/stats',{headers:{Authorization:'Bearer '+token}})).status,405);
 assert.equal(logs.length,2);assert.ok(!JSON.stringify(logs).includes('private'));assert.ok(!JSON.stringify(logs).includes('user-a'));assert.deepEqual(logs[0].events,payload.events);
});
