'use strict';
// HTTP Function (not Event Function): node index.js listens on CloudBase port 9000.
// No third-party dependencies. The service key exists only in server environment variables.
const http=require('node:http');
const LIMIT=1024*1024,UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
class HttpError extends Error{constructor(status,message){super(message);this.status=status;}}
function stripJpegMetadata(input){
  const bytes=Buffer.from(input);
  if(bytes.length<4||bytes[0]!==255||bytes[1]!==216)throw new HttpError(415,'需要 JPEG 照片');
  const parts=[bytes.subarray(0,2)];let pos=2;
  while(pos<bytes.length){
    if(bytes[pos]!==255||pos+3>=bytes.length)throw new HttpError(415,'JPEG 内容不完整');
    const marker=bytes[pos+1],size=bytes.readUInt16BE(pos+2);
    if(size<2||pos+size+2>bytes.length)throw new HttpError(415,'JPEG 数据无效');
    if(marker===218){parts.push(bytes.subarray(pos));return Buffer.concat(parts);}
    // APP1 EXIF/XMP, APP2 ICC, APP13 IPTC and comments can carry unnecessary metadata.
    if(!(marker>=225&&marker<=239)&&marker!==254)parts.push(bytes.subarray(pos,pos+size+2));
    pos+=size+2;
  }
  throw new HttpError(415,'JPEG 缺少图像数据');
}
async function limitedBytes(stream){
  const chunks=[];let size=0;
  for await(const chunk of stream){size+=chunk.length;if(size>LIMIT)throw new HttpError(413,'照片超过 1 MiB');chunks.push(chunk);}
  return Buffer.concat(chunks);
}
function createMediaServer(config,fetcher=globalThis.fetch){
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','private, no-store, max-age=0');
    res.setHeader('Pragma','no-cache');res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Vary','Origin, Authorization');
    const json=(status,value)=>{res.writeHead(status,{'Content-Type':'application/json; charset=utf-8'});res.end(JSON.stringify(value));};
    try{
      const origin=req.headers.origin;
      if(origin&&!config.origins.includes(origin))throw new HttpError(403,'此来源未配置');
      // Only one layer may emit CORS headers; duplicate origins are rejected by WebView.
      const functionCors=config.corsOwner!=='gateway';
      if(origin&&functionCors)res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method==='OPTIONS'){
        if(functionCors){
          res.setHeader('Access-Control-Allow-Methods','GET, PUT, DELETE, OPTIONS');
          res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');
        }
        res.writeHead(204);res.end();return;
      }
      if(!['GET','PUT','DELETE'].includes(req.method))throw new HttpError(405,'请求方法不支持');
      const bearer=req.headers.authorization;
      if(!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer||''))throw new HttpError(401,'请先登录');
      if(!config.origin||!config.serviceKey)throw new HttpError(503,'照片服务尚未配置');
      const id=new URL(req.url,'http://localhost').searchParams.get('id');
      if(!UUID.test(id||''))throw new HttpError(400,'照片标识无效');
      const action=req.method==='PUT'?'media_write':req.method==='DELETE'?'media_delete':'media_read';
      const authorize=async()=>{
        // The gateway verifies the user's JWT. RPC obtains UID from auth.uid(), never request data.
        const response=await fetcher(config.origin+'/v1/rdb/rest/rpc/shiri_social',{
          method:'POST',headers:{Authorization:bearer,'Content-Type':'application/json'},
          body:JSON.stringify({p_action:action,p_payload:{id}}),redirect:'error',signal:AbortSignal.timeout(15000)
        });
        if(!response.ok)throw new HttpError(response.status===401?401:403,'照片不可访问，分享可能已撤回');
        const data=await response.json();
        if(data.bucket!=='shiri-shared'||data.path!==id+'.jpg')throw new HttpError(502,'照片存储标识异常');
        return data;
      };
      const info=await authorize();
      const endpoint=config.origin+'/v1/storages/object/shiri-shared/'+encodeURIComponent(info.path);
      const headers={Authorization:'Bearer '+config.serviceKey};
      if(req.method==='PUT'){
        if(req.headers['content-type']?.split(';')[0]!=='image/jpeg')throw new HttpError(415,'需要 JPEG 照片');
        if(Number(req.headers['content-length'])>LIMIT)throw new HttpError(413,'照片超过 1 MiB');
        const body=stripJpegMetadata(await limitedBytes(req));
        await authorize();
        const uploaded=await fetcher(endpoint,{method:'POST',headers:{...headers,'Content-Type':'image/jpeg','Cache-Control':'max-age=0','x-upsert':'true'},body,redirect:'error',signal:AbortSignal.timeout(25000)});
        if(!uploaded.ok)throw new HttpError(502,'云存储上传失败，请重试');
        json(200,{ok:true});
      }else if(req.method==='DELETE'){
        const deleted=await fetcher(endpoint,{method:'DELETE',headers,redirect:'error',signal:AbortSignal.timeout(15000)});
        if(!deleted.ok&&deleted.status!==404)throw new HttpError(502,'已撤回分享，但照片副本清理失败，请重试');
        json(200,{ok:true});
      }else{
        const download=await fetcher(endpoint,{headers,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
        if(!download.ok)throw new HttpError(download.status===404?404:502,'照片暂时无法读取');
        const body=await limitedBytes(download.body);
        await authorize(); // Revocation during download must fail before bytes reach the client.
        res.writeHead(200,{'Content-Type':'image/jpeg','Content-Length':body.length});res.end(body);
      }
    }catch(error){
      // Never expose upstream payloads, JWTs, storage keys or stack traces.
      if(!res.headersSent)json(error.status||502,{error:error.status?error.message:'照片服务暂时不可用，请重试'});
      else res.destroy();
      req.resume();
    }
  });
}
if(require.main===module){
  const envId=process.env.SHIRI_ENV_ID||'',serviceKey=process.env.SHIRI_STORAGE_SERVICE_KEY||'';
  if(!/^[a-zA-Z0-9-]{3,80}$/.test(envId))throw Error('Set SHIRI_ENV_ID in server environment');
  if(serviceKey){
    let claims;try{claims=JSON.parse(Buffer.from(serviceKey.split('.')[1],'base64url'));}catch{throw Error('Invalid server storage credential');}
    if(claims.role!=='service_role'||(claims.aud!==envId&&claims.project_id!==envId))throw Error('Storage credential role/environment mismatch');
  }
  const origins=(process.env.SHIRI_ALLOWED_ORIGINS||'https://localhost,http://localhost').split(',').map(x=>x.trim()).filter(Boolean);
  // CloudBase HTTP gateway already emits CORS. Standalone deployments can select function.
  const corsOwner=process.env.SHIRI_CORS_OWNER||'gateway';
  if(!['gateway','function'].includes(corsOwner))throw Error('SHIRI_CORS_OWNER must be gateway or function');
  createMediaServer({corsOwner,origin:`https://${envId}.api.tcloudbasegateway.com`,serviceKey,origins}).listen(9000,'0.0.0.0');
}
module.exports={createMediaServer,stripJpegMetadata};
