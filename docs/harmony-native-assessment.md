# 拾日原生鸿蒙适配评估

检查日期：2026-10-29。本阶段仅完成代码与工具环境检查、官方文档核对，未创建原生鸿蒙工程，未编译 HAP，未完成鸿蒙真机验收。

## 环境与结论

当前为 Windows。PATH 未找到 hdc、hvigor、hvigorw、ohpm；常见安装目录未发现 DevEco Studio 或 HarmonyOS SDK。检查时 C 盘约余 50 GiB、D 盘约余 59 GiB；华为工具说明建议至少 100 GB 磁盘空间。上述检查不能排除工具被安装在未列入 PATH 的其他目录，但当前没有可直接使用的鸿蒙构建链与测试设备。

能够直接安装 APK 的旧鸿蒙设备沿用 Android 修复，并分别复验键盘、安全区和相册权限；HarmonyOS NEXT 原生环境需要独立工程与签名，不能把 APK 改后缀或转换为 HAP。按本次“环境满足后才搭建原型”的要求，暂不创建未经编译的空壳工程。

## 最小实现路径

采用 ArkTS / ArkUI 容器承载 ArkWeb，复用当前 HTML、CSS、JavaScript、IndexedDB 和 CloudBase 用户接口。新增能力集中在平台桥接，不重写好友、同步或审核业务。

1. **启动拾日**：用私有 HTTPS 虚拟来源及 `onInterceptRequest` 白名单映射打包资源。验证脚本、图片和离线启动；不直接假设 `file://` 的 ES modules、fetch 可以正常工作。
2. **登录现有账号**：沿用用户 Access Token；为会话实现鸿蒙安全存储。实测登录、刷新、退出，以及 Auth/RPC/媒体接口的 CORS。新来源仅经负责人审阅后精确加入白名单，不使用 `*` 或关闭校验。
3. **显示个人记录**：验证 IndexedDB Blob、重启恢复、账号空间隔离和备份导入。其他设备上的私人本地记录不会仅因同账号登录自动迁移。
4. **原生选择照片**：使用 `photoAccessHelper.PhotoViewPicker`，首原型只选一张照片；只读用户所选 URI，保存应用副本后接入现有审核流程。先不申请全库受限权限，不暴露任意路径读取桥接。
5. **保存并验证授权同步**：保存先入本地，审核前不得上传。两账号检验好友可见、陌生人拒绝、撤销/屏蔽后拒绝、断网重试不重复；未通过这些检查不得称原型完成。

## 验收门槛与限制

每一步都必须在 DevEco 构建及模拟器/真机上有实际结果。Chromium 测试不能替代 ArkWeb；需重点检查 Web Crypto、Blob URL、照片解码、文件选择、ZIP 导入导出、软键盘及进程重启持久化。桥接只向可信本地页面开放，并限制方法、文件范围与大小。

系统选择器只授予选中资源访问能力，不等于全相册扫描许可。EXIF 位置可能被系统移除；首原型不申请媒体位置或实时定位权限。不承诺定点后台采集。未经用户进一步授权，不新增云服务、付费接口、数据库或放宽现有照片访问规则。

负责人下一步准备：DevEco Studio、匹配 SDK、足够磁盘空间、华为开发者账号和调试签名，以及可用于测试的原生鸿蒙手机；签名与账号秘密不进入 Git。提供工具安装位置后再建立工程、执行以上五步。当前无可交付 HAP，也不能保证全部原生能力已兼容。

## 官方核对资料

- [DevEco Studio 环境要求](https://developer.huawei.com/consumer/cn/deveco-studio)
- [ArkWeb 本地资源与跨域加载](https://developer.huawei.com/consumer/cn/doc/harmonyos-guides/web-page-loading)
- [OpenHarmony 官方媒体选择器文档](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/media/medialibrary/photoAccessHelper-photoviewpicker.md)
- [OpenHarmony 官方权限组与受限权限](https://github.com/openharmony/docs/blob/master/zh-cn/application-dev/security/AccessToken/app-permission-group-list.md)
- [CloudBase 跨域校验与身份认证](https://docs.cloudbase.net/service/cors)

OpenHarmony 文档用于核对接口原则；具体 HarmonyOS SDK 版本、应用权限资格和设备行为仍以实际工程编译及华为设备验证为准。
