当前公开快照的安装、数据边界和验证状态以 [README](../README.md)、[SETUP](SETUP.md) 和 [PUBLIC_VERIFICATION](PUBLIC_VERIFICATION.md) 为准。以下包含历史阶段设计与记录，不能据此推断你的环境已部署。

> 0.5.1 更新：用户已完成数据库部署，当前昵称搜索使用与验收见 [0.5.1 说明](DEPLOY_NICKNAME_SEARCH.md)。不要重复执行以下历史数据库步骤。

# 拾日 0.5.0 好友与私有近况部署

2026-10-11。已编写前后端代码；没有取得你的云控制台登录会话或服务器凭据，不能自动完成部署。已有邮箱登录继续使用。本版本的搜索和近况使用真实接口，服务未部署时明确报错，不生成演示好友。

## 先部署好友数据库（文字近况也依靠这一步）

1. 登录腾讯云 CloudBase 控制台，选择上海环境 **shiri-dev / YOUR_CLOUDBASE_ENV_ID**。
2. 进入 **数据库 → PostgreSQL → SQL 编辑器**，新建 SQL 查询。控制台版本若把 SQL 编辑器放在数据库详情中，先打开当前数据库；不要新购数据库。
3. 打开项目文件 `cloudbase/migrations/001_social.sql`，完整复制，包括开头 BEGIN 与结尾 COMMIT。粘贴到编辑器后点击 **运行/执行**。
4. 预期：全部 SQL 成功，public 中出现 `shiri_` 开头的七张业务表、`shiri_social` 函数；storage 中出现私有桶 `shiri-shared`。脚本可重复运行，保留已有业务记录。首次运行前可使用控制台已有备份能力保存数据库恢复点；不要在报错后只执行剩余半段。
5. 新建查询并运行 `cloudbase/migrations/verify_social.sql`。预期所有 shiri 表 `rowsecurity=true`，`anon_must_be_false=false`、`user_must_be_true=true`，桶 `public=false`，两个 Storage 策略为 RESTRICTIVE。
6. 两部手机覆盖安装 0.5.0，分别使用不同邮箱登录，打开好友页并点击 **刷新**。应显示 **好友服务已连接**。双方均打开后，复制完整账号 ID，另一方在 **好友 → 好友 → 搜索好友** 粘贴，再发申请。

身份由网关验证 Access Token，再注入 `auth.uid()`。用户表只保存 UID 和昵称，不保存邮箱。没有独立密码，也没有使用 Hello World 作为业务接口。

## 再部署私有照片接口

文字近况不需要这个云函数。照片上传/查看需要完成下面步骤；没有自动开通或购买任何新产品。若控制台要求付费开通或升级，停在该界面，先核对现有套餐和预算。

1. 仍在同一环境，进入 **云函数 → 新建云函数 → HTTP 云函数**。
2. 函数名输入 **shiri-media**。运行时选择 **Node.js 20.19**（启动脚本使用 `/var/lang/node20/bin/node`），超时设置 **60 秒**，按现有套餐允许的最低内存配置即可，不需要预置并发。
3. 代码来源选 **本地上传 / 上传 ZIP 包**，上传 `releases/shiri-media-0.5.0.zip`。ZIP 根目录直接包含 `index.js`、`package.json`、`scf_bootstrap`，没有嵌套文件夹和依赖。
4. 在函数 **配置 → 环境变量 → 编辑** 设置下表。密钥仅在控制台填写，不能发在聊天或复制到 src、公开网页、APK。

| 变量 | 填写内容 |
| --- | --- |
| `SHIRI_ENV_ID` | `YOUR_CLOUDBASE_ENV_ID` |
| `SHIRI_STORAGE_SERVICE_KEY` | 此环境新创建的**服务端 API Key（role=service_role）**，不是客户端 Publishable Key |
| `SHIRI_ALLOWED_ORIGINS` | `https://localhost,http://localhost`；网页正式上线后再追加该网页的准确 HTTPS origin，逗号分隔 |

服务端 Key 从该环境的 **环境管理/环境配置 → API 密钥** 页面获取。如果页面提供 Publishable Key 和 API Key 两种，选择服务端 API Key。你之前发过的管理员 Key 已暴露，应先在该页面撤销旧 Key，再生成并仅填入上述函数环境变量；不要复用旧 Key。本工程没有保存或使用它。

5. 保存配置并部署，预期函数状态为可用。函数监听 9000 端口。我们提供的 ZIP 中启动脚本是 LF 换行且有 Linux 可执行权限，不需手动购买服务器或安装 npm 依赖。
6. 进入 **HTTP 网关 → 当前已用于 `/shiri-test` 的域名 → 新建路由**，路径填写 **`/shiri-media`**，关联刚建立的 **shiri-media HTTP 云函数**，支持 GET、PUT、DELETE、OPTIONS。保留原 `/shiri-test`，不要覆盖。
7. 完整媒体地址应为：

   `https://YOUR_ENV-YOUR_ACCOUNT.ap-shanghai.app.tcloudbase.com/shiri-media`

8. 浏览器直接访问该地址，应返回 **HTTP 401，“请先登录”**；这是预期鉴权行为。不要把接口改成免登录来消除这条提示。这个 401 仅验证函数路由，不能证明图片上传成功。

照片最长边 1280 像素、JPEG ≤1 MiB，浏览器重新绘制去元数据，服务端再次移除 EXIF/XMP/IPTC/注释。Storage 桶不公开；客户端对该桶被 RLS 限制，不能绕过 APP 生成可转发的长期图片链接。代理先检查请求用户授权，再用仅服务端持有的凭据读取，返回前再次检查并设置 no-store，不输出签名 URL。

## 手机使用方式

- **添加好友：** 好友页复制账号 ID → 对方搜索 → 发送申请及留言 → 收件人接受。添加不会自动开放内容。
- **开放范围：** 好友列表 → 设置开放范围。分别选择不开放、仅手动近况、指定分类、全部已确认分享；可限制最近 7/30/90 天，也可填写最早可见日期。双方独立授权。
- **分享文字：** 分享 → 填标题、正文、分类 → 确认内容并发布。默认未授权时，好友看不到。
- **分享照片：** 先在素材页确认本地记录 → 分享 → 从本地日记选择 → 阅读内容确认 → 上传进度结束后发布。所有旧 shareApproved 标记不会触发自动上传。
- **失败重试：** 网络或云配置错误时，草稿和本地原图保留。停留当前页面，点击重试；重启会丢失未提交的手动输入，照片原始记录始终保留。发布最终确认由云端执行，失败草稿不能被好友读取。
- **撤销：** 分享 → 我的云端分享 → 撤回分享，或删除/屏蔽好友。会阻止后续服务器访问，无法删除对方已经截图保存的内容。

## 双手机验收（尚未替你执行）

1. A、B 用两个邮箱登录，重开 APP 后分别恢复不同的固定 UID。
2. A 搜索 B、发送一次及重复发送，B 只看到一个申请；B 接受后双方只有一条好友关系。
3. A 发布文字与一张测试照片，默认 none 时 B 看不到；A 向 B 授权匹配分类后才可见。
4. 改为不匹配分类、缩小历史范围，刷新 B 后不可见。
5. A 撤回分享、删除好友、屏蔽 B，分别验证 B 的近况和照片读取被拒绝。解除屏蔽不会自动恢复好友或权限。
6. 第三个账号 C 无法通过 A/B 的记录 ID 或照片 ID 越权。未登录 GET/PUT/DELETE 照片接口为 401，匿名 RPC 必须拒绝。
7. 上传过程中断网，草稿不出现在 B 页；恢复网络后由 A 手动重试。另一设备撤回正在上传的记录后，旧上传任务的完成请求不能重新公开。
8. 原有本地相册、分类、报告、定时采集、导出备份仍正常。先导出备份，再覆盖安装，勿卸载测试。

## 排错与回退

- “好友数据库尚未部署”：检查是否完整运行 SQL、环境 ID、PostgREST schema 缓存。SQL 已发出 `NOTIFY pgrst,'reload schema'`。
- “请先刷新好友资料”：点击好友页刷新，自动用登录会话登记自己的 UID 和昵称。
- 查不到朋友：核对完整固定 ID，对方必须至少打开一次新版本好友页。已屏蔽时也不会显示。
- “照片服务尚未部署”：核对 `/shiri-media` 路由、Node 20 运行时、函数环境变量、私有桶和 Origin。不要将桶改为公开。
- 撤回后清理副本失败：访问权限已撤销，存储清理失败不会重新开放；可在云控制台稍后清理，不要恢复分享作为修复。
- 回退应用代码使用保留的 0.4.2 源码 ZIP。Android 通常拒绝降版本 APK，不要为回退卸载含日记的应用；应使用旧源码重新构建更高 versionCode 的同签名包。
- 测试命令：`npm ci --ignore-scripts`、`npm test`、`node scripts/check-cloudbase-social.mjs`。PGlite 测试运行真正的 PostgreSQL SQL，但 Auth/Storage schema 和身份为隔离夹具，不代表腾讯云实机验收。

## 官方依据

[PostgreSQL REST / RPC](https://docs.cloudbase.net/http-api/pgdb/postgresql-restful-api)、[PG 身份与 RLS](https://docs.cloudbase.net/en/authentication-v2/auth/auth-pg)、[PG Storage HTTP API](https://docs.cloudbase.net/en/http-api/storage-pg/pg-storage-api)、[HTTP 云函数 Node 快速开始](https://docs.cloudbase.net/cloud-function/quickstart/httpfunc/nodejs)。
