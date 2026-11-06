# Android 采集控制修复

## 根因与修改范围

- 旧手动扫描依赖自动开关及定时任务所属空间；现复用同一 MediaStore 查询、去重及暂存队列，手动范围独立选择今天或最近七天，不改自动扫描游标。
- 扫描与暂停原先共用原生单线程队列，忙时前端还会静默忽略点击。现设置/状态使用独立控制队列，检查 SharedPreferences 提交和 WorkManager 操作结果，暂停保留权限、时间及记录。
- 原刷新/导入会隐式扫描；现仅启动明确请求的扫描。旧状态响应通过请求序号失效，避免覆盖暂停结果。原生返回前台及网页可见性变化均重新读取真实权限。
- 已获全部权限时调整授权进入应用设置；Android 14+ 部分权限可重新选择；永久拒绝进入设置。手动授权不会顺带开启定时采集。
- 页面只突出定时开关与立即采集；技术说明、队列历史统计与继续导入放入折叠区。分别显示本次扫描发现/已存在，以及实际导入待审核/失败计数；明确导入含此前暂存照片。容量续扫不重复累计已暂存照片。后台失败不会被空导入结果覆盖成成功。

## 文件

- `src/auto-collect.mjs`、`collector-state.mjs`：控制、手动面板、进度、导入及结果合并。
- `src/photo-onboarding.mjs`：已有权限不重复请求；复用原启用流程。
- `PhotoCollector.java`、`PhotoCollectorPlugin.java`、`CollectionControls.java`：任务持久化与核验、独立手动扫描、按空间记录结果/错误。
- `android-shell/native-entry.mjs`：应用返回前台事件。
- `index.html`、`life.css`、`src/dialog-layout.mjs`、`sw.js`：采集弹窗、公共适配及离线资源。
- `tests/collector-controls.test.mjs`、`CollectionControlsTest.java`、`scripts/verify-collector-controls.mjs`：针对性回归。

## 验证与限制

Node 针对性测试 25 项、原生纯规则 JUnit 7 项通过。浏览器合成桥接测试覆盖暂停持久化及旧响应竞态、暂停中手动采集、去重、真实失败反馈、权限拒绝/部分/全部与设置返回、时间保留、扫描中暂停，以及 320/360/393/412 像素布局。原首次授权引导浏览器回归通过。

合成测试不代表系统 MediaStore、Android 授权窗口、WorkManager 或真机覆盖安装验收。需要 Android 12、13、14+ 手机复测：暂停重启仍暂停、定时恢复不重复建任务、部分授权增减范围、真实照片扫描及锁屏省电延迟。没有保证绝对准点。

仅新增向后兼容的本机偏好项，不需要 SQL、云函数部署或新 Android 权限；不修改 IndexedDB/照片队列表结构。扫描只进入本地待审核，未加入保存或上传调用。包名、正式版本号与签名配置保持原样，交付同版本补丁 APK；请覆盖安装，勿卸载或清空数据。
