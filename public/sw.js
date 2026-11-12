const CACHE='garu-slap-rus-static-v0.6.0-arcade';
const PREFIX='garu-slap-rus-static-';
const ASSETS=['/offline.html','/style.css?v=0.6.0','/app.js?v=0.5.0','/game.js?v=0.5.0','/device.js','/result-guard.js?v=0.5.0','/pwa.js?v=arcade','/manifest.webmanifest','/icons/icon-192.png','/icons/icon-512.png','/icons/icon-maskable-512.png','/icons/icon-180.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(ASSETS)));});
// Wait for existing game windows to close before activating a future update.
self.addEventListener('activate',event=>{event.waitUntil((async()=>{const keys=await caches.keys();await Promise.all(keys.filter(key=>key.startsWith(PREFIX)&&key!==CACHE).map(key=>caches.delete(key)));await self.clients.claim();})());});
self.addEventListener('fetch',event=>{
 const request=event.request,url=new URL(request.url);
 if(request.method!=='GET'||url.origin!==self.location.origin||url.pathname.startsWith('/api/'))return;
 if(request.mode==='navigate'){
  event.respondWith(fetch(request).catch(()=>caches.open(CACHE).then(cache=>cache.match('/offline.html')).then(response=>response||Response.error())));return;
 }
 if(!ASSETS.includes(url.pathname+url.search))return;
 event.respondWith((async()=>{const cache=await caches.open(CACHE);const cached=await cache.match(request);if(cached)return cached;const response=await fetch(request);if(response.ok)await cache.put(request,response.clone());return response;})());
});
