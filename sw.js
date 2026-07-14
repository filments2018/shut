/**
 * sw.js — v38
 * 2シーン撮影フローとシーン間準備UIを配信するためキャッシュ更新。
 */
const CACHE  = 'shut-v38';
const ASSETS = [
  '/',
  '/index.html',
  '/tokens.css',
  '/styles.css',
  '/motion.js',
  '/camera.js',
  '/audio.js',
  '/ui.js',
  '/recorder.js',
  '/share.js',
  '/app.js',
  '/manifest.json',
  '/icon-192.svg',
  '/icon-512.svg',
];

self.addEventListener('install', e => {
  e.waitUntil(
    caches.open(CACHE)
      .then(c => c.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(
        keys.filter(k => k !== CACHE).map(k => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  if (!e.request.url.startsWith('http')) return;

  e.respondWith(
    caches.match(e.request).then(cached => {
      // Stale-while-revalidate: キャッシュを即返し、バックグラウンドで更新
      const fetchPromise = fetch(e.request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200 && networkResponse.type !== 'opaque') {
          caches.open(CACHE).then(cache => cache.put(e.request, networkResponse.clone()));
        }
        return networkResponse;
      }).catch(() => null);

      // キャッシュがあれば即返却 + バックグラウンド更新を保護
      if (cached) {
        e.waitUntil(fetchPromise);
        return cached;
      }

      // キャッシュなし → ネットワーク結果を待つ
      return fetchPromise.then(net => {
        if (net) return net;
        // 完全オフライン & キャッシュなし → index.html フォールバック
        return caches.match('/index.html').then(fb =>
          fb || new Response('Offline', {
            status: 503,
            headers: { 'Content-Type': 'text/plain' },
          })
        );
      });
    })
  );
});

self.addEventListener('message', e => {
  if (e.data === 'skipWaiting') self.skipWaiting();
});
