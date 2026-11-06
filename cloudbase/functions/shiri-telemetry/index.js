'use strict';
// Separate optional HTTP function. Never reads the social database or private storage.
// There is deliberately NO client-facing statistics/query/admin endpoint.
const http=require('node:http');
const EVENTS=new Set(['first_save','subsequent_save','report_view','friend_view','sync_error']);
const exact=(value,keys)=>value&&typeof value==='object'&&!Array.isArray(value)&&Object.keys(value).sort().join(',')===keys.slice().sort().join(',');
function validate(payload,now=Date.now()){
  if(!exact(payload,['version','events'])||!/^\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(payload.version)||!Array.isArray(payload.events)||payload.events.length<1||payload.events.length>30)throw Error('invalid');
  for(const e of payload.events){
    const time=Date.parse(e?.day+'T00:00:00Z');
    if(!exact(e,['name','day','count'])||!EVENTS.has(e.name)||!/^\d{4}-\d{2}-\d{2}$/.test(e.day)||!Number.isFinite(time)||new Date(time).toISOString().slice(0,10)!==e.day||time<now-31*86400000||time>now+86400000||!Number.isInteger(e.count)||e.count<1||e.count>10000)throw Error('invalid');
  }
  return {type:'shiri_beta_counts',version:payload.version,events:payload.events.map(({name,day,count})=>({name,day,count}))};
}
function createTelemetryServer(config,{fetcher=globalThis.fetch,log=console.log,now=Date.now}={}){
  const limits=new Map();
  return http.createServer(async(req,res)=>{
    res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Vary','Origin');
    const finish=status=>{res.writeHead(status);res.end();};
    try{
      const origin=req.headers.origin;
      if(origin&&!config.origins.includes(origin))return finish(403);
      if(origin&&config.corsOwner!=='gateway')res.setHeader('Access-Control-Allow-Origin',origin);
      if(req.method==='OPTIONS'){
        if(config.corsOwner!=='gateway'){res.setHeader('Access-Control-Allow-Methods','POST, OPTIONS');res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');}
        return finish(204);
      }
      if(req.method!=='POST')return finish(405); // App login is never administrator authorization.
      const bearer=req.headers.authorization;
      if(!/^Bearer [A-Za-z0-9_.-]{1,8192}$/.test(bearer||''))return finish(401);
      if(req.headers['content-type']?.split(';')[0]!=='application/json')return finish(415);
      if(Number(req.headers['content-length'])>8192)return finish(413);
      let size=0;const chunks=[];
      for await(const chunk of req){size+=chunk.length;if(size>8192)return finish(413);chunks.push(chunk);}
      let data;try{data=validate(JSON.parse(Buffer.concat(chunks)),now());}catch{return finish(400);}
      // CloudBase verifies the access token; no trusting a client UID or decoding it as auth.
      const response=await fetcher(config.authOrigin+'/auth/v1/user/me',{headers:{Authorization:bearer},redirect:'error',signal:AbortSignal.timeout(10000)});
      if(!response.ok)return finish(response.status>=500?503:401);
      const user=await response.json();
      if(typeof user.sub!=='string'||!/^[A-Za-z0-9_-]{1,64}$/.test(user.sub)||user.sub==='anon'||user.is_anonymous===true||user.groups?.some(g=>g.id==='anonymous')||(user.status&&user.status!=='ACTIVE'))return finish(403);
      // Bounded per-instance protection; not a cross-instance security quota.
      const time=now();for(const [id,until] of limits)if(until<=time)limits.delete(id);
      if(limits.has(user.sub)||limits.size>=5000)return finish(429);
      limits.set(user.sub,time+60000);
      log(JSON.stringify(data)); // Only allowlisted counts, never user/token/content/request objects.
      finish(204);
    }catch{if(!res.headersSent)finish(503);else res.destroy();}
    finally{req.resume();}
  });
}
if(require.main===module){
  const env=process.env.SHIRI_ENV_ID||'';
  if(!/^[A-Za-z0-9-]{3,80}$/.test(env))throw Error('Set SHIRI_ENV_ID');
  createTelemetryServer({authOrigin:`https://${env}.api.tcloudbasegateway.com`,origins:(process.env.SHIRI_ALLOWED_ORIGINS||'https://localhost').split(',').map(s=>s.trim()),corsOwner:process.env.SHIRI_CORS_OWNER||'gateway'}).listen(9000,'0.0.0.0');
}
module.exports={validate,createTelemetryServer};
