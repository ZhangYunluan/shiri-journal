import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { createModelCache } from '../src/model-cache.mjs';

const origin = 'https://example.test/';
const digest = async bytes => Buffer.from(await webcrypto.subtle.digest('SHA-256', bytes)).toString('hex');
async function fixture(corrupt = false) {
  const bytes = new Uint8Array([1,2,3,4]);
  const parts = [bytes.slice(0,2), bytes.slice(2)];
  const entry = { size:4, sha256:await digest(bytes), parts:await Promise.all(parts.map(async (p,i)=>({path:`models/parts/${i}.bin`,size:p.length,sha256:await digest(p)}))) };
  const manifest = {version:1,files:{'models/test.onnx':entry}};
  const calls=[];
  const fetcher=async url=>{calls.push(String(url)); const i=Number(new URL(url).pathname.split('/').pop().split('.')[0]);return new Response(corrupt ? new Uint8Array([9,9]) : parts[i]);};
  const saved=new Map();
  const storage={open:async()=>({match:async key=>saved.get(key)?.clone(),put:async (key,res)=>{saved.set(key,res.clone());}})};
  return {manifest,calls,cache:createModelCache(manifest,{baseURL:origin,fetcher,storage,crypto:webcrypto})};
}
test('reassembles same-origin model chunks exactly and reuses the verified cache',async()=>{
  const {cache,calls}=await fixture();
  assert.deepEqual(new Uint8Array(await (await cache.match(origin+'models/test.onnx')).arrayBuffer()),new Uint8Array([1,2,3,4]));
  await cache.match(origin+'models/test.onnx');
  assert.equal(calls.length,2);
  assert.equal(await cache.match('https://outside.test/models/test.onnx'),undefined);
});
test('rejects corrupted model bytes before inference',async()=>{
  const {cache}=await fixture(true);
  await assert.rejects(cache.match(origin+'models/test.onnx'),/校验/);
});
test('refuses a model manifest that sends a chunk to another origin',async()=>{
  const {manifest}=await fixture();
  manifest.files['models/test.onnx'].parts[0].path='https://outside.test/part.bin';
  const cache=createModelCache(manifest,{baseURL:origin,crypto:webcrypto});
  await assert.rejects(cache.match(origin+'models/test.onnx'),/同源/);
});
