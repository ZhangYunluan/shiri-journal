/** Read-only connectivity diagnostics. Never print a key, token, email, or user payload. */
import {CLOUDBASE} from '../src/cloudbase-config.mjs';
import {validateCloudConfig} from '../src/cloudbase-auth.mjs';
import {MEDIA_API} from '../src/cloudbase-social-config.mjs';
const origin=validateCloudConfig(CLOUDBASE);
const checks=[
  ['test',CLOUDBASE.testUrl,{}],
  ['anonymous-rpc',origin+'/v1/rdb/rest/rpc/shiri_social',{method:'POST',headers:{Authorization:'Bearer '+CLOUDBASE.publishableKey,'Content-Type':'application/json'},body:JSON.stringify({p_action:'dashboard',p_payload:{}})}],
  ['unauthenticated-media',MEDIA_API+'?id=11111111-1111-4111-8111-111111111111',{}],
];
for(const [name,url,options]of checks){
  try{
    const res=await fetch(url,{...options,cache:'no-store',redirect:'error',signal:AbortSignal.timeout(15000)});
    let data;try{data=await res.json();}catch{}
    console.log(JSON.stringify({name,status:res.status,code:typeof data?.code==='string'?data.code:undefined}));
  }catch{console.log(JSON.stringify({name,error:'network/unreachable'}));}
}
console.log('Anonymous checks never prove real-account friendship or photo sharing; run the two-device acceptance checklist.');
