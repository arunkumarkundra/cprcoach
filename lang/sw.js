/* CPR Coach service worker — the emergency path must survive with no network. */
const V="cprcoach-v3";
const CORE=["./","./index.html","./manifest.webmanifest",
 "./lang/hi.js","./lang/kn.js","./lang/ta.js","./lang/es.js","./lang/ar.js","./lang/manifest.json"];
self.addEventListener("install",e=>{
 self.skipWaiting();
 e.waitUntil(caches.open(V).then(c=>Promise.allSettled(CORE.map(u=>c.add(u)))));
});
self.addEventListener("activate",e=>{
 e.waitUntil(caches.keys().then(ks=>Promise.all(ks.filter(k=>k!==V).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener("fetch",e=>{
 if(e.request.method!=="GET")return;
 const url=new URL(e.request.url);
 if(url.origin!==location.origin)return;           // never cache the video CDN
 e.respondWith(
  caches.match(e.request,{ignoreSearch:true}).then(hit=>{
   const net=fetch(e.request).then(r=>{
    if(r&&r.status===200)caches.open(V).then(c=>c.put(e.request,r.clone()));
    return r;
   }).catch(()=>hit);
   return hit||net;                                 // cache first: speed matters more than freshness
  })
 );
});
