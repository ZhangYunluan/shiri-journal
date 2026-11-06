import http from 'node:http';
import {readFile,stat,realpath} from 'node:fs/promises';
import {resolve,sep,extname} from 'node:path';
import {fileURLToPath} from 'node:url';

const source=resolve(fileURLToPath(new URL('../',import.meta.url)));
const root=await realpath(process.env.SHIRI_DEMO_DIRECTORY||source);
const types={'.html':'text/html; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.png':'image/png'};
const server=http.createServer(async(req,res)=>{
  try{
    let path=decodeURIComponent(new URL(req.url,'http://localhost').pathname);
    if(path==='/'){res.writeHead(302,{Location:root===source?'/demo/':'/index.html'});res.end();return;}
    if(path==='/demo/')path='/demo/index.html';
    if(!/^\/(?:demo\/(?!.*(?:^|\/)\.)[^?]*|src\/[\w-]+\.(?:mjs|css)|life\.css|favicon\.svg|index\.html)$/.test(path))throw Error('not found');
    const file=await realpath(resolve(root,'.'+path));
    if(!file.startsWith(root+sep)||!(await stat(file)).isFile()||!types[extname(file)])throw Error('not found');
    res.writeHead(200,{'Content-Type':types[extname(file)],'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});
    res.end(await readFile(file));
  }catch{res.writeHead(404);res.end('Not found');}
});
server.listen(Number(process.env.PORT||4188),'127.0.0.1',()=>console.log(`Shiri demo http://127.0.0.1:${server.address().port}/`));
