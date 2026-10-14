const CACHE='xvault-shell-v1';
const FILES=['./','./index.html','./style.css','./app.js','./media.js','./store.js','./icon.svg','./icon.png','./manifest.webmanifest'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k.startsWith('xvault-shell-')&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET'||new URL(event.request.url).origin!==self.location.origin)return;
  const url=new URL(event.request.url); if(!FILES.some(path=>new URL(path,self.registration.scope).pathname===url.pathname))return;
  event.respondWith(fetch(event.request).then(response=>{if(response.ok){const clone=response.clone();event.waitUntil(caches.open(CACHE).then(cache=>cache.put(event.request,clone)));}return response;}).catch(()=>caches.match(event.request).then(cached=>cached||Response.error())));
});
