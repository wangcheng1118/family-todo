// Service Worker for Family Todo PWA
// 版本号：每次发布新版 index.html 时必须修改 (v2, v3, ...)
const CACHE_NAME = 'family-todo-v6';
const urlsToCache = [
  './',
  './index.html',
  './manifest.json'
];

// 仅缓存同源 GET 请求
const isCacheable = (request) => {
  if (request.method !== 'GET') return false;
  const url = new URL(request.url);
  return url.origin === self.location.origin;
};

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(urlsToCache))
  );
  // 立即激活新 SW，不等旧 SW 控制的标签页关闭
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => caches.delete(name))
      )
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  // 支持页面主动调用 skipWaiting 或清理缓存
  if (event.data === 'SKIP_WAITING') self.skipWaiting();
  if (event.data === 'CLEAR_CACHE') {
    caches.keys().then((names) =>
      Promise.all(names.filter((n) => n !== CACHE_NAME).map((n) => caches.delete(n)))
    );
  }
});

self.addEventListener('fetch', (event) => {
  const { request } = event;

  // 非 GET（如 POST/PUT）或跨域请求：直接走网络，不走缓存策略
  if (!isCacheable(request)) {
    event.respondWith(fetch(request));
    return;
  }

  // 策略：Stale-While-Revalidate
  // 命中缓存时立即返回旧副本，同时后台拉取新版，下次刷新即生效。
  event.respondWith(
    caches.match(request).then((cached) => {
      const networkFetch = fetch(request)
        .then((response) => {
          if (response && response.status === 200) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, clone));
          }
          return response;
        })
        .catch(() => cached);
      return cached || networkFetch;
    })
  );
});