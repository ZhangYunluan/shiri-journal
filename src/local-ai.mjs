/** Optional on-device inference. Every asset must be installed under the same origin. */
import { suggestCategory } from "./core.mjs";
import { createModelCache, getModelManifest } from "./model-cache.mjs";
import {cleanOcr} from './ocr-filter.mjs';
let classifierPromise, ocrPromise;
const LABELS = {
  "daily life, food, pets and everyday objects": "daily",
  "travel, landscape, street, mountains and sightseeing": "travel",
  "computer screen, study notes, books and documents": "learning",
  "receipt, payment screenshot, invoice and shopping bill": "spending",
  "personal diary, sleep tracking and self care": "wellbeing",
  "gym, exercise, running, sports and body measurements": "fitness",
  "other objects or unclear image": "other",
};
async function exists(path) {
  try {
    const response = await fetch(path, { method: "HEAD", cache: "no-store" });
    return response.ok;
  } catch {
    return false;
  }
}
export async function checkModels() {
  const manifest = await getModelManifest();
  const [clip, ocr] = await Promise.all([
    manifest?.files?.['models/Xenova/clip-vit-base-patch32/onnx/vision_model_quantized.onnx'] || exists(
      "./models/Xenova/clip-vit-base-patch32/onnx/vision_model_quantized.onnx",
    ),
    exists("./vendor/tesseract/tesseract.min.js"),
  ]);
  return `视觉分类：${clip ? "文件已部署，首次识别时加载验证" : "未部署"}；OCR：${ocr ? "运行库已部署，首次识别时加载验证" : "未部署"}。所有加载仅限本站点。`;
}
async function classifier(progress) {
  if (!classifierPromise)
    classifierPromise = (async () => {
      if (!(await exists("./vendor/transformers/transformers.min.js")))
        throw Error("本地视觉模型未部署，请查看设置中的部署说明");
      const {
        AutoTokenizer,
        AutoProcessor,
        CLIPTextModelWithProjection,
        CLIPVisionModelWithProjection,
        RawImage,
        env,
      } = await import("../vendor/transformers/transformers.min.js");
      env.allowRemoteModels = false;
      env.allowLocalModels = true;
      env.localModelPath = new URL("../models/", import.meta.url).href;
      env.backends.onnx.wasm.wasmPaths = new URL(
        "../vendor/transformers/",
        import.meta.url,
      ).href;
      env.backends.onnx.wasm.numThreads = 1;
      env.backends.onnx.wasm.proxy = false;
      const manifest = await getModelManifest();
      if (manifest) {
        env.useCustomCache = true;
        env.customCache = createModelCache(manifest, { progress });
      }
      progress("正在加载本地视觉模型，首次使用可能需要一点时间…");
      const modelId = "Xenova/clip-vit-base-patch32",
        options = { device: "wasm", dtype: "q8" };
      const [tokenizer, processor, textModel] = await Promise.all([
        AutoTokenizer.from_pretrained(modelId),
        AutoProcessor.from_pretrained(modelId),
        CLIPTextModelWithProjection.from_pretrained(modelId, options),
      ]);
      const labels = Object.keys(LABELS),
        inputs = tokenizer(
          labels.map((t) => "a photo of " + t),
          { padding: true, truncation: true },
        ),
        { text_embeds } = await textModel(inputs);
      // Release the text encoder before loading vision weights to reduce mobile peak memory.
      const textEmbeddings = new Float32Array(text_embeds.data);
      await textModel.dispose();
      const visionModel = await CLIPVisionModelWithProjection.from_pretrained(modelId, options);
      // Cosine similarity over the projected CLIP embeddings; scores remain suggestions, not facts.
      return async (imageURL) => {
        const pixels = await processor(await RawImage.read(imageURL)),
          { image_embeds } = await visionModel(pixels),
          image = image_embeds.data,
          width = image.length;
        const similarities = labels.map((label, i) => {
          let dot = 0,
            a = 0,
            b = 0;
          for (let j = 0; j < width; j++) {
            const t = textEmbeddings[i * width + j];
            dot += image[j] * t;
            a += image[j] * image[j];
            b += t * t;
          }
          return { label, score: dot / Math.sqrt(a * b) };
        });
        return similarities.sort((a, b) => b.score - a.score);
      };
    })().catch((e) => {
      classifierPromise = null;
      throw e;
    });
  return classifierPromise;
}
async function ocr(progress) {
  if (!ocrPromise)
    ocrPromise = (async () => {
      if (!(await exists("./vendor/tesseract/tesseract.min.js")))
        throw Error("本地 OCR 未部署，请查看设置中的部署说明");
      if (!window.Tesseract)
        await new Promise((resolve, reject) => {
          const script = document.createElement("script");
          script.src = "./vendor/tesseract/tesseract.min.js";
          script.onload = resolve;
          script.onerror = () => reject(Error("OCR 运行库加载失败"));
          document.head.append(script);
        });
      progress("正在加载本地中英文文字识别…");
      return window.Tesseract.createWorker("chi_sim+eng", 1, {
        workerPath: new URL("./vendor/tesseract/worker.min.js", location.href)
          .href,
        corePath: new URL("./vendor/tesseract/core/", location.href).href,
        langPath: new URL("./models/tesseract/", location.href).href,
        workerBlobURL: true,
        gzip: true,
        logger: () => {},
      });
    })().catch((e) => {
      ocrPromise = null;
      throw e;
    });
  return ocrPromise;
}
export async function analyzeImage(
  asset,
  settings,
  learning,
  progress = () => {},
) {
  let categoryId = "other",
    labels = [],
    text = "",
    methods = [];
  const url = URL.createObjectURL(asset.thumbnail);
  try {
    if (settings.aiEnabled) {
      const model = await classifier(progress);
      progress("正在本机识别照片内容…");
      const result = await model(url, Object.keys(LABELS));
      labels = result.slice(0, 3).map((r) => r.label);
      categoryId = LABELS[result[0]?.label] || "other";
      const learned = learning.find((l) => l.labels?.[0] === labels[0]);
      if (learned) categoryId = learned.categoryId;
      methods.push(
        `本地 CLIP 候选${learned ? " + 纠正记忆" : ""}（待人工确认）`,
      );
    }
    if (settings.ocrEnabled) {
      const worker = await ocr(progress);
      progress("正在本机提取图片文字…");
      const result = await worker.recognize(asset.blob,{}, {text:true,blocks:true});
      text = cleanOcr(result.data);
      methods.push("本地 OCR");
      if (text) {
        const suggested = suggestCategory(text, learning);
        if (suggested.categoryId !== "other") categoryId = suggested.categoryId;
      }
    }
    if (!methods.length) throw Error("尚未启用本地模型");
    return { method: methods.join(" / "), categoryId, labels, ocr: text };
  } finally {
    URL.revokeObjectURL(url);
  }
}
