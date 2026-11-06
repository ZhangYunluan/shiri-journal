import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'..');
const manifest=JSON.parse(await readFile(resolve(root,'config/local-assets.sha256.json'),'utf8'));
let failures=0;
for(const [name,expected] of Object.entries(manifest.files)){
  try{const bytes=await readFile(resolve(root,name));if(createHash('sha256').update(bytes).digest('hex')!==expected)throw Error();}
  catch{console.error('Missing or mismatched public asset: '+name);failures++;}
}
console.log(`Public model/runtime assets checked: ${Object.keys(manifest.files).length}; failures: ${failures}`);
if(failures)process.exitCode=1;
