import test from 'node:test';
import assert from 'node:assert/strict';
import {removalPlan,removeCandidates} from '../src/review-removal.mjs';
const id='11111111-1111-4111-8111-111111111111',other='22222222-2222-4222-8222-222222222222';
const rows=()=>[{id:'native:'+id,source:'native-auto',assetId:'a'.repeat(64),status:'review'},{id:'native:'+other,source:'native-auto',assetId:'b'.repeat(64),status:'review'},{id:'saved',assetId:'saved',status:'confirmed'}];
test('default exclusion never calls native deletion and preserves confirmed records',async()=>{
 const data=rows();let called=false,saved=[];
 await removeCandidates({records:data,ids:data.map(r=>r.id),mode:'exclude',native:{deleteOriginals:()=>{called=true;}},persist:async r=>saved=r});
 assert.equal(called,false);assert.equal(saved.length,2);assert.ok(saved.every(r=>r.status==='review'&&r.excluded));assert.equal(data[2].excluded,undefined);
});
test('cancelled system consent leaves every candidate intact',async()=>{
 let writes=0;const data=rows();const result=await removeCandidates({records:data,ids:[data[0].id],mode:'originals',native:{protect:async()=>{},deleteOriginals:async()=>({cancelled:true,deleted:[]})},persist:async()=>writes++});
 assert.equal(writes,0);assert.equal(result.cancelled,true);assert.equal(data[0].excluded,undefined);
});
test('only verified selected successes are excluded; failure and unrelated IDs never succeed',async()=>{
 const data=rows();let saved=[];
 const result=await removeCandidates({records:data,ids:[data[0].id,data[1].id],mode:'originals',native:{protect:async()=>{},deleteOriginals:async()=>({deleted:[id],failed:[{id:other,reason:'未授权'}]})},persist:async r=>saved=r});
 assert.equal(saved.length,1);assert.equal(saved[0].id,data[0].id);assert.equal(result.failed.length,1);assert.equal(saved[0].originalDeleted,true);
 await assert.rejects(()=>removeCandidates({records:data,ids:[data[0].id],mode:'originals',native:{protect:async()=>{},deleteOriginals:async()=>({deleted:[other]})},persist:async()=>{throw Error('must not write');}}),/结果/);
});
test('saved asset references, excluded records and unlinked imports cannot delete originals',()=>{
 const data=rows();data.push({id:'dependent',assetId:data[0].assetId,status:'confirmed'});data[1].excluded=true;
 const plan=removalPlan(data,data.map(r=>r.id));assert.equal(plan.originals.length,0);assert.equal(plan.candidates.length,1);assert.equal(plan.blocked.length,1);
 const recovered=rows();recovered[0].originalDeleted=true;assert.equal(removalPlan(recovered,[recovered[0].id]).originals.length,0);
});
