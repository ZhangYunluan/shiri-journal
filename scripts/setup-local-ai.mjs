/** Downloads public runtime/model assets only. Never reads user data or contacts an inference API. */
import {
  mkdir,
  writeFile,
  readFile,
  copyFile,
  readdir,
  stat,
  rename,
} from "node:fs/promises";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = process.argv[2] || "all";
if (!["all", "vision", "ocr"].includes(arg))
  throw Error("用法：node scripts/setup-local-ai.mjs [all|vision|ocr]");
const modelHost = process.env.SHIRI_MODEL_HOST || "https://huggingface.co";
if (!["https://huggingface.co", "https://hf-mirror.com"].includes(modelHost))
  throw Error("模型主机不在允许列表");
const work = join(root, ".model-downloads");
await mkdir(work, { recursive: true });
const checks = [];
async function get(url, path) {
  try {
    const info = await stat(path);
    if (info.size > 0) {
      console.log("已存在：" + path.slice(root.length + 1));
      return;
    }
  } catch {}
  console.log("下载：" + url);
  const response = await fetch(url, { signal: AbortSignal.timeout(300000) });
  if (!response.ok) throw Error(`${response.status} ${url}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path + ".partial", bytes);
  await rename(path + ".partial", path);
  checks.push({
    path: path.slice(root.length + 1),
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
async function pack(name, version) {
  const folder = join(
      work,
      name.replaceAll("/", "-").replace("@", "") + "-" + version,
    ),
    metaURL = `https://registry.npmjs.org/${name.replace("/", "%2f")}/${version}`;
  const response = await fetch(metaURL, { signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw Error("无法读取 npm 包元数据 " + name);
  const meta = await response.json(),
    archive = folder + ".tgz";
  await get(meta.dist.tarball, archive);
  if (meta.dist.integrity?.startsWith("sha512-")) {
    const expected = meta.dist.integrity.slice(7),
      actual = createHash("sha512")
        .update(await readFile(archive))
        .digest("base64");
    if (expected !== actual) throw Error("npm 包完整性校验失败 " + name);
  }
  await mkdir(folder, { recursive: true });
  execFileSync("tar", ["-xzf", archive, "-C", folder]);
  return join(folder, "package");
}
async function copyDir(src, dst, filter = () => true) {
  await mkdir(dst, { recursive: true });
  for (const f of await readdir(src, { withFileTypes: true })) {
    if (f.isFile() && filter(f.name))
      await copyFile(join(src, f.name), join(dst, f.name));
  }
}
if (arg !== "ocr") {
  const pkg = await pack("@huggingface/transformers", "3.8.1");
  await copyDir(join(pkg, "dist"), join(root, "vendor/transformers"), (n) =>
    /\.(js|mjs|wasm)$/.test(n),
  );
  await copyFile(
    join(pkg, "LICENSE"),
    join(root, "vendor/transformers/LICENSE"),
  );
  const model = "Xenova/clip-vit-base-patch32";
  const revision = JSON.parse(await readFile(join(root,"config/local-assets.sha256.json"),"utf8")).clipRevision;
  const files = [
    "config.json",
    "preprocessor_config.json",
    "tokenizer.json",
    "tokenizer_config.json",
    "special_tokens_map.json",
    "onnx/text_model_quantized.onnx",
    "onnx/vision_model_quantized.onnx",
  ];
  for (const file of files)
    await get(
      `${modelHost}/${model}/resolve/${revision}/${file}`,
      join(root, "models", model, file),
    );
  await writeFile(join(root, "models", model, "revision.txt"), revision + "\n");
}
if (arg !== "vision") {
  const pkg = await pack("tesseract.js", "6.0.1"),
    core = await pack("tesseract.js-core", "6.0.0");
  await copyDir(join(pkg, "dist"), join(root, "vendor/tesseract"), (n) =>
    ["tesseract.min.js", "worker.min.js"].includes(n),
  );
  await copyDir(core, join(root, "vendor/tesseract/core"), (n) =>
    /\.(js|wasm)$/.test(n),
  );
  await copyFile(
    join(pkg, "LICENSE.md"),
    join(root, "vendor/tesseract/LICENSE.md"),
  );
  for (const lang of ["chi_sim", "eng"])
    await get(
      `https://tessdata.projectnaptha.com/4.0.0/${lang}.traineddata.gz`,
      join(root, "models/tesseract", `${lang}.traineddata.gz`),
    );
}
await writeFile(
  join(work, "download-checksums.json"),
  JSON.stringify(checks, null, 2),
);
console.log(
  "本地 AI 文件已部署。打开设置，检测模型后启用；首次实际识别仍需验证。",
);
