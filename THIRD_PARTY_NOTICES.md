# 第三方软件与素材

MIT 适用于拾日原创代码。依赖、运行时与模型各自遵守上游许可。公开源码不包含 node_modules、vendor、models、签名或真实用户素材。

## 主要依赖

| 组件 | 版本 | 上游许可 |
|---|---|---|
| Capacitor core/android/ios/cli | 8.5.3 | MIT |
| Capacitor App / Filesystem / Share | 8.1.2 / 8.1.4 / 8.0.3 | MIT |
| CloudBase JavaScript SDK | 3.10.1 | Apache-2.0 |
| esbuild | 0.28.2 | MIT |
| Playwright | 1.62.1 | Apache-2.0 |
| PGlite | 0.5.8 | Apache-2.0，并保留其 PostgreSQL 等通知 |
| Transformers.js | 3.8.1 | Apache-2.0 |
| Tesseract.js / Core | 6.0.1 / 6.0.0 | Apache-2.0 |
| Xenova CLIP ViT B/32 ONNX | 锁定 revision 见配置 | 模型卡标注 MIT |
| Tesseract 中英文训练数据 | 4.0.0 下载资源 | 上游 tessdata 为 Apache-2.0，重新分发需核对实际资源 |

依赖锁文件中的许可元数据清单见 dependency-licenses.json。third-party-licenses/ 保留部分直接依赖的完整上游许可，npm 安装会保留各包自己的 LICENSE/NOTICE。清单和部分许可不能代替完整 APK 的第三方清点。分发包含运行库与模型的 APK 时，发布者还需核对实际构建内容并随包提供适用的版权、许可和 NOTICE 文件。

setup:ai 会按锁定版本下载模型与运行库，包含第三方组件，不因外层项目采用 MIT 而变更许可。付费 API 和云服务另受各自服务条款约束。

## 原创与历史素材

demo/assets/ 为本次编写的原创 SVG 示意图片。docs/images/ 与官网 app-home 图片是实际页面的合成数据截图；不含真实内测用户记录。拾日现有 logo、图标和代码在公开前应由负责人和原贡献者确认权利。品牌名称不构成商标授权。

## 上游来源

- [Capacitor](https://github.com/ionic-team/capacitor)
- [CloudBase SDK](https://github.com/TencentCloudBase/cloudbase-js-sdk)
- [Transformers.js](https://github.com/huggingface/transformers.js)
- [CLIP ONNX 模型卡](https://huggingface.co/Xenova/clip-vit-base-patch32)
- [Tesseract.js](https://github.com/naptha/tesseract.js)
- [tessdata](https://github.com/tesseract-ocr/tessdata)
