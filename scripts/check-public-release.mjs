/** Checks the intended public snapshot without logging file content or credentials. */
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
import {CLOUDBASE} from '../src/cloudbase-config.mjs';
import {MEDIA_API} from '../src/cloudbase-social-config.mjs';
import {ASSISTANT_CONFIG} from '../src/life-assistant.mjs';
assert.equal(CLOUDBASE.envId,'');assert.equal(CLOUDBASE.publishableKey,'');
assert.equal(CLOUDBASE.friendsEnabled,false);assert.equal(MEDIA_API,'');assert.equal(ASSISTANT_CONFIG.endpoint,'');
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
assert.ok(files.length>300,'Stage the reviewed public snapshot before running this check.');
const findings=[];
for(const path of files){
  const info=await stat(path);
  if(info.size>20*1024*1024)findings.push({path,reason:'large source asset needs review'});
  if(!/\.(mjs|js|md|json|html|example|ps1|xml|yml|txt)$/.test(path))continue;
  const source=await readFile(path,'utf8');
  if(/shiri-dev-d[a-z0-9]{15,}|https:\/\/[^\s'"`<>]+\.chatgpt\.site\b|http:\/\/10\.208\.\d+\.\d+/.test(source))findings.push({path,reason:'operational environment or expired preview address'});
  if(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]{16,}/.test(source))findings.push({path,reason:'JWT-shaped literal requires manual review'});
}
console.log(JSON.stringify({filesChecked:files.length,findings,scope:'tracked snapshot and blank client defaults; not binary reverse engineering or cloud audit'},null,2));
if(findings.length)process.exitCode=1;
