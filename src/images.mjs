/** Only user-selected raster files enter this pipeline; originals stay as Blob in IndexedDB. */
import {photoGps,coordinateLabel} from './photo-metadata.mjs';
export async function prepareImage(file) {
  if (file.size > 20 * 1024 * 1024) throw Error(`${file.name} 超过 20 MiB`);
  const bytes = new Uint8Array(await file.arrayBuffer());
  const jpeg = bytes[0] === 255 && bytes[1] === 216,
    png = bytes[0] === 137 && bytes[1] === 80 && bytes[2] === 78,
    gif = bytes[0] === 71 && bytes[1] === 73 && bytes[2] === 70,
    webp =
      String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" &&
      String.fromCharCode(...bytes.slice(8, 12)) === "WEBP";
  if (!jpeg && !png && !gif && !webp)
    throw Error(
      `${file.name} 格式不支持，请选择 JPEG、PNG、WebP 或 GIF；HEIC 请先转 JPEG`,
    );
  const type = jpeg
    ? "image/jpeg"
    : png
      ? "image/png"
      : gif
        ? "image/gif"
        : "image/webp";
  if (!crypto.subtle)
    throw Error("图片去重需要 HTTPS 或 localhost，请用安全地址打开");
  const id = Array.from(
    new Uint8Array(await crypto.subtle.digest("SHA-256", bytes)),
    (x) => x.toString(16).padStart(2, "0"),
  ).join("");
  const blob = new Blob([bytes], { type }),
    url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    if (image.naturalWidth * image.naturalHeight > 70000000)
      throw Error("图片分辨率过大，请缩小后导入");
    const scale = Math.min(
        1,
        640 / Math.max(image.naturalWidth, image.naturalHeight),
      ),
      canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
    const thumbnail = await new Promise((resolve, reject) =>
      canvas.toBlob(
        (b) => (b ? resolve(b) : reject(Error("无法创建缩略图"))),
        "image/jpeg",
        0.82,
      ),
    );
    return {
      id,
      blob,
      thumbnail,
      name: file.name,
      type,
      size: blob.size,
      lastModified: file.lastModified || Date.now(),
      captureLocation: coordinateLabel(photoGps(bytes)),
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}
