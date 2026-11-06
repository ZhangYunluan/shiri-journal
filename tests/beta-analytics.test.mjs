import test from 'node:test';
import assert from 'node:assert/strict';
import {createBetaAnalytics,BETA_ID} from '../src/beta-analytics.mjs';
import {exportBackup,parseBackup} from '../src/backup.mjs';
function fixture(extra={}){let stored,calls=0,time=Date.parse('2026-10-18T12:00:00Z');const api=createBetaAnalytics({read:async()=>stored,write:async s=>{stored=s;},token:async()=>'user-token',now:()=>time,fetcher:async()=>{calls++;return new Response(null,{status:204});},...extra});return {api,get stored(){return stored;},get calls(){return calls;},advance:()=>{time+=61000;}};}
test('default off and local-only consent never transmit data',async()=>{
 const f=fixture();await f.api.load();await f.api.saved();await f.api.page('reports');await f.api.flush();assert.equal(f.api.snapshot.count,0);
 await f.api.consent(true);await f.api.saved(30);await f.api.page('reports');await f.api.page('reports');await f.api.flush();
 assert.equal(f.calls,0);assert.equal(f.api.snapshot.count,31);assert.equal(f.stored.events.find(e=>e.name==='first_save').count,1);assert.equal(f.stored.events.find(e=>e.name==='subsequent_save').count,29);
 await f.api.consent(false);await f.api.saved();assert.equal(f.api.snapshot.count,0);
});
test('existing users, view deduplication and sync failures contain no content',async()=>{
 const f=fixture();await f.api.load();await f.api.consent(true,true);await f.api.saved(2);await f.api.page('friends',false);await f.api.page('friends',true);await f.api.page('friends',true);
 const rows=[{id:'private-id',note:'secret diary',cloudSync:{state:'pending',revision:'one',error:'secret email'}}];
 await f.api.errors(rows);await f.api.errors(rows);
 assert.equal(f.api.snapshot.count,4);assert.ok(!JSON.stringify(f.stored).includes('secret'));assert.ok(!JSON.stringify(f.stored).includes('private-id'));assert.ok(!f.stored.events.some(e=>e.name==='first_save'));
});
test('failed send retains queue; retry requires delay and uses only user bearer + counts',async()=>{
 let requests=[],fail=true;const f=fixture({endpoint:'https://cloud.example/telemetry',allowedOrigin:'https://cloud.example',fetcher:async(url,options)=>{requests.push(options);return new Response(null,{status:fail?503:204});}});
 await f.api.load();await f.api.consent(true);await f.api.saved();await f.api.flush();assert.equal(f.api.snapshot.count,1);
 fail=false;await f.api.flush();assert.equal(requests.length,1);f.advance();await f.api.flush();assert.equal(f.api.snapshot.count,0);assert.equal(requests[1].headers.Authorization,'Bearer user-token');assert.deepEqual(Object.keys(JSON.parse(requests[1].body)).sort(),['events','version']);
});
test('changing destination cannot reuse previous local-only consent',async()=>{
 const api=createBetaAnalytics({read:async()=>({enabled:true,destination:'',events:[],saved:true}),write:async()=>{},token:async()=>'x',endpoint:'https://cloud.example/telemetry',allowedOrigin:'https://cloud.example'});await api.load();assert.equal(api.snapshot.enabled,false);
});

test('assistant on report route is not a report view; opening the actual report counts once',async()=>{
 const f=fixture();await f.api.load();await f.api.consent(true);
 await f.api.page('reports',false,{assistantOpen:true});
 assert.equal(f.api.snapshot.count,0);
 await f.api.page('reports');await f.api.page('reports');
 assert.equal(f.stored.events.find(e=>e.name==='report_view').count,1);
});
test('opt-out while authentication is pending prevents send',async()=>{
 let unlock;const f=fixture({endpoint:'https://cloud.example/t',allowedOrigin:'https://cloud.example',token:()=>new Promise(r=>{unlock=r;})});await f.api.load();await f.api.consent(true);await f.api.saved();const flight=f.api.flush();await f.api.consent(false);unlock('user-token');await flight;assert.equal(f.calls,0);assert.equal(f.api.snapshot.count,0);
});
test('life backup retains records and assets but omits analytics and consent',async()=>{
 const tables={records:[{id:'keep-me'}],assets:[],plans:[],reports:[],categories:[],learning:[],settings:[{id:'main',theme:'dark'},{id:BETA_ID,enabled:true,events:[{name:'first_save',count:1}]}]};
 const restored=await parseBackup(await exportBackup(tables));assert.deepEqual(restored.records,tables.records);assert.deepEqual(restored.settings,[tables.settings[0]]);assert.equal(tables.settings.length,2);
});
