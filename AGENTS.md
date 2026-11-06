# 拾日：团队 Codex 工作规范

## 产品边界
先帮助自己记录生活、回顾与成长，其次让明确授权的亲密好友了解近况。不是朋友圈、聊天平台或竞技打卡工具。不加入点赞排名、惩罚机制和假 AI 回复。

## 开始任何任务
1. 阅读本文件、README.md、TEAM_GUIDE.md 和当前相关代码；先检查 git status，不覆盖其他成员未提交的工作。
2. 使用自己的 codex/<功能短名> 分支。避免两个人同时改 life-app.mjs、src/views.mjs、life.css；先在任务中声明文件范围。
3. 先给简短方案，最小修改，不更换框架、不随意安装依赖。保留已有功能和数据。
4. 开发使用独立调试包和测试环境；不得把 shiri-dev 的名字理解成可以随便写入的测试环境，它承载真实内测用户。

## 结构
- life-app.mjs / life.css / src/views.mjs：页面与事件协调。
- src/db.mjs、backup.mjs、space.mjs：账号本地空间、IndexedDB 与备份。
- src/moment-review.mjs、moment-sync.mjs：审核与保存同步。
- src/cloudbase-*.mjs、friend-timeline.mjs：现有登录、好友授权与近况展示。
- src/life-assistant.mjs、chat-session.mjs、chat-layout.mjs：用户授权摘要、对话与显示。
- android-shell/：Capacitor + Java Android 工程；正式包 cn.shiri.life，开发包 cn.shiri.life.debug。
- cloudbase/functions/、cloudbase/migrations/：服务端源码和迁移；不能仅因为有文件就执行部署。
- social-server/：历史本地测试服务，现有单元测试依赖；不是当前 CloudBase 正式服务，不要擅自部署。
- website/：官网，独立于 APP；tests/ 与 scripts/：验证工具。

## 禁止事项
- 不清空用户数据，不卸载正式 APP，不重置/覆盖签名，不更改正式包名和正式版本号。
- 不提交 .local-backups、.local、.signing、真实 .env、密钥、Token、用户备份/日记/照片或含私密资料的日志截图。
- 不执行 git add .、reset --hard、clean -fd、强制推送或历史重写。精确选择任务文件。
- 不自动创建远程仓库、邀请成员、推送、发布 APK、开通付费服务或部署云函数/SQL。
- 不削弱 RLS、好友屏蔽/删除/授权检查；不公开照片桶；客户端传来的 uid 不是服务端身份依据。
- 不自动上传未审核/已排除素材、私人日记、复盘或好友资料。保存片刻后仍沿用已有授权同步，不增加二次发布。
- 不假装模拟测试等于真实设备或线上验证。不要打印对话正文、账号凭证或服务端秘密。

## 测试与交付
先 npm ci；npm run check:source；按修改范围运行 node --test tests/<相关文件>.test.mjs。协作基础变更可运行 npm test。
浏览器测试用 npm run test:browser:chat 或 npm run test:browser:friends，使用合成账号和模拟响应；不能为了测试调用真实付费 AI。
调试构建见 README；使用 JAVA_HOME/ANDROID_HOME，不依赖某个人的 Codex 缓存。不要运行正式发布脚本来代替调试构建。
提交前 git diff --check、检查差异和敏感内容；说明改动、测试结果、未验证设备、数据和权限影响。
线上权限、SQL、登录会话、正式签名及云配置修改必须先获得项目负责人的明确授权和审阅。普通 UI 修改无需反复请求额外许可。
