# OPPO Android12 登录连接失败排查

基于 d100abd，分支 codex/webview-auth-compat；改动前保留 .local/before-webview-auth.bundle。

## 已确认的证据与边界
- 用户照片显示 OPPO Find X3 / PEDM00、ColorOS12.1、Android12；登录页显示“无法连接 CloudBase”。没有该机 WebView 版本或系统日志。
- 用户已确认手机浏览器能打开 /shiri-test 并看到 Hello World。开发机只读检查测试接口返回200、无凭据 /auth/v1/user/me 返回401。这说明对应检查有连通性，不证明该手机 APP 的认证域名、TLS、CORS 或联网权限均正常。
- 单元测试关闭 AbortSignal.timeout/any 后，旧代码在真正调用 fetch 前抛出异常，却被统一包装为网络错误；现已修复。此 API 在 Chromium103 引入，系统是Android12不代表内置WebView足够新。[Chromium 官方发布说明](https://blog.chromium.org/2022/05/chrome-103-beta-early-navigation-hints.html)
- 不能仅凭两张照片断言该机就是此原因；修复包仍需该机复验。未要求升级整个ColorOS、卸载应用或清空数据。

## 最小修改
- 新增 src/request-scope.mjs，以 AbortController+可清理计时器提供超时和取消，避免依赖新静态API；覆盖响应正文读取，完成/重试/失败后释放资源。
- src/cloudbase-auth.mjs 使用兼容计时器；将本地配置校验放到网络捕获之外，区分配置错误、连接异常、超时和服务端拒绝。认证协议、UID、Token刷新和离线授权规则不变。
- src/cloudbase-social-api.mjs 同步修复好友RPC/私有照片请求，避免登录成功后仍因同一个API而失败；权限与401刷新机制保留。
- src/beta-analytics.mjs 仅复用兼容的取消/超时机制，统计仍默认关闭，内容、告知、频率与授权不变。
- sw.js 缓存更新；测试补充旧API缺失、请求实际发出、配置错误、超时、取消、旧内核登录恢复与好友照片。
- 不改变服务器、RLS、云函数、API凭据、Android权限、正式包名、签名或版本号。

## 测试与手机验证
针对性单元测试及浏览器回归使用合成账号、邮件验证码和AI响应，没有向真实用户发送邮件或调用付费模型。模拟缺少静态API不等于运行了真实旧版WebView。
仍需用户在该OPPO上覆盖安装修复测试包后，验证发送验证码、验证码输入框、真实登录、会话恢复、保存/审核与好友照片。不要卸载或清除拾日数据；有记录时先导出备份。
如果仍提示连接失败，确认系统允许拾日使用WLAN/移动数据，尝试另一网络，并提供系统应用里的 Android System WebView 版本和修复后完整提示。通过手机官方更新渠道检查 WebView 更新，不从陌生链接安装系统组件或关闭TLS校验。

本轮修订测试包沿用0.8.2/code28及原证书；不覆盖先前交付文件，不自动上传蒲公英或GitHub。签名一致只说明覆盖安装身份兼容，不代替真机数据保留验收。
