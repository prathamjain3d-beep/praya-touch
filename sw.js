const CACHE = 'praya-ar-6d33402240549fee';
const FILES = ["assets/index-C9tBGhFx.css","assets/index-a9FzitH4.js","assets/vision_bundle-Cn77874a.js","index.html","mediapipe/hand_landmarker.task","mediapipe/wasm/vision_wasm_internal.js","mediapipe/wasm/vision_wasm_internal.wasm","mediapipe/wasm/vision_wasm_nosimd_internal.js","mediapipe/wasm/vision_wasm_nosimd_internal.wasm"];
﻿/* CACHE and FILES are injected by the build plugin. Never installed in dev. */
const RUNTIME_CACHE = 'praya-models-v1';
self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    for (let i = 0; i < FILES.length; i += 4) {
      await Promise.all(FILES.slice(i, i + 4).map(async path => {
        const request = new Request(new URL(path, self.registration.scope));
        const response = await fetch(request);
        if (!response.ok) throw new Error(`Offline asset failed: ${path}`);
        await cache.put(request, response);
      }));
    }
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) if (key.startsWith('praya-ar-') && key !== CACHE) await caches.delete(key);
    await self.clients.claim();
  })());
});
self.addEventListener('message', event => {
  if (event.data?.type !== 'CACHE_USED_MODELS' || !Array.isArray(event.data.urls)) return;
  event.waitUntil((async () => {
    const cache = await caches.open(RUNTIME_CACHE);
    for (const value of event.data.urls) {
      const url = new URL(value, self.registration.scope);
      if (!url.href.startsWith(self.registration.scope)) continue;
      const path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
      if (!/\.glb$/i.test(url.pathname) && !path.startsWith('draco/')) continue;
      if (await cache.match(url.href)) continue;
      try {
        const response = await fetch(new Request(url));
        if (response.ok) await cache.put(url.href, response);
      } catch { /* Offline or restricted storage must not break online use. */ }
    }
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET' || !request.url.startsWith(self.registration.scope)) return;
  const url = new URL(request.url), path = url.pathname.slice(new URL(self.registration.scope).pathname.length);
  const navigation = request.mode === 'navigate' || path === 'index.html' || path === '';
  if (navigation) {
    event.respondWith((async () => {
      const cache = await caches.open(CACHE), key = new URL('index.html', self.registration.scope).href;
      try {
        const response = await fetch(request);
        if (response.ok) { await cache.put(key, response.clone()).catch(() => {}); return response; }
        return await cache.match(key) || response;
      } catch (error) { const cached = await cache.match(key); if (cached) return cached; throw error; }
    })());
    return;
  }
  const runtime = /\.glb$/i.test(url.pathname) || path.startsWith('draco/');
  const shell = FILES.includes(path) || /^assets\/.*\.(js|css)$/.test(path);
  if (!runtime && !shell) return;
  // waitUntil must be registered during dispatch, even for cache revalidation.
  let finish;
  event.waitUntil(new Promise(resolve => { finish = resolve; }));
  event.respondWith((async () => {
    try {
      const cache = await caches.open(runtime ? RUNTIME_CACHE : CACHE);
      const cached = await cache.match(request);
      if (cached && !runtime) { finish(); return cached; }
      const network = (async () => {
        const response = await fetch(request);
        if (response.ok) await cache.put(request, response.clone()).catch(() => {});
        return response;
      })();
      if (cached) { network.catch(() => {}).finally(finish); return cached; }
      try { return await network; } finally { finish(); }
    } catch (error) { finish(); throw error; }
  })());
});
