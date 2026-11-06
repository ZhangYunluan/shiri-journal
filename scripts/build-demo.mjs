import {mkdir,readFile,writeFile,copyFile,cp} from 'node:fs/promises';
import {resolve,relative,dirname} from 'node:path';

const root=resolve(import.meta.dirname,'..'),out=resolve(root,'demo-dist');
await mkdir(out,{recursive:true});
const copied=new Set();
async function copyModule(path){
  const full=resolve(path);if(copied.has(full))return;copied.add(full);
  const target=resolve(out,relative(root,full));await mkdir(dirname(target),{recursive:true});
  await copyFile(full,target);
  const text=await readFile(full,'utf8');
  for(const match of text.matchAll(/(?:from\s*|import\s*)['"](\.[^'"]+\.mjs)['"]/g))await copyModule(resolve(dirname(full),match[1]));
}
await copyModule(resolve(root,'demo/app.mjs'));
for(const file of ['life.css','src/calendar.css','favicon.svg','demo/demo.css']){
  await mkdir(dirname(resolve(out,file)),{recursive:true});await copyFile(resolve(root,file),resolve(out,file));
}
await cp(resolve(root,'demo/assets'),resolve(out,'demo/assets'),{recursive:true});
const index=(await readFile(resolve(root,'demo/index.html'),'utf8')).replaceAll('../','./')
  .replace('href="./demo.css"','href="./demo/demo.css"').replace('src="./app.mjs"','src="./demo/app.mjs"');
await writeFile(resolve(out,'index.html'),index);
await writeFile(resolve(out,'.nojekyll'),'');
console.log(`Static demo built at ${out}. No cloud configuration or credentials included.`);
