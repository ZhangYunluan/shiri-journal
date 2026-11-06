# 拾日0.8.0：生活月历、照片回顾、好友备注与留言

日期：2026-10-28。基于团队仓库6f65031，在codex/life-calendar-comments分支开发。没有推送GitHub、部署SQL/云函数、开通服务或调用付费AI。原目录的官网工作未覆盖。

## 第一阶段
复用已有日期、情绪分组/自定义词、IndexedDB、照片缩略图、大图左右切换、好友稳定UID和备份，不重新开发这些能力。
- 总览“生活，慢慢有了形状”右侧“生活日历”展开完整月历；原日期输入也会打开月历。默认收起，快速记录仍在首页核心位置。可切换年月，点击日期回看已保存片刻，缺记录只有一句提示。
- 点击当天感受，八个常用Emoji一步选择；“更多感受”复用现有分组/自定义情绪，可以修改/清除。每日感受独立于片刻感受，仅本人本机保存，重启保留。
- 日/周/月/年复盘在有已确认照片时显示照片回顾，每次24项按需继续；大图只在点击时读取，缩略图按可见区域加载。不改变文字报告、统计、规划或Markdown导出，不生成本机图片外链。
- 好友列表和个人主页可设置备注；当前账号的已添加好友搜索结果/近况优先显示备注，原昵称仍可辨认。按稳定UID保存在本机，不回写云端昵称。
- 每日感受和备注分别为settings中的daily-feeling:日期、friend-note:UID记录；不升级IndexedDB结构。ZIP备份会保留这些数据，恢复时先校验后合并，现有同ID不覆盖。不恢复登录/统计授权。

第一阶段提交：e6c4619。52项针对性测试通过，新浏览器日历/心情/备注/ZIP及原好友照片回归通过；独立Debug构建成功，185任务，2m41s。

## 第二阶段：留言
独立shiri_comments RPC，只增量增加评论表、私有计数表和权限函数。没有替换shiri_social或修改shiri-media/原好友关系授权逻辑。按片刻+具体好友隔离两人线程，主人可以选择留言者回复。
客户端在检测到已部署RPC后才显示入口；未部署时不伪造成功，旧功能仍可用。评论仅临时保存在当前页面内存，不进入个人复盘、AI、ZIP或统计。关闭/切后台清理显示；网络失败保留当前草稿，重试沿用相同clientId；不实现离线自动发送。
每条1–300字，支持Emoji/换行；服务端每分钟10次、每天100次。原作者和片刻主人可删除。每次读取/发送重新验证真实身份、好友、屏蔽、片刻shared、分类、历史范围；他人不能查看别人的两人线程。撤销服务端权限后拒绝后续请求，不能保证已下载内容从对方设备抹除。
需要负责人执行004增量，步骤见MOMENT_COMMENTS_DEPLOY.md；无需新增云函数、网关或客户端Key。

## 实际文件
- 新增src/life-calendar.mjs、life-calendar-view.mjs、calendar.css、local-photo-gallery.mjs：私密设置、月历、照片回顾与本机图片适配。
- life-app.mjs、life.css、src/views.mjs、db.mjs：入口、交互、保存/恢复和样式；sw.js更新代码缓存，不清除用户数据。
- src/friend-timeline.mjs：沿用现有大图/左右切换/并发清理，新增可选的本机缩略图读取和留言入口。
- src/cloudbase-friends.mjs、cloudbase-friends-view.mjs、cloudbase-panel.mjs：本地备注、留言入口及权限变化清理。
- 新增src/moment-comments.mjs；cloudbase-social-api.mjs增加同身份的评论RPC调用。
- cloudbase/migrations/004_moment_comments.sql、verify_moment_comments.sql：独立增量与只读检查。
- tests/life-calendar.test.mjs、moment-comments.test.mjs、moment-comments-sql.test.mjs及两项新浏览器脚本。
- Android app/build.gradle、build-apk.ps1、两个README：0.8.0-release/code26及对应文件名，原包名与证书保留。

## 最终验证
- 79项相关Node/PostgreSQL测试通过，无跳过；包括原保存同步、断网重试、账号空间、备份、授权和新功能。SQL只读验收脚本也在PGlite中执行通过。
- 四项浏览器合成回归通过：新月历/心情/备注、留言发送回复/失败重试/删除/转义/撤权清理、旧好友照片、旧批量保存；320/390/1280宽无横向溢出。未连接真实CloudBase或模型。
- Release BUILD SUCCESSFUL，2m51s，246任务；100个打包资源的路径/SHA-256校验通过。
- cn.shiri.life，0.8.0-release，versionCode26；无debuggable标记；apksigner v2验证有效。
- 原证书SHA-256：18b016b5e0c67c9931b1e76436180154e8d46792a343e4a3cb4b34b33b1681ad。
- APK SHA-256：2c4088b639813a257f9de33828eee305662ec4a95c5eb5f1bec0eea95b3449b4。
- 最终APK文本/DEX静态检查278项，只有公开anon凭证，无命中的私钥/管理员JWT模式；这不是安全认证。

## 仍需真实验证
Android/鸿蒙真机、两台手机真实留言与权限撤销、0.7.4覆盖升级后的数据完整性尚未验收。建议先用旧版导出ZIP，再同签名覆盖安装；不要卸载旧版或清除数据。评论上线必须先审阅并部署004，不能把本机SQL/模拟浏览器测试当成线上成功。
正式APK仅构建输出，未发布蒲公英/应用商店。正式签名只保存在被Git忽略的本机目录，没有进入提交。
