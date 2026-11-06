/** Read-only public advisory lookup; sends package names/versions, never code or credentials. */
import {readFile,writeFile} from 'node:fs/promises';
const inventory=new Map();
function add(ecosystem,name,version,scope){
  const id=`${ecosystem}:${name}@${version}`;
  inventory.set(id,{package:{ecosystem,name},version,scope});
}
const gradle=await readFile('releases/security-0.5.7-gradle-dependencies.txt','utf8');
if(!gradle.includes('BUILD SUCCESSFUL'))throw Error('No successful resolved Gradle inventory');
for(const line of gradle.split('\n')){
  const m=line.match(/(?:\+|\\)--- ([\w.-]+):([\w.-]+)(?::([^\s]+))?(?: -> ([^\s]+))?/);
  if(m&&(m[4]||m[3]))add('Maven',m[1]+':'+m[2],m[4]||m[3],'Android releaseRuntimeClasspath');
}
const lock=JSON.parse(await readFile('android-shell/package-lock.json','utf8'));
for(const [path,p] of Object.entries(lock.packages))if(path&&p.version&&!p.dev)add('npm',path.split('node_modules/').at(-1),p.version,'npm production dependency');
for(const [name,version] of [['@huggingface/transformers','3.8.1'],['tesseract.js','6.0.1'],['tesseract.js-core','6.0.0'],['onnxruntime-web','1.22.0']])add('npm',name,version,'vendored local AI runtime');
const packages=[...inventory.values()],findings=[];
for(let offset=0;offset<packages.length;offset+=50){
  const batch=packages.slice(offset,offset+50);
  const response=await fetch('https://api.osv.dev/v1/querybatch',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({queries:batch.map(({package:p,version})=>({package:p,version}))}),signal:AbortSignal.timeout(45000)});
  if(!response.ok)throw Error('OSV HTTP '+response.status);
  const data=await response.json();
  if(!Array.isArray(data.results)||data.results.length!==batch.length)throw Error('Incomplete OSV result');
  for(let i=0;i<batch.length;i++)for(const v of data.results[i].vulns||[]){
    const detail=await fetch('https://api.osv.dev/v1/vulns/'+encodeURIComponent(v.id),{signal:AbortSignal.timeout(30000)});
    if(!detail.ok)throw Error('OSV details HTTP '+detail.status);
    findings.push({...batch[i],advisory:await detail.json()});
  }
}
const report={checkedAt:new Date().toISOString(),source:'https://api.osv.dev',packages,findings};
await writeFile('releases/security-0.5.7-osv.json',JSON.stringify(report,null,2));
console.log(JSON.stringify({packages:packages.length,maven:packages.filter(p=>p.package.ecosystem==='Maven').length,findings:findings.map(f=>({package:f.package.name,version:f.version,id:f.advisory.id,summary:f.advisory.summary,severity:f.advisory.database_specific?.severity}))},null,2));
