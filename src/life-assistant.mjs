import {addDays,validDate} from './core.mjs';
// Disabled until a reviewed, authenticated server endpoint and provider disclosure exist.
// No model/provider key belongs in this file or in the APK.
export const ASSISTANT_CONFIG=Object.freeze({endpoint:'',provider:'',privacyUrl:''});
export function assistantContext(records,selected,date){
  const chosen=new Set(selected),start=addDays(date,-13);
  return records.filter(r=>chosen.has(r.id)&&r.kind==='moment'&&r.status==='confirmed'&&!r.excluded&&r.date>=start&&r.date<=date)
    .sort((a,b)=>b.date.localeCompare(a.date)).slice(0,20)
    .map(r=>({date:r.date,title:String(r.title||'').slice(0,100),note:String(r.note||'').slice(0,240),category:String(r.categoryId||'').slice(0,40),mood:Number.isInteger(r.mood)&&r.mood>=1&&r.mood<=5?r.mood:null,reflection:['highlight','regret'].includes(r.reflection)?r.reflection:''}));
}
export function createAssistantClient({config=ASSISTANT_CONFIG,allowedOrigin,token,fetcher=globalThis.fetch,now=Date.now}){
  let last=-Infinity,inFlight=false,generation=0,controller=null;const cache=new Map();
  const configured=()=>{
    try{const url=new URL(config.endpoint);return !!config.provider&&url.protocol==='https:'&&url.origin===allowedOrigin&&!url.username&&!url.password&&!url.search&&!url.hash;}catch{return false;}
  };
  return {get configured(){return configured();},clear(){generation++;controller?.abort();cache.clear();},async ask({question,records,consent,history=[],mode='chat',goals=''}){
    if(!configured())throw Error('问问拾日尚未接通 AI 服务，本次不会发送数据。');
    if(consent!==true)throw Error('请先阅读并同意本次数据处理方式。');
    question=String(question||'').trim();if(!question||question.length>600)throw Error('问题需为 1–600 字。');
    if(!Array.isArray(records)||records.length>20)throw Error('每次最多选择 20 条片刻。');
    const safe=records.map(r=>{
      if(!validDate(r.date))throw Error('摘要日期无效');
      return {date:r.date,title:String(r.title||'').slice(0,100),note:String(r.note||'').slice(0,240),category:String(r.category||'').slice(0,40),mood:Number.isInteger(r.mood)&&r.mood>=1&&r.mood<=5?r.mood:null,reflection:['highlight','regret'].includes(r.reflection)?r.reflection:''};
    });
    const context=mode==='plan'?[]:history.slice(-6).map(({role,content})=>({role,content}));
    const encode=()=>JSON.stringify({question,records:safe,consent:true,history:context,mode,goals:String(goals).slice(0,600)});
    let body=encode();
    // Leave headroom for the existing server prompt/framing. Never trim the visible history.
    while(new TextEncoder().encode(body).length>12000&&context.length){context.splice(0,2);body=encode();}
    if(new TextEncoder().encode(body).length>12000)throw Error('摘要过长，请减少选择的片刻。');
    const cached=cache.get(body);if(cached&&now()-cached.at<600000)return cached.answer;
    if(inFlight||now()-last<60000)throw Error('请稍后再问，每分钟最多一次。');
    inFlight=true;last=now();const run=generation,request=new AbortController();controller=request;
    const timeout=setTimeout(()=>request.abort(),30000);
    try{
      const bearer=await token();
      if(run!==generation)throw Error('本次内容已清空，回复不再保留。');
      const res=await fetcher(config.endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+bearer},body,credentials:'omit',redirect:'error',cache:'no-store',referrerPolicy:'no-referrer',signal:request.signal});
      if(!res.ok)throw Error(res.status===429?'请求过于频繁，请稍后再试。':res.status===401?'请联网恢复登录后再试。':'AI 服务暂不可用，你的本机记录不受影响。');
      const raw=await res.text();if(raw.length>16000)throw Error('AI 回复超过限制。');
      const answer=JSON.parse(raw).answer;if(typeof answer!=='string'||!answer.trim()||answer.length>3000)throw Error('AI 回复格式异常，请稍后再试。');
      if(run!==generation)throw Error('本次内容已清空，回复不再保留。');
      if(cache.size>=5)cache.delete(cache.keys().next().value);cache.set(body,{answer,at:now()});return answer;
    }catch(error){
      if(run!==generation)throw Error('本次内容已清空，回复不再保留。');
      if(error.name==='AbortError'||error.name==='TimeoutError')throw Error('AI 请求超时，请检查网络后重试。问题已保留在对话中。');
      if(error instanceof SyntaxError)throw Error('AI 服务返回格式异常，请稍后重试。');
      if(error instanceof TypeError)throw Error('网络或 AI 服务连接失败，请检查连接后重试。');
      throw error;
    }finally{clearTimeout(timeout);if(controller===request)controller=null;inFlight=false;}
  }};
}
