# 演示运行与部署

## 本地

Node.js 24，执行 npm ci 和 npm run demo，访问 http://127.0.0.1:4188/ 。通过 http 运行，不直接双击 HTML。服务只监听本机，不能作为公网服务。

demo 复用现有页面、审核、保存反馈和规则报告。使用示例数据，图片为原创示意图。存储键为 shiri-public-demo-v1，重置仅改这一份演示记录，不读取正式 APP 的 IndexedDB 或会话。

账号登录、设备相册、好友、上传与 AI 在完整 APP 中验证。演示不伪造这些服务结果，也不会请求模型。

## 静态部署

执行 npm run build:demo。上传 demo-dist **内部所有文件**，保证托管根目录是 index.html。CSS、JavaScript、SVG 均为相对路径，可用于 CloudBase 静态托管或 GitHub Pages 的项目子路径。

本次附带 shiri-demo-0.8.3.zip，即这个目录的内容。它只包含演示所需代码，不能拿完整源代码或私有配置目录去当静态网站上传。

## GitHub Pages

仓库上传后，可手动执行 Actions 中的 Publish demo 工作流。先在 Settings → Pages → Source 选择 GitHub Actions，再点 Actions → Publish demo → Run workflow。部署完成后使用工作流实际输出的地址，确认页面可用再添加到 About/README。

工作流仅手动触发。演示源码在独立目录，发布演示不会部署 CloudBase 后端。未配置 Pages 或网络不通时，本地演示仍可使用。GitHub 的网络可达性由访问者网络决定，不承诺全国无网络限制。
