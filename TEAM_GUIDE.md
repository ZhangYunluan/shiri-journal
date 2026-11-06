# 初学者团队协作

仓库是共享代码档案，分支是独立草稿，Commit 是本机存档，Push 才上传到 GitHub。代码上传、云服务部署与 APK 发布是三个独立动作。

## 第一次加入

公开仓库人人可阅读。负责人在 Settings → Collaborators → Add people 邀请四位队员的 GitHub 用户名，队员从各自通知接受邀请。每人使用自己的账号与 AI 工具。

GitHub Desktop → File → Clone repository → 选择公开仓库 → 选短英文目录，例如 C:\dev\shiri → Clone。在 Codex 或其他 AI 工具中打开这个文件夹，先让它阅读 AGENTS.md、README.md、docs/SETUP.md，运行本地演示和测试。

## 每次修改

1. 切到 main，点 Fetch origin；出现 Pull origin 时点它。显示 Fetch origin 说明当前没有待拉取更新。
2. Current branch → New branch，新建 codex/姓名-任务名。
3. 告诉 AI 具体页面、允许改的文件和验收条件，要求保留数据与权限，先测试再交付。
4. GitHub Desktop 的 Changes 检查文件，只勾本次任务。填写 Summary，Commit to 当前分支。
5. 点 Publish branch 或 Push origin，再点 Preview/Create Pull Request，base 选 main。
6. PR 填写变化、测试和未验证项。由另一人审阅，负责人确认后 Merge。
7. 其他队员 Fetch/Pull 后开始下一个任务。

出现 There are no changes 说明分支目前没有领先 main 的提交，先检查 AI 修改在哪个目录、是否真的 Commit。No local changes 只说明本机没有未提交改动，不代表代码已合并到 main。

## 分工

可分别负责记录体验、复盘规则、好友展示、测试与官网。共同大文件修改前在 Issue 里声明范围，避免同时修改同一区域。认证、数据库、权限与发布签名由负责人额外审阅。

## 安全

每个人创建独立测试配置，真实 API Key 和正式签名不通过 GitHub 共享。遇到冲突请 AI 保留双方功能并测试，不要强推或直接覆盖队友代码。提交日志和截图只用合成内容。

公开候选版的首次发布步骤见 PUBLICATION.md。原私有仓库可继续保留备份，之后确定一个公开主仓库承接新代码，避免长期两套源代码失去同步。
