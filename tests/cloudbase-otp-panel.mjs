import {createSocial} from '../src/cloudbase-panel.mjs';
if(location.hostname!=='127.0.0.1'||location.port!=='4182')throw Error('Dedicated synthetic test origin required');
const main=document.querySelector('#test-panel'),out=document.querySelector('#results');
let count=0,calls=0,social,rendered;
const originalFetch=window.fetch,originalNative=window.shiriNative;
const assert=(value,label)=>{if(!value)throw Error(label);count++;out.textContent+='PASS · '+label+'\n';};
try{
  out.textContent='';
  // Use the production panel and auth client, with an explicit isolated HTTP fixture.
  window.shiriNative={auth:{get:async()=>({value:null})}};
  window.fetch=async(url,options)=>{
    calls++;
    if(!url.endsWith('/auth/v1/verification'))throw Error('Unexpected test request');
    const body=JSON.parse(options.body);
    if(body.email!=='synthetic@example.invalid'||body.target!=='ANY')throw Error('Unexpected test email');
    return Response.json({verification_id:'synthetic-challenge',expires_in:600});
  };
  social=createSocial({toast:()=>{},confirm:async()=>false,redraw:()=>{
    main.innerHTML=social.panel();if(rendered){const resolve=rendered;rendered=null;resolve();}
  }});
  await social.start();
  main.innerHTML=social.panel();
  assert(!!main.querySelector('input[name="email"]'),'邮箱表单显示');
  assert(!main.querySelector('input[name="code"]'),'发送前不假装有有效挑战');
  main.querySelector('input[name="email"]').value='synthetic@example.invalid';
  const completed=new Promise(resolve=>{rendered=resolve;});
  main.querySelector('[data-cloud-form="send"]').requestSubmit();
  await completed;
  assert(calls===1,'只发送一次验证码请求');
  assert(!!main.querySelector('input[name="code"]'),'合法响应省略 is_user 时仍显示验证码输入框');
  assert(!!main.querySelector('[data-cloud-form="verify"] button'),'显示验证并登录按钮');
  assert(main.querySelector('input[name="email"]').readOnly,'待验证邮箱固定为实际发送对象');
  assert(main.textContent.includes('验证码已发送'),'显示真实发送步骤结果');
  assert(!main.textContent.includes('CloudBase 已验证登录'),'发送成功不冒充登录成功');
  out.textContent+='DONE · '+count+' assertions passed\n';
}catch(error){out.textContent+='FAIL · '+error.stack;}
finally{window.fetch=originalFetch;window.shiriNative=originalNative;}
