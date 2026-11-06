当前公开快照的安装、数据边界和验证状态以 [README](../README.md)、[SETUP](SETUP.md) 和 [PUBLIC_VERIFICATION](PUBLIC_VERIFICATION.md) 为准。以下包含历史阶段设计与记录，不能据此推断你的环境已部署。

> 0.5.1 更新：用户已完成数据库部署，当前昵称搜索使用与验收见 [0.5.1 说明](DEPLOY_NICKNAME_SEARCH.md)。不要重复执行以下历史数据库步骤。

> 2026-10-12：好友与主动分享接入见 [最新部署说明](cloudbase-social-deployment.md)。只读检查：测试接口 200，业务 RPC 与照片接口均 404，尚待部署；以下旧版本记录保留。

# 拾日 CloudBase 接入与验收

更新时间：2026-10-11。当前代码处于第一阶段：邮箱认证接入；不能据此认为好友/照片共享已经部署。

0.4.1 修正了新邮箱发送验证码后“验证码服务未返回有效挑战”的客户端错误。官方响应的 `is_user` 为可选字段；省略时应进入验证后注册流程，不应拒绝合法的 `verification_id`。验证码输入框在发送成功后出现。旧版 0.4.0 APK 和源码 ZIP 保留作为可恢复版本。

0.4.2 加入云端显示昵称编辑。登录后进入“好友近况 → 修改昵称”，填写 2–48 字（支持中文，可重名），点击“保存昵称”。通过当前用户 Access Token 请求官方接口，重新读取服务器用户信息确认后才显示保存成功。CloudBase 固定 UID 与原本本机日记空间不变。截图已证明用户一个邮箱真实登录及会话恢复成功；第二个邮箱与 UID 的验收仍待完成。昵称修改的真实手机验收需要用户在新版应用操作。

## 当前已连接的信息

- 环境：`YOUR_CLOUDBASE_ENV_ID`，上海 `ap-shanghai`。
- 连通性测试：`https://YOUR_ENV-YOUR_ACCOUNT.ap-shanghai.app.tcloudbase.com/shiri-test`。
- 官方认证/数据库域名：`https://YOUR_CLOUDBASE_ENV_ID.api.tcloudbasegateway.com`。
- 仅公开的 Publishable Key 写入 `src/cloudbase-config.mjs`；客户端配置校验拒绝 service_role。收到过的管理员 Key 不使用、不保存；需要你在控制台吊销。

## 第一阶段不需要购买或部署新的服务器

应用直接访问 CloudBase 官方认证 HTTP API。保留 `shiri-api-test` 和 `/shiri-test`，不改变其代码，不把它当正式业务接口。

| 功能 | 官方路径 | 身份要求 |
| --- | --- | --- |
| 发送验证码 | POST `/auth/v1/verification` `{email,target:"ANY"}` | 官方公开认证接口 |
| 验证验证码 | POST `/auth/v1/verification/verify` | verification_id + 邮件验证码 |
| 注册新用户 | POST `/auth/v1/signup` | email + verification_token |
| 登录已有用户 | POST `/auth/v1/signin` | verification_token |
| 获取稳定 UID / 验证登录状态 | GET `/auth/v1/user/me` | 当前用户 Access Token |
| 修改显示昵称 | POST `/auth/v1/user/basic/edit` `{nickname}` | 当前用户 Access Token；不传 user_id |
| 刷新会话 | POST `/auth/v1/token` | refresh_token，不能附过期 bearer |
| 退出 | POST `/auth/v1/user/signout` | 当前用户 Access Token |

UID 取自官方 `sub`，不是拾日生成的另一套账号。旧 SR 密码账号没有自动迁移至云端。登录后使用新的本地命名空间，旧 SR / 访客照片和日记仍在原 IndexedDB 中；退出回到访客空间，不自动导入历史数据。

Android 会话通过 AuthVault 插件使用 Android Keystore AES-GCM 加密存放在应用私有 SharedPreferences。网页会话存放在独立 IndexedDB，依赖浏览器同源隔离，不宣称具有 Android Keystore 的安全等级。凭据不进入日志备份、不放进 localStorage；仍需防止设备被他人解锁访问以及同源脚本漏洞。

## 控制台操作（第一阶段）

1. 打开腾讯云 CloudBase 控制台，选择 **shiri-dev** 环境，核对环境 ID 为上述值。
2. 进入 **环境管理 → API 密钥**。找到先前错误复制的管理员 API Key，点击其 **删除 / 吊销**。不要删除环境或数据库。创建客户端 Key 时选择 **Publishable Key / publish_key**，不是 **API Key / api_key**。正确公开 Key 的 JWT role 是 `anon`。
3. 进入 **身份认证 → 登录方式**，查看邮箱验证码登录为开启、邮件代发为 CloudBase；不重新购买短信或邮件服务。进入 **登录页设置**，核对允许注册已保存。
4. 如果 Web 登录提示 CORS，进入 **环境管理 → 安全配置 → 安全域名**，添加实际网页域名（本机测试添加 `localhost` / `127.0.0.1`）。Capacitor Android 内置页面 Origin 为 `https://localhost`。列表输入是域名时填写 `localhost`，要求完整 Origin 时填写 `https://localhost`，不添加 `*`。以控制台字段提示为准。
5. 在新的 APK 中进入 **好友近况 → 邮箱验证码登录 / 注册**。输入自己邮箱，点击 **发送验证码**；在应用里输入收到的验证码，点击 **验证并登录**。不要把验证码发到聊天或日志。
6. 成功后应显示真实 CloudBase 用户 ID。回控制台 **身份认证 → 用户管理**，应看到该邮箱的用户条目，UID 与应用一致。另一手机用第二个邮箱重复；两个 UID 应不同。
7. 重启应用应恢复同一 UID；点击 **刷新会话** 应成功；退出后不再显示该账号。离线退出只清本机凭据，界面会明确云端会话未撤销。

如果腾讯云返回 `captcha_required`，当前直接 HTTP 流程会明确提示图形验证要求，不会跳过验证码或伪造成功。应先核对控制台图形验证策略；图形挑战的原生/内嵌官方 SDK 接入尚未通过真实环境验收，不能把这一情况当成已支持。

## 构建与源码使用


如果提示 `ERR_CONNECTION_REFUSED`，先在电脑项目文件夹双击 `启动拾日下载.cmd`，保持该窗口开启。电脑可打开 `http://127.0.0.1:4187/`；手机打开窗口打印的同一 Wi-Fi 地址。启动器只提供指定 APK 和下载页，不提供项目目录。APK 必须传到安卓手机安装，不能在 Windows 上直接作为程序运行。也可直接把 `releases/shiri-0.4.2-auth-preview.apk` 文件复制到手机，避免依赖下载服务。

更换公开配置时，复制 `cloudbase/.env.example` 到 `cloudbase/.env`，填写实际 `SHIRI_CLOUDBASE_ENV_ID` 和 **Publishable Key**，运行 `node scripts/configure-cloudbase.mjs`。脚本检查 role=anon/环境匹配后才写源码，不打印 Key，拒绝管理员凭证。当前公开配置已填入，不需再次填写。

```powershell
npm test
cd android-shell
npm ci
npm run sync
cd ..
./android-shell/scripts/build-apk.ps1
```

APK 构建要求 JDK 21、Android SDK 36 与已接受的 SDK 许可；当前构建脚本使用本机 `.tool-cache/android-build`。外部开发者应设置相应路径，保留自己名下的签名密钥。源码 ZIP 不含 JKS、数据库、个人备份、node_modules 或 SDK。**升级现有手机须使用同一签名，不要卸载应用以免丢失本地数据。**

## 后续阶段与当前边界

先完成两个真实邮箱的阶段一验收，再启用好友数据库和共享；当前 `friendsEnabled:false`。尚未执行 CloudBase PostgreSQL 建表、好友同步、私有 Bucket 创建、真实照片上传或双手机权限验收。这些不能从 Hello World 或本地单元测试推断已经完成。

旧版自动上传所有照片的 JS 逻辑和 Android 上传 Worker 已禁用。原有定时采集队列、相册权限、日记和本地复盘继续保留；原有云端副本未被擅自删除。新版本仅允许逐张保存“愿意分享”的本地标记，共享服务验收前不会上传。

## 官方文档核对依据

- [PG 身份认证与三种凭据](https://docs.cloudbase.net/authentication-v2/auth/auth-pg)
- [发送验证码](https://docs.cloudbase.net/en/http-api/auth/auth-send-verification)
- [验证验证码](https://docs.cloudbase.net/http-api/auth/auth-verify-verification)
- [获取当前用户信息](https://docs.cloudbase.net/http-api/auth/user-me)
- [修改昵称等基础信息](https://docs.cloudbase.net/http-api/auth/user-edit-user-basic-info)
- [Token 换取与刷新](https://docs.cloudbase.net/http-api/auth/auth-grant-token)
- [退出登录](https://docs.cloudbase.net/en/http-api/auth/auth-sign-out)
- [PostgreSQL RPC 安全注意事项](https://docs.cloudbase.net/database/postgresql/rpc)
- [PG 私有云存储](https://docs.cloudbase.net/storage/pg/introduce)

PG 的 auth.users.id 是 varchar(64)，不能假设一定是 UUID。API Key 对应 service_role，可绕过 RLS，绝不进入客户端。官方 RPC 文档说明不能仅依赖 EXECUTE GRANT，SECURITY DEFINER 函数必须主动核验角色和身份。
