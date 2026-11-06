当前公开快照的安装、数据边界和验证状态以 [README](../README.md)、[SETUP](SETUP.md) 和 [PUBLIC_VERIFICATION](PUBLIC_VERIFICATION.md) 为准。以下包含历史阶段设计与记录，不能据此推断你的环境已部署。

# 第二台电脑独立构建验收

只使用审阅过的源码、公开依赖和模型，不复制正式签名、不接入真实用户云环境。每人自行阅读接受 SDK 许可。

1. 从未来私有仓库克隆到 C:\dev\shiri。当前远程尚未创建。确认没有 .signing、真实.env、用户备份和旧build。
2. 安装Git、Node24、JDK21。在Android Studio → SDK Manager安装Platform36、Build Tools36.0.0、Platform Tools；记录工具版本。
3. 根目录 npm ci --ignore-scripts --no-audit --no-fund；再 npm --prefix android-shell ci --ignore-scripts --no-audit --no-fund。
4. npm run check:source、npm test。HTTP测试需本机回环端口；沙箱阻断要明确报告，不能算通过。
5. npm run setup:ai、npm run check:assets。也可复制已校验的models/vendor公开资源包，不复制其他目录。
6. 设置JAVA_HOME/ANDROID_HOME，执行 & ./android-shell/scripts/build-debug.ps1。准备开发资源、Capacitor同步、assembleDebug，不生成发布签名。
7. 检查 app-debug.apk 包名 cn.shiri.life.debug、名称拾日开发版、调试签名有效，不能覆盖 cn.shiri.life。
8. 安装后正式APP仍存在、记录不变；开发包无配置时停留登录页是预期。负责人配置独立测试环境后才能验收真实邮箱登录、双账号好友与同步。
9. npx playwright install chromium；执行 README 三项浏览器测试，不需要真实照片或付费模型。
10. 记录电脑/手机系统、工具版本、命令退出码、包名和合成截图，通过PR交付文字结果；APK仅本地，不发布蒲公英。

本机干净副本验证见 TEAM_BASELINE_VERIFICATION.md。不能代替第二台物理电脑、另一网络的首次下载和真实手机验收。
