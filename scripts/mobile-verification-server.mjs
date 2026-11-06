// Isolated localhost test origin. Only the test harness routes fall outside the published files.
import {createServer} from 'node:http';
import {readFile} from 'node:fs/promises';
import {resolve,extname,sep} from 'node:path';
const root=resolve(import.meta.dirname,'..'),dist=resolve(root,'.site-publish/dist');
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript','.js':'text/javascript','.css':'text/css','.json':'application/json','.wasm':'application/wasm','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml'};
createServer(async(req,res)=>{
  try{
    if(!['GET','HEAD'].includes(req.method)){res.writeHead(405).end();return;}
    const path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path.includes('\\')||path.split('/').some(p=>p.startsWith('.'))){res.writeHead(403).end();return;}
    const base=path==='/verification.html'||path.startsWith('/tests/')?root:dist;
    const file=resolve(base,'.'+(path==='/'?'/index.html':path));
    if(!file.startsWith(base+sep)){res.writeHead(403).end();return;}
    const data=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':'no-cache'});res.end(req.method==='HEAD'?undefined:data);
  }catch{res.writeHead(404).end('Not found');}
}).listen(4178,'127.0.0.1',()=>console.log('Mobile artifact QA ready at http://127.0.0.1:4178/verification.html'));
