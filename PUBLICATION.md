# 第一次公开发布，照着做

## 先确认两件事

本目录是独立的 0.8.3 公开候选快照，云配置默认为空，旧私有 Git 历史保留在原工程。这里准备了 MIT 许可，允许商业使用和闭源衍生。请你与已有贡献者确认同意，并核实 logo、图标和素材权利后再公开。第三方许可继续适用。

此前曾暴露的管理员凭证需要资源持有人确认已撤销。新快照不带旧凭证，无法让旧凭证自行失效。

## 一，添加准备好的本地仓库

优先使用交付目录中的 shiri-journal 文件夹，它包含准备好的新 Git 历史。GitHub Desktop → File → Add local repository → Choose → 选择 shiri-journal → Add repository。当前分支为 main，检查 History 能看到一条公开快照提交，Changes 应为空。

如果你是在别的电脑使用源码 ZIP，先解压，确认根目录有 README.md、package.json、LICENSE。ZIP 不含 .git，可在该目录终端执行 git init -b main，然后让 Codex 按 AGENTS.md 精确检查并提交文件，勿复制旧私有工程的 .git。

## 二，发布到新仓库

在 GitHub Desktop 点击 Publish repository。名称建议 shiri-journal，Description 填“记录生活，回看自己。A personal life journal with photo review, reflections and private friend sharing.”。确认要公开后，取消 Keep this code private，再点 Publish repository。

如果该名称已被占用，选择你自己账号下未使用的新名称。这个流程创建新仓库，无需把旧私有 shiri-app 直接改为 Public。若你已在网页创建新空仓库，请复制它的 HTTPS URL，用 GitHub Desktop 的 Repository → Repository settings → Remote 填入，再 Push；不要在空仓库额外创建 README/License，以免产生不同历史。

上传完成后点 View on GitHub，确认 README 图片正常、main 文件完整、Actions 检查成功。GitHub 的扫描与测试结果需要实际运行后查看。

## 三，完善项目展示

在仓库首页右侧 About 齿轮填入上面的描述。Topics 可用 android、capacitor、javascript、journaling、local-first、indexeddb、privacy。不要编造下载量、评价、认证或 AI 能力。

README 已有截图、演示录屏、快速运行和贡献说明。About 的 Website 先留空；演示真正部署且访问成功后再填写实际地址。Settings → Security 中检查可用的 Secret scanning、Dependabot alerts 和 Private vulnerability reporting，开启适用项目。它们不替代人工检查。

## 四，可选发布在线演示

按 docs/DEMO.md 手动启用 Pages，再运行 Publish demo 工作流；也可把附带的 shiri-demo-0.8.3.zip 内部内容上传自己的静态托管。部署成功后把真实地址放入 About。源码包不能作为静态站根目录直接上传。

## 五，发布 0.8.3 内测 APK

仓库右侧 Releases → Create a new release，Tag 输入 v0.8.3，选择 main 为 Target，Title 填“拾日 0.8.3 · 开源内测”。正文复制 docs/RELEASE_NOTES_0.8.3.md。勾选 This is a pre-release。

附件选择单独交付的 release-assets 中 APK、SHA256SUMS.txt 和 APK_INFO.md。APK 不放入 Git 代码列表。发布前读 APK_INFO.md，确认你愿意让公开内测用户访问现有服务，并已完成所需运营与隐私准备。这个 APK 是既有运营版，仍连接原 CloudBase；公共源码默认空配置与演示没有这些连接。若暂不开放服务，先只发布源码和演示，后续补 APK。

确认文件、说明与版本后点 Publish release。本步骤是实际公开分发，由你最终决定。

## 六，邀请队友与获取反馈

按 TEAM_GUIDE.md 邀请四人；Issues 建 3–5 个真实且边界明确的小任务，例如可访问性、跨机型复验、文档与规则测试，标注 good first issue 或 help wanted。标签需要你在 Issues → Labels 实际创建。以可用演示和真实改进记录介绍项目，欢迎用户试用和反馈，不承诺 Star 数。

可复制介绍文案见 docs/LAUNCH_COPY.md。发布后确定公开主仓库为后续开发入口，再让队友从它克隆。原私有工程、签名备份与真实云配置继续由负责人独立保管。

## 发布后核对

- main 是公开审查过的新快照，未上传旧 .git 或私人备份。
- README 图片、录屏、安装说明与许可证能打开。
- Actions 检查真实通过，演示地址可用后才公开填写。
- APK 文件哈希与交付清单一致，内测和云端配置限制已说明。
- 贡献者同意许可，私密漏洞渠道可用，Issues 可提交。

官方操作参考核对于 2026-11-06。

- [创建仓库](https://docs.github.com/en/repositories/creating-and-managing-repositories/creating-a-new-repository)
- [GitHub Pages](https://docs.github.com/en/pages/quickstart)
- [大文件与 Releases](https://docs.github.com/en/repositories/working-with-files/managing-large-files/about-large-files-on-github)
