import {validateCloudConfig} from '../src/cloudbase-auth.mjs';

// Configuration validation is local only; it does not authenticate or contact CloudBase.
export function developmentConfig(value, productionId) {
  if (!value) return {cloud:{envId:'',region:'ap-shanghai',publishableKey:'',testUrl:'',friendsEnabled:false},media:'',ai:''};
  const allowed=['envId','region','publishableKey','testUrl','mediaUrl','aiUrl'];
  if (Object.keys(value).some(key=>!allowed.includes(key))) throw Error('Unknown developer configuration field; server secrets are forbidden.');
  if (!value.envId || value.envId===productionId) throw Error('A separate test CloudBase environment is required; production is forbidden.');
  validateCloudConfig(value);
  const claims=JSON.parse(Buffer.from(value.publishableKey.split('.')[1],'base64url'));
  if(claims.is_system_admin || claims.client_type==='client_server')throw Error('Privileged credentials are forbidden.');
  const checked=url=>{
    if(!url)return '';
    const u=new URL(url);
    if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||!u.hostname.startsWith(value.envId+'-')||!u.hostname.endsWith('.app.tcloudbase.com'))throw Error('Use a credential-free CloudBase gateway URL belonging to the test environment.');
    return u.href;
  };
  const testUrl=checked(value.testUrl),media=checked(value.mediaUrl),ai=checked(value.aiUrl);
  return {cloud:{envId:value.envId,region:value.region||'ap-shanghai',publishableKey:value.publishableKey,testUrl,friendsEnabled:!!media},media,ai};
}

export function replaceAssistantConfig(source,endpoint) {
  const pattern=/export const ASSISTANT_CONFIG=Object\.freeze\([^\n]+\);/;
  if(!pattern.test(source))throw Error('Assistant configuration format changed; refusing an unsafe development build.');
  return source.replace(pattern,`export const ASSISTANT_CONFIG=Object.freeze(${JSON.stringify({endpoint,provider:endpoint?'开发测试服务':'',privacyUrl:''})});`);
}
