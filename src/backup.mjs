/** Minimal interoperable STORE ZIP, with CRC checking. No archive library/CDN. */
const encoder = new TextEncoder(),
  decoder = new TextDecoder();
export const MAX_BACKUP = 200 * 1024 * 1024;
const crcTable = Uint32Array.from({ length: 256 }, (_, n) => {
  for (let k = 0; k < 8; k++) n = n & 1 ? 0xedb88320 ^ (n >>> 1) : n >>> 1;
  return n >>> 0;
});
export function crc32(bytes) {
  let n = 0xffffffff;
  for (const byte of bytes) n = crcTable[(n ^ byte) & 255] ^ (n >>> 8);
  return (n ^ 0xffffffff) >>> 0;
}
function header(size) {
  const b = new Uint8Array(size);
  return [b, new DataView(b.buffer)];
}
function safeName(name) {
  return (
    !!name &&
    !name.includes("..") &&
    !name.startsWith("/") &&
    !name.includes("\\") &&
    !name.includes(":")
  );
}
export async function createZip(files) {
  if (files.length > 60000) throw Error("备份文件过多");
  const parts = [],
    directory = [];
  let offset = 0;
  for (const file of files) {
    if (!safeName(file.name)) throw Error("非法备份路径");
    const data =
      file.data instanceof Blob
        ? new Uint8Array(await file.data.arrayBuffer())
        : file.data;
    const name = encoder.encode(file.name),
      crc = crc32(data),
      [h, v] = header(30);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    parts.push(h, name, data);
    const [c, w] = header(46);
    w.setUint32(0, 0x02014b50, true);
    w.setUint16(4, 20, true);
    w.setUint16(6, 20, true);
    w.setUint16(8, 0x800, true);
    w.setUint32(16, crc, true);
    w.setUint32(20, data.length, true);
    w.setUint32(24, data.length, true);
    w.setUint16(28, name.length, true);
    w.setUint32(42, offset, true);
    directory.push(c, name);
    offset += 30 + name.length + data.length;
    if (offset > MAX_BACKUP) throw Error("备份超过 200 MiB，请减少单次数据量");
  }
  const [end, e] = header(22);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(
    12,
    directory.reduce((n, b) => n + b.length, 0),
    true,
  );
  e.setUint32(16, offset, true);
  const result = new Blob([...parts, ...directory, end], {
    type: "application/zip",
  });
  if (result.size > MAX_BACKUP) throw Error("备份超过 200 MiB");
  return result;
}
export async function readZip(blob) {
  if (blob.size > MAX_BACKUP) throw Error("备份超过 200 MiB");
  const bytes = new Uint8Array(await blob.arrayBuffer()),
    v = new DataView(bytes.buffer),
    files = new Map();
  let offset = 0;
  try {
    while (
      offset + 30 <= bytes.length &&
      v.getUint32(offset, true) === 0x04034b50
    ) {
      const method = v.getUint16(offset + 8, true),
        flags = v.getUint16(offset + 6, true),
        crc = v.getUint32(offset + 14, true),
        size = v.getUint32(offset + 18, true),
        raw = v.getUint32(offset + 22, true),
        len = v.getUint16(offset + 26, true),
        extra = v.getUint16(offset + 28, true);
      if (method !== 0 || (flags & 9) !== 0 || raw !== size)
        throw Error("仅支持本应用导出的未压缩 ZIP");
      const start = offset + 30 + len + extra,
        end = start + size;
      if (end > bytes.length) throw Error("备份损坏");
      const name = decoder.decode(bytes.slice(offset + 30, offset + 30 + len));
      if (!safeName(name) || files.has(name)) throw Error("备份路径损坏或重复");
      const data = bytes.slice(start, end);
      if (crc32(data) !== crc) throw Error("备份校验失败，文件损坏");
      files.set(name, data);
      offset = end;
    }
    if (
      !files.size ||
      offset + 4 > bytes.length ||
      v.getUint32(offset, true) !== 0x02014b50 ||
      bytes.length < 22 ||
      v.getUint32(bytes.length - 22, true) !== 0x06054b50 ||
      v.getUint16(bytes.length - 12, true) !== files.size
    )
      throw Error("备份目录损坏");
  } catch (e) {
    if (e instanceof RangeError) throw Error("备份损坏");
    throw e;
  }
  return files;
}
export async function exportBackup(tables) {
  if (
    tables.assets.reduce((n, a) => n + a.size + a.thumbnail.size, 0) >
    MAX_BACKUP
  )
    throw Error("备份超过 200 MiB，请先分批整理素材");
  const files = [],
    assets = [];
  for (const a of tables.assets) {
    const path = `images/${a.id}.${a.type === "image/png" ? "png" : a.type === "image/webp" ? "webp" : a.type === "image/gif" ? "gif" : "jpg"}`,
      thumbnailPath = `thumbnails/${a.id}.jpg`;
    assets.push({
      id: a.id,
      path,
      thumbnailPath,
      name: a.name,
      type: a.type,
      size: a.size,
      lastModified: a.lastModified,
    });
    files.push(
      { name: path, data: a.blob },
      { name: thumbnailPath, data: a.thumbnail },
    );
  }
  const { assets: ignored, ...rest } = tables;
  // Consent and telemetry are device-local, never transferred in a life backup.
  rest.settings=(rest.settings||[]).filter(row=>row.id!=='beta-analytics-v1');
  files.unshift({
    name: "manifest.json",
    data: encoder.encode(
      JSON.stringify(
        {
          format: "shiri-backup",
          version: 1,
          exportedAt: new Date().toISOString(),
          tables: rest,
          assets,
        },
        null,
        2,
      ),
    ),
  });
  return createZip(files);
}
export async function parseBackup(file) {
  const files = await readZip(file);
  let m;
  try {
    m = JSON.parse(decoder.decode(files.get("manifest.json")));
  } catch {
    throw Error("缺少有效的 manifest.json");
  }
  if (
    m?.format !== "shiri-backup" ||
    m.version !== 1 ||
    !Array.isArray(m.assets) ||
    !m.tables
  )
    throw Error("不支持的备份版本");
  const assets = m.assets.map((a) => {
    if (
      !/^[a-f0-9]{64}$/.test(a.id) ||
      !["image/jpeg", "image/png", "image/webp", "image/gif"].includes(
        a.type,
      ) ||
      !files.has(a.path) ||
      !files.has(a.thumbnailPath)
    )
      throw Error("图片信息不完整");
    const blob = new Blob([files.get(a.path)], { type: a.type }),
      thumbnail = new Blob([files.get(a.thumbnailPath)], {
        type: "image/jpeg",
      });
    if (blob.size !== a.size || blob.size > 20 * 1024 * 1024)
      throw Error("图片大小校验失败");
    return { ...a, blob, thumbnail };
  });
  return { ...m.tables, assets };
}
