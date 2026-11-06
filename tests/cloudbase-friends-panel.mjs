import {createFriends} from '../src/cloudbase-friends.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Isolated test origin required');
const main=document.querySelector('#test-panel'),out=document.querySelector('#results');let count=0,controller,finished,accepted=false,published=false,rejected=false,posts=0,searchFailure=false,discoveryFailure=false;
const requests=[];
const auth={session:{user:{id:'synthetic-me',nickname:'拾日测试'}}};
const state={friends:[],discoverable:false,incoming:[{id:'synthetic-friend',nickname:'山间',note:'一起记录生活'}],outgoing:[],blocked:[],mine:[]};
const api={rpc:async(action,p={})=>{
  if(action==='profile')return {id:'synthetic-me',version:1};
  if(action==='dashboard')return structuredClone(state);
  if(action==='feed')return {records:accepted?[{id:'note',ownerId:'synthetic-friend',nickname:'山间',title:'今天读完了一本书',date:'2026-10-11',note:'下班后留一点时间给自己',categoryName:'学习'}]:[],hasMore:false};
  if(action==='search'){if(searchFailure)throw Error('测试：搜索失败');return {users:[{id:'synthetic-friend',nickname:p.query,isFriend:accepted},{id:'synthetic-other',nickname:p.query,isFriend:false}]};}
  if(action==='discoverability'){if(discoveryFailure)throw Error('测试：设置失败');state.discoverable=p.enabled;return {discoverable:p.enabled};}
  if(action==='request'){requests.push(structuredClone(p));state.outgoing.push({id:p.id,nickname:'山间',status:'pending'});return {ok:true};}
  if(action==='respond'){accepted=true;state.incoming=[];state.friends=[{id:p.id,nickname:'山间',scope:'none',categories:[],historyDays:0}];return {ok:true};}
  if(action==='grant'){state.friends[0].scope=p.scope;return {ok:true};}
  if(action==='publish_begin'){posts++;if(rejected)throw Error('测试：网络失败，草稿保留');return {id:'shared-test',mediaId:null};}
  if(action==='publish_finish'){published=true;state.mine=[{id:p.id,title:'平凡的一天',shared:true}];return {ok:true};}
  throw Error('Unexpected '+action);
}};
const assert=(ok,label)=>{if(!ok)throw Error(label);count++;out.textContent+='PASS · '+label+'\n';};
const act=async(fn)=>{const done=new Promise(resolve=>{finished=resolve;});fn();await done;};
const click=selector=>act(()=>main.querySelector(selector).click());
try{
  controller=createFriends({auth,api,getData:()=>({categories:[{id:'daily',name:'日常'}],records:[],assets:[]}),toast:()=>{},confirm:async()=>true,redraw:()=>{main.innerHTML=controller.panel();if(finished&&!controller.busy){const done=finished;finished=null;done();}}});
  await controller.refresh();main.innerHTML=controller.panel();
  assert(main.textContent.includes('好友服务已连接'),'真实请求状态控制连接提示');
  await click('[data-friends-view="people"]');
  main.querySelector('[name="query"]').value='山间';await act(()=>main.querySelector('[data-friends-form="search"]').requestSubmit());
  assert(main.querySelectorAll('[name="request-note"]').length===2,'同名用户分别显示，账号标识不混用');
  assert(state.discoverable===false&&main.textContent.includes('已关闭（默认）'),'默认关闭昵称发现');
  await click('[data-friends-action="discoverability"]');assert(state.discoverable===true,'开启后使用服务端返回的可发现状态');
  discoveryFailure=true;await click('[data-friends-action="discoverability"]');assert(state.discoverable===true&&main.textContent.includes('设置失败'),'设置失败保留真实状态，不冒充已关闭');
  discoveryFailure=false;await click('[data-friends-action="discoverability"]');assert(state.discoverable===false,'可重新关闭昵称发现');
  const notes=main.querySelectorAll('[name="request-note"]');
  notes[1].value='发给另一位山间';notes[1].dispatchEvent(new Event('input',{bubbles:true}));
  notes[0].value='发给我的老朋友';notes[0].dispatchEvent(new Event('input',{bubbles:true}));
  await click('[data-friends-action="request"][data-id="synthetic-other"]');
  assert(requests.length===1&&requests[0].id==='synthetic-other'&&requests[0].note==='发给另一位山间','同名结果将独立留言发给所选真实 UID');
  searchFailure=true;await act(()=>main.querySelector('[data-friends-form="search"]').requestSubmit());
  assert(main.textContent.includes('搜索失败')&&!main.querySelector('[data-friends-action="request"]'),'搜索失败清理旧结果，避免误发申请');
  searchFailure=false;await act(()=>main.querySelector('[data-friends-form="search"]').requestSubmit());
  await click('[data-friends-action="request"][data-id="synthetic-friend"]');
  assert(requests[1].id==='synthetic-friend'&&requests[1].note==='发给我的老朋友','另一同名账号使用自己的申请留言');
  await click('[data-friends-view="requests"]');
  assert(main.textContent.includes('一起记录生活'),'收到的好友申请与留言可见');
  await click('[data-friends-action="accept"]');
  assert(accepted&&state.friends[0].scope==='none','接受好友后默认不开放自己的生活');
  await click('[data-friends-view="feed"]');
  assert(main.textContent.includes('今天读完了一本书'),'好友授权近况展示');
  await click('[data-friends-view="publish"]');
  const form=main.querySelector('[data-friends-form="publish"]');form.elements.title.value='平凡的一天';form.elements.note.value='晚饭后散步';
  rejected=true;await act(()=>form.requestSubmit());
  assert(main.textContent.includes('网络失败'),'发布失败显示错误');
  assert(main.querySelector('[name="title"]').value==='平凡的一天','发布失败保留草稿');
  assert(!published,'上传/发布失败不冒充成功');
  rejected=false;await act(()=>main.querySelector('[data-friends-form="publish"]').requestSubmit());
  assert(published&&posts===2,'用户重试后才发布成功');
  controller.clear();assert(!controller.panel().includes('今天读完了一本书'),'清理后朋友私密内容不残留');
  out.textContent+='DONE · '+count+' assertions passed\n';
  await controller.refresh();main.innerHTML=controller.panel();
}catch(error){out.textContent+='FAIL · '+error.stack;}
