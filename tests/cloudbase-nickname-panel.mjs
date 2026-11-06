import {createSocial} from '../src/cloudbase-panel.mjs';
import {localCloudSpace} from '../src/cloudbase-auth.mjs';
import {CLOUDBASE} from '../src/cloudbase-config.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Dedicated synthetic test origin required');
const main=document.querySelector('#test-panel'),out=document.querySelector('#results'),uid='synthetic-profile-user';
const originalFetch=window.fetch,originalNative=window.shiriNative,originalOwner=localStorage.getItem('shiri-space-owner');
let social,rendered,count=0,nickname='原来的昵称',deny=true,edits=0,collectorCalls=0;
let saved={envId:CLOUDBASE.envId,accessToken:'synthetic-token',refreshToken:'synthetic-refresh',expiresAt:Date.now()+7200000,user:{id:uid,nickname,email:'synthetic@example.invalid'}};
const assert=(value,label)=>{if(!value)throw Error(label);count++;out.textContent+='PASS · '+label+'\n';};
const act=async(action)=>{const ready=new Promise(resolve=>{rendered=resolve;});action();await ready;};
try{
  out.textContent='';localStorage.setItem('shiri-space-owner',localCloudSpace(uid));
  window.shiriNative={auth:{get:async()=>({value:JSON.stringify(saved)}),set:async({value})=>{saved=JSON.parse(value);},clear:async()=>{saved=null;}},photos:{configure:async()=>{collectorCalls++;}}};
  window.fetch=async(url,options)=>{
    if(url.endsWith('/user/me'))return Response.json({sub:uid,name:'旧的登录名',nickName:nickname,email:'synthetic@example.invalid'});
    if(url.endsWith('/user/basic/edit')){
      edits++;const body=JSON.parse(options.body);
      if(Object.keys(body).join()!=='nickname'||options.headers.Authorization!=='Bearer synthetic-token')throw Error('Unexpected profile mutation');
      if(deny)return Response.json({error:'permission_denied',error_description:'测试：拒绝修改'},{status:403});
      nickname=body.nickname;return Response.json({});
    }
    throw Error('Unexpected test request');
  };
  social=createSocial({toast:()=>{},confirm:async()=>false,isBusy:()=>true,redraw:()=>{main.innerHTML=social.panel();if(rendered){const resolve=rendered;rendered=null;resolve();}}});
  await social.start();main.innerHTML=social.panel();
  assert(main.querySelector('h2').textContent==='原来的昵称','优先显示云端昵称，不显示旧登录名');
  await act(()=>main.querySelector('[data-cloud-auth="edit-name"]').click());
  assert(main.querySelector('input[name="nickname"]').value==='原来的昵称','编辑填入现有昵称');
  main.querySelector('input[name="nickname"]').value='拾光旅人';
  await act(()=>main.querySelector('[data-cloud-form="nickname"]').requestSubmit());
  assert(main.textContent.includes('测试：拒绝修改'),'保存失败明确显示服务端错误');
  assert(main.querySelector('h2').textContent==='原来的昵称','失败不冒充新昵称已保存');
  assert(main.querySelector('input[name="nickname"]').value==='拾光旅人','失败保留输入草稿');
  deny=false;await act(()=>main.querySelector('[data-cloud-form="nickname"]').requestSubmit());
  assert(main.querySelector('h2').textContent==='拾光旅人','服务器重新读取后显示新昵称');
  assert(main.textContent.includes('昵称已保存到云端'),'显示完成状态');
  assert(!main.querySelector('input[name="nickname"]'),'成功关闭编辑表单');
  assert(saved.user.id===uid&&saved.user.nickname==='拾光旅人','安全会话只更新昵称，UID 不变');
  assert(localStorage.getItem('shiri-space-owner')===localCloudSpace(uid),'本机日记空间不变');
  assert(collectorCalls===0,'编辑昵称不停止正在处理的本机采集');
  assert(edits===2,'失败和重试各发一次修改请求');
  out.textContent+='DONE · '+count+' assertions passed\n';
}catch(error){out.textContent+='FAIL · '+error.stack;}
finally{
  window.fetch=originalFetch;window.shiriNative=originalNative;
  if(originalOwner===null)localStorage.removeItem('shiri-space-owner');else localStorage.setItem('shiri-space-owner',originalOwner);
}
