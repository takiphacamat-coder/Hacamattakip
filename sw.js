// Hacamat Müşteri Takip — Offline Uygulama Kabuğu (App Shell) Service Worker
// Amaç: sayfa bir kez internetle açıldıktan sonra, internet olmasa bile
// tekrar açılabilsin diye kendisini ve gerekli dosyaları cihaza kaydeder.
// NOT: Bu, sadece sayfanın AÇILMASINI sağlar. Kayıtlı kişi verileri zaten
// ayrı olarak Firestore'un offline desteğiyle (index.html içinde açılan
// enablePersistence) cihazda saklanıyor.

const CACHE_NAME = 'hacamat-app-shell-v1';

// Sayfanın kendisi + çalışması için şart olan dış scriptler (Firebase SDK)
const APP_SHELL_URLS = [
  self.registration.scope, // ana sayfa (index.html)
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-app-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-auth-compat.js',
  'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore-compat.js'
];

self.addEventListener('install', event => {
  self.skipWaiting();
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    // Ana sayfayı önbelleğe al
    try {
      await cache.add(new Request(self.registration.scope, { cache: 'reload' }));
    } catch (e) {
      console.warn('SW: ana sayfa önbelleğe alınamadı', e);
    }
    // Firebase scriptlerini önbelleğe al (farklı domain olduğu için no-cors ile)
    for (const url of APP_SHELL_URLS.slice(1)) {
      try {
        const res = await fetch(url, { mode: 'no-cors' });
        await cache.put(url, res);
      } catch (e) {
        console.warn('SW: script önbelleğe alınamadı:', url, e);
      }
    }
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const req = event.request;
  const isAppShellUrl = APP_SHELL_URLS.includes(req.url);
  const isNavigation = req.mode === 'navigate';

  // Sadece sayfanın kendisini ve Firebase scriptlerini bu Service Worker yönetiyor.
  // Firestore'a giden gerçek veri istekleri (firestore.googleapis.com vb.) buraya girmez,
  // onları Firestore SDK'sının kendi offline mekanizması yönetir.
  if (!isAppShellUrl && !isNavigation) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(isNavigation ? self.registration.scope : req);

    // Önce ağdan (internetten) taze veriyi almayı dener, güncel kalınsın diye.
    // İnternet yoksa/başarısız olursa cihazdaki önbellekten (offline kopyadan) açar.
    try {
      const fresh = await fetch(req);
      cache.put(isNavigation ? self.registration.scope : req, fresh.clone());
      return fresh;
    } catch (err) {
      if (cached) return cached;
      throw err;
    }
  })());
});
