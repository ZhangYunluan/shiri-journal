import {test} from 'node:test';
import assert from 'node:assert/strict';
import {canShare,sharedRecord,recordDigest} from '../src/sharing.mjs';
import {createHash} from 'node:crypto';
test('sharing requires an explicit scope, with no original files or AI raw text in projection',async()=>{
 const source={id:'r1',kind:'record',status:'confirmed',shareApproved:true,categoryId:'daily',date:'2026-10-10',title:' 标题 ',note:'笔记',tags:[' 标签 '],blob:'private',analysis:{ocr:'private OCR'},assetId:'secret',reflection:'private'};
 assert.equal(canShare({scope:'none'},source),false);
 assert.equal(canShare({scope:'shared'},source),false);
 assert.equal(canShare({scope:'categories',categories:['daily']},source),true);
 assert.equal(canShare({scope:'all'},source),true);
 assert.equal(canShare({scope:'all'},{...source,status:'review'}),false);
 assert.equal(canShare({scope:'all'},{...source,shareApproved:false}),false);
 const result=sharedRecord(source,{name:'日常'});
 assert.deepEqual(Object.keys(result),['id','kind','status','shareApproved','categoryId','date','title','note','privatePhotoId','categoryName','tags']);
 assert.equal(await recordDigest(result),createHash('sha256').update(JSON.stringify(result)).digest('hex'));
});
