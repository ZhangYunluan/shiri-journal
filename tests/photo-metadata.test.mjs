import test from 'node:test';
import assert from 'node:assert/strict';
import {photoGps,coordinateLabel} from '../src/photo-metadata.mjs';
import {shareProjection} from '../src/cloudbase-social-api.mjs';
function jpeg(little=true){
 const t=new Uint8Array(152),v=new DataView(t.buffer),u16=(p,n)=>v.setUint16(p,n,little),u32=(p,n)=>v.setUint32(p,n,little);
 t.set(little?[73,73]:[77,77]);u16(2,42);u32(4,8);u16(8,1);u16(10,0x8825);u16(12,4);u32(14,1);u32(18,26);
 u16(26,4);for(const [i,tag,type,count,offset]of [[0,1,2,2,0],[1,2,5,3,80],[2,3,2,2,0],[3,4,5,3,104]]){const p=28+12*i;u16(p,tag);u16(p+2,type);u32(p+4,count);u32(p+8,offset);}t[36]=78;t[60]=69;
 for(const [p,n]of [[80,31],[88,12],[96,0],[104,121],[112,30],[120,0]]){u32(p,n);u32(p+4,1);}
 const out=new Uint8Array(t.length+14);out.set([255,216,255,225,0,t.length+8,69,120,105,102,0,0]);out.set(t,12);out.set([255,217],out.length-2);return out;
}
test('EXIF GPS parses either byte order without guessing a place',()=>{
 for(const le of [true,false])assert.deepEqual(photoGps(jpeg(le)),{latitude:31.2,longitude:121.5});
 assert.equal(coordinateLabel({latitude:31.2,longitude:121.5}),'拍摄坐标：31.200000, 121.500000');
 assert.equal(photoGps(new Uint8Array([255,216,255,217])),null);
});
test('malformed, truncated or out of range EXIF fails closed',()=>{
 const x=jpeg();new DataView(x.buffer).setUint32(12+18,999999,true);assert.equal(photoGps(x),null);
 for(let n=0;n<166;n++)assert.doesNotThrow(()=>photoGps(jpeg().slice(0,n)));
 assert.equal(coordinateLabel({latitude:91,longitude:10}),'');assert.equal(coordinateLabel(null),'');
});
test('precise location and original linkage never enter existing share projection',()=>{
 const p=shareProjection({id:'r',kind:'moment',status:'confirmed',title:'散步',note:'',date:'2026-10-29',location:'拍摄坐标：31,121',nativePhotoId:'n',categoryId:'daily'},{});
 assert.equal(p.location,undefined);assert.equal(p.nativePhotoId,undefined);
});
