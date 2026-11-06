当前公开快照的安装、数据边界和验证状态以 [README](../README.md)、[SETUP](SETUP.md) 和 [PUBLIC_VERIFICATION](PUBLIC_VERIFICATION.md) 为准。以下包含历史阶段设计与记录，不能据此推断你的环境已部署。

# 本地数据结构 v1

数据库：`shiri-life-v1`，IndexedDB schema version 1。统一以 `id` 为 keyPath。每次写入在 transaction.oncomplete 后提示成功；事务失败不更新界面内存。内容存储在 IndexedDB，静态应用文件/可选模型运行缓存由 Cache Storage 管理，不包含照片或日志。

| object store | 字段 | 索引 |
|---|---|---|
| records | id, date(YYYY-MM-DD 本地日历), time(HH:mm), title, note, categoryId, tags[], location, mood(1–5 或 null), duration(分钟/null), amount(元/null), weight(kg/null), reflection(highlight/regret/空), assetId/null, status(review/confirmed), source(manual/photo/legacy), analysis{method,labels,ocr}, createdAt, updatedAt | date, categoryId, assetId |
| assets | id(文件 SHA-256), blob(原图), thumbnail(缩略图 Blob), name, type, size, lastModified | 无 |
| categories | id, name, color, icon, builtIn | 无 |
| reports | id(period:rangeStart:style), period(day/week/month/year), start, end, style(brief/deep), text(Markdown), generatedAt, updatedAt, recordSignature | 无 |
| plans | id, title, categoryId, date, done, order, reason, source(manual/rule), horizon(week/month), createdAt | date |
| learning | id(record id), categoryId, text, labels[], updatedAt | categoryId |
| settings | id(main), reminderEnabled, reminderTime, lastReminderDate, reportStyle, autoReport, aiEnabled, ocrEnabled, theme | 无 |

示例记录：

```json
{
  "id": "r-uuid", "date": "2026-10-04", "time": "18:30",
  "title": "晚饭后散步", "note": "沿河走了一会，风很舒服。",
  "categoryId": "daily", "tags": ["散步", "秋天"], "location": "河边",
  "mood": 4, "duration": 25, "amount": null, "weight": null,
  "reflection": "highlight", "assetId": null, "status": "confirmed",
  "source": "manual", "analysis": {"method": "manual", "labels": [], "ocr": ""},
  "createdAt": "2026-10-04T10:30:00.000Z", "updatedAt": "2026-10-04T10:30:00.000Z"
}
```

## 一致性

- 图片及其首条记录在同一个事务写入；相同 SHA-256 不重复导入。
- 删除照片记录，同时在事务内确认无其他引用再删除图片；一并删除该记录学习样本。
- 修改分类与更新该条学习样本为单事务。重复修正覆盖同一学习样本，避免无穷加权。
- reports 是可编辑快照；recordSignature 标识生成时的素材版本，素材变化显示“记录已变化”，不静默覆盖人工文字。
- reminder 每次可见时检查本地日历日与时间；一天一次，lastReminderDate 在同一主设置记录中保存。
- 清空一个事务清空七张表并还原默认分类/设置。撤销需要用户事先导出的备份。
- 数据库 versionchange 主动关闭连接，并通知刷新，避免旧标签页阻塞升级。

## ZIP 备份格式

`manifest.json` 包含 `{format:'shiri-backup', version:1, exportedAt, tables:{...}, assets:[{id,path,thumbnailPath,name,type,size,lastModified}]}`。原图放 `images/<id>.<ext>`，缩略图放 `thumbnails/<id>.jpg`。不存操作系统绝对路径。使用标准 STORE ZIP，CRC32 完整性检查，无第三方 ZIP 依赖。

恢复仅支持本应用导出的未压缩 ZIP，校验格式版本、表字段、日期数值、唯一 ID、大小、CRC、分类/图片引用与安全路径；校验结束前不写数据库。同 ID 保留本机值，其余追加；不覆盖本机设置。单次备份/恢复上限 200 MiB（避免手机内存峰值）；达到限制明确失败，不导出不完整备份。图片单张上限 20 MiB，一批上限 30 张。建议日常导出并使用系统磁盘加密保存备份。

## 隐私边界

IndexedDB 按浏览器、协议、域名、端口隔离；不等于加密保险箱。浏览器站点数据清除、私密窗口结束或系统回收可能造成数据丢失。使用持久存储请求降低回收概率，但不能替代备份。没有 API key、账户、服务端上传、追踪脚本。CSP 仅允许同源静态资产、blob 图像/worker 和本地 WASM；禁止外部连接、嵌入与表单提交。
## 0.3.0 账号私人照片层

records 新增 shareApproved（可选 boolean，旧数据视为 false）。status 表示本人是否核对日志，与分享审批分开；自己的复盘只依赖 status=confirmed。恢复备份中的新增记录强制 shareApproved=false。settings 增加 private-cloud{enabled} 与 private-deletions{ids[]}，后者保存离线删除意图，成功删除远端后才清理。

原生 PhotoQueue schema v2 从 v1 增加 cloud_uploaded 字段（0 待传、1 已完成、-1 需前台处理），不删除旧队列。工作任务只读取当前 owner 的待传照片。账号 session 不进入备份；原生后台 token 用 Android Keystore AES-GCM 加密，AAD 绑定 owner。

Node/SQLite 增加 private_photos(owner,id,date,time,name,photo,digest,approval,updated) 与 private_config(owner,enabled)。主键为 (owner,id)，账号外键级联清理。照片压缩副本只允许本人认证读取；好友可见需要 shareApproved=true、status=confirmed、privatePhotoId 在私人库已 approved、好友当前单向授权允许。图片删除墓碑不保存照片字节，用于阻止延迟重试复活。
