/** Checks Git's selected file set, never prints file contents or secret values. */
import {execFileSync} from 'node:child_process';
import {readFile,stat} from 'node:fs/promises';
const files=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
const failures=[];
const forbidden=/(^|\/)(\.signing|\.local|\.local-backups|\.tool-cache|\.model-downloads|node_modules|releases|\.openai|\.aws)(\/|$)|(^|\/)\.env(\.(?!example$)[^/]+)?$|\.(jks|keystore|p12|pfx|pem|apk|aab|sqlite|sqlite3|db)$|(^|\/)signing\.properties$/;
for(const file of files){
  if(forbidden.test(file)){failures.push({file,reason:'private/generated file in Git'});continue;}
  const info=await stat(file).catch(()=>null);if(!info){failures.push({file,reason:'missing tracked file'});continue;}
  if(!/\.(mjs|js|json|md|txt|html|xml|ps1|yml|yaml|properties|java|gradle|sql|example)$/.test(file))continue;
  if(info.size>5*1024*1024){failures.push({file,reason:'text too large for this scanner; manual review needed'});continue;}
  const s=await readFile(file,'utf8');
  if(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|\bAKID[A-Za-z0-9]{20,}|\bsk-[A-Za-z0-9_-]{24,}/.test(s))failures.push({file,reason:'private-key-shaped literal'});
  if(/(?:SecretKey|secret_key|api_key|password)\s*[=:]\s*["'][A-Za-z0-9/+_-]{28,}["']/i.test(s))failures.push({file,reason:'possible hardcoded credential'});
  for(const m of s.matchAll(/eyJ[A-Za-z0-9_-]+\.([A-Za-z0-9_-]+)\.[A-Za-z0-9_-]{16,}/g)){
    try{const c=JSON.parse(Buffer.from(m[1],'base64url'));if(c.role!=='anon'||c.is_system_admin)failures.push({file,reason:'non-public JWT'});}catch{failures.push({file,reason:'unreadable JWT needs review'});}
  }
}
const required=['docs/local-ai.md','docs/life-product.md','docs/life-storage.md','docs/mobile-use.md','docs/国内上线注册指引.md','docs/friends-autocollect.md','docs/cloudbase-deployment.md','docs/cloudbase-social-deployment.md','docs/DEPLOY_NICKNAME_SEARCH.md','social-server/server.mjs','social-server/store.mjs','AGENTS.md','TEAM_GUIDE.md'];
for(const file of required)if(!files.includes(file))failures.push({file,reason:'build/test/team source missing from Git'});
console.log(JSON.stringify({filesChecked:files.length,findings:failures,scope:'selected Git files only; not image OCR, archives, cloud settings or complete history'},null,2));
if(failures.length)process.exitCode=1;
