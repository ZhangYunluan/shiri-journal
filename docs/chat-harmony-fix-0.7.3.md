# 拾日 0.7.3：聊天显示与 WebView 兼容性修复报告

## 架构与检查范围

基线为 0.7.2。应用采用 Java `BridgeActivity` + Capacitor 8.5.3 + Android System WebView，页面是 `index.html`、`life.css`、`life-app.mjs` 和原生 ES Modules。没有使用 Compose、Flutter 或原生 XML 页面来绘制聊天。
Android minSdk 24、compileSdk/targetSdk 36；AppCompat 1.7.1、Activity 1.11.0、WebKit 1.14.0。现有 SystemBars 插件负责系统栏与 IME Insets。未替换依赖或增加第二套原生 Insets Listener。
生活记录仍在账号隔离的 IndexedDB；原生照片队列仍用现有 SQLite；登录使用既有 CloudBase 会话与 AuthVault。聊天仅为页面内存状态，没有会话数据库或云端历史读取接口。

聊天链路：表单 → 已发送消息状态 → 既有 Access Token → `src/life-assistant.mjs` → `shiri-ai` HTTP → `{answer}` 校验 → 消息状态 → `src/views.mjs` 渲染。本次不修改云函数、协议或好友权限。

## 能确认的缺陷与证据

1. 旧 `life-app.mjs` 将唯一显示历史赋值为 `assistantHistory=[...].slice(-6)`，导致第四轮开始丢失早期消息。选中附带片刻时还会执行 `assistantHistory=[]`。这是状态主动删除，不是回复颜色问题。
2. 用户消息只在 `assistantBusy` 时临时渲染，失败后临时消息消失，正文回到输入框，没有明确的失败消息留在列表中。
3. 每次 `render()` 无条件设置 `scrollTop=scrollHeight`，包括网络回复、摘要选择和其他刷新。用户读旧消息时会被拉走；长回复直接跳到末尾。
4. 聊天高度仅用 `100dvh - 160/190px` 和 300/360px 最小高度估算；输入、选项在同一个受限滚动区。横屏 844×390 回归实际发现：父面板底部仍在视口内，但输入框落到选项区的滚动范围之外。
5. 传输直接调用 `AbortSignal.timeout`；移除该 API 的测试复现 TypeError。连续较长回复进入请求历史时，旧请求体超长测试复现“摘要过长”。
6. 原生 Activity 未声明 `windowSoftInputMode`；打包 CSS 只读 `env(safe-area-inset-*)`，没有使用当前 Capacitor SystemBars 在不同 WebView 上注入的 `--safe-area-inset-*`。这些属于跨内核的兼容性缺口；没有故障设备日志，不能据此断言就是该鸿蒙设备的唯一原因。

## 文件与修改原因

| 文件 | 修改与目的 |
| --- | --- |
| `src/chat-session.mjs`（新增） | 将显示历史和模型上下文分开；发送立即入列，成功追加回复，失败保留问题；用请求 ID 拒绝清空/退出账号后的旧回复；更换摘要只切换发送上下文 |
| `src/chat-layout.mjs`（新增） | 用 visualViewport/innerHeight、真实页面位置和可见导航测量聊天高度；保留阅读位置、输入焦点和选区；长回复先显示开头，不在阅读历史时强制滚动 |
| `life-app.mjs` | 接入上述两部分，移除三轮显示截断和无条件滚动；显式处理未同意、失败及迟到回复；增加批量模式/照片标题类，作为 :has 的备用布局依据 |
| `src/views.mjs` | 单独渲染真实已发送消息、失败标记和等待状态；选项区与输入区分离；说明本次内存会话的保存边界 |
| `src/life-assistant.mjs` | 使用 AbortController + 可清理计时器；清空时取消请求；区分超时、网络、格式异常；发送上下文按既有预算缩减，显示历史不删减 |
| `life.css` | vh/测量高度备用、去除硬性最小高度；消息列表与选项分别滚动、输入区始终保留；文字换行与低高度布局；批量工具栏及照片入口的 :has 备用类 |
| `index.html` | 视口增加 interactive-widget=resizes-content，支持时由内核据键盘调整布局，不支持时依靠备用测量 |
| `android-shell/android/app/src/main/AndroidManifest.xml` | 显式 adjustResize，支持 IME 可见区域变化 |
| `android-shell/scripts/prepare-web.mjs` | 原生打包 CSS 优先读取 Capacitor 注入的安全区变量，再回退 env；原生已消费 Insets 时变量为零，避免叠加安全区 |
| `tests/chat-session.test.mjs`、`tests/life-experience.test.mjs` | 多轮保留、失败保留、更换摘要、迟到回复、缺少 API、长上下文输入预算的单元测试 |
| `scripts/verify-chat-compat.mjs`（新增）、`scripts/verify-ux-phase2.mjs` | 多尺寸、长回复首尾、读旧消息、返回页面、草稿、模拟键盘、字号放大及原有页面回归 |
| Android 版本与构建脚本 | 0.7.3-release / versionCode 24；保持 cn.shiri.life 与原发布证书 |

## 已验证

- 70 项针对性自动化测试通过：聊天状态/渲染/传输，AI 配额和服务接口测试替身，照片审核保存、断网恢复、重复上传、删除/转私密、PostgreSQL 好友授权/撤销/屏蔽、备份及空间隔离等。
- 聊天隔离浏览器测试通过两轮：正常 CSS，以及移除 dvh/:has 规则的功能缺失模拟。聊天请求时另模拟没有 AbortSignal.timeout。
- 测试尺寸：320×568、360×480、390×844、844×390、1280×800。输入和消息均有可见区域，无横向溢出。
- visualViewport 高度模拟从 844 缩至 480 再恢复，输入未丢焦点，输入框未越出可见区域；模拟字号放大至 22px，无横向溢出。这不是系统级 IME 或系统字号设置的真机测试。
- 五轮及后续追问保留首轮消息；长回复可从开头滚至末尾；查看历史时到达的新回复不强制滚动；切换首页再返回保留消息、草稿及阅读位置。
- 服务返回 503 时保留发送的问题并显示明确错误；新摘要请求不带旧摘要上下文，但旧对话仍可阅读。截图与网络响应均为合成测试内容。
- 首页批量与单张保存、备份合并、照片入口、聊天授权、好友图库迟到请求与权限拒绝缓存清理等浏览器回归通过。没有真实模型调用及新增 API 费用。

## 鸿蒙边界与仍需验证

用户已说明“直接安装 APK”，尚无设备型号、HarmonyOS 完整版本、WebView 提供方/版本和故障日志。不能仅凭安装方式判断底层是否含兼容服务。
本包修复的是可运行 Android APK 的环境。通过兼容服务运行时仍需该服务上的实测；不具备 Android APK 运行能力的 HarmonyOS NEXT 原生环境不能靠 CSS 或此 APK 获得原生支持，本次没有迁移 ArkTS/HAP。
真实普通 Android、实际鸿蒙设备、系统字号/显示大小、刘海和三键/手势导航、第三方输入法、折叠屏、后台恢复及真实双账号云端回归仍未验收。当前聊天依旧只在本次打开期间保存：切换页面可恢复，重启/刷新不能恢复。本次没有新增聊天云存储，也没有为修复显示而清除用户数据。

设备复测需补充：型号、系统完整版本、WebView 版本、输入法名称、问题出现在发送前/等待中/返回后哪个步骤。只收集布局与状态码，不提供对话正文、照片、账号或 Token。

## 实现依据

- 本机 Capacitor `SystemBars.java` 的原生/网页 Insets 分支与 CSS 变量注入逻辑。
- [Android 官方：WebView 的窗口 Insets 与可见视口](https://developer.android.com/develop/ui/views/layout/webapps/understand-window-insets)：不同内核支持存在差异，重复 Padding 和 resize 时重建输入都可能引发异常。
- [华为官方：HarmonyOS 5 及以上应用下载安装介绍](https://consumer.huawei.com/cn/support/content/zh-cn16061787/)：部分应用经兼容服务提供，安装兼容性需以实际支持为准。

无需部署 SQL、云函数或更改现有接口配置。请用新版 APK 覆盖安装进行设备复测，先导出备份，勿卸载或清除应用数据。

## 发布核验与原生测试边界

Release APK 构建成功，包名 cn.shiri.life，versionCode 24，版本 0.7.3-release；已从合并后的 APK Manifest 确认 adjustResize（0x10）。93 个打包资源路径与 SHA-256 匹配；APK 文本及 DEX 扫描未发现服务端密钥，仅有公开 anon 凭证。
证书 SHA-256：18b016b5e0c67c9931b1e76436180154e8d46792a343e4a3cb4b34b33b1681ad，与原发布证书相同。
APK SHA-256：271e5c74cf7d592c580bd66876449594e52b7c2117f0f85005adc7210a09cb8e。
输出：releases/shiri-0.7.3-release.apk；示例截图：releases/chat-compat-0.7.3.png（合成对话，模拟大字号）。

Gradle testReleaseUnitTest 已编译 Java 测试，但 Gradle Test Executor 因 ClassNotFoundException: GradleWorkerMain 无法启动，不能报告此 Gradle 测试任务成功。直接以现有 JDK/JUnit 运行同一批编译产物中的 CollectionClockTest、PhotoScanRulesTest，4 项测试全部通过。这验证定时和照片日期/去重规则，不验证 Android WindowInsets、真实输入法或设备兼容性。没有为此迁移目录或修改构建依赖。
