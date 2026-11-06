import test from 'node:test';
import assert from 'node:assert/strict';
import {assertShareable,uploadPrivateRecord} from '../src/private-cloud.mjs';
test('unconfirmed or unapproved photographs can never reach an upload',async()=>{
  assert.throws(()=>assertShareable({status:'review',shareApproved:true}),/确认/);
  assert.throws(()=>assertShareable({status:'confirmed',shareApproved:false}),/确认/);
  let requests=0;const before=globalThis.fetch;globalThis.fetch=async()=>{requests++;throw Error('must not send');};
  try{await assert.rejects(()=>uploadPrivateRecord({status:'confirmed',shareApproved:false},{}),/确认/);assert.equal(requests,0);}finally{globalThis.fetch=before;}
});
test('even explicitly approved photos stay local until the sharing stage is verified',async()=>{
  await assert.rejects(()=>uploadPrivateRecord({status:'confirmed',shareApproved:true},{}),/阶段/);
});
