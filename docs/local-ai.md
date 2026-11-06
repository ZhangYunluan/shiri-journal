当前公开快照的安装、数据边界和验证状态以 [README](../README.md)、[SETUP](SETUP.md) 和 [PUBLIC_VERIFICATION](PUBLIC_VERIFICATION.md) 为准。以下包含历史阶段设计与记录，不能据此推断你的环境已部署。

# 本地 AI 部署与能力边界

## 方案

应用默认不下载模型、不调用外部 API。部署者可一次性下载公开运行库和模型文件，随后浏览器只从自己的静态服务加载，照片始终在设备内推理。CSP 限制 connect-src / script-src 为同源，Transformers.js 显式设置 allowRemoteModels=false。

```powershell
node scripts/setup-local-ai.mjs
# 也可单独部署：
node scripts/setup-local-ai.mjs vision
node scripts/setup-local-ai.mjs ocr
```

部署脚本需要联网，仅下载公开资源，不读取浏览器数据。来源：官方 npm registry、Hugging Face 模型仓库、Tesseract 官方语言文件域名。下载写入 .partial 后原子重命名；npm 包核验 SHA-512，模型版本解析为固定提交并写入 revision.txt。失败可重跑，已存在文件跳过；损坏文件需先手动移走后重下。模型与运行库合计约数百 MB，请预留磁盘空间和手机内存。

- 视觉：Transformers.js 3.8.1，Xenova/clip-vit-base-patch32，q8 text/vision 两个 ONNX。七组语义描述用于零样本分类。首次启动常需要数秒到数十秒，低端手机可能耗时更久或内存不足。采用 WASM 单线程，避免要求跨源隔离；没有隐式 WebGPU 要求。
- 文字：Tesseract.js 6.0.1、core 6.0.0、chi_sim 与 eng。只加载同源 worker/core/lang 文件。识别结果保存为原始文字，用户校正后进入记录。
- 结构化：生活分类来自 CLIP/OCR 规则建议，描述来自 OCR 原文。地点、情绪与不确定数值不猜测。数字、地点、活动等仅在文字明确提供时可用“从文字提取”辅助，并需用户确认。
- 学习：保存人工确认的标题/标签候选与类别映射，用后续匹配改善建议。这是本地纠正记忆，不是重新训练大模型。
- 报告：完整的本地规则统计与模板，不需要模型。深度风格是扩展的反思结构，不是生成式大语言模型。

目录：

```text
vendor/transformers/transformers.min.js
vendor/transformers/*.wasm
vendor/transformers/*.mjs
models/Xenova/clip-vit-base-patch32/{config,preprocessor_config,tokenizer,tokenizer_config,special_tokens_map}.json
models/Xenova/clip-vit-base-patch32/onnx/{text_model_quantized,vision_model_quantized}.onnx
vendor/tesseract/{tesseract.min,worker.min}.js
vendor/tesseract/core/*.js
vendor/tesseract/core/*.wasm
models/tesseract/{chi_sim,eng}.traineddata.gz
```

运行 `npm run preview` 后在设置中“检测本地模型”，开启所需功能。照片导入时执行，旧素材可在详情里点击“重新进行本地识别”。缺失依赖或推理失败时原图继续保留，状态为待整理，错误会明确显示。重新识别不会静默覆盖已保存的人工字段，核对后保存才生效。

## 不做的推断

单张照片无法可靠判断人的情绪、身体健康、真实行程与全天时间分配；CLIP 分类也可能把风景和运动混淆。消费 OCR 的金额可能是折扣或小计，必须核对币种和含义。未来规划只提供来自历史记录的小建议，不提供医疗诊断、饮食处方或健康结论。

## 更强的本地生成模型扩展

如需自然语言长文，可另行接入同源 WebGPU 文本模型，但通常需要额外数百 MB 至数 GB 权重。仍应禁用远程模型、限制请求同源、显式设置模型加载开关，并保留规则报告降级路径。当前版本没有接入生成式 LLM，也不把规则输出称作模型推理。

## 参考

- [Transformers.js 本地模型与 WASM 配置](https://huggingface.co/docs/transformers.js/en/custom_usage)
- [CLIP ONNX 官方模型目录](https://huggingface.co/Xenova/clip-vit-base-patch32/tree/main/onnx)
- [Tesseract.js 本地安装说明](https://github.com/naptha/tesseract.js/blob/master/docs/local-installation.md)

## 本次部署与验证

此项目目录已包含上述运行库、CLIP q8 模型以及中英文 OCR 语言数据，无需重新下载即可启用。CLIP 模型固定提交为 `d15189d7028b43f1d3e65039190477f6af591c2a`。本次官方 Hugging Face 地址连接超时，模型通过公开镜像 hf-mirror.com 下载，提交与官方目录一致；npm 和 OCR 使用上文官方来源。

如重建时官方地址不可达，可显式选择公开镜像：

```powershell
$env:SHIRI_MODEL_HOST='https://hf-mirror.com'
node scripts/setup-local-ai.mjs vision
```

浏览器不会联系这个镜像；它只供部署脚本下载模型文件。所有运行时请求仍限定同源。已在桌面 Chromium 中用合成收据验证：CLIP 首选分类为消费账单，OCR 输出 `TOTAL: 28.50`，结构化金额为 28.5。不能将这一项通过视为所有照片类型、设备或语言识别率保证；手机机型性能需实际试用。
