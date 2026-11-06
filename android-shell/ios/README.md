# iOS 原生适配源码

由现有 Capacitor CLI 8.5.3 的 SPM 模板生成，平台依赖锁定 8.5.3。Windows 只完成工程生成、Web 资源同步和结构检查；尚未执行 Xcode / Swift 编译、签名、模拟器或真机验证，没有可安装 IPA。

需要 macOS + Xcode 26 或以上。Shiri 当前工程目标系统为 iOS 17.4+（Web 层使用的 API 需要该下限；不是 Capacitor 自身的最低要求）。在完整项目的 android-shell 目录准备资源并同步 iOS，再打开 `ios/App/App.xcodeproj`。首次 SPM 解析需要访问官方 GitHub 软件包。

## 原生桥接

- `AuthVault`：`get()` → `{value: string|null}`；`set({value})`；`clear()`。只在本设备 Keychain 保存最多 16 KiB 的现有 CloudBase 会话。首次安装标记只存在 UserDefaults，重新安装后不复活旧 Keychain 登录。登录刷新、账号身份及业务权限仍由现有 Web/CloudBase 实现。
- `ShiriPhotoPicker.pick({limit: 50})`：用户主动打开 PHPicker，仅返回所选图片。返回 `{selectionId, photos:[{path,name,type,taken?,converted}], failedCount, cancelled}`。取消时没有 selectionId。
- `taken` 仅在已具备 PhotoKit 授权、且所选资源可读取时返回拍摄日期毫秒值；缺失时由现有导入日期及用户审核决定，不能用当前时间伪装拍摄时间。
- JPEG/PNG/WebP/GIF 保留所选本地文件副本。HEIC/HEIF 以最长边 4096 像素转换为 JPEG，返回 `converted: true`，转换副本不保留 EXIF GPS。单图最多 20 MiB，最多 50 张、每批副本总量 200 MiB；失败数量必须由前端明确提示。
- `cleanup({selectionId})` 仅删除插件自己创建且本次运行登记的缓存批次，不接受任意路径，不删除系统相册原图。进程退出留下的副本属于系统可回收的 Caches，原图不受影响。
- 没有 Android MediaStore 原图删除、系统后台定时采集或全相册扫描功能；不能把这些方法伪装为空成功实现。

主入口 `SceneDelegate` 和 Storyboard 都使用 `ShiriBridgeViewController`，在 `capacitorDidLoad` 中注册两个插件。未请求麦克风、实时定位、全库照片访问权限。系统选择器对仅授权部分照片的处理仍需真实 iPhone 验证。

## 隐私声明与后续验证

`PrivacyInfo.xcprivacy` 声明 Filesystem/应用缓存文件元数据用途 C617.1，以及应用自有首次安装标记用途 CA92.1；未声明跟踪。上架前仍需根据实际 CloudBase 邮箱、用户主动分享照片、AI 授权摘要等完成 App Store 隐私问卷/数据收集说明，不能把这个 API 用途文件当作“完全不联网”的证明。

仍待验证：Swift 编译、Keychain 锁屏/重装行为、PHPicker 取消/限权/iCloud 下载失败/HEIC、大批导入内存、首次登录与 CloudBase Origin 白名单、IndexedDB 重启持久化、备份恢复及分享。模板图标也需负责人在正式签名前核对。

官方依据：
- https://capacitorjs.com/docs/ios/custom-code
- https://capacitorjs.com/docs/getting-started/environment-setup
- https://capacitorjs.com/docs/apis/filesystem
- https://developer.apple.com/documentation/photokit/selecting-photos-and-videos-in-ios
