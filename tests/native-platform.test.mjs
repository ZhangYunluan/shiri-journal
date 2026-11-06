import test from 'node:test';
import assert from 'node:assert/strict';
import {platformServices,readPickedPhoto} from '../android-shell/platform-services.mjs';
test('Android-only collectors never leak onto iOS; same vault contract is retained',()=>{
 const calls=[],register=name=>new Proxy({},{get:(_,method)=>args=>{calls.push({name,method,args});return Promise.resolve({});}});
 const android=platformServices('android',register,'owner');
 assert.ok(android.photos);assert.equal(android.pickPhotos,undefined);
 android.photos.pending();assert.deepEqual(calls.pop(),{name:'PhotoCollector',method:'pending',args:{owner:'owner'}});
 const ios=platformServices('ios',register,'owner');assert.equal(ios.photos,undefined);
 ios.auth.set({value:'synthetic'});assert.equal(calls.pop().name,'AuthVault');
 ios.pickPhotos();assert.equal(calls.pop().name,'ShiriPhotoPicker');
 ios.releasePickedPhotos('batch');assert.deepEqual(calls.pop().args,{selectionId:'batch'});
 assert.deepEqual(platformServices('web',register,'owner'),{});
});
test('selected photo conversion is bounded and never guesses a capture date',async()=>{
 const convert=x=>x.replace('file://','https://localhost/_capacitor_file_');
 const fetcher=async()=>new Response(new Blob(['jpeg'],{type:'image/jpeg'}));
 const item={path:'file:///cache/photo.jpg',name:'photo.jpg',type:'image/jpeg',taken:Date.UTC(2026,9,9,2)};
 const file=await readPickedPhoto(item,convert,fetcher);assert.equal(file.name,'photo.jpg');assert.equal(file.captureTime,item.taken);
 const missing=await readPickedPhoto({...item,taken:undefined},convert,fetcher);assert.equal(missing.captureTime,undefined);
 await assert.rejects(readPickedPhoto({...item,path:'https://external.example/a'},convert,fetcher));
 await assert.rejects(readPickedPhoto({...item,type:'text/html'},convert,fetcher));
 await assert.rejects(readPickedPhoto(item,convert,async()=>new Response('bad',{status:404})));
 await assert.rejects(readPickedPhoto(item,convert,async()=>new Response(new Blob([new Uint8Array(20*1024*1024+1)]))));
});
