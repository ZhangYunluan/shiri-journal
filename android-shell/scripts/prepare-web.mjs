/** Build a self-contained Android asset tree. No private backups or deployment credentials. */
import {readFile,writeFile,mkdir,copyFile,readdir,unlink} from 'node:fs/promises';
import {createReadStream,createWriteStream} from 'node:fs';
import {pipeline} from 'node:stream/promises';
import {createGunzip} from 'node:zlib';
import {resolve,join,dirname} from 'node:path';
import {build} from 'esbuild';
import {SOCIAL_API} from '../../src/social-config.mjs';
import {CLOUDBASE} from '../../src/cloudbase-config.mjs';
import {validateCloudConfig} from '../../src/cloudbase-auth.mjs';
import {developmentConfig,replaceAssistantConfig} from '../../scripts/dev-profile.mjs';
const shell = resolve(import.meta.dirname,'..'), root = resolve(shell,'..'), out = join(shell,'www');
const profile=process.env.SHIRI_BUILD_PROFILE||'release';
const platform=process.env.SHIRI_PLATFORM||'android';
if(!['android','ios'].includes(platform))throw Error('Unknown SHIRI_PLATFORM');
if(!['debug','release'].includes(profile))throw Error('Unknown SHIRI_BUILD_PROFILE');
let dev;
if(profile==='debug'){
  let raw;try{raw=JSON.parse(await readFile(join(root,'.local/dev-cloud.json'),'utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
  dev=developmentConfig(raw,CLOUDBASE.envId);
}
await mkdir(out,{recursive:true});
// Public endpoint only, compiled into the APK. No token or server secret is bundled.
const nativeAssets=platform==='android'?join(shell,'android/app/src/main/assets'):null;
if(nativeAssets){await mkdir(nativeAssets,{recursive:true});await writeFile(join(nativeAssets,'shiri-cloud.json'),JSON.stringify({api:SOCIAL_API}));}
const files = ['index.html','life.css','life-app.mjs','favicon.svg','manifest.webmanifest',
  'README.md','docs/local-ai.md','docs/life-product.md','docs/life-storage.md','docs/mobile-use.md',
  'docs/国内上线注册指引.md','docs/friends-autocollect.md','docs/cloudbase-deployment.md','docs/cloudbase-social-deployment.md','docs/DEPLOY_NICKNAME_SEARCH.md',
  'fitness.html','app.mjs','styles.css','fitness-advice.mjs','fitness-store.mjs','fitness-view-models.mjs'];
async function copy(name) {
  const target=join(out,name); await mkdir(dirname(target),{recursive:true});
  await copyFile(join(root,name),target);
}
async function tree(name) {
  for (const entry of await readdir(join(root,name),{withFileTypes:true})) {
    if (entry.isSymbolicLink()) throw Error('Refusing symlink in APK assets');
    const path = `${name}/${entry.name}`;
    if (entry.isDirectory()) await tree(path);
    else if (!/\.(map|partial)$/.test(entry.name)) await copy(path);
  }
}
for (const file of files) await copy(file);
for (const directory of ['src','icons','vendor','models']) await tree(directory);
await writeFile(join(out,'shiri-build-profile.json'),JSON.stringify({profile}));
if(dev){
  await writeFile(join(out,'src/cloudbase-config.mjs'),`export const CLOUDBASE=Object.freeze(${JSON.stringify(dev.cloud)});\n`);
  await writeFile(join(out,'src/cloudbase-social-config.mjs'),`export const MEDIA_API=${JSON.stringify(dev.media)};\n`);
  await writeFile(join(out,'src/social-config.mjs'),"export const SOCIAL_API='';\n");
  if(nativeAssets)await writeFile(join(nativeAssets,'shiri-cloud.json'),'{"api":""}');
  await writeFile(join(out,'src/life-assistant.mjs'),replaceAssistantConfig(await readFile(join(out,'src/life-assistant.mjs'),'utf8'),dev.ai));
}
// AAPT automatically expands .gz assets and strips the extension. Prepare explicit
// uncompressed OCR files so browser preview and the final APK use identical URLs.
for (const language of ['chi_sim','eng']) {
  const compressed=join(out,`models/tesseract/${language}.traineddata.gz`);
  await pipeline(createReadStream(compressed),createGunzip(),createWriteStream(compressed.slice(0,-3)));
  await unlink(compressed);
}
let localAI=await readFile(join(out,'src/local-ai.mjs'),'utf8');
if (!localAI.includes('gzip: true,')) throw Error('Native OCR integration no longer matches source');
localAI=localAI.replace('gzip: true,','gzip: false,');
await writeFile(join(out,'src/local-ai.mjs'),localAI);
// This APK carries complete model files. No online model host or split downloads are needed.
await writeFile(join(out,'models/chunks.json'),JSON.stringify({version:1,files:{}}));
let html = await readFile(join(out,'index.html'),'utf8');
if(dev){
  // Strip production connections from the generated debug CSP as well as runtime settings.
  html=html.replace(/https:\/\/[^\s;"']*tcloudbase(?:gateway)?\.com/g,'');
  const origins=[dev.cloud.envId&&validateCloudConfig(dev.cloud),dev.cloud.testUrl,dev.media,dev.ai].filter(Boolean).map(x=>new URL(x).origin);
  html=html.replace("connect-src 'self' blob:",`connect-src 'self' blob: ${[...new Set(origins)].join(' ')}`);
}
if(!dev&&CLOUDBASE.envId){
  const origin=validateCloudConfig(CLOUDBASE);
  if(!html.includes(origin))html=html.replace("connect-src 'self' blob:",`connect-src 'self' blob: ${origin}`);
}
if(!dev&&SOCIAL_API){
  const api=new URL(SOCIAL_API);
  if(api.protocol!=='https:'||api.username||api.password||api.search||api.hash)throw Error('Social API requires a credential-free HTTPS URL');
  html=html.replace("connect-src 'self' blob:;",`connect-src 'self' blob: ${api.origin};`);
}
html = html.replace('<script type="module" src="life-app.mjs"></script>',
  '<script type="module" src="native-boot.mjs"></script>');
html = html.replace('<a href="install.html">安装到手机 ↗</a>',`<span>${platform==='ios'?'iOS':'安卓'} · 内测版</span>`);
await writeFile(join(out,'index.html'),html);
await build({entryPoints:[join(shell,'native-entry.mjs')],outfile:join(out,'native-entry.mjs'),bundle:true,format:'esm',platform:'browser',target:['chrome110','safari17.4']});
await writeFile(join(out,'native-boot.mjs'),"await import('./native-entry.mjs');\nawait import('./life-app.mjs');\n");
// Normalize Windows editor line endings before matching the existing native export hooks.
let app = (await readFile(join(out,'life-app.mjs'),'utf8')).replace(/\r\n/g,'\n');
function replaceOnce(before,after) {
  if (!app.includes(before)) throw Error('Native integration no longer matches source: '+before.slice(0,70));
  app=app.replace(before,after);
}
replaceOnce('function download(blob, name) {','async function download(blob, name) {\n  if (window.shiriNative) return window.shiriNative.exportFile(blob, name);');
replaceOnce('"download-report": () => {','"download-report": async () => {');
replaceOnce('    download(\n      new Blob','    await download(\n      new Blob');
replaceOnce('    download(blob, `拾日-完整备份-','    await download(blob, `拾日-完整备份-');
replaceOnce('if ("serviceWorker" in navigator && window.isSecureContext)','if (!window.shiriNative && "serviceWorker" in navigator && window.isSecureContext)');
replaceOnce('toast("Markdown 文件已准备下载。");','toast(window.shiriNative ? "已打开系统文件分享窗口，请完成保存。" : "Markdown 文件已准备下载。");');
replaceOnce('toast("完整备份已准备下载，请保存在安全位置。");','toast(window.shiriNative ? "已打开系统文件分享窗口，请完成备份保存。" : "完整备份已准备下载，请保存在安全位置。");');
await writeFile(join(out,'life-app.mjs'),app);
let views=await readFile(join(out,'src/views.mjs'),'utf8');
views=views.replace('<a href="install.html" class="button ghost">安装到手机</a>',`<span class="badge">${platform==='ios'?'iOS':'安卓'}测试版</span>`);
await writeFile(join(out,'src/views.mjs'),views);
// Capacitor SystemBars supplies CSS variables for WebViews whose env() values are missing.
// It supplies zero when native padding already consumed the system inset: never add it twice.
const css=(await readFile(join(out,'life.css'),'utf8'))+'\n.native-app .topbar{padding-top:env(safe-area-inset-top);height:calc(64px + env(safe-area-inset-top))}.native-app .mobile-nav{padding-bottom:max(10px,env(safe-area-inset-bottom))}\n';
await writeFile(join(out,'life.css'),css.replace(/env\(safe-area-inset-(top|right|bottom|left)\)/g,(_,edge)=>`var(--safe-area-inset-${edge},env(safe-area-inset-${edge},0px))`));
console.log(`Prepared ${platform} assets, full local models and native export (${profile}).`);
