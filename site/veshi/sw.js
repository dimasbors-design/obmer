// «Где лежит»: работает без интернета (подвал, авиарежим).
// Страница и скрипты — сначала сеть, без сети из кэша. Модель речи — общий кэш с «Обмером».
var V = 'veshi-v1', CORE = ['./', 'index.html', 'core.js', 'manifest.webmanifest', 'icon-180.png', 'icon-192.png', 'icon-512.png'];
self.addEventListener('install', function (e) { e.waitUntil(caches.open(V).then(function (c) { return c.addAll(CORE); }).then(function () { return self.skipWaiting(); })); });
self.addEventListener('activate', function (e) { e.waitUntil(caches.keys().then(function (ks) { return Promise.all(ks.filter(function (k) { return k.indexOf('veshi-') === 0 && k !== V; }).map(function (k) { return caches.delete(k); })); }).then(function () { return self.clients.claim(); })); });
self.addEventListener('fetch', function (e) {
  var u = new URL(e.request.url);
  if (e.request.method !== 'GET' || u.origin !== location.origin) return;
  if (/\/(vendor|model)\//.test(u.pathname)) {
    e.respondWith(caches.open('obmer-big').then(function (c) { return c.match(e.request).then(function (r) { return r || fetch(e.request).then(function (n) { if (n.ok) c.put(e.request, n.clone()); return n; }); }); }));
    return;
  }
  e.respondWith(fetch(e.request).then(function (n) { if (n.ok) { var cl = n.clone(); caches.open(V).then(function (c) { c.put(e.request, cl); }); } return n; })
    .catch(function () { return caches.match(e.request, {ignoreSearch: true}).then(function (r) { return r || caches.match('index.html'); }); }));
});
