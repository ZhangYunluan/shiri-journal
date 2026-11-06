# iOS 工程准备与实机验收

## 本次实际完成
Windows 上通过官方 CLI 生成 `android-shell/ios/App/App.xcodeproj`，锁定 `@capacitor/ios=8.5.3`，复用现有 Web、CloudBase 协议与 App/Filesystem/Share 插件，无数据库迁移。
新增 Keychain 会话插件、PHPicker 主动选图、受限缓存清理；Android MediaStore/后台采集/原图删除不会被 iOS 调用。已有审核、批量排除、保存、复盘、好友、AI 界面继续共用业务代码。
仅完成源码/资源同步与结构验证；**没有执行 Swift 编译、模拟器或 iPhone 验收，没有 IPA**。

## 需要准备
- 可运行 Xcode 26+ 的 Mac，Xcode 及 iOS Simulator；Node 22+（建议24）。[Capacitor 官方要求](https://capacitorjs.com/docs/getting-started/environment-setup)
- 真机 iPhone / iPad。本应用暂定 **iOS 17.4+**，因为现有 Web 代码使用 `AbortSignal.any` 等 API；不是 Capacitor 自身最低版本。[WebKit 17.4](https://webkit.org/blog/15063/webkit-features-in-safari-17-4/)
- Apple ID 用于开发签名；TestFlight/App Store 分发还需 Apple Developer Program、可用 Bundle ID、Team 与签名资格。不要把证书密码发进聊天或提交 Git。
- 官方模板图标与启动图尚需在正式签名前核对替换；本次未做品牌重设计。

## Mac 操作
1. 下载完整源码（不能只复制 ios 文件夹，SPM 插件和 Web 构建使用相对路径）。项目放短路径，例如 `~/dev/shiri`。
2. 根目录执行 `npm ci --ignore-scripts --no-audit --no-fund`；然后 `npm --prefix android-shell ci --ignore-scripts --no-audit --no-fund`。
3. `npm run setup:ai`、`npm run check:assets` 准备现有离线资源（约235 MiB），或者复制已校验的 models/、vendor/；不要复制签名、用户备份或旧 node_modules。
4. `cd android-shell` → `npm run sync:ios`。默认打包隔离调试配置，没有生产登录地址；开发云配置仍按 `docs/ENVIRONMENTS.md`。Xcode 增加资源配置校验，不允许把 Release 云配置误打成 Debug 包，反之亦然。
5. 负责人需要用原内测公开配置联调时，明确执行 `npm run sync:ios -- --release`；此命令只准备本地资源，不会部署任何云服务。对应 Xcode Release 配置。
6. Xcode → Open → `ios/App/App.xcodeproj`。等待 SPM 解析官方依赖。Targets → App → Signing & Capabilities 选择自己的 Team；本项目未填写任何 Team 或私钥。
7. Debug 包标识 `cn.shiri.life.debug`，Release 包标识 `cn.shiri.life`；不要改 Android 包名。选择对应 Simulator 或 iPhone，点击 Run。负责人首次运行如遇 Swift 编译错误应修复后重新测试，不能跳过编译当作通过。
8. 无签名模拟器构建命令（**须在 Mac 执行，本机未执行**）：
   `xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug -sdk iphonesimulator -destination 'generic/platform=iOS Simulator' CODE_SIGNING_ALLOWED=NO build`

## 后端连通性：不能只凭 OPTIONS 宣称可用
2026-10-29 从本机对现有接口发送不含身份/内容的 OPTIONS，Origin 为 `capacitor://localhost`：Auth、RPC、media 都返回204且允许该来源；AI返回404且未给允许来源。没有发送邮件、调用付费模型、上传照片或写数据库。
现有函数源码默认来源中部分只有 `https://localhost`，网关的204可能不代表函数实际响应也允许；需要负责人核对 `shiri-media` / `shiri-ai` 环境变量 `SHIRI_ALLOWED_ORIGINS` 的实际配置名称（见各函数 .env.example），保留已有来源并准确加入 `capacitor://localhost`，不能改成通配符。
核对 HTTP 网关的实际 `/shiri-ai` 路由与函数绑定；本次不修改/部署线上环境。完成后必须测试真正登录、刷新、照片读写和401/403；iOS CORS 不替代现有身份与好友授权校验。可用 `node scripts/check-platform-cors.mjs` 重做只读预检。

## 当前边界与权限
- PHPicker 只提供用户主动选中的照片，不需要全相册读取授权；不伪造全部/有限授权成功。首次最多50张，每张20MiB，单批副本200MiB。iCloud不可用、格式或额度失败会显示失败数；HEIC转换会明确提示。[Apple 选择器](https://developer.apple.com/documentation/photokit/selecting-photos-and-videos-in-ios)
- 未申请全库权限的首次安装通常拿不到 PHAsset 创建日期：有合法 PhotoKit 数据才使用真实拍摄时间，否则沿用导入日期，让用户审核。显式改过导入日期时优先用户值。未审核不上传。
- 未来自动发现需独立、明确的 PhotoKit 授权，分别处理 authorized/limited/denied/restricted 与更改有限选择。本轮只研究、不实现全库发现；系统不保证22:00后台运行。[有限相册](https://developer.apple.com/documentation/photokit/delivering-an-enhanced-privacy-experience-in-your-photos-app)、[后台调度](https://developer.apple.com/documentation/backgroundtasks/bgtaskrequest/earliestbegindate)
- iOS 本轮不支持系统原图删除、Android自动采集、主动摄像或录音；不额外申请麦克风、实时/后台位置、全文件权限。保留所选文件自带GPS时仍仅本地；HEIC副本不保留GPS。
- 现有 IndexedDB 和账号空间可复用，Android 与 iOS 本地原始日记不会仅靠登录自动互通。使用原 ZIP 备份/恢复（200MiB上限）迁移；认证凭据不进备份。iOS存储回收、重启持久化与大文件分享未实机验证，不能宣称备份体验完全相同。
- 离线OCR/CLIP可能受WKWebView内存/WASM能力影响，需真实照片和低内存设备测试；识别失败仍可手工分类保存。AI404时保留规则复盘，不制造回复。

## 必须做的实机验收
先备份：登录/重启恢复/过期刷新/断网记录；仅选定照片/取消/HEIC/iCloud失败/批量；日期正确与审核后保存；备份恢复前后数量与图片；键盘、刘海、横屏、大字体；A(iOS)与B(Android)交叉好友查看，第三方拒绝、撤销/删除/屏蔽后拒绝；AI错误可见、不影响本地记录。以上未以Chromium测试替代。
