# 拾日 0.6.0 内测更新

日期：2026-10-17。沿用 Capacitor、IndexedDB、现有 CloudBase 邮箱认证及好友权限，不迁移数据库、不删除历史数据、不新增依赖。

## 已完成

- 首页保留添加照片、写笔记、日期切换、素材整理、复盘和晚间采集入口；删除重复教程及底部重复引导。已有记录时只显示数量与简短隐私提示；首次无记录时提供简短流程。
- 设置增加本地折叠「使用指南」，覆盖整理、保存、复盘、好友、授权、离线同步和备份。
- 公共色彩、卡片、按钮与报告层级统一；照片采用 4:3 显示，手机统计更紧凑，移除时间线无意义的最低高度。保留深色/浅色、底部导航及批量管理工具栏。
- 规划采用本机规则：当前周/月截至今天的已确认记录，与上一周期对应天数比较；不足两天不判断趋势。明确区分记录频次与实际生活行为，仅使用主动填写的心情，不从照片推断心理状态。
- 根据已有未完成计划、明确标记的改进点、亮点或自评生成最多三条可编辑行动。先展示观察、变化和依据；采纳才写入计划。忽略状态只存在当前账户本机 settings，重复采纳会去重。
- 复盘/规划增加「问问拾日」。当前 AI 服务未配置，发送关闭，不伪造答案。可以选择近 14 天、最多 20 条已保存片刻并预览可读摘要；默认不选任何记录，排除私人日记、未审核及已排除照片。不传原图、地点、好友资料、账号信息。单独同意后才能发起请求。
- 前次未发包的启动登录与离线恢复变更一起纳入本次构建；首次必须真实认证，已经认证的本机会话断网时只解锁本地记录，云端操作仍需有效用户 Token。

## 实际文件

主要体验：`src/views.mjs`、`life.css`、`src/core.mjs`、`life-app.mjs`。

AI 客户端准备：`src/life-assistant.mjs`（新增）、`src/cloudbase-panel.mjs`（复用用户 Token 的入口）、`sw.js`（缓存版本与新模块）。没有修改好友 RPC、同步队列或数据库迁移。

版本与打包：`android-shell/android/app/build.gradle`、`android-shell/scripts/prepare-web.mjs`、`android-shell/scripts/build-apk.ps1`、`scripts/start-apk-download.mjs`。

前次保留的登录/发布安全改动：`src/cloudbase-auth.mjs`、`src/auto-collect.mjs`、`android-shell/android/app/src/main/AndroidManifest.xml`。现有 WorkManager 普通任务继续使用，移除未使用的前台服务及其权限；Release 构建强制核对已有证书，缺失签名文件时拒绝重新生成。

测试：`tests/life-experience.test.mjs`（新增）、`tests/cloudbase-auth.test.mjs`（离线认证回归）、`scripts/verify-experience-0.6.mjs`（新增）。

修改前备份：`releases/shiri-before-0.6.0.zip`。更早的发布安全修改前备份：`releases/shiri-before-security-0.5.7.zip`。均不包含私钥。

## 验证

69 项针对性 Node 测试通过：建议证据、上下文最小化、未配置不请求、授权、缓存/限频、认证、视图、复盘、批量审核及现有同步权限逻辑。记录见 `releases/tests-0.6.0.txt`。

隔离 Chromium 使用合成数据及模拟认证响应，检查邮箱流程、启动门禁、320/390/430 手机与 1280 桌面布局、指南、建议采纳/编辑/忽略、AI 未配置状态、选择摘要、照片卡片、浅色模式、离线与联网恢复、退出。未连接真实邮箱或改变真实云端数据。

Android `assembleRelease` 成功；apksigner 验证通过。88 个打包资产与准备目录逐项 SHA-256 一致。检查了 APK 文本/DEX 中 JWT 和私钥标记；发现的嵌入 JWT 仅为公开 anon，不是 service_role。此检查不是完整渗透测试或厂商安全认证。

未进行真实手机覆盖安装或本版双账号实机验收。原有双账号测试是用户对旧版的反馈，不冒充本版验证结果。建议先在一台已有数据的测试机导出备份后覆盖安装，再检查一条片刻的同步和好友读取。

## 构建输出

- APK：`C:\dev\shiri\releases\shiri-0.6.0-release.apk`
- 包名：`cn.shiri.life`；versionCode：15；versionName：`0.6.0-release`。
- 证书：`CN=Shiri Release`，沿用 0.5.6 及以前发布证书。
- 证书 SHA-256：`18b016b5e0c67c9931b1e76436180154e8d46792a343e4a3cb4b34b33b1681ad`
- APK SHA-256：`f720caf1f9a975ff0a411fd7b747005116c7b7537f573133002b69fec4377826`
- 构建日志：`releases/build-0.6.0.log`；校验文件：APK 同名 `.sha256`。

使用同签名 APK 直接覆盖安装；不要先卸载或清除应用数据。先备份仍然必要。本版不能保证厂商「未经安全检测」提示消失。

## AI 接通前仍需完成的工作

本次没有部署 AI 云函数，也没有开通模型账户或新增第三方模型费用。已有 CloudBase 好友/照片服务的正常费用不因这个说明而免除。

客户端请求契约已经实现，但不是仅填一个 API Key 就能启用：

1. 选定可服务目标用户地区的模型供应商，明确运营账户、模型价格、数据存储地区、保留时间与隐私说明。当前中国大陆不在 [OpenAI API 官方支持地区](https://developers.openai.com/api/docs/supported-countries) 列表中，因此没有默认接入 OpenAI 或建议绕过地区限制。
2. 在现有 CloudBase 环境实现独立 HTTPS 业务接口，例如 `/shiri-assistant`；保留 `/shiri-test` 和照片服务。接口必须验证 Bearer 用户 Token，拒绝匿名/过期身份，不接受客户端声称的 UID。模型密钥只放云函数环境变量或服务端密钥管理，不能进入 `src`、APK、导出备份或前端配置。参见 [API 密钥安全说明](https://developers.openai.com/api/reference/overview)。
3. 接口收取 `{question, records}`。每条 records 只允许 `date,title,note,category,mood,reflection`；问题最多 600 字、记录最多 20 条、整个 JSON 最多 12000 字节。不得接受图片 URL、好友记录 ID、文件或任意外部 URL。此接口不需要读取云端好友或照片桶。
4. 服务端必须再次执行长度/类型校验、用户级每分钟一次及每日预算限制、并发限制、用户隔离的幂等/短期缓存、超时和模型输出 Token 上限。客户端当前有每分钟一次、10 分钟最多五条内存缓存、30 秒超时、最多 3000 字回复的保护，但客户端限频不能代替服务端计费控制。不要用云函数单实例内存声称全局限流已经落实。
5. 将用户文字与系统规则分离，记录视为数据而不是指令；只做有证据的观察和可选建议，不诊断心理状态。响应为 `{answer:"..."}`，错误用 401/429/503 等 HTTP 状态；禁用正文/Token 日志，不将个人回复写入好友动态。
6. 完成接口与供应商政策的真实验证后，修改 `src/life-assistant.mjs` 的 `ASSISTANT_CONFIG`：`endpoint` 为与当前照片服务相同 HTTPS 源下的接口，`provider` 为真实处理方，`privacyUrl` 为真实数据处理说明地址。前端只向这个 CloudBase 源发送用户 Token，不直连模型供应商。重新构建 APK 后才启用发送。

上线测试至少包含未登录、过期 Token、未同意、超长输入、重复请求、超频、超时、撤销选择及不同账户缓存隔离。费用按最终供应商模型的输入/输出 Token 和 CloudBase 计算/流量计价；本次未选定模型，不提供虚构报价。若使用符合地区条件的 OpenAI 账户，以其 [官方价格](https://platform.openai.com/pricing/) 为准。
