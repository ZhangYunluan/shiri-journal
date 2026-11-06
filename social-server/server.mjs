import {createServer} from 'node:http';
import {mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {SocialStore,ServiceError} from './store.mjs';

export function createSocialServer(store,{origins=[]}={}){
  const rates=new Map();
  return createServer(async(req,res)=>{
    res.setHeader('Content-Type','application/json; charset=utf-8');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('X-Content-Type-Options','nosniff');
    const send=(status,body)=>{res.writeHead(status);res.end(JSON.stringify(body));};
    try {
      const origin=req.headers.origin;
      if(origin&&!origins.includes(origin))throw new ServiceError('来源未获准',403);
      if(origin){res.setHeader('Access-Control-Allow-Origin',origin);res.setHeader('Vary','Origin');}
      if(req.method==='OPTIONS'){res.setHeader('Access-Control-Allow-Headers','Authorization, Content-Type');res.setHeader('Access-Control-Allow-Methods','GET,POST,PUT,DELETE,OPTIONS');send(204,null);return;}
      const url=new URL(req.url,'http://localhost'),path=url.pathname;
      const now=Date.now();
      // Never trust an arbitrary forwarded IP header; reverse proxy must also apply quotas.
      for(const [key,value] of rates)if(value.until<now)rates.delete(key);
      const key=req.socket.remoteAddress+':'+(path.startsWith('/api/auth/')?'auth':'api');
      const quota=rates.get(key)||{n:0,until:now+60000};quota.n++;rates.set(key,quota);
      if(quota.n>(path.startsWith('/api/auth/')?15:240))throw new ServiceError('请求过于频繁，请稍后重试',429);
      let body={};
      if(['POST','PUT','DELETE'].includes(req.method)){
        if(!String(req.headers['content-type']).startsWith('application/json'))throw new ServiceError('需要 JSON 请求',415);
        let bytes=0,chunks=[];
        for await(const chunk of req){bytes+=chunk.length;if(bytes>5*1024*1024)throw new ServiceError('请求过大',413);chunks.push(chunk);}
        try {body=JSON.parse(Buffer.concat(chunks).toString('utf8')||'{}');}catch{throw new ServiceError('JSON 无效');}
        if(!body||typeof body!=='object'||Array.isArray(body))throw new ServiceError('请求格式无效');
      }
      if(req.method==='GET'&&path==='/api/health'){send(200,{service:'shiri-friends',version:1});return;}
      if(req.method==='POST'&&path==='/api/auth/register'){send(201,store.register(body.nickname,body.password));return;}
      if(req.method==='POST'&&path==='/api/auth/login'){send(200,store.login(body.id,body.password));return;}
      const token=/^Bearer (\S+)$/.exec(req.headers.authorization||'')?.[1],id=store.authenticate(token);
      let result;
      if(req.method==='GET'&&path==='/api/me')result={user:store.user(id),friends:store.friends(id),requests:store.requests(id)};
      else if(req.method==='GET'&&path==='/api/private/photos')result=store.privateList(id);
      else if(req.method==='GET'&&path==='/api/private/photo')result=store.privateGet(id,url.searchParams.get('id'));
      else if(req.method==='POST'&&path==='/api/private/photos')result=store.privatePut(id,body);
      else if(req.method==='PUT'&&path==='/api/private/config')result=store.privateConfigure(id,body.enabled);
      else if(req.method==='PUT'&&path==='/api/private/review')result=store.privateReview(id,body.id,body.approved);
      else if(req.method==='DELETE'&&path==='/api/private/photo')result=store.privateDelete(id,body.id);
      else if(req.method==='DELETE'&&path==='/api/private/photos')result=store.privateDeleteAll(id);
      else if(req.method==='GET'&&path==='/api/users')result={user:store.user(String(url.searchParams.get('id')||'').trim().toUpperCase())};
      else if(req.method==='GET'&&path==='/api/feed')result={records:store.feed(id)};
      else if(req.method==='GET'&&path==='/api/sync')result=store.syncState(id);
      else if(req.method==='POST'&&path==='/api/sync')result=store.sync(id,body);
      else if(req.method==='POST'&&path==='/api/requests')result=store.request(id,String(body.id||'').trim().toUpperCase());
      else if(req.method==='POST'&&path==='/api/requests/respond'){if(typeof body.accept!=='boolean')throw new ServiceError('请选择处理方式');result=store.respond(id,body.id,body.accept);}
      else if(req.method==='PUT'&&path==='/api/grant')result=store.setGrant(id,body.id,body);
      else if(req.method==='DELETE'&&path==='/api/friends')result=store.removeFriend(id,body.id);
      else if(req.method==='DELETE'&&path==='/api/account')result=store.deleteAccount(id,body.password);
      else if(req.method==='POST'&&path==='/api/auth/logout'){store.logout(token);result={ok:true};}
      else throw new ServiceError('接口不存在',404);
      send(200,result);
    } catch(error){send(error instanceof ServiceError?error.status:500,{error:error instanceof ServiceError?error.message:'服务暂不可用，请稍后重试'});}
  });
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  const data=resolve(process.env.SHIRI_DATA_DIR||'social-server/data');await mkdir(data,{recursive:true});
  const store=new SocialStore(resolve(data,'social.sqlite'));
  const origins=String(process.env.SHIRI_ORIGINS||'https://localhost').split(',').filter(Boolean);
  const server=createSocialServer(store,{origins});
  server.listen(Number(process.env.PORT||4190),process.env.HOST||'127.0.0.1',()=>console.log('Shiri social API ready; no life data uploaded without grants.'));
}
