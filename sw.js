/*
 * Kokpit Cep çevrimdışı önbelleği (service worker)
 * Sayfa (index.html) internet varken her açılışta sunucudan alınır, yoksa önbellekten açılır; böylece
 * yayımlanan yeni sürüm hemen gelir. Simgeler ve yazı tipleri önce önbellekten verilir, arka planda yenilenir.
 * Uygulama dosyası değişince VERSION artırılır (scripts/cep-yayinla.ps1); eski önbellekler silinir.
 * Bildirime dokunulunca uygulama öne getirilir.
 */
const VERSION = 'kokpit-cep-20261031-0016';
const SHELL = ['./', './index.html', './manifest.webmanifest', './icons/icon-192.png', './icons/icon-512.png',
  './icons/icon-maskable-192.png', './icons/icon-maskable-512.png', './icons/apple-touch-icon.png', './icons/icon.svg'];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(VERSION).then(c => c.addAll(SHELL)).then(() => self.skipWaiting()));
});

self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== VERSION).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  const sameOrigin = url.origin === self.location.origin;
  const font = /fonts\.(googleapis|gstatic)\.com$/.test(url.hostname);
  if (!sameOrigin && !font) return;
  const page = req.mode === 'navigate' || (sameOrigin && /\/(index\.html)?$/.test(url.pathname));
  e.respondWith(caches.open(VERSION).then(async cache => {
    const key = page ? './index.html' : req;
    if (page) {
      // Önce ağ (en yeni sürüm), 4 sn içinde gelmezse ya da ağ yoksa önbellek
      try {
        const res = await Promise.race([fetch(req, { cache: 'no-cache' }), new Promise((_, rej) => setTimeout(() => rej(new Error('zaman aşımı')), 4000))]);
        if (res && res.ok) { cache.put(key, res.clone()); return res; }
      } catch (err) { /* çevrimdışı */ }
      return (await cache.match(key)) || Response.error();
    }
    const cached = await cache.match(key);
    const fresh = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(key, res.clone());
      return res;
    }).catch(() => cached);
    return cached || fresh;
  }));
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(list => {
    const win = list.find(c => 'focus' in c);
    return win ? win.focus() : self.clients.openWindow('./index.html#bugun');
  }));
});
