import test from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {createMediaServer,stripJpegMetadata}=require('../cloudbase/functions/shiri-media/index.js');
const jpeg=Buffer.from([255,216,255,225,0,8,69,120,105,102,0,0,255,218,0,2,1,2,255,217]);
const config={origin:'https://example.api.tcloudbasegateway.com',serviceKey:'server-secret',origins:['https://localhost']};
test('JPEG transfer strips EXIF and rejects malformed images',()=>{
  const clean=stripJpegMetadata(jpeg);assert.equal(clean.includes(Buffer.from('Exif')),false);assert.equal(clean[0],255);
  assert.throws(()=>stripJpegMetadata(Buffer.from('not jpeg')),/JPEG/);
  assert.throws(()=>stripJpegMetadata(Buffer.from([255,216,255,225,255,255])),/JPEG/);
});
test('private media HTTP checks current user grants, rechecks after read, no signed URLs',{timeout:15000},async t=>{
  let revoked=false,calls=[],during=false;
  const server=createMediaServer(config,async(url,options)=>{
    calls.push({url,options});
    if(url.endsWith('/rpc/shiri_social')){
      assert.equal(options.headers.Authorization,'Bearer user-token');
      if(revoked)return Response.json({message:'照片不可访问'},{status:403});
      return Response.json({bucket:'shiri-shared',path:'11111111-1111-4111-8111-111111111111.jpg'});
    }
    assert.equal(options.headers.Authorization,'Bearer server-secret');
    if(options.method==='POST'){assert.equal(Buffer.from(options.body).includes(Buffer.from('Exif')),false);return Response.json({});}
    if(options.method==='DELETE')return Response.json({});
    if(during)revoked=true;
    return new Response(jpeg,{headers:{'Content-Type':'image/jpeg'}});
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/shiri-media?id=11111111-1111-4111-8111-111111111111`;
  assert.equal((await fetch(url)).status,401);assert.equal(calls.length,0);
  assert.equal((await fetch(url,{headers:{Authorization:'Bearer user-token',Origin:'https://untrusted.invalid'}})).status,403);
  let res=await fetch(url,{headers:{Authorization:'Bearer user-token',Origin:'https://localhost'}});
  assert.equal(res.status,200);assert.equal(res.headers.get('Cache-Control'),'private, no-store, max-age=0');assert.equal(res.headers.get('Access-Control-Allow-Origin'),'https://localhost');
  assert.equal(calls.filter(c=>c.url.endsWith('/rpc/shiri_social')).length,2);
  calls=[];during=true;res=await fetch(url,{headers:{Authorization:'Bearer user-token'}});assert.equal(res.status,403);
  revoked=false;during=false;calls=[];
  res=await fetch(url,{method:'PUT',headers:{Authorization:'Bearer user-token','Content-Type':'image/jpeg'},body:jpeg});assert.equal(res.status,200);
  assert.equal(JSON.parse(calls[0].options.body).p_action,'media_write');
  res=await fetch(url,{method:'PUT',headers:{Authorization:'Bearer user-token','Content-Type':'image/jpeg'},body:Buffer.alloc(1048577)});assert.equal(res.status,413);
  revoked=true;calls=[];res=await fetch(url,{headers:{Authorization:'Bearer user-token'}});assert.equal(res.status,403);assert.equal(calls.length,1);
});

// CloudBase gateway adds its own CORS headers. The function must not duplicate them.
test('gateway owns CORS while function retains origin checks and authentication',async t=>{
  const server=createMediaServer({...config,corsOwner:'gateway'},async()=>{throw Error('Unauthenticated request reached storage');});
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));t.after(()=>new Promise(resolve=>server.close(resolve)));
  const url=`http://127.0.0.1:${server.address().port}/shiri-media`;
  for(const method of ['GET','PUT','OPTIONS']){
    const r=await fetch(url,{method,headers:{Origin:'https://localhost'}});
    assert.equal(r.status,method==='OPTIONS'?204:401);
    assert.equal(r.headers.get('Access-Control-Allow-Origin'),null);
    assert.equal(r.headers.get('Access-Control-Allow-Methods'),null);
  }
  const denied=await fetch(url,{method:'PUT',headers:{Origin:'https://untrusted.invalid'}});
  assert.equal(denied.status,403);
});
