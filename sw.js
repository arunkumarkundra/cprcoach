/* SELF-UNINSTALLING WORKER.
   The previous service worker could serve a stale copy of itself, which meant
   fixes never reached devices and looked like the app randomly losing steps.
   This version exists only to remove every trace of its predecessors.
   Offline support returns once the UI stops changing daily — see SPEC.md §9. */
self.addEventListener("install",()=>self.skipWaiting());
self.addEventListener("activate",e=>{
 e.waitUntil((async()=>{
  const keys=await caches.keys();
  await Promise.all(keys.map(k=>caches.delete(k)));
  await self.registration.unregister();
  const cs=await self.clients.matchAll({type:"window"});
  cs.forEach(c=>c.navigate(c.url));
 })());
});
/* no fetch handler at all — every request goes straight to the network */
