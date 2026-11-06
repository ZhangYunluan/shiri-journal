import test from 'node:test';
import assert from 'node:assert/strict';
import {mergeScan} from '../src/collector-state.mjs';
test('multi-page scan results count prior staged photos once, not as pre-existing duplicates',()=>{
 let r=mergeScan(null,{found:300,staged:300,existing:0,failed:0,unsupported:0,complete:false,until:10});
 r=mergeScan(r,{found:380,staged:30,existing:350,failed:0,unsupported:0,complete:true,until:10});
 assert.deepEqual(r,{found:380,staged:330,existing:50,failed:0,unsupported:0,complete:true,until:10});
});
test('unsupported results and failures remain explicit and cannot be reported as a complete scan',()=>{
 const r=mergeScan(null,{found:4,staged:1,existing:1,failed:1,unsupported:1,complete:false,until:10});
 assert.equal(r.failed,1);assert.equal(r.unsupported,1);assert.equal(r.complete,false);assert.equal(r.found,4);
});
