// Optional, account-local counters. No record IDs, content, device IDs or raw errors.
import {requestScope} from './request-scope.mjs';
export const BETA_ID='beta-analytics-v1';
export const BETA_CONFIG=Object.freeze({endpoint:''}); // Enable only after separate deployment verification.
export const EVENTS=['first_save','subsequent_save','report_view','friend_view','sync_error'];
export function createBetaAnalytics({read,write,token,endpoint=BETA_CONFIG.endpoint,allowedOrigin,fetcher=globalThis.fetch,now=Date.now}){
  let state={id:BETA_ID,enabled:false,saved:false,events:[],destination:endpoint},loaded=false,chain=Promise.resolve(),flight=null,controller,epoch=0,lastSend=-Infinity,lastPage='',seenErrors=new Set();
  const configured=()=>{try{const u=new URL(endpoint);return u.protocol==='https:'&&u.origin===allowedOrigin&&!u.search&&!u.hash&&!u.username&&!u.password;}catch{return false;}};
  const serial=work=>{const next=chain.then(work);chain=next.catch(()=>{});return next;};
  const day=()=>{const d=new Date(now());return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;};
  const keep=events=>events.filter(e=>e.day>=new Date(now()-30*86400000).toISOString().slice(0,10)).slice(-150);
  function increment(name,count=1){
    if(!state.enabled||!EVENTS.includes(name)||!Number.isInteger(count)||count<1)return;
    const old=state.events.find(e=>e.name===name&&e.day===day());
    if(old)old.count=Math.min(10000,old.count+count);else state.events.push({name,day:day(),count:Math.min(10000,count)});
    state.events=keep(state.events);
  }
  async function persist(){await write(structuredClone(state));}
  async function flush(){
    if(flight)return flight;
    if(!state.enabled||!configured()||!state.events.length||now()-lastSend<60000)return;
    const generation=epoch;lastSend=now();controller=new AbortController();
    flight=(async()=>{
      const access=await token();if(!state.enabled||epoch!==generation)return;
      const events=structuredClone(state.events.slice(0,30));
      const scope=requestScope(15000,controller.signal);
      try{
      const response=await fetcher(endpoint,{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+access},body:JSON.stringify({version:'0.6.1',events}),signal:scope.signal,credentials:'omit',redirect:'error',referrerPolicy:'no-referrer',cache:'no-store'});
      if(!response.ok)throw Error('统计暂未发送，稍后重试');
      await serial(async()=>{
        if(epoch!==generation||!state.enabled)return;
        for(const sent of events){const current=state.events.find(e=>e.name===sent.name&&e.day===sent.day);if(current)current.count-=sent.count;}
        state.events=state.events.filter(e=>e.count>0);await persist();
      });
      }finally{scope.dispose();}
    })().catch(()=>{}).finally(()=>{flight=null;});return flight;
  }
  return {
    load:()=>serial(async()=>{if(loaded)return;const old=await read();if(old?.enabled===true&&old.destination===endpoint)state={id:BETA_ID,enabled:true,saved:!!old.saved,destination:endpoint,events:keep((Array.isArray(old.events)?old.events:[]).filter(e=>EVENTS.includes(e.name)&&/^\d{4}-\d{2}-\d{2}$/.test(e.day)&&Number.isInteger(e.count)&&e.count>0&&e.count<=10000).map(({name,day,count})=>({name,day,count})))};loaded=true;}),
    get snapshot(){return {enabled:state.enabled,configured:configured(),count:state.events.reduce((n,e)=>n+e.count,0)};},
    async consent(enabled,hasRecords=false){epoch++;controller?.abort();await serial(async()=>{state={id:BETA_ID,enabled:enabled===true,saved:hasRecords,events:[],destination:endpoint};lastPage='';await persist();});},
    clear:()=>serial(async()=>{epoch++;controller?.abort();state.events=[];await persist();}),
    saved:(count=1)=>serial(async()=>{if(!state.enabled||!Number.isInteger(count)||count<1)return;if(!state.saved){increment('first_save');state.saved=true;count--;}if(count)increment('subsequent_save',count);await persist();}),
    page:(page,friendReady=false,{assistantOpen=false}={})=>serial(async()=>{if(!state.enabled)return;const key=assistantOpen&&['reports','plans'].includes(page)?'assistant':page==='friends'&&!friendReady?'friends-loading':page;if(key===lastPage)return;lastPage=key;if(key==='reports')increment('report_view');if(key==='friends'&&friendReady)increment('friend_view');await persist();}),
    errors:rows=>serial(async()=>{const current=new Set();for(const r of rows){if(r.cloudSync?.error&&r.cloudSync.state==='pending'){const key=r.id+':'+r.cloudSync.revision;current.add(key);if(!seenErrors.has(key))increment('sync_error');}}seenErrors=current;if(state.enabled)await persist();}),
    flush,
  };
}
