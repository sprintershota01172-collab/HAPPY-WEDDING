const CACHE = 'happy-wedding-v3';
const SHELL = ['./','./index.html','./styles.css','./app.js','./sync.js','./notifications.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch', e => { if(e.request.method!=='GET') return; const u=new URL(e.request.url); if(u.origin!==self.location.origin) return; e.respondWith(fetch(e.request).then(r=>{if(r.ok){const clone=r.clone();caches.open(CACHE).then(c=>c.put(e.request,clone));}return r;}).catch(()=>caches.match(e.request).then(r=>r||caches.match('./index.html')))); });
self.addEventListener('message',e=>{if(e.data?.type==='SKIP_WAITING')self.skipWaiting()});
self.addEventListener('push', event => {
 let data={};
 try{data=event.data?.json()||{}}catch{}
 const title='Happy Wedding';
 const body='パートナーが結婚式の準備を更新しました';
 event.waitUntil(self.registration.showNotification(title,{
  body,icon:'./icon.svg',badge:'./icon.svg',tag:'partner-update',
  data:{url:'./'}
 }));
});
self.addEventListener('notificationclick', event => {
 event.notification.close();
 event.waitUntil((async()=>{
  const url=new URL('./',self.registration.scope).href;
  const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
  const existing=windows.find(c=>c.url.startsWith(self.registration.scope));
  if(existing){await existing.focus();return}
  await clients.openWindow(url);
 })());
});
