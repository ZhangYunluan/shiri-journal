# shiri-ai 部署
1. CloudBase shiri-dev → 数据库 → PostgreSQL SQL 编辑器，执行随包 003_ai_quota.sql。仅新增 AI 用量表和 RPC，不改好友数据。没有部署该脚本时服务拒绝调用模型。
2. 云函数 → 新建 → HTTP 云函数 → 名称 shiri-ai，Node.js 20.19，上传 shiri-ai.zip（根目录有 index.js、package.json、scf_bootstrap）。启动命令 node index.js，监听 9000，超时建议 60 秒。若界面要求 bootstrap，使用随包文件并设可执行权限。
3. 函数配置 → 环境变量：按 .env.example 填写。SHIRI_AI_API_KEY 为 TokenHub 密钥；SHIRI_AI_SERVICE_KEY 为本环境服务端 service_role 凭证，仅用于 AI 额度 RPC，绝不填写到客户端。SHIRI_ENV_ID、BASE_URL、MODEL 按模板。不要把真实 .env 加入 ZIP/Git。
4. HTTP 访问服务/网关 → 新建路由 /shiri-ai，绑定该函数，POST 和 OPTIONS。CORS 允许 https://localhost，允许头 Authorization、Content-Type；如使用网页版，明确追加实际 HTTPS 网站 origin 到网关和 SHIRI_ALLOWED_ORIGINS，不能使用 *。网关负责 CORS（SHIRI_CORS_OWNER=gateway），函数继续验证登录。无需网关共享口令，不更改 /shiri-test、/shiri-media。
5. 无 Authorization 的 POST 应返回 401（未配置密钥时 503）。APK 登录后 → 规划 → AI 自我规划或问问拾日 → 勾选片刻、填写目标/问题、阅读并同意 → 发送。再次提问携带最近三轮对话；更改所选片刻将清除旧对话。未部署时显示服务错误，不伪造回答。

额度：每账号每天最多 10 次、保守预留最多 100000 token；每次输入按 UTF-8 字节+512 framing 估计上界，最多 14000，输出 max_tokens=1024，关闭 thinking。全实例共享 PostgreSQL 原子限额；全局累计预留 900000 后停止，不自动恢复/增加。失败和超时也保留额度，避免供应商已收费但本地退款造成超支。配额表只有 uid/日期/计数，无日记或对话。规划相同请求在当前客户端内存缓存10分钟；重启后缓存消失，服务端不保存私人回复。

100万体验额度是用户账户权益，不是模型永久免费承诺；其他应用消耗、到期、模型是否适用和超额计费需在 TokenHub 控制台确认。本地上限不反映账号其他用途消耗。不要自动开通后付费，建议设置供应商余额/额度告警。云函数、网关和数据库仍按现有套餐计费。

验收：两个账号分别登录，用户B不能借传uid使用A额度；无token/假token拒绝；连续调用到上限后429；同规划缓存重复不调用模型；更改授权选择清除旧对话；检查日志没有请求正文/密钥。管理员可在SQL查看用量，客户端无查询接口。本次交付没有访问真实Key、未部署、未消耗模型Token；需要控制台部署和真机验收。
