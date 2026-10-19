
const PENDING_KEY='hw_pending_2026_v1';
let active=null;
let pending=JSON.parse(localStorage.getItem(PENDING_KEY)||'[]');
function saveQueue(){try{localStorage.setItem(PENDING_KEY,JSON.stringify(pending))}catch(e){console.warn('Queue storage full',e)}}
export function roomCode(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('')}
export function queueChange(collection,id,value,deleted=false){
 const room=JSON.parse(localStorage.getItem('happy_wedding_cloud_v1')||'null')?.room||'';
 const entry={collection,id,value,deleted,updatedAt:Date.now(),room};
 pending=pending.filter(x=>!(x.room===room&&x.collection===collection&&x.id===id));
 pending.push(entry);saveQueue();flush();return entry;
}
async function flush(){
 if(!active||active.flushing||!navigator.onLine)return;
 active.flushing=true;
 try{
  while(active&&navigator.onLine){
   const i=pending.findIndex(x=>x.room===active.room);
   if(i<0)break;
   const item=pending[i];
   const payload={collection:item.collection,id:item.id,value:item.value,deleted:item.deleted,updatedAt:item.updatedAt};
   await active.setDoc(active.doc(active.db,'rooms',active.room,'records',item.collection+'_'+item.id),payload);
   pending.splice(i,1);saveQueue();
  }
  if(active&&active.onStatus)active.onStatus('synced');
 }catch(e){if(active&&active.onStatus)active.onStatus('offline');console.warn('Cloud sync queued',e)}
 finally{if(active)active.flushing=false}
}
export async function startSync(config,room,onRemote,onStatus,onReady){
 stopSync();
 if(!config?.apiKey||!config?.projectId||!config?.appId)throw Error('FirebaseのapiKey、projectId、appIdが必要です');
 if(!/^[a-f0-9]{48}$/.test(room))throw Error('共有コードは48文字の英数字です');
 onStatus('connecting');
 const [fa,auth,fs]=await Promise.all([
  import('https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js'),
  import('https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js'),
  import('https://www.gstatic.com/firebasejs/10.12.5/firebase-firestore.js')
 ]);
 const app=fa.getApps().find(a=>a.name==='hw-'+config.projectId)||fa.initializeApp(config,'hw-'+config.projectId);
 const a=auth.getAuth(app);
 await auth.signInAnonymously(a);
 const db=fs.getFirestore(app);
 const current={room,db,doc:fs.doc,setDoc:fs.setDoc,onStatus,unsub:null,flushing:false};
 active=current;
 current.unsub=fs.onSnapshot(fs.collection(db,'rooms',room,'records'),snapshot=>{
  if(active!==current)return;
  for(const change of snapshot.docChanges()){
   const entry=change.doc.data();
   if(!entry.collection||!entry.id)continue;
   const dirty=pending.some(x=>x.room===room&&x.collection===entry.collection&&x.id===entry.id);
   if(!dirty)onRemote(entry,{initial:!current.ready,kind:change.type});
  }
  if(!current.ready){current.ready=true;onReady(snapshot.empty);}
  onStatus(navigator.onLine?'synced':'offline');
  flush();
 },err=>{console.error('Firestore listener',err);onStatus('error');});
 window.addEventListener('online',flush);
 return true;
}
export function stopSync(){if(active?.unsub)active.unsub();active=null;window.removeEventListener('online',flush)}
export function queuedCount(){return pending.length}
