import config from './site.config.mjs';
import './motion.mjs';
// Presentation only: no tracking, network requests, persistence, or form submission.
const all=s=>document.querySelectorAll(s);
all('[data-version]').forEach(e=>e.textContent=config.productVersion);
all('[data-minimum]').forEach(e=>e.textContent=config.minimumAndroid);
all('[data-wechat]').forEach(e=>e.textContent=config.wechat);
all('[data-channel-version]').forEach(e=>e.textContent=config.observedChannelVersion);
all('[data-checked]').forEach(e=>e.textContent=config.checkedOn);
all('[data-download]').forEach(e=>{if(/^https:\/\/www\.pgyer\.com\/[A-Za-z0-9_-]+$/.test(config.downloadUrl))e.href=config.downloadUrl;});
let timer;
const status=document.querySelector('#copy-status');
function announce(message){clearTimeout(timer);status.textContent=message;status.hidden=false;timer=setTimeout(()=>status.hidden=true,5500);}
async function copy(text,fallback){
  try{await navigator.clipboard.writeText(text);announce('已复制，请在微信中自行发送或搜索。');}
  catch{fallback();announce('浏览器未允许自动复制。内容已选中，请长按或按 Ctrl+C 复制。');}
}
document.querySelector('#copy-contact').addEventListener('click',()=>copy(config.wechat,()=>{
  const range=document.createRange();range.selectNodeContents(document.querySelector('[data-wechat]'));const selection=getSelection();selection.removeAllRanges();selection.addRange(range);
}));
const field=document.querySelector('#feedback-template'),kind=document.querySelector('#feedback-kind');
const template=()=>`问题类型：${kind.value}\n拾日版本：请填写实际安装版本\n手机型号 / Android 版本：\n我进行了哪些操作：\n遇到的提示或现象：\n希望改进的地方：`;
kind.addEventListener('change',()=>{const lines=field.value.split('\n');if(lines[0].startsWith('问题类型：'))lines[0]=`问题类型：${kind.value}`;else lines.unshift(`问题类型：${kind.value}`);field.value=lines.join('\n');});
document.querySelector('#copy-feedback').addEventListener('click',()=>copy(field.value,()=>{field.focus();field.select();}));
document.querySelector('#reset-feedback').addEventListener('click',()=>{if(field.value===template()||window.confirm('重置会清除当前输入的反馈内容。确定重置吗？')){field.value=template();announce('模板已重置，内容未发送。');}});
// Anchor navigation expands policy details, including direct links and keyboard activation.
function revealPolicy(){if(location.hash==='#privacy-policy')document.querySelector('#privacy-policy').open=true;}
window.addEventListener('hashchange',revealPolicy);revealPolicy();
document.querySelectorAll('a[href="#privacy-policy"]').forEach(a=>a.addEventListener('click',()=>document.querySelector('#privacy-policy').open=true));
const sticky=document.querySelector('.mobile-download');
if('IntersectionObserver' in window){
  let heroVisible=true,downloadVisible=false;
  const update=()=>{sticky.hidden=heroVisible||downloadVisible;};
  new IntersectionObserver(([e])=>{heroVisible=e.isIntersecting;update();}).observe(document.querySelector('.hero'));
  new IntersectionObserver(([e])=>{downloadVisible=e.isIntersecting;update();}).observe(document.querySelector('#download'));
}
