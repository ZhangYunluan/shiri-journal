# 拾日 Android
正式配置为 cn.shiri.life，0.8.3-release，versionCode29。Capacitor8.5.3 + Java + WebView，JDK21、SDK36、Build Tools36.0.0，Node最低22，建议24。APK版本以android/app/build.gradle为准。

从根 README 开始安装两个目录依赖、准备公开模型，设置 JAVA_HOME/ANDROID_HOME 后执行 scripts/build-debug.ps1。
开发包 cn.shiri.life.debug，“拾日开发版”，默认不连接真实用户云环境，不需要 .signing。联调配置见 ../docs/ENVIRONMENTS.md。

正式发布仅负责人操作 scripts/build-apk.ps1；必须沿用现有 .signing/shiri-release.jks 和 signing.properties。禁止运行 create-signing-key.mjs 生成新身份来代替遗失签名。
签名只做受控备份，不进入 Git，不发群聊。未经授权不发布 APK、不改正式版本/包名/云环境。

资源准备写入 www/ 与 Android 生成资源。Gradle 检查资源 profile，拒绝 debug/release 混用。业务、数据和隐私规则保持原有实现。
