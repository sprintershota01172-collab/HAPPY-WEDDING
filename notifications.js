import {queueChange} from './sync.js';

const DEVICE_KEY='happy_wedding_device_id_v1';
let deviceId=localStorage.getItem(DEVICE_KEY);
if(!deviceId){deviceId=crypto.randomUUID();localStorage.setItem(DEVICE_KEY,deviceId)}
let hooks={getRoom:()=>'',getRole:()=>'',toast:()=>{},modal:()=>{}};
const cache=new Map();
const label={tasks:'やること',guests:'ゲスト',payments:'支払い',categories:'予算',gifts:'ご祝儀',tables:'席次表',timeline:'当日の進行',vendors:'打ち合わせ',ideas:'アイデア',items:'持ち物',thanks:'お礼',roles:'役割',comments:'ひとこと',settings:'基本設定',schedules:'準備予定',extras:'必要なもの',presents:'お祝い・お返し'};
const feedKey=room=>'hw_change_feed_'+room;
const seenKey=room=>'hw_feed_seen_'+room+'_'+deviceId;
const currentRoom=()=>hooks.getRoom()||'';

function feed(room){
 if(cache.has(room))return cache.get(room);
 let arr=[];
 try{const read=JSON.parse(localStorage.getItem(feedKey(room))||'[]');if(Array.isArray(read))arr=read}catch{}
 cache.set(room,arr);return arr;
}
function put(room,event){
 if(!room||!event?.id)return false;
 const list=feed(room);
 if(list.some(x=>x.id===event.id))return false;
 list.unshift(event);
 list.sort((a,b)=>b.at-a.at);
 if(list.length>100)list.length=100;
 try{localStorage.setItem(feedKey(room),JSON.stringify(list))}catch{}
 return true;
}
export function initPartnerRoom(room){
 if(room&&localStorage.getItem(seenKey(room))===null){
  localStorage.setItem(seenKey(room),String(Date.now()));
 }
}
export function setupPartnerNotifications(options){
 hooks=options;initPartnerRoom(currentRoom());
 document.getElementById('header-notifications')?.addEventListener('click',openPartnerFeed);
 updatePartnerBell();
}
export function announcePartnerChange(collection,verb='更新'){
 const room=currentRoom();if(!room)return;
 const event={id:crypto.randomUUID(),at:Date.now(),actorId:deviceId,
  actor:hooks.getRole()||'パートナー',section:label[collection]||'準備',
  verb:verb==='完了'?'完了':verb};
 put(room,event);
 queueChange('activity',event.id,event);
}
export function receivePartnerActivity(entry,meta={}){
 const room=currentRoom(),event=entry?.value||entry;
 if(!room||!event?.id||event.actorId===deviceId)return;
 if(!put(room,event))return;
 updatePartnerBell();
 if(!meta.initial&&event.at>Date.now()-120000){
  const message=(event.actor||'パートナー')+'が'+(event.section||'準備')+'を'+(event.verb||'更新')+'しました';
  hooks.toast(message);
  if(document.hidden&&'Notification' in window&&Notification.permission==='granted'){
   try{new Notification('Happy Wedding',{body:message,icon:'./icon.svg'})}catch{}
  }
 }
}
export function updatePartnerBell(){
 const button=document.getElementById('header-notifications');if(!button)return;
 const room=currentRoom();
 const seen=room?Number(localStorage.getItem(seenKey(room))||Date.now()):Date.now();
 const unread=room?feed(room).filter(x=>x.actorId!==deviceId&&x.at>seen).length:0;
 button.classList.toggle('has-unread',unread>0);
 button.setAttribute('aria-label',unread?'パートナーからの通知 '+unread+'件':'変更通知');
 button.innerHTML='<svg width="21" height="21" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9ZM10 21h4"/></svg>'+(unread?'<span class="notification-count">'+Math.min(unread,99)+'</span>':'');
}
export function openPartnerFeed(){
 const room=currentRoom();
 if(!room){hooks.toast('「その他 → ふたりで共有」から接続すると、変更通知を受け取れます');return}
 const all=feed(room).filter(x=>x.actorId!==deviceId).slice(0,50);
 localStorage.setItem(seenKey(room),String(Date.now()));updatePartnerBell();
 const escape=s=>String(s??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
 const body=all.length?'<div class="activity-list">'+all.map(a=>
  '<div class="activity-row"><b>'+escape(a.actor||'パートナー')+'</b>が'+escape(a.section||'準備')+'を'+escape(a.verb||'更新')+'しました'
  +'<time>'+new Date(a.at).toLocaleString('ja-JP',{month:'numeric',day:'numeric',hour:'2-digit',minute:'2-digit'})+'</time></div>'
 ).join('')+'</div>':'<div class="empty">まだパートナーからの変更はありません。</div>';
 hooks.modal('ふたりの更新履歴',body);
}
export async function enablePartnerPush(publicVapidKey){
 const room=currentRoom();
 if(!room){hooks.toast('先に「ふたりで共有」を設定してください');return}
 if(!('Notification' in window)){hooks.toast('このブラウザは通知に対応していません');return}
 const permission=await Notification.requestPermission();
 if(permission!=='granted'){hooks.toast('通知が許可されていません');return}
 if(!publicVapidKey){
  hooks.toast('アプリを開いている間の変更通知は有効です。閉じている間の通知はプッシュ配信設定が必要です');
  return;
 }
 if(!('serviceWorker' in navigator)||!('PushManager' in window)){
  hooks.toast('この端末でWebプッシュは利用できません');return;
 }
 try{
  const registration=await navigator.serviceWorker.ready;
  const str=publicVapidKey.replace(/-/g,'+').replace(/_/g,'/');
  const key=Uint8Array.from(atob(str.padEnd(Math.ceil(str.length/4)*4,'=')),c=>c.charCodeAt(0));
  let subscription=await registration.pushManager.getSubscription();
  if(subscription&&!subscription.options?.applicationServerKey){
   await subscription.unsubscribe();subscription=null;
  }
  if(!subscription)subscription=await registration.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:key});
  queueChange('pushSub',deviceId,{actorId:deviceId,subscription:subscription.toJSON()});
  hooks.toast('この端末をプッシュ通知に登録しました。Firebase Functionsの配信設定が必要です');
 }catch(err){console.error(err);hooks.toast('プッシュ登録に失敗。iPhoneではホーム画面に追加してからお試しください')}
}
