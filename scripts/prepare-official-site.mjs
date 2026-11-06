/** Buildless, allowlisted landing-page export. Never includes the APP, user data or credentials. */
import {readFile,writeFile,mkdir,copyFile} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import config from '../website/site.config.mjs';
const root=resolve(import.meta.dirname,'..'),source=resolve(root,'website'),out=resolve(source,'dist');
if(!/^\d+\.\d+\.\d+$/.test(config.productVersion))throw Error('Invalid product version');
if(!/^https:\/\/www\.pgyer\.com\/[A-Za-z0-9_-]+$/.test(config.downloadUrl))throw Error('Expected verified PGYER download URL');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
await mkdir(resolve(out,'assets'),{recursive:true});
let html=await readFile(resolve(source,'index.html'),'utf8');
for(const [name,value] of Object.entries({version:config.productVersion,minimum:config.minimumAndroid,wechat:config.wechat,'channel-version':config.observedChannelVersion,checked:config.checkedOn})){
 html=html.replace(new RegExp(`(<[^>]+data-${name}[^>]*>)[^<]*(</[^>]+>)`,'g'),(_,a,b)=>a+escape(value)+b);
}
html=html.replaceAll('href="https://www.pgyer.com/shiri-android-f"',`href="${escape(config.downloadUrl)}"`);
if(config.channelReady){
 if(!config.observedChannelVersion.startsWith(config.productVersion))throw Error('Channel release must match product version before marking ready');
 html=html.replace('下载渠道版本待更新，查看说明','下载与安装说明');
 html=html.replace(/<h3>下载渠道待更新<\/h3><p>[\s\S]*?<\/p>/,'<h3>'+escape(config.productVersion)+' 内测版</h3><p>下载链接已核对。进入蒲公英后，请再次核对应用名称与版本；页面信息为手动维护，不代表实时查询结果。</p>');
}
if(config.privacyPolicyUrl){
 const url=new URL(config.privacyPolicyUrl);if(url.protocol!=='https:'||url.username||url.password)throw Error('Policy must have a real credential-free HTTPS URL');
 html=html.replace(/<details id="privacy-policy">[\s\S]*?<\/details>/,`<div id="privacy-policy"><a class="text-link" href="${escape(url.href)}" target="_blank" rel="noopener noreferrer">阅读正式隐私政策 ↗</a></div>`).replaceAll('隐私政策 · 待补充','隐私政策');
}
await writeFile(resolve(out,'index.html'),html);
for(const name of ['site.css','experience.css','site.mjs','motion.mjs','site.config.mjs','assets/shiri.svg','assets/app-home.png'])await copyFile(resolve(source,name),resolve(out,name));
await writeFile(resolve(out,'_headers'),"/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: no-referrer\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n");
console.log(JSON.stringify({directory:out,version:config.productVersion,download:config.downloadUrl,channelReady:config.channelReady}));
