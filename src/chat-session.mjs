// Page-local only. Display history is independent from the bounded model context.
let sequence=0;
export function beginTurn(s,question){
 const history=(s.assistantHistory||[]).slice(s.assistantContextStart||0)
  .filter(m=>m.status!=='failed'&&m.status!=='pending').slice(-6)
  .map(({role,content})=>({role,content}));
 const id='chat-'+Date.now()+'-'+(++sequence);
 s.assistantHistory=[...(s.assistantHistory||[]),{id,role:'user',content:question,status:'pending'}];
 s.assistantPendingId=id;s.assistantBusy=true;s.assistantError='';s.assistantQuestion='';
 return {id,history};
}
export function finishTurn(s,id,{answer,error}={}){
 if(s.assistantPendingId!==id)return false;
 const message=s.assistantHistory.find(m=>m.id===id);if(!message)return false;
 message.status=error?'failed':'sent';
 if(!error)s.assistantHistory.push({id:id+'-reply',role:'assistant',content:answer,status:'sent'});
 s.assistantAnswer=answer||'';s.assistantError=error||'';s.assistantBusy=false;s.assistantPendingId=null;
 return true;
}
export function changeContext(s){s.assistantContextStart=(s.assistantHistory||[]).length;s.assistantConsent=false;}
