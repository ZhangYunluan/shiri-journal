import test from 'node:test';
import assert from 'node:assert/strict';
import {developmentConfig,replaceAssistantConfig} from '../scripts/dev-profile.mjs';
const envId='shiri-team-test';
const key=claims=>'eyJhbGciOiJub25lIn0.'+Buffer.from(JSON.stringify({role:'anon',aud:envId,...claims})).toString('base64url')+'.synthetic';
const config={envId,publishableKey:key({}),mediaUrl:`https://${envId}-123.ap-shanghai.app.tcloudbase.com/shiri-media`};
test('default developer build has no cloud, friend or AI endpoint',()=>{
  const c=developmentConfig(null,'production');assert.equal(c.cloud.envId,'');assert.equal(c.ai,'');assert.equal(c.cloud.friendsEnabled,false);
});
test('reject production identity, foreign gateway and server secrets',()=>{
  assert.throws(()=>developmentConfig(config,envId));
  assert.throws(()=>developmentConfig({...config,mediaUrl:'https://production-123.ap-shanghai.app.tcloudbase.com/shiri-media'},'production'));
  assert.throws(()=>developmentConfig({...config,SecretKey:'not-a-real-secret'},'production'));
  for(const claims of [{role:'service_role'},{is_system_admin:true},{client_type:'client_server'}])assert.throws(()=>developmentConfig({...config,publishableKey:key(claims)},'production'));
  assert.equal(developmentConfig(config,'production').cloud.envId,envId);
});
test('assistant overlay only changes configuration, fails closed if source no longer matches',()=>{
  const source="export const ASSISTANT_CONFIG=Object.freeze({endpoint:'https://old'});\nexport function keep(){return 1;}";
  const changed=replaceAssistantConfig(source,'');assert.ok(!changed.includes('https://old'));assert.ok(changed.endsWith('export function keep(){return 1;}'));
  assert.throws(()=>replaceAssistantConfig('changed format',''));
});
