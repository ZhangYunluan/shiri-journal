/** Explicit deployment allowlist: never copy user backups, fixtures or local tool caches. */
import {mkdir,readFile,writeFile,copyFile,readdir} from 'node:fs/promises';
import {resolve,dirname,join} from 'node:path';
import {createHash} from 'node:crypto';
import {deflateSync} from 'node:zlib';
const root=resolve(import.meta.dirname,'..');
const target=join(root,'.site-publish');
const dist=join(target,'dist');
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
await mkdir(dist,{recursive:true});
const files=['index.html','install.html','install.css','install.mjs','life.css','life-app.mjs','favicon.svg','manifest.webmanifest','sw.js','README.md',
  'fitness.html','app.mjs','styles.css','fitness-advice.mjs','fitness-store.mjs','fitness-view-models.mjs',
  'docs/local-ai.md','docs/life-product.md','docs/life-storage.md','docs/mobile-use.md'];
async function copy(relative){
  const destination=join(dist,relative);await mkdir(dirname(destination),{recursive:true});
  await copyFile(join(root,relative),destination);
}
for(const file of files) await copy(file);
async function tree(relative){
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})) {
    if(entry.isSymbolicLink()) throw Error('Refusing symlink in deployment');
    const file=relative+'/'+entry.name;
    if(entry.isDirectory()) await tree(file); else if(!file.endsWith('.map')) await copy(file);
  }
}
await tree('src');await tree('vendor');

// Deterministic, dependency-free PNG icons: the same notebook motif as favicon.svg.
function png(size){
  const crc32=b=>{let c=0xffffffff;for(const n of b){c^=n;for(let k=0;k<8;k++)c=(c>>>1)^((c&1)?0xedb88320:0);}return(c^0xffffffff)>>>0;};
  const chunk=(name,data)=>{const type=Buffer.from(name),length=Buffer.alloc(4),crc=Buffer.alloc(4);length.writeUInt32BE(data.length);crc.writeUInt32BE(crc32(Buffer.concat([type,data])));return Buffer.concat([length,type,data,crc]);};
  const raw=Buffer.alloc(size*(1+size*4));
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const a=x/size,b=y/size;
    const frame=a>.27&&a<.73&&b>.22&&b<.78&&(a<.30||a>.70||b<.25||b>.75);
    const line=a>.37&&a<.63&&([.36,.46,.56].some(v=>Math.abs(b-v)<.015));
    const ink=frame||line;
    const offset=y*(1+size*4)+1+x*4;
    raw.set(ink?[36,48,39,255]:[173,196,163,255],offset);
  }
  const ihdr=Buffer.alloc(13);ihdr.writeUInt32BE(size);ihdr.writeUInt32BE(size,4);ihdr[8]=8;ihdr[9]=6;
  return Buffer.concat([Buffer.from([137,80,78,71,13,10,26,10]),chunk('IHDR',ihdr),chunk('IDAT',deflateSync(raw)),chunk('IEND',Buffer.alloc(0))]);
}
await mkdir(join(root,'icons'),{recursive:true});
for(const [name,size] of [['icon-192.png',192],['icon-512.png',512],['apple-touch-icon.png',180]]){
  await writeFile(join(root,'icons',name),png(size));await copy('icons/'+name);
}
const manifest={version:1,files:{}};
async function models(relative){
  for(const entry of await readdir(join(root,relative),{withFileTypes:true})){
    const path=relative+'/'+entry.name;
    if(entry.isDirectory()){await models(path);continue;}
    if(entry.isSymbolicLink())throw Error('Refusing model symlink');
    if(entry.name==='chunks.json'||entry.name.endsWith('.partial'))continue;
    const bytes=await readFile(join(root,path));
    if(bytes.length<=20*1024*1024){await copy(path);continue;}
    const parts=[];
    for(let offset=0,index=0;offset<bytes.length;offset+=20*1024*1024,index++){
      const data=bytes.subarray(offset,offset+20*1024*1024);
      const partPath=`models/parts/${hash(bytes).slice(0,16)}-${index}.bin`;
      await mkdir(dirname(join(dist,partPath)),{recursive:true});await writeFile(join(dist,partPath),data);
      parts.push({path:partPath,size:data.length,sha256:hash(data)});
    }
    manifest.files[path]={size:bytes.length,sha256:hash(bytes),parts};
  }
}
await models('models');
await writeFile(join(dist,'models/chunks.json'),JSON.stringify(manifest,null,2)+'\n');
const hosting=JSON.parse(await readFile(join(root,'.openai/hosting.json'),'utf8'));
hosting.static={directory:'dist',not_found_handling:'none'};
await mkdir(join(target,'.openai'),{recursive:true});
await writeFile(join(target,'.openai/hosting.json'),JSON.stringify(hosting,null,2)+'\n');
await writeFile(join(target,'.gitignore'),'node_modules/\n*.tar.gz\n');
// Prevent MIME sniffing and ensure model/manifest files have predictable types.
await writeFile(join(dist,'_headers'),'/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n/manifest.webmanifest\n  Content-Type: application/manifest+json\n/sw.js\n  Cache-Control: no-cache\n');
let count=0,total=0;
async function validate(directory){for(const entry of await readdir(directory,{withFileTypes:true})){
  const file=join(directory,entry.name);if(entry.isDirectory())await validate(file);else{const data=await readFile(file);if(data.length>25*1024*1024)throw Error('Asset exceeds 25 MiB: '+file);count++;total+=data.length;}
}}
await validate(dist);
console.log(JSON.stringify({checkout:target,files:count,bytes:total,splitModels:Object.keys(manifest.files)}));
