const CACHE = "shiri-shell-v27";
const FILES = [
  "./src/collector-state.mjs",
  "./src/request-scope.mjs",
  "./src/photo-onboarding.mjs",
  "./src/dialog-layout.mjs",
  "./src/photo-metadata.mjs",
  "./src/review-removal.mjs",
  "./",
  "./index.html",
  "./src/life-assistant.mjs",
  "./src/beta-analytics.mjs",
  "./install.html",
  "./install.css",
  "./install.mjs",
  "./life.css",
  "./life-app.mjs",
  "./favicon.svg",
  "./manifest.webmanifest",
  "./src/core.mjs",
  "./src/life-expression.mjs",
  "./src/db.mjs",
  "./src/moment-review.mjs",
  "./src/moment-sync.mjs",
  "./src/ocr-filter.mjs",
  "./src/space.mjs",
  "./src/auto-collect.mjs",
  "./src/social-client.mjs",
  "./src/social-config.mjs",
  "./src/sharing.mjs",
  "./src/private-cloud.mjs",
  "./src/cloudbase-config.mjs",
  "./src/cloudbase-auth.mjs",
  "./src/cloudbase-panel.mjs",
  "./src/cloudbase-friends.mjs",
  "./src/cloudbase-friends-view.mjs",
  "./src/cloudbase-social-api.mjs",
  "./src/cloudbase-social-config.mjs",
  "./src/auth-vault.mjs",
  "./src/ui.mjs",
  "./src/views.mjs",
  "./src/life-calendar.mjs",
  "./src/moment-comments.mjs",
  "./src/life-calendar-view.mjs",
  "./src/local-photo-gallery.mjs",
  "./src/calendar.css",
  "./src/images.mjs",
  "./src/backup.mjs",
  "./src/local-ai.mjs",
  "./src/model-cache.mjs",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];
self.addEventListener("install", (e) => {
  e.waitUntil(
    caches
      .open(CACHE)
      .then((c) => c.addAll(FILES))
      .then(() => self.skipWaiting()),
  );
});
self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(
          keys
            .filter((k) => k.startsWith("shiri-shell-") && k !== CACHE)
            .map((k) => caches.delete(k)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});
// This cache holds app code, never user photos or logs. Third-party requests are blocked by CSP.
self.addEventListener("fetch", (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== "GET" || url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api/')) return;
  if (url.pathname.includes("/vendor/") || url.pathname.includes("/models/")) {
    // ONNX is cached by the verified model loader; avoid storing the chunks twice.
    if (url.pathname.endsWith('.bin') || url.pathname.endsWith('.onnx')) return;
    e.respondWith(caches.open('shiri-runtime-v1').then(async cache => {
      const cached = await cache.match(e.request);
      if (cached) return cached;
      const response = await fetch(e.request);
      if (response.ok && !response.redirected) {
        try { await cache.put(e.request, response.clone()); } catch { /* storage can be full */ }
      }
      return response;
    }));
    return;
  }
  e.respondWith(
    fetch(e.request)
      .then((response) => {
        if (
          response.ok &&
          FILES.some(
            (f) => new URL(f, self.location.href).pathname === url.pathname,
          )
        ) {
          const copy = response.clone();
          caches.open(CACHE).then((c) => c.put(e.request, copy));
        }
        return response;
      })
      .catch(() =>
        caches
          .match(e.request)
          .then(
            (cached) =>
              cached ||
              (e.request.mode === "navigate"
                ? caches.match("./index.html")
                : Response.error()),
          ),
      ),
  );
});
