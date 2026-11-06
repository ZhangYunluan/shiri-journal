# 拾日 0.6.2 体验调整

- 借鉴轻量任务引导和触感按钮，不使用多邻国品牌素材、积分或连续打卡机制。
- `src/views.mjs`：生活小步入口、真实记录天数、已保存与待整理反馈；复用原 note/library/reports/settings/guide 操作。
- `life.css`：绿色重点色、按压反馈、三步路径、移动端和深浅色样式、减少动态偏好。
- `index.html`：恢复 Git 中原 APP 入口；之前工作区官网入口完整备份于 releases/experience-062-backup/index.html。官网源文件与 dist 不受影响。
- `android-shell/android/app/build.gradle`：0.6.2-release / versionCode 17，包名保持 cn.shiri.life。
- `android-shell/scripts/build-apk.ps1`：输出新版本文件名，继续强制验证既有签名。
- `tests/daily-journey.test.mjs`、`scripts/verify-experience-0.6.2.mjs`：真实计数与隔离浏览器回归。

验证：26 项针对性 Node 测试通过。浏览器隔离账号测试通过：320/390/430/1280 宽度、记录入口、登录门禁、离线恢复、备份恢复、规划/复盘、好友空状态；模拟云接口，不代表真实云端或真机验收。截图位于 releases/experience-0.6.2-*。

没有修改数据库、云函数、同步队列或授权规则；没有新增依赖、第三方 API 费用。升级前建议从设置导出备份，直接覆盖安装，不卸载旧版。

发布验证：Release 编译成功，包名 cn.shiri.life，versionCode 17，minSdk 24。apksigner 验证通过，证书 SHA-256 为 18b016b5e0c67c9931b1e76436180154e8d46792a343e4a3cb4b34b33b1681ad，与 0.6.1 一致。PowerShell 5 文件名解码导致第一次资源检查失败，改用 PowerShell 7 重新检查后 89 个资源路径和 SHA-256 全部一致。272 个文本/DEX 项密钥扫描未发现问题（仅公开 anon JWT）。

APK：releases/shiri-0.6.2-release.apk
SHA-256：240bd405cf9297ba12e35253aab7fea4f5b5a53963b11e7faca3e8fbaab08d3d
未执行真机覆盖安装和真实双账号回归；未上传蒲公英。
