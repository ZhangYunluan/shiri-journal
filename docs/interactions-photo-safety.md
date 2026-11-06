# 片刻互动与审核安全（2026-10-29）

范围：复用 0.8.0 的私密评论、认证、审核与原生采集；不部署线上服务。

- 评论：独立 dialog 底部面板；消息区域滚动、输入固定底部，visualViewport 跟随键盘，避免整个好友页面重绘；复用 shiri_comments。
- 点赞：新增 005 独立 shiri_interactions RPC，显式设置 liked true/false，唯一约束和服务端权限/限流。统计仅返回当前用户可见评论数，不泄露其他私密线程。
- 地点：本地 JPEG/PNG/WebP EXIF GPS + 原生原图 EXIF；仅在主动请求时申请媒体位置权限，无实时定位。坐标不进入现有云端投影。
- 原图：首次审核选中照片，默认只排除；可选系统删除。原生以队列关联和媒体版本/生成代数核验，Android 11+ createDeleteRequest；旧系统提示从系统相册删除，不做静默降级。成功逐项核验后再排除，取消/失败保留审核。
- 不可信/历史无原图关联的导入仍可排除，不猜测文件路径。不能删除其他已保存记录关联的资产。

验证顺序：评论 UI 回归 → 互动 SQL 权限/幂等 → EXIF 合成数据/投影 → 审核纯状态与原生单元测试 → 浏览器与 Release 构建/签名。真实手机系统窗口及覆盖升级需实机复验。

## 实际验证
- 47 项 Node / 本地 PGlite 测试通过，包含旧评论和好友授权、撤销、离线同步、备份验证、账号空间、新点赞幂等/限流/权限、EXIF 和审核删除状态。
- 4 组浏览器合成回归通过：底部评论面板与赞/取消赞；默认排除/取消/部分失败；好友图库权限和请求清理；批量保存与备份。视口覆盖 320/390/1280，键盘缩小视口为模拟，不等于真机 IME。
- 原生 Java 编译通过；5 项纯逻辑 JUnit 测试通过（CollectionClock、PhotoScanRules、PhotoSourceRules）。Gradle testReleaseUnitTest 启动器因中文缓存路径无法加载 GradleWorkerMain；改用现有 JUnit 直接运行同一批编译结果通过，没有把失败隐藏成成功。
- Release 构建成功，沿用 cn.shiri.life，0.8.1-release / 27。发布前复核打包资源、原证书和 APK 静态扫描。新接口与 SQL 未部署，未调用真实用户数据或付费 AI。
- 未验证：Android/HarmonyOS 真机键盘、真实系统相册删除/取消、旧版覆盖安装数据保留、生产 A/B/C 互动及撤权。不能据合成测试宣称这些已经验收。

官方接口依据：Android [MediaStore 删除与 EXIF 权限](https://developer.android.com/training/data-storage/shared/media)、[createDeleteRequest](https://developer.android.com/reference/android/provider/MediaStore)。
