// PushRun 앱 셸 캐시와 알림 클릭 처리를 담당하는 서비스워커.
const CACHE_NAME = "pushrun-v0.6.10";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260711-2",
  "./alerts-core.js?v=20260711-2",
  "./app.js?v=20260711-2",
  "./races.json?v=20260711-2",
  "./manifest.webmanifest",
  "./icon.svg",
  "./apple-touch-icon.png",
  "./icon-192.png",
  "./icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL)));
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin) return;

  // 네트워크 우선. 캐시 저장은 응답을 돌려주기 "전에" clone 을 떠서
  // event.waitUntil 에 묶는다 — 떠다니는 프로미스로 두면 워커가 먼저 종료돼
  // 저장이 유실되거나, 실패 시 처리되지 않은 rejection 이 생길 수 있다.
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          event.waitUntil(
            caches
              .open(CACHE_NAME)
              .then((cache) => cache.put(request, copy))
              .catch(() => undefined) // 캐시 저장 실패는 조용히 무시(응답은 이미 전달됨)
          );
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || caches.match("./")))
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.registration.scope));
      return existing?.focus?.() || self.clients.openWindow("./");
    })
  );
});
