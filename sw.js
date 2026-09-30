/* Service worker — what makes the app open with no signal.
 *
 * Cache-first for the shell: none of it changes during a shift, and a field
 * connection is slow enough that a network check is felt on every launch.
 *
 * The badges (24 of them, ~2.4 MB) are cached BEST-EFFORT, not as part of the
 * all-or-nothing shell: on weak signal one slow badge would otherwise fail the
 * whole install and leave the phone on the old version. A badge missed here is
 * still cached the first time the app shows it (the post/team badge is
 * preloaded when a shift or day starts); without it, a photo gets the text mark.
 */

/* BUMP THIS ON EVERY UPLOAD, together with BUILD in js/app.js — they are a
   pair. A browser decides whether to install a new worker by comparing the
   BYTES of this file, and only the new worker re-caches everything else.
   Upload twenty changed files with this line untouched and every phone that
   already has the app keeps the old ones, silently. */
var CACHE_VERSION = 'superapp-laporan-v13';

var SHELL = [
  './',
  './index.html',
  './styles.css',
  './manifest.webmanifest',
  './js/options.js',
  './js/exif.js',
  './js/seal.js',
  './js/db.js',
  './js/geo.js',
  './js/photo.js',
  './js/xlsx.js',
  './js/wt-options.js',
  './js/sheets.js',
  './js/wt-records.js',
  './js/sec-caption.js',
  './js/sec-records.js',
  './js/app.js',
  './assets/brand/prabhu-logo.png',
  './assets/fonts/fonts.css',
  './assets/fonts/barlow-400.woff2',
  './assets/fonts/barlow-500.woff2',
  './assets/fonts/barlow-600.woff2',
  './assets/fonts/barlow-700.woff2',
  './assets/fonts/barlow-condensed-600.woff2',
  './assets/fonts/barlow-condensed-700.woff2',
  './icons/icon-180.png',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/maskable-192.png',
  './icons/maskable-512.png',
  './icons/icon-32.png',
  './icons/icon.svg'
];

var BADGES = [
  './assets/badges/sec-sora.png',
  './assets/badges/sec-spo.png',
  './assets/badges/sec-warehouse.png',
  './assets/badges/sec-area-melur.png',
  './assets/badges/sec-st-batang.png',
  './assets/badges/sec-dsp.png',
  './assets/badges/sec-kota-batak-junction.png',
  './assets/badges/sec-kota-batak-kp21.png',
  './assets/badges/sec-menggala-booster.png',
  './assets/badges/sec-dumai-metering.png',
  './assets/badges/wt-team.png',
  './assets/badges/wt-1.png',
  './assets/badges/wt-2.png',
  './assets/badges/wt-3.png',
  './assets/badges/wt-4.png',
  './assets/badges/wt-5.png',
  './assets/badges/wt-6.png',
  './assets/badges/wt-7.png',
  './assets/badges/wt-8.png',
  './assets/badges/wt-9.png',
  './assets/badges/wt-10.png',
  './assets/badges/wt-11.png',
  './assets/badges/wt-12.png',
  './assets/badges/wt-13.png'
];

self.addEventListener('install', function (event) {
  event.waitUntil(
    caches.open(CACHE_VERSION).then(function (cache) {
      return cache.addAll(SHELL).then(function () {
        // Each badge on its own; a failure costs that badge only.
        return Promise.all(BADGES.map(function (url) {
          return cache.add(url).catch(function () { return null; });
        }));
      });
    }).then(function () { return self.skipWaiting(); })
  );
});

self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys().then(function (names) {
      return Promise.all(names.map(function (name) {
        return name === CACHE_VERSION ? null : caches.delete(name);
      }));
    }).then(function () { return self.clients.claim(); })
  );
});

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);

  // Address lookups are never cached: a stale answer would burn the wrong
  // village into a photograph.
  if (url.origin !== self.location.origin) return;

  event.respondWith(
    caches.match(request).then(function (cached) {
      if (cached) return cached;
      return fetch(request).then(function (response) {
        if (response && response.status === 200 && response.type === 'basic') {
          var copy = response.clone();
          caches.open(CACHE_VERSION).then(function (cache) { cache.put(request, copy); });
        }
        return response;
      }).catch(function () {
        if (request.mode === 'navigate') return caches.match('./index.html');
        throw new Error('offline');
      });
    })
  );
});
