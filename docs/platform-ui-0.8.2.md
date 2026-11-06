# 0.8.2 Android 弹窗修复

## 范围与证据
- 基于 19dce90 / 0.8.1，先保留 .local/before-platforms.bundle；不改变数据库、账号或好友授权。
- 日期 value 在合成复现中始终为完整的 2026-10-09，未发现格式化截断。旧编辑表单在 320px 下日期框仅约 120px；150% 字体出现横向溢出。
- 原 dialog 整体 overflow:auto，表单双列没有按控件最小宽度换行。长内容会带走顶部关闭与底部保存。没有普通弹窗的 visualViewport 键盘适配。
- 导入弹窗的具体原生 WebView 截字没有完全复现；修复共享宽度约束，并保留原生日期控件，仍需报告机型复验，不宣称已解决所有厂商行为。

## 最小修复
- life.css：字段宽度、单列窄屏表单、日期控件尺寸；只给 editor/import/confirm 三种普通弹窗独立滚动内容，头尾保持可用。保留评论与照片查看器自己的布局。
- src/dialog-layout.mjs / life-app.mjs：按可见视口调整弹窗高度与位置，保留焦点，只滚动被遮挡的当前字段；不重复添加原生已经消费的安全区域。
- sw.js 更新缓存；Android 0.8.2-release / code28，原包名与签名配置不变。
- scripts/verify-dialog-compat.mjs：真实页面+合成账号，四种宽度、两种 DPR、150% 字体、模拟键盘与本地保存回归。所有外部请求模拟。

## 验证边界
针对性 Node 测试 29 项通过；评论浏览器回归通过。布局测试结果见交付说明。没有本次反馈截图对应的真机或设备日志；Chromium/模拟 viewport 不等于 Android IME、iOS 或 HarmonyOS 实测。
不需要 SQL、云函数部署或新增 Android 权限。覆盖安装仍需在备份后用真实设备验证旧数据，不卸载正式应用。
