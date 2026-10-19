
import {startSync,stopSync,roomCode,queueChange,queuedCount} from './sync.js';

const KEY='happy_wedding_local_v1';
const CLOUD_KEY='happy_wedding_cloud_v1';
const COLORS=['#d995a3','#a9c9b9','#c3ab96','#b6b4d8','#e3be8e','#91c1c7','#c5a8c6','#b6bd91'];
const DEFAULT_ROLES=[
 {id:'groom',name:'新郎',color:COLORS[0]},{id:'bride',name:'新婦',color:COLORS[1]},
 {id:'parents',name:'両家の親',color:COLORS[2]},{id:'reception',name:'受付係',color:COLORS[3]},
 {id:'host',name:'司会・友人幹事',color:COLORS[4]},{id:'planner',name:'プランナー',color:COLORS[5]}
];
const DEFAULT_CATEGORIES=['会場','衣装','写真・映像','料理','装花','引出物','ペーパーアイテム','演出','二次会','新婚旅行'].map((name,i)=>({id:'c'+i,name,icon:['⌂','♕','▧','♨','✿','🎁','✉','♫','♡','✈'][i],budget:0,estimate:0,contract:0,manualPaid:0,color:COLORS[i%COLORS.length]}));
const ARRAYS=['roles','categories','tasks','payments','gifts','guests','tables','timeline','vendors','ideas','items','thanks','comments'];
function defaults(){return {version:1,setup:0,date:'2027-02-20',myRole:'groom',couple:['新郎','新婦'],budgetTotal:0,reminders:false,roles:DEFAULT_ROLES,categories:DEFAULT_CATEGORIES,tasks:[],payments:[],gifts:[],guests:[],tables:[],timeline:[],vendors:[],ideas:[],items:[],thanks:[],comments:[]}}
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!v)return defaults();const d=defaults();return {...d,...v,...Object.fromEntries(ARRAYS.map(k=>[k,Array.isArray(v[k])?v[k]:d[k]]))}}catch(e){return defaults()}}
let state=load(), tab='home', taskRole='all', guestView='list', moneyView='overview', morePage='',selectedGuest='', cloud=null;
const app=document.getElementById('main'),dialog=document.getElementById('modal'),modalContent=document.getElementById('modal-content'),toastEl=document.getElementById('toast');
let toastTimer=0,renderScheduled=false,completionSound=false;
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const e=(x)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const n=x=>Number(x)||0;
const yen=x=>'¥'+Math.round(n(x)).toLocaleString('ja-JP');
const id=()=> (crypto.randomUUID?.()||('x'+Date.now().toString(36)+Math.random().toString(36).slice(2)));
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
const parseDate=s=>new Date((s||today())+'T12:00:00');
const distance=s=>Math.round((parseDate(s)-parseDate(today()))/86400000);
const dayLabel=s=>s?new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric'}).format(parseDate(s)):'未設定';
const role=x=>state.roles.find(r=>r.id===x);
const cat=x=>state.categories.find(c=>c.id===x);
const nameRole=x=>role(x)?.name||'未担当';
const badge=(text,cl='')=>'<span class="pill '+cl+'">'+e(text)+'</span>';
const btn=(text,action,arg='',cl='ghost tiny')=>'<button class="btn '+cl+'" data-action="'+e(action)+'" data-id="'+e(arg)+'">'+text+'</button>';
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2900)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){toast('保存容量が不足しています。写真を減らしてバックアップしてください。')}}
function settingsRemote(){return {date:state.date,couple:state.couple,budgetTotal:state.budgetTotal,reminders:state.reminders}}
function setSetting(key,value){state[key]=value;save();if(syncEnabled())queueChange('settings','main',settingsRemote());render()}
function syncEnabled(){return Boolean(cloud?.config?.apiKey&&cloud?.room)}
function write(collection,item,opt={}){
 if(!ARRAYS.includes(collection))return;
 const idx=state[collection].findIndex(x=>x.id===item.id);
 if(idx<0)state[collection].push(item);else state[collection][idx]=item;
 save();if(syncEnabled())queueChange(collection,item.id,item);
 if(!opt.quiet)render();
}
function erase(collection,uid){state[collection]=state[collection].filter(x=>x.id!==uid);save();if(syncEnabled())queueChange(collection,uid,null,true);render()}
function remote(entry){
 if(entry.collection==='settings'){Object.assign(state,entry.value||{});save();scheduleRender();return}
 if(!ARRAYS.includes(entry.collection))return;
 const list=state[entry.collection],i=list.findIndex(x=>x.id===entry.id);
 if(entry.deleted){if(i>=0)list.splice(i,1)}
 else if(entry.value){if(i>=0)list[i]=entry.value;else list.push(entry.value)}
 save();scheduleRender();
}
function scheduleRender(){if(renderScheduled)return;renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;if(!dialog.open)render()})}
function status(s){const el=$('#connection');el.textContent=({connecting:'同期接続中',synced:'ふたりで同期中',offline:'オフライン保存',error:'同期エラー'})[s]||'この端末に保存';el.style.background=s==='error'?'#ffe4e5':''}
async function connect(){if(!syncEnabled())return;try{await startSync(cloud.config,cloud.room,remote,status,(empty)=>{
 if(empty){for(const c of ARRAYS)for(const item of state[c])queueChange(c,item.id,item);queueChange('settings','main',settingsRemote())}
 toast(empty?'共有ルームを作成しました':'共有ルームに接続しました');
 });}catch(err){status('error');console.error(err);toast('クラウド接続を確認してください: '+err.message)}}
function chooseTab(t){tab=t;morePage='';if(t==='home')moneyView='overview';render();app.scrollTop=0;window.scrollTo({top:0,behavior:'instant'})}
function header(title,right='',desc=''){return '<div class="page-head"><h1>'+e(title)+'</h1>'+right+'</div>'+(desc?'<div class="page-desc">'+e(desc)+'</div>':'')}
function section(title,right=''){return '<div class="section-title"><h2>'+title+'</h2>'+right+'</div>'}
function empty(msg){return '<div class="empty"><div class="flower">✿</div>'+msg+'</div>'}
function progress(items){return items.length?Math.round(items.filter(x=>x.done).length/items.length*100):0}
function formatPriority(x){return x==='high'?badge('優先','danger'):x==='low'?badge('ゆっくり','mint'):''}
function overdue(x){return x.due&&!x.done&&distance(x.due)<0}
function dueSoon(x){return x.due&&!x.done&&distance(x.due)>=0&&distance(x.due)<=7}
function render(){document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#connection').title=syncEnabled()?'共有コード設定済み':'端末に保存';if(!state.setup){app.innerHTML=renderSetup();return}
 app.innerHTML=tab==='home'?renderHome():tab==='tasks'?renderTasks():tab==='money'?renderMoney():tab==='guests'?renderGuests():renderMore();
}
function renderSetup(){const step=state.setup===1?2:1;return '<div class="setup"><div class="setup-flower">✿ ♡ ✿</div><h1>Happy Wedding</h1><p>ふたりの特別な一日まで。<br>準備も一緒に楽しもう。</p><div class="card">'+(step===1?'<div class="eyebrow">STEP 1 / 2</div><h2>挙式日はいつ？</h2><form data-form="setup1">'+field('挙式日','date','date',state.date,true)+'<button class="btn primary btn-wide">次へ →</button></form>':'<div class="eyebrow">STEP 2 / 2</div><h2>あなたの役割は？</h2><form data-form="setup2">'+selectField('role','あなたの役割',state.roles,state.myRole)+'<button class="btn primary btn-wide">はじめる ♡</button></form>')+'</div><p>あとから設定を変更できます。<br>データは自動でこの端末に保存されます。</p></div>'}
function renderHome(){
 const left=distance(state.date),done=state.tasks.filter(t=>t.done).length,total=state.tasks.length,paid=totalPaid(), forecast=totalForecast();
 const near=state.tasks.filter(x=>!x.done&&x.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,4);
 const nextPay=state.payments.filter(p=>!p.paid&&p.due).sort((a,b)=>a.due.localeCompare(b.due)).slice(0,2);
 let h='<div class="hero"><div class="overline">OUR WEDDING DAY</div><div class="days">'+Math.abs(left)+'</div><div class="days-label">'+(left>=0?'DAYS TO GO':'DAYS SINCE')+'</div><div class="wedding-date">'+e(state.date.replaceAll('-',' . '))+'</div><div class="couple">'+e(state.couple[0])+' ♡ '+e(state.couple[1])+'</div><p class="hero-message">'+(left>0?'結婚式まであと'+left+'日だね。ひとつずつ、楽しもう！':left===0?'今日はふたりの特別な日。おめでとう！':'大切な一日から'+Math.abs(left)+'日。ありがとうを届けよう。')+'</p></div>';
 h+='<div class="metric-grid"><div class="metric"><div class="row between"><span class="small muted">準備の進み具合</span><span class="symbol">✿</span></div><div class="value">'+progress(state.tasks)+'%</div><div class="progress"><span style="width:'+progress(state.tasks)+'%"></span></div><div class="detail">'+done+' / '+total+' タスク完了</div></div><div class="metric"><div class="row between"><span class="small muted">自己負担見込み</span><span class="symbol">♡</span></div><div class="value" style="font-size:18px">'+yen(Math.max(0,forecast-totalGifts()))+'</div><div class="detail">見込費用 − ご祝儀</div></div></div>';
 h+=section('つぎにやること',btn('一覧を見る →','nav','tasks'))+(near.length?'<div class="list">'+near.map(t=>taskCard(t,true)).join('')+'</div>':empty('まだ期限付きタスクがありません。<br>準備テンプレートから始めましょう。'));
 if(!total)h+='<p>'+btn('準備スケジュールを一括追加','template','','primary')+'</p>';
 h+=section('お支払い予定',btn('お金を見る →','nav','money'))+(nextPay.length?'<div class="card">'+nextPay.map(p=>'<div class="row between" style="padding:6px 0"><div><b>'+e(p.title)+'</b><div class="small muted">'+dayLabel(p.due)+' · '+e(nameRole(p.payer))+'</div></div><b>'+yen(p.amount)+'</b></div>').join('')+'</div>':'<div class="card small muted">支払い予定はまだ登録されていません。</div>');
 h+=section('ふたりのひとこと',btn('コメントを残す ＋','comment'))+'<div class="card">'+(state.comments.length?state.comments.slice().sort((a,b)=>b.at-a.at).slice(0,4).map(c=>'<div style="padding:8px 0;border-bottom:1px solid #f4eeea"><div class="small muted">'+e(c.author||'ふたり')+' · '+new Date(c.at).toLocaleDateString('ja-JP')+'</div><div class="twoline">'+e(c.text)+'</div></div>').join(''):'<div class="small muted">「これ楽しみ！」など、ひとこと残してみよう。</div>')+'</div>';
 h+='<div class="callout">✿　進み具合は比べなくて大丈夫。ふたりのペースで。</div>';
 return h;
}
function taskCard(t,compact=false){
 const who=role(t.role),sub=t.subtasks||[],subDone=sub.filter(s=>s.done).length;
 return '<div class="item '+(t.done?'done':'')+'"><input class="check" aria-label="'+e(t.title)+'を完了" type="checkbox" data-action="toggle-task" data-id="'+e(t.id)+'" '+(t.done?'checked':'')+'><div class="content"><div class="item-title">'+e(t.title)+'</div><div class="item-sub"><span class="role-dot" style="background:'+e(who?.color||'#ccc')+'"></span> '+e(who?.name||'未担当')+(t.due?' · '+dayLabel(t.due):'')+' '+(overdue(t)?badge('期限を過ぎています','danger'):dueSoon(t)?badge('もうすぐ','warn'):'')+' '+formatPriority(t.priority)+(sub.length?' · '+subDone+'/'+sub.length+' 小項目':'')+'</div></div>'+btn('編集','edit-task',t.id)+'</div>';
}
function renderTasks(){
 const done=state.tasks.filter(t=>t.done).length;
 let h=header('やること',btn('＋ 追加','new-task','','primary'),'役割で分けて、みんなで少しずつ');
 h+='<div class="card"><div class="row between"><b>準備の達成率</b><b>'+progress(state.tasks)+'%</b></div><div class="progress mt"><span style="width:'+progress(state.tasks)+'%"></span></div><div class="caption">'+done+' / '+state.tasks.length+' 件完了</div></div>';
 const tabs=[['all','全員分'],['me','自分の担当'],...state.roles.map(r=>[r.id,r.name])];
 h+='<div class="tabs">'+tabs.map(t=>'<button class="tab '+(taskRole===t[0]?'active':'')+'" data-action="task-filter" data-id="'+e(t[0])+'">'+e(t[1])+'</button>').join('')+'</div>';
 const list=state.tasks.filter(t=>taskRole==='all'||(taskRole==='me'&&t.role===state.myRole)||t.role===taskRole).sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999'));
 h+='<div class="filterbar"><span class="small muted">'+list.length+'件のタスク</span>'+btn('✿ 準備テンプレート','template','','light tiny')+'</div>';
 h+=list.length?'<div class="list">'+list.map(t=>taskCard(t)).join('')+'</div>':empty('まだタスクはありません。<br>右上の追加ボタンかテンプレートから登録してね。');
 h+=section('役割ごとの進捗',btn('役割を編集','more','roles'));
 h+='<div class="card">'+state.roles.map(r=>{const all=state.tasks.filter(t=>t.role===r.id);return '<div class="bar-row"><div class="row between"><span><span class="role-dot" style="background:'+e(r.color)+'"></span> '+e(r.name)+'</span><small class="muted">'+all.filter(t=>t.done).length+'/'+all.length+' · '+progress(all)+'%</small></div><div class="bar-track"><span style="width:'+progress(all)+'%;background:'+e(r.color)+'"></span></div></div>'}).join('')+'</div>';
 return h;
}
function totalGifts(){return state.gifts.reduce((sum,x)=>sum+n(x.amount),0)}
function paidCategory(c){return n(c.manualPaid)+state.payments.filter(p=>p.category===c.id&&p.paid).reduce((s,p)=>s+n(p.amount),0)}
function totalPaid(){return state.categories.reduce((s,c)=>s+paidCategory(c),0)}
function forecastCat(c){return n(c.contract)>0?n(c.contract):n(c.estimate)}
function totalForecast(){return state.categories.reduce((s,c)=>s+forecastCat(c),0)}
function renderMoney(){
 let h=header('お金の管理',btn('＋ 追加','money-add','','primary'),'見積から支払い、ご祝儀までひと目で');
 h+='<div class="tabs">'+[['overview','全体'],['categories','項目別'],['payments','支払い'],['gifts','ご祝儀']].map(v=>'<button class="tab '+(moneyView===v[0]?'active':'')+'" data-action="money-view" data-id="'+v[0]+'">'+v[1]+'</button>').join('')+'</div>';
 const budget=n(state.budgetTotal),cost=totalForecast(),paid=totalPaid(),gifts=totalGifts();
 if(moneyView==='overview'){
  const progressPct=budget?Math.round(cost/budget*100):0;
  h+='<div class="card"><div class="small muted">費用見込み</div><div class="amount">'+yen(cost)+'</div><div class="small muted">全体予算 '+(budget?yen(budget):'未設定')+'　'+btn('予算を設定','budget-total')+'</div><div class="donut-wrap mt"><div class="donut" style="background:conic-gradient(#d99aa8 0 '+Math.min(progressPct,100)+'%,#edf0e9 '+Math.min(progressPct,100)+'% 100%)"><div class="donut-inner"><b>'+progressPct+'%</b><small>予算使用率</small></div></div><div class="legend"><div><span class="small muted">支払済み</span><div class="strong">'+yen(paid)+'</div></div><div><span class="small muted">見込額の未払い</span><div class="strong">'+yen(Math.max(0,cost-paid))+'</div></div><div><span class="small muted">ご祝儀</span><div class="strong">'+yen(gifts)+'</div></div></div></div>'+(budget&&cost>budget?'<div class="notice">予算より '+yen(cost-budget)+' ほど多くなりそう。項目ごとに確認してみよう。</div>':'')+'</div>';
  h+='<div class="metric-grid"><div class="metric"><div class="small muted">契約・見積ベース</div><div class="amount" style="font-size:17px;margin-top:9px">'+yen(cost)+'</div></div><div class="metric" style="background:#fff0f2"><div class="small muted">最終持ち出し見込み</div><div class="amount" style="font-size:17px;margin-top:9px;color:#ad7280">'+yen(Math.max(0,cost-gifts))+'</div></div></div>';
  h+=section('項目ごとの予算',btn('詳しく →','money-view','categories'));
  h+='<div class="card">'+state.categories.filter(c=>n(c.budget)||forecastCat(c)).slice(0,8).map(c=>barCategory(c)).join('')+(state.categories.every(c=>!n(c.budget)&&!forecastCat(c))?'<div class="small muted">見積・契約額を入力するとグラフが表示されます。</div>':'')+'</div>';
  h+=section('支払いが近いもの',btn('支払いを管理 →','money-view','payments'))+'<div class="card">'+(state.payments.filter(p=>!p.paid).length?state.payments.filter(p=>!p.paid).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,3).map(p=>'<div class="row between" style="padding:6px 0"><span>'+e(p.title)+'<div class="small muted">'+dayLabel(p.due)+'</div></span><b>'+yen(p.amount)+'</b></div>').join(''):'<span class="small muted">未払い予定はありません。</span>')+'</div>';
 }
 if(moneyView==='categories'){
  h+='<div class="page-actions mb">'+btn('＋ 項目を追加','new-category','','light')+btn('全体予算の設定','budget-total')+'</div>';
  h+=state.categories.map(c=>'<div class="card"><div class="row between"><b>'+e(c.icon||'♡')+' '+e(c.name)+'</b>'+btn('編集','edit-category',c.id)+'</div><div class="row between mt"><span class="small muted">予算</span><b>'+yen(c.budget)+'</b></div><div class="row between mt"><span class="small muted">見積 / 契約</span><b>'+yen(c.estimate)+' / '+yen(c.contract)+'</b></div><div class="row between mt"><span class="small muted">支払済み / 未払い見込</span><b>'+yen(paidCategory(c))+' / '+yen(Math.max(0,forecastCat(c)-paidCategory(c)))+'</b></div>'+ (n(c.budget)&&forecastCat(c)>n(c.budget)?'<div class="caption warning">予算を'+yen(forecastCat(c)-n(c.budget))+'超えています</div>':'')+'</div>').join('');
 }
 if(moneyView==='payments'){
  h+='<div class="page-actions mb">'+btn('＋ 支払い予定','new-payment','','primary')+'</div>';
  const payments=state.payments.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  h+=payments.length?'<div class="list">'+payments.map(p=>'<div class="item"><input type="checkbox" class="check" aria-label="支払い完了" data-action="toggle-payment" data-id="'+e(p.id)+'" '+(p.paid?'checked':'')+'><div class="content"><div class="item-title">'+e(p.title)+'</div><div class="item-sub">'+e(cat(p.category)?.name||'未分類')+' · '+e(nameRole(p.payer))+' · '+dayLabel(p.due)+' '+(!p.paid&&p.due&&distance(p.due)<0?badge('期限超過','danger'):'')+'</div><div class="strong money">'+yen(p.amount)+'</div></div>'+btn('編集','edit-payment',p.id)+'</div>').join('')+'</div>':empty('手付金・内金・残金などを登録できます。');
  h+='<p class="caption">完了にした支払いは、該当する項目の「支払済み」に自動反映されます。</p>';
 }
 if(moneyView==='gifts'){
  h+='<div class="card"><div class="small muted">ご祝儀・支援金の合計</div><div class="amount">'+yen(gifts)+'</div><div class="small muted">費用見込み − 収入 = '+yen(Math.max(0,cost-gifts))+' の持ち出し見込み</div></div>';
  h+='<div class="page-actions mb">'+btn('＋ ご祝儀を登録','new-gift','','primary')+'</div>';
  h+=state.gifts.length?'<div class="list">'+state.gifts.map(g=>'<div class="item"><div class="content"><b>'+e(g.source)+'</b><div class="item-sub">'+e(g.note||'')+'</div></div><b>'+yen(g.amount)+'</b>'+btn('編集','edit-gift',g.id)+'</div>').join('')+'</div>':empty('ご祝儀や親御さんからの支援を登録できます。');
 }
 return h;
}
function barCategory(c){const used=forecastCat(c),budget=n(c.budget);return '<div class="bar-row"><div class="row between small"><span>'+e(c.icon||'♡')+' '+e(c.name)+'</span><span>'+yen(used)+(budget?' / '+yen(budget):'')+'</span></div><div class="bar-track"><span style="width:'+(budget?Math.min(used/budget*100,100):0)+'%;background:'+(budget&&used>budget?'#d88080':e(c.color||'#dba7a0'))+'"></span></div></div>'}
function renderGuests(){
 const attending=state.guests.filter(g=>g.status==='yes').length,declined=state.guests.filter(g=>g.status==='no').length;
 let h=header('ゲスト',btn('＋ 登録','new-guest','','primary'),'ゲストと席次をまとめて管理');
 h+='<div class="metric-grid mb"><div class="metric"><div class="small muted">招待予定</div><div class="value">'+state.guests.length+'<span class="small muted"> 名</span></div></div><div class="metric"><div class="small muted">出席 / 欠席</div><div class="value">'+attending+' <span class="small muted">/ '+declined+' 名</span></div></div></div>';
 h+='<div class="tabs">'+[['list','ゲスト一覧'],['seats','席次表']].map(v=>'<button class="tab '+(guestView===v[0]?'active':'')+'" data-action="guest-view" data-id="'+v[0]+'">'+v[1]+'</button>').join('')+'</div>';
 if(guestView==='list'){
  h+=state.guests.length?'<div class="list">'+state.guests.map(g=>'<div class="item guest-row"><div class="avatar">'+e((g.name||'？').slice(0,1))+'</div><div class="content"><div class="item-title">'+e(g.name)+'</div><div class="item-sub">'+e(g.relation||'未分類')+' · '+e(g.side||'')+' '+(g.sent?badge('招待状送付済','mint'):'')+(g.allergy?badge('アレルギーあり','warn'):'')+'</div></div>'+badge(({yes:'出席',no:'欠席',pending:'未回答'})[g.status]||'未回答',g.status==='yes'?'mint':g.status==='no'?'danger':'warn')+btn('編集','edit-guest',g.id)+'</div>').join('')+'</div>':empty('ゲストを追加して、出欠やアレルギーを管理しましょう。');
 }else{
  h+='<div class="callout">ゲストをタップして卓を選ぶか、ドラッグして卓に配置できます。タッチ操作にも対応。</div><div class="page-actions mb">'+btn('＋ 卓を追加','new-table','','primary')+(selectedGuest?badge('選択中: '+(state.guests.find(g=>g.id===selectedGuest)?.name||''),'pink'):'')+'</div>';
  const loose=state.guests.filter(g=>!g.tableId&&g.status!=='no');
  h+='<div class="small muted mb">未配置ゲスト（'+loose.length+'人）</div><div class="seat-pool" data-drop-table="">'+(loose.length?loose.map(g=>guestChip(g)).join(''):'<span class="small muted">未配置のゲストはいません。</span>')+'</div>';
  h+='<div class="table-grid">'+state.tables.map(t=>{const members=state.guests.filter(g=>g.tableId===t.id);return '<div class="seat-table" data-drop-table="'+e(t.id)+'"><div class="table-circle">'+e(t.name)+'</div><div class="small muted">'+members.length+' / '+(t.capacity||8)+' 人</div><div>'+members.map(g=>guestChip(g)).join('')+'</div><div class="mt">'+btn('編集','edit-table',t.id)+'</div></div>'}).join('')+'</div>';
  if(!state.tables.length)h+=empty('まずは卓を追加してください。');
 }
 return h;
}
function guestChip(g){return '<button class="seat-chip" draggable="true" data-guest="'+e(g.id)+'" data-action="pick-guest" data-id="'+e(g.id)+'" style="'+(selectedGuest===g.id?'outline:2px solid #c88b99':'')+'">'+e(g.name)+'</button>'}
function moreTitle(label){return '<div class="row mb">'+btn('← 戻る','more','','ghost tiny')+'<h1 style="font-size:20px;margin:0">'+e(label)+'</h1></div>'}
function renderMore(){
 if(morePage)return renderSubpage();
 const entries=[['schedule','当日のタイムライン','進行やスピーチ担当を整理','◷'],['vendors','業者・打ち合わせ','連絡先と決定事項を記録','⌂'],['ideas','アイデアボード','好きな写真やURLを保存','✿'],['packing','持ち物','前日・当日のチェック','▣'],['thanks','お礼リスト','お礼状・内祝い・発送','♡'],['roles','役割の管理','名前・カラー・自分の担当を編集','♧'],['sync','ふたりで共有','リアルタイム同期の設定','⇄'],['backup','バックアップ','JSON保存・読み込み・CSV書出し','⇩'],['settings','基本設定','挙式日・ふたりの名前・通知','⚙']];
 return header('その他','','準備の記録や設定も、ここにまとめて')+'<div class="card flush">'+entries.map((v,i)=>'<button data-action="more" data-id="'+v[0]+'" style="display:flex;align-items:center;width:100%;gap:12px;border:0;background:transparent;padding:15px;border-bottom:'+(i===entries.length-1?'0':'1px solid #f2e9e5')+';text-align:left"><span style="font-size:22px;color:#c59499;width:29px;text-align:center">'+v[3]+'</span><span class="grow"><b style="font-size:13px">'+v[1]+'</b><div class="small muted" style="margin-top:3px">'+v[2]+'</div></span><span class="muted">›</span></button>').join('')+'</div>';
}
function renderSubpage(){
 if(morePage==='roles'){let h=moreTitle('役割の管理')+'<p class="page-desc">自由に追加・編集。タスクの担当に反映されます。</p>'+btn('＋ 役割追加','new-role','','primary');h+='<div class="list mt">'+state.roles.map(r=>'<div class="item"><span class="role-dot" style="width:23px;height:23px;background:'+e(r.color)+'"></span><div class="content"><b>'+e(r.name)+'</b> '+(r.id===state.myRole?badge('自分の担当','mint'):'')+'</div>'+btn('自分','set-my-role',r.id)+btn('編集','edit-role',r.id)+'</div>').join('')+'</div>';return h}
 if(morePage==='schedule')return moreTitle('当日のタイムライン')+btn('＋ 進行を追加','new-timeline','','primary')+'<div class="card mt"><div class="timeline">'+state.timeline.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(x=>'<div class="timeline-item"><div><time>'+e(x.time)+'</time><b>'+e(x.title)+'</b></div><div class="small muted">'+e(nameRole(x.role))+' · '+e(x.memo||'')+'</div>'+btn('編集','edit-timeline',x.id)+'</div>').join('')+'</div>'+(state.timeline.length?'':empty('挙式、披露宴、スピーチなどを追加しましょう。'))+'</div>';
 if(morePage==='vendors')return moreTitle('業者・打ち合わせ')+btn('＋ 業者を登録','new-vendor','','primary')+'<div class="list mt">'+(state.vendors.length?state.vendors.map(v=>'<div class="item"><div class="content"><b>'+e(v.company)+'</b><div class="item-sub">'+e(v.contact||'')+' · '+e(v.phone||'')+'</div><div class="item-sub">'+e(v.decisions||'')+'</div></div>'+btn('編集','edit-vendor',v.id)+'</div>').join(''):empty('業者の連絡先と打ち合わせ履歴を保存できます。'))+'</div>';
 if(morePage==='ideas')return moreTitle('アイデアボード')+btn('＋ アイデア保存','new-idea','','primary')+'<div class="idea-grid mt">'+(state.ideas.length?state.ideas.map(v=>'<div class="idea-card">'+(v.photo?'<img src="'+e(v.photo)+'" alt="アイデア写真">':'<div style="height:110px;background:#fff0f1;display:grid;place-items:center;font-size:35px;color:#d9a8ae">✿</div>')+'<div class="idea-content"><b>'+e(v.title)+'</b><div class="small muted">'+e(v.category||'')+'</div>'+(v.url?'<a href="'+e(safeUrl(v.url))+'" target="_blank" rel="noopener noreferrer">リンクを見る ↗</a>':'')+'<div>'+btn('編集','edit-idea',v.id)+'</div></div></div>').join(''):empty('お気に入りの装花や衣装を集めましょう。'))+'</div>';
 if(morePage==='packing')return moreTitle('持ち物チェック')+btn('＋ 持ち物','new-item','','primary')+(['前日','当日'].map(stage=>section(stage)+(state.items.filter(x=>x.stage===stage).length?'<div class="list">'+state.items.filter(x=>x.stage===stage).map(x=>'<div class="item '+(x.done?'done':'')+'"><input type="checkbox" class="check" data-action="toggle-item" data-id="'+e(x.id)+'" '+(x.done?'checked':'')+'><div class="content"><b class="item-title">'+e(x.title)+'</b><div class="item-sub">'+e(x.note||'')+'</div></div>'+btn('編集','edit-item',x.id)+'</div>').join('')+'</div>':empty('まだ登録されていません。'))).join('');
 if(morePage==='thanks')return moreTitle('お礼リスト')+btn('＋ お礼を追加','new-thanks','','primary')+'<div class="list mt">'+(state.thanks.length?state.thanks.map(x=>'<div class="item '+(x.done?'done':'')+'"><input type="checkbox" class="check" data-action="toggle-thanks" data-id="'+e(x.id)+'" '+(x.done?'checked':'')+'><div class="content"><b>'+e(x.recipient)+'</b><div class="item-sub">'+e(x.type||'内祝い')+' · '+e(x.note||'')+'</div></div>'+btn('編集','edit-thanks',x.id)+'</div>').join(''):empty('結婚式後のお礼も漏れなく管理しましょう。'))+'</div>';
 if(morePage==='settings')return renderSettings();
 if(morePage==='backup')return renderBackup();
 if(morePage==='sync')return renderSync();
 return moreTitle('準備');
}
function renderSettings(){
 return moreTitle('基本設定')+'<div class="card"><form data-form="settings">'+field('挙式日','date','date',state.date,true)+field('新郎の呼び名','couple0','text',state.couple[0])+field('新婦の呼び名','couple1','text',state.couple[1])+'<button class="btn primary btn-wide">設定を保存</button></form></div><div class="card"><h2>期限のお知らせ</h2><p class="small muted">アプリを開いた時、直近3日と期限を過ぎた予定をお知らせできます。ブラウザが対応する場合のみシステム通知も表示します。</p>'+btn(state.reminders?'通知をオフにする':'通知をオンにする','notifications','','light')+'<p class="caption">アプリを閉じている間のプッシュ通知は、この版では提供していません。</p></div><div class="card"><h2>保存について</h2><p class="small muted">端末に自動保存します。iPhoneの「ホーム画面に追加」前後で、ブラウザ内の保存領域が別になる場合があります。大切なデータはバックアップを保存してください。</p>'+btn('バックアップへ','more','backup')+'</div>';
}
function renderBackup(){
 return moreTitle('バックアップと書き出し')+'<div class="card"><h2>JSONバックアップ</h2><p class="small muted">ゲスト、タスク、予算、写真などを一括保存・復元します。</p><div class="page-actions">'+btn('バックアップを保存','export-json','','primary')+btn('バックアップを読み込む','import-json')+'</div><input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="card"><h2>CSV書き出し</h2><p class="small muted">Excelで使える形式で項目別に保存します。</p><div class="field"><select id="csv-section">'+ARRAYS.map(k=>'<option value="'+k+'">'+e(({tasks:'タスク',guests:'ゲスト',payments:'支払い',categories:'予算項目',gifts:'ご祝儀',roles:'役割',tables:'卓',timeline:'当日進行',vendors:'業者',ideas:'アイデア',items:'持ち物',thanks:'お礼',comments:'コメント'})[k])+'</option>').join('')+'</select></div>'+btn('CSVを保存','export-csv','','light')+'</div><p class="caption">JSONファイルには個人情報が含まれるため、第三者には渡さず安全に保管してください。</p>';
}
function renderSync(){
 const cfg=cloud?.config||{},code=cloud?.room||'';
 return moreTitle('ふたりでリアルタイム共有')+'<div class="card"><h2>共有のしくみ</h2><p class="small muted">Firebase（外部クラウド）を設定すると、ふたりの端末でタスクやゲストなどを同期できます。設定がなくても、端末だけで全機能を使えます。</p><div class="notice">重要：共有コードを知る人はデータにアクセスできます。招待相手以外にコードを渡さないでください。ご利用前にFirebaseのセキュリティルールをREADMEどおりに設定してください。</div></div><div class="card"><h2>Firebaseの接続設定</h2><form data-form="sync"><div class="field"><label>API Key</label><input name="apiKey" required value="'+e(cfg.apiKey||'')+'" placeholder="AIza..." autocomplete="off"></div><div class="field"><label>Project ID</label><input name="projectId" required value="'+e(cfg.projectId||'')+'" autocomplete="off"></div><div class="field"><label>App ID</label><input name="appId" required value="'+e(cfg.appId||'')+'" autocomplete="off"></div><div class="field"><label>Auth Domain</label><input name="authDomain" value="'+e(cfg.authDomain||'')+'" autocomplete="off"></div><div class="field"><label>共有コード（48文字）</label><input name="room" required value="'+e(code)+'" minlength="48" maxlength="48" placeholder="下のボタンで新しく作成、または相手から貼付" autocomplete="off"></div><div class="page-actions mb">'+btn('新しい共有コードを発行','generate-room')+btn('コードをコピー','copy-room')+'</div><button class="btn primary btn-wide">保存して接続</button></form><div class="caption">両端末に同じFirebase設定と共有コードを入力してください。匿名認証を利用します。</div></div>'+(syncEnabled()?'<div class="card">'+btn('共有接続を解除','disconnect','','danger')+'<p class="caption">解除しても端末に保存したデータは残ります。</p><div class="small muted">未送信の変更: '+queuedCount()+' 件</div></div>':'');
}
function field(label,name,type='text',value='',required=false,extra=''){
 return '<div class="field"><label for="f-'+e(name)+'">'+e(label)+'</label><input id="f-'+e(name)+'" name="'+e(name)+'" type="'+e(type)+'" value="'+e(value)+'" '+(required?'required':'')+' '+extra+'></div>';
}
function area(label,name,value=''){return '<div class="field"><label for="f-'+e(name)+'">'+e(label)+'</label><textarea id="f-'+e(name)+'" name="'+e(name)+'" rows="3">'+e(value)+'</textarea></div>'}
function choices(label,name,options,value=''){return '<div class="field"><label>'+e(label)+'</label><select name="'+e(name)+'">'+options.map(x=>'<option value="'+e(x[0])+'" '+(String(x[0])===String(value)?'selected':'')+'>'+e(x[1])+'</option>').join('')+'</select></div>'}
function selectField(name,label,opts,value){return choices(label,name,opts.map(x=>[x.id,x.name]),value)}
function checkField(label,name,value){return '<label class="row field"><input type="checkbox" name="'+e(name)+'" '+(value?'checked':'')+'> '+e(label)+'</label>'}
function modal(title,body,formType='',uid=''){
 modalContent.innerHTML='<div class="modal-head"><h2>'+title+'</h2><button class="close-modal" type="button" data-action="close-modal" aria-label="閉じる">×</button></div><div class="modal-body">'+(formType?'<form data-form="'+formType+'" data-id="'+e(uid)+'">'+body+'<div class="form-actions">'+(uid?'<button type="button" class="btn danger" data-action="delete" data-id="'+e(uid)+'" data-type="'+e(formType)+'">削除</button>':'')+'<button type="button" class="btn ghost" data-action="close-modal">キャンセル</button><button class="btn primary" type="submit">保存する</button></div></form>':body)+'</div>';dialog.showModal();
}
function modalEdit(type,uid=''){
 const plural={task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks'};
 const c=plural[type],x=state[c]?.find(v=>v.id===uid)||{};
 let b='',title='';
 if(type==='task'){
  title=uid?'タスクを編集':'新しいタスク';
  b=field('タスク名','title','text',x.title,true)+selectField('role','担当者',state.roles,x.role||state.myRole)+field('期限','due','date',x.due||'')+choices('優先度','priority',[['high','高い'],['normal','普通'],['low','低い']],x.priority||'normal')+area('メモ','memo',x.memo||'')+field('参考URL','url','url',x.url||'')+area('サブタスク（1行に1件）','subtasks',(x.subtasks||[]).map(s=>(s.done?'[x] ':'')+s.title).join('\n'))+'<div class="field"><label>写真添付（容量を抑えて保存）</label><input type="file" name="photo" accept="image/*"></div>'+(x.photo?'<div class="attachments"><img src="'+e(x.photo)+'" alt="添付写真">'+checkField('写真を削除','removePhoto',false)+'</div>':'');
 }else if(type==='category'){
  title=uid?'予算項目を編集':'予算項目を追加';b=field('項目名','name','text',x.name,true)+field('アイコン','icon','text',x.icon||'♡')+field('項目別予算（円）','budget','number',x.budget||0,false,'min="0"')+field('見積（円）','estimate','number',x.estimate||0,false,'min="0"')+field('契約額（円）','contract','number',x.contract||0,false,'min="0"')+field('予定表に登録していない支払済額（円）','manualPaid','number',x.manualPaid||0,false,'min="0"')+'<p class="field-hint">支払い予定で完了にした金額は自動加算されます。二重計上しないようご注意ください。</p>';
 }else if(type==='payment'){
  title=uid?'支払いを編集':'支払い予定を追加';b=field('支払い内容','title','text',x.title,true)+choices('項目','category',state.categories.map(c=>[c.id,c.name]),x.category)+field('金額（円）','amount','number',x.amount||0,false,'min="0"')+field('支払期限','due','date',x.due||'')+selectField('payer','支払い担当',state.roles,x.payer||state.myRole)+checkField('支払い完了','paid',x.paid);
 }else if(type==='gift'){
  title=uid?'ご祝儀を編集':'ご祝儀・支援金を追加';b=field('誰から・項目名','source','text',x.source,true)+field('金額（円）','amount','number',x.amount||0,false,'min="0"')+area('メモ','note',x.note||'');
 }else if(type==='guest'){
  title=uid?'ゲストを編集':'ゲストを追加';
  b=field('お名前','name','text',x.name,true)+choices('出欠','status',[['pending','未回答'],['yes','出席'],['no','欠席']],x.status||'pending')+choices('関係性','relation',[['親族','親族'],['友人','友人'],['職場','職場'],['その他','その他']],x.relation||'友人')+choices('招待側','side',[['新郎側','新郎側'],['新婦側','新婦側'],['両家','両家']],x.side||'新郎側')+field('住所','address','text',x.address||'')+field('アレルギー','allergy','text',x.allergy||'')+field('ご祝儀（実績・円）','gift','number',x.gift||0,false,'min="0"')+field('引出物','favors','text',x.favors||'')+checkField('お車代が必要','transport',x.transport)+checkField('宿泊が必要','stay',x.stay)+checkField('招待状を送付済','sent',x.sent)+area('メモ','memo',x.memo||'');
 }else if(type==='table'){
  title=uid?'卓を編集':'卓を追加';b=field('卓名','name','text',x.name||('卓'+(state.tables.length+1)),true)+field('人数の目安','capacity','number',x.capacity||8,false,'min="1" max="30"');
 }else if(type==='role'){
  title=uid?'役割を編集':'役割を追加';b=field('役割名','name','text',x.name,true)+field('表示色','color','color',x.color||COLORS[state.roles.length%COLORS.length]);
 }else if(type==='timeline'){
  title=uid?'進行を編集':'進行を追加';b=field('時間','time','time',x.time||'12:00',true)+field('進行内容','title','text',x.title,true)+selectField('role','担当',state.roles,x.role||state.myRole)+area('進行メモ・スピーチ担当','memo',x.memo||'');
 }else if(type==='vendor'){
  title=uid?'業者を編集':'業者を追加';b=field('会社・業者名','company','text',x.company,true)+field('担当者','contact','text',x.contact||'')+field('電話・メール','phone','text',x.phone||'')+area('打ち合わせ履歴','history',x.history||'')+area('決定事項','decisions',x.decisions||'');
 }else if(type==='idea'){
  title=uid?'アイデアを編集':'アイデアを保存';b=field('タイトル','title','text',x.title,true)+choices('種類','category',[['衣装','衣装'],['装花','装花'],['演出','演出'],['会場','会場'],['その他','その他']],x.category||'衣装')+field('参考URL','url','url',x.url||'')+area('メモ','memo',x.memo||'')+'<div class="field"><label>写真</label><input type="file" name="photo" accept="image/*"></div>'+(x.photo?'<img src="'+e(x.photo)+'" alt="登録画像" style="max-width:100%;height:130px;object-fit:contain"> '+checkField('写真を削除','removePhoto',false):'');
 }else if(type==='item'){
  title=uid?'持ち物を編集':'持ち物を追加';b=field('持ち物','title','text',x.title,true)+choices('準備するタイミング','stage',[['前日','前日'],['当日','当日']],x.stage||'前日')+area('メモ','note',x.note||'')+checkField('準備済み','done',x.done);
 }else if(type==='thanks'){
  title=uid?'お礼を編集':'お礼を追加';b=field('お礼をする相手','recipient','text',x.recipient,true)+choices('種類','type',[['内祝い','内祝い'],['お礼状','お礼状'],['引出物の発送','引出物の発送'],['その他','その他']],x.type||'内祝い')+area('品物・発送・メモ','note',x.note||'')+checkField('完了','done',x.done);
 }
 modal(title,b,type,uid);
}
function safeUrl(url){try{const u=new URL(url);return ['https:','http:'].includes(u.protocol)?u.href:''}catch{return ''}}
async function imageData(file){
 if(!file)return null;
 if(file.size>15*1024*1024)throw Error('写真は15MB以下を選んでください');
 const img=await createImageBitmap(file);const k=Math.min(1,800/Math.max(img.width,img.height)),canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(img.width*k));canvas.height=Math.max(1,Math.round(img.height*k));canvas.getContext('2d').drawImage(img,0,0,canvas.width,canvas.height);img.close?.();
 const data=canvas.toDataURL('image/jpeg',.55);if(data.length>600000)throw Error('画像が大きすぎます。小さな写真で試してください');return data;
}
function values(form){const f=new FormData(form),v={};for(const [k,val] of f.entries()){if(k!=='photo')v[k]=val}return v}
function flBool(f,k){return f.has(k)}
async function submit(form){
 const type=form.dataset.form,uid=form.dataset.id||'',f=new FormData(form),v=values(form);
 if(type==='setup1'){state.date=v.date;state.setup=1;save();render();return}
 if(type==='setup2'){state.myRole=v.role;state.setup=2;save();render();return}
 if(type==='settings'){state.date=v.date;state.couple=[v.couple0.trim()||'新郎',v.couple1.trim()||'新婦'];save();if(syncEnabled())queueChange('settings','main',settingsRemote());toast('基本設定を保存しました');render();return}
 if(type==='sync'){
  const cfg={apiKey:v.apiKey.trim(),projectId:v.projectId.trim(),appId:v.appId.trim(),authDomain:v.authDomain.trim()};
  const room=v.room.trim();if(!/^[a-f0-9]{48}$/.test(room)){toast('共有コードは48文字の小文字英数字です');return}
  cloud={config:cfg,room};localStorage.setItem(CLOUD_KEY,JSON.stringify(cloud));toast('設定を保存しました。接続を確認します');render();connect();return;
 }
 if(type==='comment'){const txt=(v.text||'').trim();if(!txt)return;write('comments',{id:id(),author:nameRole(state.myRole),text:txt,at:Date.now()});dialog.close();toast('ひとことを残しました');return}
 if(type==='budget-total'){setSetting('budgetTotal',Math.max(0,n(v.budget)));dialog.close();toast('全体予算を保存しました');return}
 const types={task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks'};
 const col=types[type];if(!col)return;
 const old=state[col].find(x=>x.id===uid)||{};
 const item={...old,...v,id:uid||id()};
 if(type==='task'){
  item.title=v.title.trim();item.role=v.role;item.done=old.done||false;item.url=safeUrl(v.url);
  const prev=(old.subtasks||[]),lines=(v.subtasks||'').split('\n').map(s=>s.trim()).filter(Boolean);
  item.subtasks=lines.map(line=>{const checked=line.startsWith('[x] '),title=checked?line.slice(4):line;const same=prev.find(p=>p.title===title);return {id:same?.id||id(),title,done:checked||same?.done||false}});
  if(flBool(f,'removePhoto'))delete item.photo;
 }
 if(type==='category'){for(const k of ['budget','estimate','contract','manualPaid'])item[k]=Math.max(0,n(v[k]));item.color=old.color||COLORS[state.categories.length%COLORS.length];item.name=v.name.trim()}
 if(type==='payment'){item.amount=Math.max(0,n(v.amount));item.paid=flBool(f,'paid')}
 if(type==='gift'){item.amount=Math.max(0,n(v.amount))}
 if(type==='guest'){item.gift=Math.max(0,n(v.gift));for(const x of ['transport','stay','sent'])item[x]=flBool(f,x)}
 if(type==='table'){item.capacity=Math.max(1,n(v.capacity)||8)}
 if(type==='role'){item.color=v.color}
 if(type==='idea'){item.url=safeUrl(v.url);if(flBool(f,'removePhoto'))delete item.photo}
 if(type==='item'||type==='thanks')item.done=flBool(f,'done');
 if(type==='task'||type==='idea'){try{const file=f.get('photo');if(file&&file.size)item.photo=await imageData(file)}catch(err){toast(err.message);return}}
 write(col,item);dialog.close();toast(uid?'更新しました':'追加しました');
}
function completion(){for(let i=0;i<19;i++){const x=document.createElement('span');x.className='petal';x.textContent=i%3===0?'♡':'✿';x.style.left=Math.round(Math.random()*100)+'vw';x.style.color=i%2?'#e3adba':'#afd6c3';x.style.setProperty('--dx',(Math.random()*160-80)+'px');x.style.animationDelay=(Math.random()*.5)+'s';document.getElementById('confetti').append(x);setTimeout(()=>x.remove(),2500)}}
function templateTasks(){
 const template=[
 [6,'式場のプランと見積を確認する','groom'],[6,'結婚式のテーマを話し合う','bride'],[6,'招待するゲストをリストアップ','groom'],
 [5,'ドレス・衣装を検討する','bride'],[5,'前撮りの撮影内容を決める','bride'],[5,'両家への相談事項をまとめる','parents'],
 [4,'招待状のデザインを決める','bride'],[4,'料理・ドリンクを検討する','groom'],[4,'受付係にお願いする','reception'],
 [3,'招待状を発送する','groom'],[3,'写真・映像の演出を相談する','groom'],[3,'装花・ブーケを打ち合わせる','bride'],
 [2,'出欠を確認し席次を考える','bride'],[2,'引出物・プチギフトを選ぶ','groom'],[2,'司会や余興の担当を調整する','host'],
 [1,'席次表・席札を確定する','bride'],[1,'スピーチと挨拶の内容を準備する','groom'],[1,'支払予定と最終見積を確認','groom'],
 [0,'最終打ち合わせ・搬入を確認','planner'],[0,'前日の持ち物を確認','bride'],[0,'当日の進行表を全員で確認','planner'],
 [-1,'お礼状や内祝いの手配を進める','bride'],[-1,'写真やアルバムの手配を確認','groom']
 ];
 let added=0;
 for(let i=0;i<template.length;i++){const [month,title,assigned]=template[i],key='template-'+i;
  if(state.tasks.some(t=>t.templateKey===key))continue;
  const d=parseDate(state.date);d.setMonth(d.getMonth()-month);
  const due=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');
  const item={id:id(),templateKey:key,title,role:state.roles.some(r=>r.id===assigned)?assigned:state.roles[0]?.id,due,priority:'normal',done:false,memo:'',url:'',subtasks:[]};
  write('tasks',item,{quiet:true});added++;
 }
 render();toast(added?added+'件の準備タスクを追加しました':'テンプレートはすべて登録済みです');
}
function download(name,text,mime){
 const blob=new Blob(['\ufeff',text],{type:mime});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)
}
function toCsv(list){const keys=Array.from(new Set(list.flatMap(row=>Object.keys(row))));const encode=v=>'"'+String((typeof v==='object'&&v!==null)?JSON.stringify(v):(v??'')).replaceAll('"','""')+'"';return [keys.map(encode).join(','),...list.map(row=>keys.map(k=>encode(row[k])).join(','))].join('\r\n')}
function remind(){
 if(!state.reminders||!state.setup)return;
 const key='happy_wedding_reminder_'+today();
 if(localStorage.getItem(key))return;
 const todo=state.tasks.filter(t=>!t.done&&t.due&&distance(t.due)<=3);
 const due=state.payments.filter(t=>!t.paid&&t.due&&distance(t.due)<=3);
 if(!todo.length&&!due.length)return;
 localStorage.setItem(key,'1');
 const msg='期限が近いタスク '+todo.length+'件・お支払い '+due.length+'件があります。';
 toast(msg);
 if('Notification' in window&&Notification.permission==='granted')try{new Notification('Happy Wedding ✿',{body:msg,icon:'./icon.svg'})}catch{}
}
async function handleAction(target){
 const action=target.dataset.action,uid=target.dataset.id;
 if(!action)return;
 if(action==='nav'){chooseTab(uid);return}
 if(action==='more'){tab='more';morePage=uid;render();window.scrollTo(0,0);return}
 if(action==='close-modal'){dialog.close();return}
 if(action==='task-filter'){taskRole=uid;render();return}
 if(action==='money-view'){moneyView=uid;render();return}
 if(action==='guest-view'){guestView=uid;render();return}
 if(action==='template'){templateTasks();return}
 if(action==='money-add'){modal('何を追加する？','<div class="stack">'+btn('予算項目を追加','new-category','','light')+btn('支払い予定を追加','new-payment','','light')+btn('ご祝儀を追加','new-gift','','light')+'</div>');return}
 if(action==='budget-total'){modal('全体予算',field('予算総額（円）','budget','number',state.budgetTotal,true,'min="0"'),'budget-total');return}
 if(action==='comment'){modal('ふたりのひとこと',area('メッセージ','text'),'comment');return}
 if(action==='toggle-task'){const x=state.tasks.find(t=>t.id===uid);if(x){write('tasks',{...x,done:!x.done});if(!x.done){completion();toast('おつかれさま！ひとつ完了 ✿')}}return}
 if(['toggle-payment','toggle-item','toggle-thanks'].includes(action)){const c={'toggle-payment':'payments','toggle-item':'items','toggle-thanks':'thanks'}[action],x=state[c].find(t=>t.id===uid);if(x){write(c,{...x,paid:action==='toggle-payment'?!x.paid:x.paid,done:action==='toggle-payment'?x.done:!x.done});if(action!=='toggle-payment'&&!x.done)completion()}return}
 if(action.startsWith('new-')||action.startsWith('edit-')){modalEdit(action.split('-')[1],action.startsWith('edit-')?uid:'');return}
 if(action==='delete'){
  const c={task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks'}[target.dataset.type];
  if(!c)return;
  if(c==='roles'&&state.roles.length<=1){toast('役割を最低1つ残してください');return}
  if(!window.confirm('削除しますか？ 元に戻せません。'))return;
  if(c==='roles'&&state.myRole===uid)state.myRole=state.roles.find(r=>r.id!==uid)?.id||'';
  if(c==='tables')for(const g of state.guests.filter(g=>g.tableId===uid))write('guests',{...g,tableId:''},{quiet:true});
  erase(c,uid);dialog.close();toast('削除しました');return;
 }
 if(action==='set-my-role'){state.myRole=uid;save();render();toast('自分の担当を変更しました');return}
 if(action==='pick-guest'){selectedGuest=uid;render();return}
 if(action==='generate-room'){const f=$('form[data-form=sync]');if(f){f.elements.room.value=roomCode();toast('共有コードを発行しました。接続設定を保存してください。')}return}
 if(action==='copy-room'){const val=$('form[data-form=sync]')?.elements.room.value||'';if(!val){toast('先に共有コードを発行してください');return}try{await navigator.clipboard.writeText(val);toast('共有コードをコピーしました')}catch{toast('コードを長押ししてコピーしてください')}return}
 if(action==='disconnect'){if(!confirm('クラウド接続を解除しますか？端末のデータは残ります。'))return;stopSync();cloud=null;localStorage.removeItem(CLOUD_KEY);status('local');render();return}
 if(action==='notifications'){if(!state.reminders&&'Notification' in window){try{await Notification.requestPermission()}catch{}}setSetting('reminders',!state.reminders);toast(state.reminders?'お知らせをオンにしました':'お知らせをオフにしました');return}
 if(action==='export-json'){download('happy-wedding-backup-'+today()+'.json',JSON.stringify(state,null,2),'application/json;charset=utf-8');toast('バックアップを書き出しました');return}
 if(action==='import-json'){$('#import-file')?.click();return}
 if(action==='export-csv'){const col=$('#csv-section')?.value||'tasks';download('happy-wedding-'+col+'-'+today()+'.csv',toCsv(state[col]),'text/csv;charset=utf-8');toast('CSVを書き出しました');return}
}
function assignGuest(uid,tableId){
 const g=state.guests.find(x=>x.id===uid);if(!g)return;
 if(tableId){const t=state.tables.find(x=>x.id===tableId);if(!t)return;const occupied=state.guests.filter(x=>x.tableId===tableId&&x.id!==uid).length;if(occupied>=n(t.capacity)){toast('この卓は設定人数に達しています');return}}
 write('guests',{...g,tableId});selectedGuest='';toast('席次表を更新しました');
}
document.addEventListener('click',ev=>{
 const t=ev.target.closest('[data-action]');if(t){if(t.dataset.action==='toggle-task'||t.dataset.action==='toggle-item'||t.dataset.action==='toggle-thanks'||t.dataset.action==='toggle-payment')return;ev.preventDefault();handleAction(t);return}
 const seat=ev.target.closest('[data-drop-table]');
 if(seat&&selectedGuest){assignGuest(selectedGuest,seat.dataset.dropTable);return}
});
document.addEventListener('change',async ev=>{
 const t=ev.target;
 if(t.matches('input[data-action^="toggle-"]')){handleAction(t);return}
 if(t.id==='import-file'&&t.files?.[0]){
  if(syncEnabled()){toast('復元する前に共有接続を解除してください');return}
  try{const obj=JSON.parse(await t.files[0].text());if(!obj||!Array.isArray(obj.tasks)||!Array.isArray(obj.roles)||!Array.isArray(obj.guests)||!Array.isArray(obj.categories))throw Error('バックアップ形式が不正です');if(!confirm('現在の端末データをバックアップ内容で置き換えますか？'))return;state={...defaults(),...obj};save();render();toast('データを復元しました')}catch(err){toast('読み込みに失敗: '+err.message)}
 }
});
document.addEventListener('submit',async ev=>{const f=ev.target.closest('form[data-form]');if(!f)return;ev.preventDefault();const b=f.querySelector('button[type=submit],button:not([type])');if(b)b.disabled=true;try{await submit(f)}catch(err){console.error(err);toast('保存できませんでした: '+err.message)}finally{if(b)b.disabled=false}});
document.addEventListener('dragstart',ev=>{const s=ev.target.closest('[data-guest]');if(s)ev.dataTransfer.setData('text/plain',s.dataset.guest)});
document.addEventListener('dragover',ev=>{const s=ev.target.closest('[data-drop-table]');if(s)ev.preventDefault()});
document.addEventListener('drop',ev=>{const s=ev.target.closest('[data-drop-table]');if(s){ev.preventDefault();const g=ev.dataTransfer.getData('text/plain');if(g)assignGuest(g,s.dataset.dropTable)}});
document.getElementById('header-settings').addEventListener('click',()=>{tab='more';morePage='settings';render()});
dialog.addEventListener('click',ev=>{if(ev.target===dialog)dialog.close()});
window.addEventListener('online',()=>{if(syncEnabled())connect()});
window.addEventListener('focus',()=>remind());
try{cloud=JSON.parse(localStorage.getItem(CLOUD_KEY)||'null')}catch{}
render();setTimeout(remind,600);
if(syncEnabled())connect();
if('serviceWorker' in navigator)window.addEventListener('load',()=>navigator.serviceWorker.register('./sw.js').catch(console.warn));
