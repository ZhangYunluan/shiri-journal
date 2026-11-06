/** Reassemble public model weights from same-origin, SHA-256 checked static chunks.
 * No image, note, or other user content passes through this cache.
 */
export function createModelCache(manifest, {
  baseURL = new URL('../', import.meta.url).href,
  fetcher = (...args) => fetch(...args),
  storage = globalThis.caches,
  crypto = globalThis.crypto,
  progress = () => {},
} = {}) {
  const base = new URL(baseURL);
  const cachePromise = storage?.open('shiri-ai-v1').catch(() => undefined);
  const sameOrigin = value => {
    const url = new URL(value, base);
    if (url.origin !== base.origin) throw Error('模型分片必须同源');
    return url;
  };
  const hash = async bytes => [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
    .map(n => n.toString(16).padStart(2, '0')).join('');
  return {
    async match(request) {
      const url = new URL(request, base);
      if (url.origin !== base.origin) return undefined;
      const relative = url.pathname.slice(base.pathname.length);
      const entry = manifest?.files?.[relative];
      const key = entry ? url.href + '?sha256=' + entry.sha256 : url.href;
      const cache = await cachePromise;
      const cached = await cache?.match(key);
      if (cached) return cached;
      if (!entry) return undefined;
      if (!Number.isSafeInteger(entry.size) || entry.size < 1 || entry.size > 200 * 1024 * 1024 || !Array.isArray(entry.parts))
        throw Error('模型清单大小无效');
      const urls = entry.parts.map(part => sameOrigin(part.path));
      const bytes = new Uint8Array(entry.size);
      let offset = 0;
      for (let i = 0; i < entry.parts.length; i++) {
        const part = entry.parts[i];
        progress(`正在准备本机模型：${i + 1}/${entry.parts.length} 个分片…`);
        const response = await fetcher(urls[i].href);
        if (!response.ok) throw Error('模型分片下载失败，请保持联网后重试');
        const chunk = new Uint8Array(await response.arrayBuffer());
        if (chunk.length !== part.size || offset + chunk.length > bytes.length || await hash(chunk) !== part.sha256)
          throw Error('模型分片校验失败，请重新加载');
        bytes.set(chunk, offset);
        offset += chunk.length;
      }
      if (offset !== bytes.length || await hash(bytes) !== entry.sha256)
        throw Error('完整模型校验失败');
      const response = new Response(bytes, {headers: {'Content-Type':'application/octet-stream', 'Content-Length':String(bytes.length)}});
      try { await cache?.put(key, response.clone()); } catch { /* cache is optional */ }
      return response;
    },
    async put(request, response) {
      const url = sameOrigin(request);
      try { await (await cachePromise)?.put(url.href, response); } catch { /* cache is optional */ }
    },
  };
}

let manifestPromise;
export function getModelManifest() {
  return manifestPromise ||= fetch(new URL('../models/chunks.json', import.meta.url))
    .then(async response => response.ok ? await response.json() : null)
    .catch(() => null);
}
