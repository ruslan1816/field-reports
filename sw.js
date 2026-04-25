const CACHE_NAME = 'nw-field-v127';
const ASSETS = [
  './',
  './index.html',
  './login.html',
  './history.html',
  './service-call-report.html',
  './startup-report.html',
  './site-survey-report.html',
  './pm-checklist.html',
  './work-order.html',
  './change-order.html',
  './rfi.html',
  './projects.html',
  './management.html',
  './equipment.html',
  './report-view.html',
  './support.html',
  './install.html',
  './styles.css',
  './icon-192.png',
  './icon-512.png',
  './logo-header.png',
  './draft-utils.js',
  './email-utils.js',
  './auth.js',
  './supabase-config.js',
  './project-utils.js',
  './equipment-utils.js',
  './cloud-save.js',
  './edit-utils.js',
  './customer-utils.js',
  './ai-summary.js',
  './ai-chat.js',
  './pdf-utils.js',
  './form-utils.js',
  './schedule.html',
  './schedule-utils.js',
  './submittals-generator.html',
  './customers.html',
  './dispatch.html',
  './sw-register.js',
  'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap',
  'https://cdn.jsdelivr.net/npm/@emailjs/browser@4/dist/email.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js',
  'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js'
];

// CDN URLs — these rarely change, safe to cache-first
const CDN_HOSTS = ['fonts.googleapis.com', 'fonts.gstatic.com', 'cdn.jsdelivr.net', 'cdnjs.cloudflare.com', 'unpkg.com'];

function isCDN(url) {
  try {
    var host = new URL(url).hostname;
    return CDN_HOSTS.some(function(h) { return host === h; });
  } catch(e) { return false; }
}

// Install — cache all assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

// Activate — clean old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

// Message — allow page to trigger skipWaiting
self.addEventListener('message', event => {
  if (event.data && event.data.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});

// Fetch strategy:
//   CDN assets → cache-first (they never change)
//   App files  → network-first, fall back to cache (always get latest)
self.addEventListener('fetch', event => {
  var request = event.request;
  if (request.method !== 'GET') return;

  // CDN assets: cache-first
  if (isCDN(request.url)) {
    event.respondWith(
      caches.match(request).then(cached => {
        return cached || fetch(request).then(response => {
          if (response.ok) {
            var clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
          }
          return response;
        });
      })
    );
    return;
  }

  // App files: network-first, cache fallback (for offline)
  event.respondWith(
    fetch(request).then(response => {
      if (response.ok) {
        var clone = response.clone();
        caches.open(CACHE_NAME).then(cache => cache.put(request, clone));
      }
      return response;
    }).catch(() => {
      return caches.match(request).then(cached => {
        if (cached) return cached;
        // Offline navigation fallback
        if (request.mode === 'navigate') {
          return caches.match('./index.html');
        }
      });
    })
  );
});
