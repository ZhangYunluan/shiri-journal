// Keep installation useful even when the browser never emits an install event.
const button = document.querySelector('#install');
const status = document.querySelector('#status');
const open = document.querySelector('#open');
const help = document.querySelector('#install-help');
const helpTitle = document.querySelector('#help-title');
const helpMessage = document.querySelector('#help-message');
const urlField = document.querySelector('#install-url');
const standalone = matchMedia('(display-mode: standalone)');
let pendingPrompt = null;
let installed = Boolean(standalone.matches || navigator.standalone);
const inWeChat = /MicroMessenger/i.test(navigator.userAgent);
const onIOS = /iPad|iPhone|iPod/i.test(navigator.userAgent);
document.querySelector('#wechat-tip').hidden = !inWeChat;
// Do not copy query strings or hashes that could contain authentication parameters.
urlField.value = `${location.origin}${location.pathname}`;
function hideHelp() {
  help.hidden = true;
  button.setAttribute('aria-expanded', 'false');
}
function showHelp() {
  help.hidden = false;
  button.setAttribute('aria-expanded', 'true');
  helpTitle.textContent = inWeChat ? '请先在浏览器打开' : onIOS ? '在 Safari 中添加到主屏幕' : '通过浏览器添加到桌面';
  helpMessage.textContent = inWeChat
    ? '微信内不能直接安装。请点右上角“…”→“在浏览器打开”，然后再次点击安装按钮。'
    : onIOS ? '请用 Safari 打开，点分享按钮，再选择“添加到主屏幕”。下方安卓菜单步骤可忽略。'
    : '当前浏览器尚未提供系统安装弹窗。请用浏览器菜单添加到桌面；网页不能代替你操作这个菜单。';
  helpTitle.focus({preventScroll:true});
  help.scrollIntoView({block:'start', behavior:'auto'});
}
function showInstalled(message = '已在桌面应用模式打开。') {
  installed = true;
  pendingPrompt = null;
  button.textContent = '打开拾日';
  open.textContent = '进入日志';
  status.textContent = message;
  hideHelp();
}
if (installed) showInstalled();
standalone.addEventListener?.('change', event => { if (event.matches) showInstalled(); });
window.addEventListener('beforeinstallprompt', event => {
  if (installed || inWeChat) return;
  event.preventDefault();
  pendingPrompt = event;
  status.textContent = '已准备好直接安装。点击“安装到手机”，再在系统弹窗中确认。';
});
button.addEventListener('click', async () => {
  if (installed) { location.assign('./'); return; }
  const prompt = pendingPrompt;
  if (!prompt) { showHelp(); return; }
  pendingPrompt = null; // A browser event can only be consumed once.
  button.disabled = true;
  hideHelp();
  try {
    await prompt.prompt();
    const choice = await prompt.userChoice;
    if (!installed) status.textContent = choice.outcome === 'accepted'
      ? '已确认安装请求，请等待浏览器完成后查看手机桌面。'
      : '已取消安装。按钮仍可使用，也可以通过浏览器菜单添加到桌面。';
  } catch {
    status.textContent = '系统安装窗口未能打开，请按下方步骤添加到桌面。';
    showHelp();
  } finally { button.disabled = false; }
});
window.addEventListener('appinstalled', () => showInstalled('浏览器已报告安装完成，可以从手机桌面打开拾日。'));
document.querySelector('#close-help').addEventListener('click', () => { hideHelp(); button.focus(); });
document.querySelector('#copy-url').addEventListener('click', async () => {
  const message = document.querySelector('#copy-status');
  try {
    await navigator.clipboard.writeText(urlField.value);
    message.textContent = '网址已复制，请粘贴到 Chrome 的地址栏。';
  } catch {
    urlField.focus(); urlField.select();
    message.textContent = '浏览器未允许自动复制，网址已选中，请长按复制。';
  }
});
// Registration failure must not remove the installation button.
if ('serviceWorker' in navigator && window.isSecureContext) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    if (!installed) status.textContent = '离线缓存尚未准备好。请联网刷新；安装按钮仍可查看添加到桌面的步骤。';
  });
}
