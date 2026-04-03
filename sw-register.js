/**
 * sw-register.js — Auto-updating Service Worker registration
 *
 * When a new SW version is deployed:
 * 1. Browser detects the new sw.js on next page load
 * 2. New SW installs (skipWaiting activates it immediately)
 * 3. controllerchange fires → page auto-reloads with fresh cache
 *
 * No more manual cache clearing or hard restarts needed.
 */
(function() {
  'use strict';
  if (!('serviceWorker' in navigator)) return;

  var refreshing = false;

  // Auto-reload when a new SW takes control
  navigator.serviceWorker.addEventListener('controllerchange', function() {
    if (refreshing) return;
    refreshing = true;
    console.log('[sw-register] New version active — reloading...');
    window.location.reload();
  });

  // Register and check for updates
  navigator.serviceWorker.register('sw.js').then(function(reg) {
    // Check for updates every 10 seconds while page is open
    setInterval(function() {
      reg.update().catch(function() {});
    }, 10000);

    // If there's a waiting SW (installed but not yet active), activate it
    if (reg.waiting) {
      reg.waiting.postMessage({ type: 'SKIP_WAITING' });
    }

    // When a new SW is found and installed, activate it immediately
    reg.addEventListener('updatefound', function() {
      var newWorker = reg.installing;
      if (!newWorker) return;
      newWorker.addEventListener('statechange', function() {
        if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
          console.log('[sw-register] New version installed — activating...');
          newWorker.postMessage({ type: 'SKIP_WAITING' });
        }
      });
    });
  }).catch(function(err) {
    console.error('[sw-register] Registration failed:', err);
  });
})();
