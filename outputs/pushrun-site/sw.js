// 러닝봄 앱 셸 캐시와 알림 클릭 처리를 담당하는 서비스워커. 캐시 키는 기존 설치 호환용으로 유지한다.
const CACHE_NAME = "pushrun-v0.15.0";
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css?v=20260713-25",
  "./race-calendar-core.js?v=20260713-25",
  "./alerts-core.js?v=20260713-25",
  "./app.js?v=20260713-25",
  "./races.json?v=20260713-25",
  "./bom-runningbom.svg?v=20260713-25",
  "./manifest.webmanifest",
  "./icon-v2.svg",
  "./apple-touch-icon-v2.png",
  "./icon-192-v2.png",
  "./icon-512-v2.png",
  "./maskable-512-v2.png"
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

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
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
      .catch(() =>
        caches.match(request).then((cached) => cached || (request.mode === "navigate" ? caches.match("./") : Response.error()))
      )
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  let targetUrl = self.registration.scope;
  try {
    const candidate = new URL(event.notification.data?.url || "./", self.registration.scope);
    if (candidate.origin === self.location.origin && candidate.href.startsWith(self.registration.scope)) {
      targetUrl = candidate.href;
    }
  } catch {
    // 잘못된 주소는 앱 홈으로 보낸다.
  }
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(async (clients) => {
      const existing = clients.find((client) => client.url.startsWith(self.registration.scope));
      if (existing) {
        if ("navigate" in existing) await existing.navigate(targetUrl);
        return existing.focus();
      }
      return self.clients.openWindow(targetUrl);
    })
  );
});
