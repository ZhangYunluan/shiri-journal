// Read-only OPTIONS checks. No tokens, email messages, content, or paid AI requests.
import {CLOUDBASE} from '../src/cloudbase-config.mjs';
import {validateCloudConfig} from '../src/cloudbase-auth.mjs';
import {MEDIA_API} from '../src/cloudbase-social-config.mjs';
import {ASSISTANT_CONFIG} from '../src/life-assistant.mjs';
const origin='capacitor://localhost',base=validateCloudConfig(CLOUDBASE);
const endpoints={auth:base+'/auth/v1/verification',rpc:base+'/v1/rdb/rest/rpc/shiri_social',media:MEDIA_API,ai:ASSISTANT_CONFIG.endpoint};
const checks=await Promise.all(Object.entries(endpoints).map(async([name,url])=>{
 if(!url)return {name,configured:false};
 try{const response=await fetch(url,{method:'OPTIONS',headers:{Origin:origin,'Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'authorization,content-type'},signal:AbortSignal.timeout(15000),redirect:'error'});
 return {name,status:response.status,allowOrigin:response.headers.get('access-control-allow-origin'),allowMethods:response.headers.get('access-control-allow-methods'),allowHeaders:response.headers.get('access-control-allow-headers')};
 }catch{return {name,error:'network check unavailable'};}
}));console.log(JSON.stringify({origin,checks,scope:'OPTIONS only; not authentication or resource authorization acceptance'},null,2));
