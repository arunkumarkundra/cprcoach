/* CPR Coach service worker.
   Network-first for the HTML document — a cache-first document meant users kept
   getting a stale app shell paired with fresh language files, which looked like
   random missing steps. Cache-first only for static assets that are versioned. */
const V="cprcoach-v7";
const CORE=["./","./index.html","./manifest.webmanifest",
 "./assets/icon-192.png","./assets/icon-512.png",
 "./lang/hi.js","./lang/kn.js","./lang/ta.js","./lang/es.js","./lang/ar.js"];

self.addEventListener("install",e=>{
 self.skipWaiting();
 e.waitUntil(caches.open(V).then(c=>Promise.allSettled(CORE.map(u=>c.add(u)))));
});
self.addEventListener("activate",e=>{
 e.waitUntil(caches.keys()
  .then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k))))
  .then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
 const req=e.request;
 if(req.method!=="GET")return;
 const url=new URL(req.url);
 if(url.origin!==location.origin)return;              // never cache the video CDN

 const isDoc = req.mode==="navigate" || url.pathname.endsWith(".html") || url.pathname.endsWith("/");
 if(isDoc){
  // network first: always try for the newest app shell, fall back to cache offline
  e.respondWith(
   fetch(req).then(r=>{
    if(r&&r.status===200)caches.open(V).then(c=>c.put(req,r.clone()));
    return r;
   }).catch(()=>caches.match(req,{ignoreSearch:true}).then(hit=>hit||caches.match("./index.html")))
  );
  return;
 }
 // static assets: cache first, refresh in the background
 e.respondWith(
  caches.match(req,{ignoreSearch:true}).then(hit=>{
   const net=fetch(req).then(r=>{
    if(r&&r.status===200)caches.open(V).then(c=>c.put(req,r.clone()));
    return r;
   }).catch(()=>hit);
   return hit||net;
  })
 );
});
