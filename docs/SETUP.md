# 完整工程安装与配置

## 先跑无云演示

Node.js 24 LTS，npm ci --ignore-scripts --no-audit --no-fund，然后 npm run demo。无需 Android SDK、模型和云账号。

## 修改 Web 业务

先读 AGENTS.md。执行 npm --prefix android-shell ci --ignore-scripts --no-audit --no-fund，再 npm run setup:ai、npm run check:assets。模型与运行库约 235 MiB，使用网络下载到被 Git 忽略的目录，公开源访问失败需检查网络。不能只因校验失败就改校验表。

npm run dev 构建隔离调试页面，默认地址 http://127.0.0.1:4177/ 。默认无云配置，登录页显示未配置是正常状态；不要绕过正式登录门槛。离线演示请用 npm run demo。

## 独立 CloudBase

创建你自己的测试环境，不复用内测用户所在环境。CloudBase 的价格、邮件能力、配额与可用区域以控制台为准，项目不会替你开通或部署服务。

1. 参考 config/dev-cloud.example.json，把公开配置复制为 .local/dev-cloud.json。填写环境 ID、地区、该环境 anon Publishable Key，以及你实际部署的 testUrl/mediaUrl/aiUrl。
2. 在 CloudBase 认证控制台按官方指南开启邮箱验证码注册登录，配置允许的客户端来源。
3. 阅读 docs/cloudbase-social-deployment.md 与后续功能部署说明；在新空环境按依赖顺序审阅 SQL。已有环境先核对已执行迁移，不能重复覆盖。
4. 将 cloudbase/functions/ 对应函数部署至自己的 HTTPS 网关。严格保留验证 UID、RLS、私有照片桶、好友授权和限频检查。
5. 服务端密钥只在云函数环境变量中配置。参考每个函数的 .env.example，不将真实服务端密钥写进本机客户端配置。
6. 用两个受控账号验证注册、好友、保存同步、删除与撤销权限，以及第三方拒绝访问。Hello World 只能证明测试网关连通。

调试配置会在构建产物中生效，不需要提交真实环境绑定。公开源码中的 check:public 要求默认配置为空。

## Android 调试构建

需要 JDK 21、Android SDK Platform 36、Build Tools 36.0.0、Platform Tools；Gradle Wrapper 下载 8.14.3。先通过 Android Studio 接受所需 SDK 许可，设置 JAVA_HOME 与 ANDROID_HOME 为本机真实目录。完成上述依赖与模型准备后执行以下命令。

~~~powershell
& ./android-shell/scripts/build-debug.ps1
~~~

输出 android-shell/android/app/build/outputs/apk/debug/app-debug.apk，包名 cn.shiri.life.debug。独立于正式版，不能用它覆盖正式版。macOS/Linux 可设置 SHIRI_BUILD_PROFILE=debug 后运行 npm --prefix android-shell run sync，再进入 android-shell/android 执行 ./gradlew assembleDebug；该路径需要对应平台实际验证。

正式包 cn.shiri.life 的发布需要原签名与负责人审阅。私有发布脚本依赖维护者本机 .tool-cache 与 .signing，公共工程的默认构建入口是上面的调试脚本。Fork 发布者应使用自己的应用身份、签名和云环境。

## iOS 与鸿蒙

iOS 见 IOS_SETUP.md，需要 macOS/Xcode 和相应签名条件；当前没有可安装 IPA。HarmonyOS NEXT 见 harmony-native-assessment.md，目前没有 HAP。Android 合成测试不能替代这两个平台验收。

## 测试

先 npm run check:source、npm run check:public、npm test。浏览器测试需 npx playwright install chromium；使用 npm run test:browser:demo 或原有 chat/friends/record 脚本。测试使用合成账号与响应，不调用付费 AI。

## 配置清单

公开默认值位于 src/cloudbase-config.mjs、cloudbase-social-config.mjs、life-assistant.mjs。调试构建使用 .local/dev-cloud.json 自动替换。生产客户端如需配置，先审阅 scripts/configure-cloudbase.mjs，它只配置认证和认证 CSP；媒体/AI 路由与对应 HTTPS CSP 还需发布者按实际环境审阅，不要假设一条命令完成全部生产接入。
