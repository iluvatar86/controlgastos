/* ---------------------------------------------------------------------------
   sw.js — Modo sin conexión.

   IMPORTANTE: al tocar cualquier archivo de la app hay que subir VERSION, o
   los teléfonos seguirán abriendo la copia guardada de la versión anterior.
--------------------------------------------------------------------------- */

const VERSION = 'controlgastos-v25';

const FILES = [
  './',
  './index.html',
  './guia.html',
  './app.css',
  './manifest.webmanifest',
  './js/dom.js',
  './js/store.js',
  './js/bancos.js',
  './js/charts.js',
  './js/views.js',
  './js/dashboard.js',
  './js/gmail.js',
  './js/app.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(VERSION)
      .then((cache) => cache.addAll(FILES))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((names) => Promise.all(names.filter((n) => n !== VERSION).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

/* Primero la red, y si no hay, la copia guardada. Así una versión nueva se ve
   en cuanto hay conexión, sin dejar de funcionar en el avión. */
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (!event.request.url.startsWith(self.location.origin)) return;

  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(VERSION).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request).then((hit) => hit || caches.match('./index.html')))
  );
});
