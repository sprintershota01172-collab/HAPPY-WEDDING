const CACHE = 'happy-wedding-v12-20261020r8';
const SHELL = ['./','./index.html','./styles.css?v=20261020r8','./app.js?v=20261020r8','./sync.js','./notifications.js','./manifest.webmanifest','./icon.svg'];
self.addEventListener('install', e => { e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting())); });
self.addEventListener('activate', e => { e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim())); });
self.addEventListener('fetch',event=>{
 if(event.request.method!=='GET')return;
 const url=new URL(event.request.url);
 if(url.origin!==self.location.origin)return;
 event.respondWith((async()=>{
  try{
   const response=await fetch(event.request,{cache:'no-store'});
   if(response.ok){
    const cache=await caches.open(CACHE);
    event.waitUntil(cache.put(event.request,response.clone()).catch(()=>{}));
   }
   return response;
  }catch{
   const cached=await caches.match(event.request,{ignoreSearch:true});
   if(cached)return cached;
   if(event.request.mode==='navigate')return caches.match('./index.html');
   return Response.error();
  }
 })());
});
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
