/** Temporary LAN delivery: an explicit route allowlist, never a workspace file server. */
import {createServer} from 'node:http';
import {createReadStream} from 'node:fs';
import {stat} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';

const name = 'shiri-0.3.0-preview.apk';
export async function createDownloadServer(apk,{name='shiri-0.3.0-preview.apk',version='0.3.0',authConnected=false,socialIncluded=false,nicknameSearchIncluded=false}={}) {
  if(!/^shiri-[a-z0-9.-]{1,70}\.apk$/.test(name))throw Error('Invalid APK download filename');
  const info = await stat(apk);
  if (!info.isFile() || info.size < 1) throw Error('APK is missing or empty. Build and verify it first.');
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(apk)) hash.update(chunk);
  const digest = hash.digest('hex');
  const page = Buffer.from(`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>拾日 · 安卓安装包</title><style>body{margin:0;background:#141715;color:#ecefe9;font:16px/1.8 system-ui,sans-serif}main{max-width:540px;padding:40px 24px;margin:auto}h1{font-size:36px}p,li{color:#b8c1b9}a{display:block;text-align:center;background:#adc4a3;color:#17201a;padding:16px;border-radius:16px;text-decoration:none;font-weight:650;margin:28px 0}small{display:block;overflow-wrap:anywhere;color:#98a59b}.tag{letter-spacing:.16em;color:#adc4a3}</style><main><div class="tag">SHIRI · LOCAL FIRST</div><h1>把拾日装进口袋</h1><p>安卓测试版 ${version} · ${(info.size/1024/1024).toFixed(1)} MiB<br>Android 7.0 及以上，并使用更新的系统 WebView。</p><a href="/${name}" download>下载 APK 安装包 ↓</a><ol><li>用手机浏览器打开此页，下载完成后打开 APK。</li><li>按系统提示允许当前浏览器安装此文件，再完成安装。不同品牌的入口名称可能不同。</li><li>打开「拾日」。原有网页记录可先导出完整备份，再在应用中恢复。</li></ol><p>照片、笔记与模型在本机处理。${nicknameSearchIncluded?'已包含邮箱登录、昵称搜索、可发现性开关和真实好友申请。已有数据库迁移无需重复执行；照片共享需配套媒体接口。':socialIncluded?'已包含邮箱登录、好友搜索、申请、分级授权和主动分享。首次使用需部署配套数据库与照片接口；界面会显示实际连接结果。':authConnected?'已包含 CloudBase 邮箱验证码接入代码；可在好友页登录。好友同步和照片共享尚未启用，需先完成真实账号验收。':'此测试版无需登录；微信、短信和邮箱账号服务尚未开通。'}</p><p>这是临时局域网下载页：手机与电脑需在可互访的同一 Wi-Fi，电脑和下载服务需保持开启。公共 Wi-Fi 可能禁止设备互访。</p><small>SHA-256<br>${digest}</small></main></html>`);
  return createServer((req,res) => {
    res.setHeader('X-Content-Type-Options','nosniff');
    res.setHeader('Referrer-Policy','no-referrer');
    res.setHeader('Cache-Control','no-store');
    res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'");
    if (!['GET','HEAD'].includes(req.method)) {res.writeHead(405,{Allow:'GET, HEAD'}).end();return;}
    let path;
    try { path = new URL(req.url,'http://localhost').pathname; } catch {res.writeHead(400).end();return;}
    if (path === '/') {
      res.writeHead(200,{'Content-Type':'text/html; charset=utf-8','Content-Length':page.length});
      res.end(req.method === 'HEAD' ? undefined : page); return;
    }
    if (path !== `/${name}`) {res.writeHead(404).end();return;}
    let start=0, end=info.size-1, status=200;
    if (req.headers.range) {
      const match = /^bytes=(\d+)-(\d*)$/.exec(req.headers.range);
      if (!match) {res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      start=Number(match[1]); end=match[2] ? Math.min(Number(match[2]),end) : end;
      if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start>end) {res.writeHead(416,{'Content-Range':`bytes */${info.size}`}).end();return;}
      status=206; res.setHeader('Content-Range',`bytes ${start}-${end}/${info.size}`);
    }
    res.writeHead(status,{'Content-Type':'application/vnd.android.package-archive','Content-Length':end-start+1,'Accept-Ranges':'bytes','Content-Disposition':`attachment; filename="${name}"`});
    if(req.method === 'HEAD') {res.end();return;}
    const stream=createReadStream(apk,{start,end});
    stream.on('error',()=>res.destroy());
    res.on('close',()=>stream.destroy());
    stream.pipe(res);
  });
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const selected=process.env.SHIRI_APK_NAME||name;
  if(!/^shiri-[a-z0-9.-]{1,70}\.apk$/.test(selected))throw Error('Invalid APK filename');
  const apk=resolve(import.meta.dirname,'../../releases',selected);
  const authVersion=/^shiri-(0\.4\.[012])-auth-preview\.apk$/.exec(selected)?.[1];
  const socialVersion=/^shiri-(0\.5\.[0123])-(?:social|nickname|ui|review)-preview\.apk$/.exec(selected)?.[1];
  const server=await createDownloadServer(apk,{name:selected,version:socialVersion||authVersion||'0.3.0',authConnected:!!(authVersion||socialVersion),socialIncluded:!!socialVersion,nicknameSearchIncluded:!!socialVersion&&socialVersion!=='0.5.0'});
  const host=process.env.SHIRI_DOWNLOAD_HOST || '127.0.0.1';
  const port=Number(process.env.SHIRI_DOWNLOAD_PORT || 4179);
  server.listen(port,host,()=>console.log(`Shiri APK download: http://${host}:${port}/`));
}
