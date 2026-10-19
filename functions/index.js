'use strict';
// Optional backend for partner notifications when the PWA is closed.
// Deploy to the same Firebase project as Firestore.
// VAPID_PRIVATE_KEY is stored in Firebase Secret Manager, never in GitHub.
const admin=require('firebase-admin');
const webpush=require('web-push');
const {onDocumentCreated}=require('firebase-functions/v2/firestore');
const {defineString,defineSecret}=require('firebase-functions/params');

admin.initializeApp();
const vapidPublic=defineString('VAPID_PUBLIC_KEY');
const vapidSubject=defineString('VAPID_SUBJECT',{default:'mailto:admin@example.com'});
const vapidPrivate=defineSecret('VAPID_PRIVATE_KEY');

exports.notifyPartnerOnChange=onDocumentCreated({
 document:'rooms/{roomId}/records/{recordId}',
 region:'asia-northeast1',
 secrets:[vapidPrivate],
 retry:false
},async event=>{
 const record=event.data?.data();
 if(!record||record.collection!=='activity'||record.deleted||!record.value)return;
 const activity=record.value;
 if(!activity.actorId||!Number.isFinite(activity.at))return;
 // Do not alert for stale changes queued while offline for an extended time.
 if(Math.abs(Date.now()-activity.at)>15*60*1000)return;
 const room=event.params.roomId;
 const records=admin.firestore().collection('rooms').doc(room).collection('records');
 const subscriptions=await records.where('collection','==','pushSub').get();
 if(subscriptions.empty)return;
 const publicKey=vapidPublic.value();
 const subject=vapidSubject.value();
 if(!publicKey||!subject)throw new Error('VAPID public key and subject are not configured');
 webpush.setVapidDetails(subject,publicKey,vapidPrivate.value());
 // The payload intentionally contains no guest names, amounts or private event data.
 const payload=JSON.stringify({kind:'partner-update'});
 await Promise.allSettled(subscriptions.docs.map(async doc=>{
  const data=doc.data();
  const info=data.value||{};
  if(data.deleted||info.actorId===activity.actorId||!info.subscription?.endpoint)return;
  try{
   await webpush.sendNotification(info.subscription,payload,{TTL:3600,urgency:'normal'});
  }catch(err){
   if(err.statusCode===404||err.statusCode===410){
    // Remove expired subscriptions using admin rights.
    await doc.delete();
   }else{
    console.error('Web Push failed',err.statusCode||err.message);
   }
  }
 }));
});
