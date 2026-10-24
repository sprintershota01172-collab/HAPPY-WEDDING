
import {startSync,stopSync,roomCode,queueChange,queuedCount} from './sync.js';
import {setupPartnerNotifications,initPartnerRoom,announcePartnerChange,receivePartnerActivity,updatePartnerBell,enablePartnerPush} from './notifications.js';

const KEY='happy_wedding_local_v1';
const CLOUD_KEY='happy_wedding_cloud_v1';
const COLORS=['#d995a3','#a9c9b9','#c3ab96','#b6b4d8','#e3be8e','#91c1c7','#c5a8c6','#b6bd91'];
const DEFAULT_ROLES=[
 {id:'groom',name:'新郎',color:COLORS[0]},{id:'bride',name:'新婦',color:COLORS[1]},
 {id:'parents',name:'両家の親',color:COLORS[2]},{id:'reception',name:'受付係',color:COLORS[3]},
 {id:'host',name:'司会・友人幹事',color:COLORS[4]},{id:'planner',name:'プランナー',color:COLORS[5]}
];
const DEFAULT_CATEGORIES=['会場','衣装','写真・映像','料理','装花','引出物','ペーパーアイテム','演出','二次会','新婚旅行'].map((name,i)=>({id:'c'+i,name,icon:['⌂','♕','▧','♨','✿','🎁','✉','♫','♡','✈'][i],budget:0,estimate:0,contract:0,manualPaid:0,color:COLORS[i%COLORS.length]}));
const ARRAYS=['roles','categories','tasks','payments','gifts','guests','tables','timeline','vendors','ideas','items','thanks','comments','schedules','extras','presents','savingsAccounts'];
function defaults(){return {version:1,setup:0,date:'',myRole:'groom',couple:['新郎','新婦'],budgetTotal:0,weddingPaidDirect:0,savings:null,savingsLedgerInitialized:false,reminders:false,reminderDays:3,roles:DEFAULT_ROLES,categories:DEFAULT_CATEGORIES,tasks:[],payments:[],gifts:[],guests:[],tables:[],timeline:[],vendors:[],ideas:[],items:[],thanks:[],comments:[],schedules:[],extras:[],presents:[],savingsAccounts:[]}}
function load(){try{const v=JSON.parse(localStorage.getItem(KEY)||'null');if(!v)return defaults();const d=defaults();return {...d,...v,...Object.fromEntries(ARRAYS.map(k=>[k,Array.isArray(v[k])?v[k]:d[k]]))}}catch(e){return defaults()}}
let state=load(), tab='home', taskRole='all', guestView='list', moneyView='overview', paymentMonth='',paymentDateSelected='', morePage='',presentView='received',selectedGuest='', cloud=null;
const app=document.getElementById('main'),dialog=document.getElementById('modal'),modalContent=document.getElementById('modal-content'),toastEl=document.getElementById('toast');
let toastTimer=0,renderScheduled=false,completionSound=false;
const pageByKey=new Map();
let activePager=null;
const $=(s,root=document)=>root.querySelector(s);
const $$=(s,root=document)=>Array.from(root.querySelectorAll(s));
const e=(x)=>String(x??'').replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;').replaceAll("'",'&#39;');
const n=x=>Number(x)||0;
const yen=x=>'¥'+Math.round(n(x)).toLocaleString('ja-JP');
const id=()=> (crypto.randomUUID?.()||('x'+Date.now().toString(36)+Math.random().toString(36).slice(2)));
const today=()=>{const d=new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')};
paymentMonth=today().slice(0,7);
const parseDate=s=>new Date((s||today())+'T12:00:00');
const distance=s=>Math.round((parseDate(s)-parseDate(today()))/86400000);
const dayLabel=s=>s?new Intl.DateTimeFormat('ja-JP',{month:'numeric',day:'numeric'}).format(parseDate(s)):'未設定';
const role=x=>state.roles.find(r=>r.id===x);
const cat=x=>state.categories.find(c=>c.id===x);
const nameRole=x=>role(x)?.name||'未担当';
const badge=(text,cl='')=>'<span class="pill '+cl+'">'+e(text)+'</span>';
const btn=(text,action,arg='',cl='ghost tiny')=>'<button type="button" class="btn '+cl+'" data-action="'+e(action)+'" data-id="'+e(arg)+'">'+text+'</button>';
function toast(msg){toastEl.textContent=msg;toastEl.classList.add('show');clearTimeout(toastTimer);toastTimer=setTimeout(()=>toastEl.classList.remove('show'),2900)}
function save(){try{localStorage.setItem(KEY,JSON.stringify(state))}catch(e){toast('保存容量が不足しています。写真を減らしてバックアップしてください。')}}
function settingsRemote(){return {date:state.date,couple:state.couple,budgetTotal:state.budgetTotal,weddingPaidDirect:state.weddingPaidDirect||0,savings:state.savings,savingsLedgerInitialized:state.savingsLedgerInitialized,reminders:state.reminders,reminderDays:state.reminderDays}}
function setSetting(key,value){state[key]=value;save();if(syncEnabled())queueChange('settings','main',settingsRemote());announcePartnerChange('settings');render()}
function syncEnabled(){return Boolean(cloud?.config?.apiKey&&cloud?.room)}
function write(collection,item,opt={}){
 if(!ARRAYS.includes(collection))return;
 const idx=state[collection].findIndex(x=>x.id===item.id);
 if(idx<0)state[collection].push(item);else state[collection][idx]=item;
 if(collection==='savingsAccounts'){state.savingsLedgerInitialized=true;state.savings=state.savingsAccounts.reduce((v,x)=>v+Math.max(0,n(x.amount)),0)}
 save();
 if(syncEnabled()){
  queueChange(collection,item.id,item);
  if(collection==='savingsAccounts')queueChange('settings','main',settingsRemote());
 }
 if(!opt.quiet){announcePartnerChange(collection,idx<0?'追加':item.done?'完了':'更新');render()}
}
function erase(collection,uid){
 state[collection]=state[collection].filter(x=>x.id!==uid);
 if(collection==='savingsAccounts'){state.savingsLedgerInitialized=true;state.savings=state.savingsAccounts.reduce((v,x)=>v+Math.max(0,n(x.amount)),0)}
 save();
 if(syncEnabled()){queueChange(collection,uid,null,true);if(collection==='savingsAccounts')queueChange('settings','main',settingsRemote())}
 announcePartnerChange(collection,'削除');render();
}
function remote(entry,meta={}){
 if(entry.collection==='activity'){receivePartnerActivity(entry,meta);return}
 if(entry.collection==='pushSub')return;
 if(entry.collection==='settings'){
 Object.assign(state,entry.value||{});
 if(state.savingsAccounts.length)state.savings=state.savingsAccounts.reduce((v,x)=>v+Math.max(0,n(x.amount)),0);
 save();scheduleRender();return
}
 if(!ARRAYS.includes(entry.collection))return;
 const list=state[entry.collection],i=list.findIndex(x=>x.id===entry.id);
 if(entry.deleted){if(i>=0)list.splice(i,1)}
 else if(entry.value){if(i>=0)list[i]=entry.value;else list.push(entry.value)}
 if(entry.collection==='savingsAccounts'){
  state.savingsLedgerInitialized=true;
  state.savings=state.savingsAccounts.reduce((v,x)=>v+Math.max(0,n(x.amount)),0)
 }
 save();scheduleRender();
}
function scheduleRender(){if(renderScheduled)return;renderScheduled=true;requestAnimationFrame(()=>{renderScheduled=false;if(!dialog.open)render()})}
function status(s){const el=$('#connection');el.textContent=({connecting:'同期接続中',synced:'ふたりで同期中',offline:'オフライン保存',error:'同期エラー'})[s]||'この端末に保存';el.style.background=s==='error'?'#ffe4e5':''}
async function connect(){if(!syncEnabled())return;initPartnerRoom(cloud.room);try{await startSync(cloud.config,cloud.room,remote,status,(empty)=>{
 if(empty){for(const c of ARRAYS)for(const item of state[c])queueChange(c,item.id,item);queueChange('settings','main',settingsRemote())}
 toast(empty?'共有ルームを作成しました':'共有ルームに接続しました');
 });}catch(err){status('error');console.error(err);toast('クラウド接続を確認してください: '+err.message)}}
function chooseTab(t){tab=t;morePage='';if(t==='home')moneyView='overview';render()}
function header(title,right='',desc=''){return '<div class="page-head"><h1>'+e(title)+'</h1>'+right+'</div>'+(desc?'<div class="page-desc">'+e(desc)+'</div>':'')}
function section(title,right=''){return '<div class="section-title"><h2>'+title+'</h2>'+right+'</div>'}
function empty(msg){return '<div class="empty"><div class="flower">✿</div>'+msg+'</div>'}
function progress(items){return items.length?Math.round(items.filter(x=>x.done).length/items.length*100):0}
function formatPriority(x){return x==='high'?badge('優先','danger'):x==='low'?badge('ゆっくり','mint'):''}
function overdue(x){return x.due&&!x.done&&distance(x.due)<0}
function dueSoon(x){return x.due&&!x.done&&distance(x.due)>=0&&distance(x.due)<=7}
function render(){updatePartnerBell();const bottomNav=document.querySelector('.bottom-nav');if(bottomNav)bottomNav.hidden=!state.setup;document.querySelectorAll('.bottom-nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('#connection').title=syncEnabled()?'共有コード設定済み':'端末に保存';if(!state.setup){app.innerHTML=renderSetup();return}
 app.innerHTML=tab==='home'?renderHome():tab==='tasks'?renderTasks():tab==='money'?renderMoney():tab==='guests'?renderGuests():tab==='presents'?renderPresents():renderMore();
 organizeScreen();
}


/**
 * All content pages are real DOM nodes: nothing scrolls, and no row is cut by a mask.
 * Large lists are segmented into individual item shells before measuring pages.
 */
function getScreenKey(){
 return tab+'|'+(tab==='money'?moneyView:tab==='guests'?guestView:tab==='tasks'?taskRole:tab==='presents'?presentView:morePage);
}

function splitPageable(node,depth=0){
 if(!(node instanceof HTMLElement)||depth>5)return [node];
 const children=Array.from(node.children);
 if(!children.length)return [node];
 const isFlow=node.matches('.list,.idea-grid,.table-grid,.home-preview,.activity-list,.timeline,.stack,.money-dashboard');
 const isGroup=node.matches('.card')&&(
  children.length>2||children.some(x=>x.matches('.list,.timeline,.bar-row,.setting-row,.calendar-grid'))
 );
 // A large chart or table with a single list-like child must break at item boundaries.
 if(node.matches('.card')&&children.length===1&&
    children[0].matches('.list,.timeline,.idea-grid,.table-grid')){
   const inner=children[0];
   const pieces=splitPageable(inner,depth+1);
   if(pieces.length>1)return pieces.map(piece=>{
    const container=node.cloneNode(false);
    container.classList.add('page-piece');
    container.appendChild(piece);
    return container;
   });
 }
 if(node.matches('.calendar-grid')&&children.length>21){
  const result=[];
  // Repeat the weekday header while spreading weeks into two-week spreads.
  const header=children.slice(0,7);
  const rest=children.slice(7);
  for(let i=0;i<rest.length;i+=14){
   const grid=node.cloneNode(false);grid.classList.add('page-piece');
   grid.append(...header.map(x=>x.cloneNode(true)),...rest.slice(i,i+14));
   result.push(grid);
  }
  return result;
 }
 if(!isFlow&&!isGroup)return [node];
 const parts=[];
 while(node.firstChild){
  const child=node.firstChild;
  if(child.nodeType===Node.TEXT_NODE&&!child.textContent.trim()){node.removeChild(child);continue}
  const fragment=node.cloneNode(false);
  fragment.classList.add('page-piece');
  fragment.appendChild(child);
  if(child.matches?.('.calendar-grid,.timeline,.list,.idea-grid,.table-grid')){
   for(const piece of splitPageable(child,depth+1)){
    const wrapped=node.cloneNode(false);
    wrapped.classList.add('page-piece');
    wrapped.appendChild(piece);
    parts.push(wrapped);
   }
  }else parts.push(fragment);
 }
 return parts.length?parts:[node];
}
function presentPage(page){
 if(!activePager||!activePager.pages.length)return;
 const p=Math.max(0,Math.min(page,activePager.pages.length-1));
 activePager.index=p;
 pageByKey.set(activePager.key,p);
 activePager.panel.replaceChildren(...activePager.pages[p]);
 activePager.panel.scrollTop=0;
 const prev=activePager.nav.querySelector('[data-action="pager-prev"]');
 const next=activePager.nav.querySelector('[data-action="pager-next"]');
 prev.disabled=p===0;
 next.disabled=p>=activePager.pages.length-1;
 activePager.nav.querySelector('.page-counter').textContent=(p+1)+' / '+activePager.pages.length;
 activePager.nav.hidden=activePager.pages.length<=1;
}
function paginateScreen(panel,nav,key){
 const elements=Array.from(panel.children);
 const atomic=elements.flatMap(node=>splitPageable(node));
 const pages=[];
 let page=[];
 panel.replaceChildren();
 const available=Math.max(120,panel.clientHeight);
 for(const piece of atomic){
  panel.appendChild(piece);
  if(panel.scrollHeight>available+1&&page.length){
   panel.removeChild(piece);
   pages.push(page);
   panel.replaceChildren(piece);
   page=[piece];
  }else page.push(piece);
 }
 if(page.length)pages.push(page);
 if(!pages.length)pages.push([]);
 activePager={panel,nav,pages,index:0,key};
 presentPage(pageByKey.get(key)||0);
}
function organizeScreen(){
 const children=Array.from(app.children);
 if(!children.length)return;
 const pinned=document.createElement('div'),panel=document.createElement('section');
 pinned.className='screen-fixed';panel.className='screen-panel';
 panel.tabIndex=-1;
 panel.setAttribute('aria-label',({home:'準備の概要',tasks:'タスク一覧',money:'お金の詳細',guests:'ゲスト管理',presents:'お祝い・お返し',more:'その他の項目'})[tab]);
 const key=getScreenKey();
 // Do not pin finance or progress cards: they must fit inside one paginated frame.
 let pinnedCount=tab==='home'?0:tab==='tasks'?4:tab==='guests'?3:tab==='money'?1:tab==='presents'?2:morePage?0:1;
 children.forEach((node,i)=>(i<pinnedCount?pinned:panel).appendChild(node));
 const nav=document.createElement('div');nav.className='page-navigation';
 nav.innerHTML='<button class="page-arrow" data-action="pager-prev" type="button" aria-label="前のページ">‹ 前</button>'
  +'<span class="page-counter" aria-live="off"></span>'
  +'<button class="page-arrow" data-action="pager-next" type="button" aria-label="次のページ">次 ›</button>';
 app.replaceChildren(pinned,panel,nav);
 paginateScreen(panel,nav,key);
}


function renderSetupDate(){
 const current=new Date().getFullYear();
 const years=Array.from({length:27},(_,i)=>current-3+i);
 const choices=(values,placeholder,toLabel)=>'<option value="">'+placeholder+'</option>'
  +values.map(v=>'<option value="'+v+'">'+toLabel(v)+'</option>').join('');
 return '<div class="setup-date-field"><span class="setup-date-label">挙式日</span>'
  +'<div class="setup-date-grid">'
  +'<select name="weddingYear" aria-label="挙式年" required>'+choices(years,'年を選ぶ',v=>v+'年')+'</select>'
  +'<select name="weddingMonth" aria-label="挙式月" required>'+choices(Array.from({length:12},(_,i)=>i+1),'月',v=>v+'月')+'</select>'
  +'<select name="weddingDay" aria-label="挙式日" required>'+choices(Array.from({length:31},(_,i)=>i+1),'日',v=>v+'日')+'</select>'
  +'</div></div>';
}
function updateSetupDays(){
 const form=document.querySelector('form[data-form="setup1"]');
 if(!form)return;
 const y=Number(form.elements.weddingYear.value),m=Number(form.elements.weddingMonth.value);
 const el=form.elements.weddingDay,previous=el.value;
 const maxDay=y&&m?new Date(y,m,0).getDate():31;
 el.innerHTML='<option value="">日</option>'+Array.from({length:maxDay},(_,i)=>'<option value="'+(i+1)+'">'+(i+1)+'日</option>').join('');
 if(previous&&Number(previous)<=maxDay)el.value=previous;
}

function renderSetup(){const step=state.setup===1?2:1;return '<div class="setup"><div class="setup-flower">✿ ♡ ✿</div><h1>Happy Wedding</h1><p>ふたりの特別な一日まで。<br>準備も一緒に楽しもう。</p><div class="card">'+(step===1?'<div class="eyebrow">STEP 1 / 2</div><h2>挙式日はいつ？</h2><form data-form="setup1" novalidate>'+renderSetupDate()+'<button class="btn primary btn-wide">次へ →</button></form>':'<div class="eyebrow">STEP 2 / 2</div><h2>あなたの役割は？</h2><form data-form="setup2">'+selectField('role','あなたの役割',state.roles,state.myRole)+'<button class="btn primary btn-wide">はじめる ♡</button></form>')+'</div><p>あとから設定を変更できます。<br>データは自動でこの端末に保存されます。</p></div>'}


function honeymoonCategory(){return state.categories.find(c=>c.name==='新婚旅行'||c.id==='hw-honeymoon')||null}
function honeymoonQuote(){const c=honeymoonCategory();return c?Math.max(0,forecastCat(c)||n(c.budget)):0}
function honeymoonPanel(){
 const c=honeymoonCategory(),planned=honeymoonQuote(),paid=c?paidCategory(c):0,remaining=Math.max(0,planned-paid);
 return '<div class="honeymoon-panel"><div class="honeymoon-label"><span>HONEYMOON BUDGET</span>'+btn('旅費を更新','edit-honeymoon','','light tiny')+'</div>'
  +'<div class="honeymoon-cost"><span>新婚旅行の予定総額</span><button type="button" class="finance-amount-edit honeymoon-amount" data-action="edit-honeymoon" aria-label="新婚旅行費を登録・更新"><strong>'+(c?yen(planned):'—')+'</strong><small aria-hidden="true">✎</small></button></div>'
  +'<div class="honeymoon-grid"><div><span>支払済み</span><strong>'+yen(paid)+'</strong></div><div><span>残りの支払い</span><strong>'+(c?yen(remaining):'—')+'</strong></div></div>'
  +'<p class="caption">旅行費は式とは別に計算します。</p></div>';
}


/* Preserve the former single savings balance until the first account edit. */
const LEGACY_SAVINGS_ID='legacy-savings-v1';
function savingRecords(){
 if(state.savingsAccounts.length)return state.savingsAccounts;
 if(!state.savingsLedgerInitialized&&state.savings!==null&&state.savings!==undefined&&state.savings!=='')
  return [{id:LEGACY_SAVINGS_ID,owner:'未分類',purpose:'用途未設定',bank:'口座未設定',account:'',
   amount:Math.max(0,n(state.savings)),available:true,legacy:true}];
 return [];
}
function savingsTotals(){
 const entries=savingRecords();
 return {entries,total:entries.reduce((v,x)=>v+Math.max(0,n(x.amount)),0),
  usable:entries.filter(x=>x.available!==false).reduce((v,x)=>v+Math.max(0,n(x.amount)),0),
  registered:entries.length>0||state.savingsLedgerInitialized};
}
function savingsGroups(){
 const groups=new Map();
 for(const x of savingRecords()){
  const key=JSON.stringify([x.owner||'未分類',x.bank||'口座未設定',x.account||'']);
  if(!groups.has(key))groups.set(key,{owner:x.owner||'未分類',bank:x.bank||'口座未設定',account:x.account||'',amount:0,entries:[]});
  const g=groups.get(key);g.entries.push(x);g.amount+=Math.max(0,n(x.amount));
 }
 return [...groups.values()];
}
function savingsRows(){
 const groups=savingsGroups();
 return groups.length?'<div class="list savings-list">'+groups.map(g=>
  '<div class="item saving-row"><div class="content"><b class="item-title">'+e(g.owner)+'</b>'
  +'<div class="item-sub">'+e(g.bank)+(g.account?' · '+e(g.account):'')+' · '+g.entries.length+'件</div></div>'
  +'<div class="saving-right"><strong>'+yen(g.amount)+'</strong>'+btn('＋ 追加','new-saving',g.entries[0].id,'ghost tiny')+'</div></div>'
 ).join('')+'</div>':empty('貯金を追加するとここに表示されます。');
}
function savingsAccountPage(){
 const t=savingsTotals();
 return '<div class="row between savings-heading"><b>貯金内訳</b></div>'
 +'<div class="savings-account-top"><div><span>貯金合計</span><strong>'+yen(t.total)+'</strong></div>'
 +'<div><span>利用可能額</span><strong>'+yen(t.usable)+'</strong></div></div>'
 +'<div class="page-actions">'+btn('＋ 追加','new-saving','','primary')+'</div>'
 +savingsRows()+'<p class="caption">銀行名・口座の呼び名のみ登録してください。口座番号・暗証番号は不要です。</p>';
}
function savingEditor(uid='',seedId=''){
 const x=(uid?savingRecords().find(v=>v.id===uid):seedId?savingRecords().find(v=>v.id===seedId):null)||{};
 const datalist=(key,opts)=>'<datalist id="'+key+'">'+opts.map(v=>'<option value="'+e(v)+'"></option>').join('')+'</datalist>';
 const fields='<p class="saving-editor-intro">'+(uid?'この記録の金額を変更します。':'新しい貯金として合計に加算します。')+'</p>'
 +field(uid?'登録した金額（円）':'今回追加する金額（円）','amount','number',uid?x.amount??'':'',true,'min="0" inputmode="numeric" placeholder="例：50000"')
 +'<div class="field"><label for="saving-owner">誰の貯金？</label>'
 +'<input id="saving-owner" name="owner" list="saving-owner-list" value="'+e(x.owner==='未分類'?'':x.owner||'')+'" placeholder="新郎／新婦／共同" required autocomplete="off">'
 +datalist('saving-owner-list',['新郎','新婦','共同','親・家族'])+'</div>'
 +field('どこの貯金？','bank','text',x.bank==='口座未設定'?'':x.bank||'',true,'autocomplete="off" placeholder="例：楽天銀行／現金"')
 +'<details class="editor-more"><summary>日付・用途など（任意）</summary><div class="editor-more-inner">'
 +field('日付','date','date',uid?x.date||'':today())
 +'<div class="field"><label for="saving-purpose">用途</label><input id="saving-purpose" name="purpose" list="saving-purpose-list" value="'+e(x.purpose==='用途未設定'?'':x.purpose||'')+'" placeholder="結婚式・新婚旅行" autocomplete="off">'
 +datalist('saving-purpose-list',['結婚式','新婚旅行','結婚式・新婚旅行','共有貯金','生活費','生活防衛資金','その他'])+'</div>'
 +field('口座の呼び名','account','text',x.account||'',false,'autocomplete="off" placeholder="普通預金"')
 +checkField('結婚資金に使う','available',x.available!==false)
 +field('メモ','note','text',x.note||'')
 +'<p class="field-hint">口座番号・暗証番号は入力しないでください。</p></div></details>';
 modal(uid?'貯金の記録を編集':'貯金を追加',fields,'saving',uid);
}

/** Gift contributions may already be part of an entered savings balance.
 * Count them for the gift breakdown, but only add the non-deposited portion
 * to available wedding funds and the combined total.
 */
function giftFunding(){
 const giftRows=state.gifts.map(g=>({amount:Math.max(0,n(g.amount)),included:!!g.inSavings}));
 const guestRows=state.guests.map(g=>({amount:Math.max(0,n(g.gift)),included:!!g.giftInSavings}));
 const giftTotal=giftRows.reduce((v,g)=>v+g.amount,0);
 const guestTotal=guestRows.reduce((v,g)=>v+g.amount,0);
 const included=[...giftRows,...guestRows].filter(g=>g.included).reduce((v,g)=>v+g.amount,0);
 return {giftTotal,guestTotal,total:giftTotal+guestTotal,included,
  additional:Math.max(0,giftTotal+guestTotal-included)};
}
function combinedFunding(){
 const savings=savingsTotals(),gifts=giftFunding();
 return {...gifts,savingsTotal:savings.total,savingsUsable:savings.usable,
  savingsSet:savings.registered,
  total:savings.total+gifts.additional,
  usable:savings.usable+gifts.additional,
  hasEntries:savings.registered||gifts.total>0};
}
function fundingBreakdownCard(){
 const v=combinedFunding(),f=financeSummary(),savings=savingsTotals();
 const ceremonyEntered=f.weddingPlan>0,travelEntered=honeymoonQuote()>0,savingsEntered=savings.entries.length>0;
 const inputs=[
  {name:'結婚式の総額',done:ceremonyEntered,action:'budget-total'},
  {name:'新婚旅行費',done:travelEntered,action:'edit-honeymoon'},
  {name:'貯金',done:savingsEntered,action:'new-saving'}
 ];
 const remaining=inputs.filter(x=>!x.done);
 const missing='<span class="funding-empty-line" aria-label="金額の入力待ち"></span>';
 // Do not show a potentially understated shortage before the wedding and honeymoon costs are both entered.
 const ready=ceremonyEntered&&travelEntered&&f.savingsSet;
 return '<div class="budget-funds">'
  +'<div class="budget-funds-top"><div><span>結婚資金の合計</span><strong>'+(v.hasEntries?yen(v.total):missing)+'</strong></div><small>貯金 ＋ ご祝儀・支援</small></div>'
  +'<div class="budget-funds-sources">'
  +'<button type="button" class="budget-fund-source" data-action="money-view" data-id="accounts"><span>貯金</span><b>'+(v.savingsSet?yen(v.savingsTotal):missing)+'</b></button>'
  +'<button type="button" class="budget-fund-source" data-action="money-view" data-id="gifts"><span>ご祝儀・支援</span><b>'+yen(v.giftTotal+v.guestTotal)+'</b></button></div>'
  +'<button type="button" class="funding-add-gift" data-action="new-gift">＋ ご祝儀を追加</button>'
  +(v.included?'<div class="budget-funds-note">貯金に含むご祝儀 '+yen(v.included)+' は二重に足していません</div>':'')
  +'<div class="funding-need" aria-label="追加で必要な資金">'
  +'<div class="funding-need-result"><span>あと準備する金額</span>'
  +'<strong class="'+(ready?'':'funding-pending')+'">'+(ready?yen(f.shortfall):missing)+'</strong>'
  +'<small>'+(ready?(f.shortfall>0?'今後の支払いに対する不足分':'必要額を確保できています'):'式・旅費・貯金を入力すると表示します')+'</small></div></div>'
  +(remaining.length?'<div class="funding-start"><div class="funding-start-head"><b>まず入力する金額</b><small>'+(3-remaining.length)+'/3 完了</small></div>'
   +'<div class="funding-start-actions" style="--guide-cols:'+remaining.length+'">'+remaining.map(x=>'<button type="button" data-action="'+x.action+'"><span>'+x.name+'</span><span aria-hidden="true">＋</span></button>').join('')+'</div></div>':'')
  +'</div>';
}

function financeSummary(){
  const source=savingsTotals(), gifts=giftFunding(), honeymoon=honeymoonCategory();
  const plannedFor=c=>{
    const payments=state.payments.filter(p=>p.category===c.id).reduce((sum,p)=>sum+Math.max(0,n(p.amount)),0);
    return Math.max(0,forecastCat(c),n(c.budget),payments,paidCategory(c));
  };
  const ceremonyCats=state.categories.filter(c=>c.id!==honeymoon?.id);
  const ceremonyItemTotal=ceremonyCats.reduce((sum,c)=>sum+plannedFor(c),0);
  // The wedding budget serves as a fallback while some detailed costs are not registered.
  // The single wedding total is authoritative. Detailed categories are a breakdown,
// not an extra bill added on top. Fall back to category totals only if no total is set.
  const weddingPlan=Math.max(0,n(state.budgetTotal))||ceremonyItemTotal;
  const weddingPaidByDetails=ceremonyCats.reduce((sum,c)=>sum+Math.max(0,paidCategory(c)),0);
  // The manually entered figure is the wedding-wide paid total, not an extra payment.
  // Prefer the larger amount so category/payment records do not get double counted.
  const weddingPaid=Math.max(weddingPaidByDetails,Math.max(0,n(state.weddingPaidDirect)));
  const travelPlan=honeymoon?plannedFor(honeymoon):0;
  const travelPaid=honeymoon?Math.max(0,paidCategory(honeymoon)):0;
  const ceremonyFuture=Math.max(0,weddingPlan-weddingPaid);
  const travelFuture=Math.max(0,travelPlan-travelPaid);
  const categoryFuture=ceremonyFuture+travelFuture;
  const extraFuture=state.extras.filter(x=>!x.paid).reduce((sum,x)=>sum+Math.max(0,n(x.amount)),0);
  const required=categoryFuture+extraFuture;
  const savings=source.usable+gifts.additional;
  const costsSet=weddingPlan>0||travelPlan>0||state.payments.length>0||state.extras.length>0;
  const savingsSet=source.registered||gifts.total>0;
  return {required,savings,savingsTotal:source.total,giftsTotal:gifts.total,
    giftsAdditional:gifts.additional,savingsSet,costsSet,categoryFuture,extraFuture,
    ceremonyFuture,travelFuture,weddingPlan,travelPlan,weddingPaid,travelPaid,
    shortfall:Math.max(0,required-savings),surplus:Math.max(0,savings-required)};
}
function financePanel(compact=false){
 const f=financeSummary();
 return '<div class="finance-overview '+(compact?'compact':'')+'"><div class="finance-top"><div class="eyebrow">資金状況</div>'+btn('内訳','edit-savings','','ghost tiny')+'</div>'
 +'<div class="finance-main"><span>貯金合計</span><button type="button" class="finance-amount-edit" data-action="edit-savings" aria-label="貯金額を更新"><strong>'+(f.savingsSet?yen(f.savingsTotal):'—')+'</strong><small aria-hidden="true">✎</small></button></div>'
 +'<div class="finance-available">利用可能額 <b>'+(f.savingsSet?yen(f.savings):'—')+'</b></div>'
 +'<div class="finance-pairs"><div><span>必要額</span><strong>'+(f.costsSet?yen(f.required):'—')+'</strong></div>'
 +'<div class="'+(f.shortfall?'needs-money':'enough-money')+'"><span>'+(f.savingsSet&&f.costsSet?(f.shortfall?'不足額':'残額'):'不足額')+'</span><strong>'+(f.savingsSet&&f.costsSet?yen(f.shortfall||f.surplus):'—')+'</strong></div></div>'
 +'<p class="finance-note">未払い '+yen(f.categoryFuture)+' ＋ 追加費用 '+yen(f.extraFuture)+'</p></div>';
}
function futureSchedule(x){
 return (x.date||'')+(x.time?' '+x.time:'');
}
function upcomingSchedule(limit=3){
 return state.schedules.filter(x=>!x.done).sort((a,b)=>futureSchedule(a).localeCompare(futureSchedule(b))).slice(0,limit);
}

function renderHome(){
 const total=state.tasks.length,done=state.tasks.filter(t=>t.done).length;
 const nextTasks=state.tasks.filter(t=>!t.done).sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999')).slice(0,2);
 const events=upcomingSchedule(3);
 let h='<div class="home-identity"><div><span class="eyebrow">OUR WEDDING</span><strong>'+e(state.date.replaceAll('-',' / '))+'</strong></div>'
  +'<span class="home-partners">'+e(state.couple[0])+' & '+e(state.couple[1])+'</span></div>';
 if(state.reminders){
  const alerts=reminderCandidates();
  if(alerts.length)h+='<button type="button" class="deadline-banner" data-action="show-deadlines">確認が必要な期限 <b>'+alerts.length+'件</b><span>›</span></button>';
 }
 h+='<div class="home-progress"><span>準備の進捗 <b>'+progress(state.tasks)+'%</b></span><span>'+done+' / '+total+' 件</span><div class="progress"><span style="width:'+progress(state.tasks)+'%"></span></div></div>';
 h+=section('準備スケジュール',btn('一覧 →','more','appointments'));
 h+='<div class="home-preview">'+(events.length?events.map(x=>
 '<div class="mini-band"><time>'+dayLabel(x.date)+(x.time?' '+e(x.time):'')+'</time><strong>'+e(x.title)+'</strong>'+btn('編集','edit-schedule',x.id)+'</div>').join('')
 :'<div class="empty mini-empty">打ち合わせや衣装合わせの予定を登録できます。</div>')+'</div>';
 h+='<div class="home-quick">'+btn('＋ 予定を登録','new-schedule','','primary')+btn('＋ タスクを登録','new-task','','light')+'</div>';
 h+=section('これからのタスク',btn('すべて →','nav','tasks'));
 h+='<div class="home-preview">'+(nextTasks.length?nextTasks.map(t=>taskCard(t,true)).join(''):btn('準備リストをまとめて登録','template','','light'))+'</div>';
 h+='<div class="home-footnote">資金や支払いは、下の「お金」タブで管理できます。</div>';
 return h;
}
function taskCard(t,compact=false){
 const who=role(t.role),sub=t.subtasks||[],subDone=sub.filter(s=>s.done).length;
 return '<div class="item '+(t.done?'done':'')+'"><input class="check" aria-label="'+e(t.title)+'を完了" type="checkbox" data-action="toggle-task" data-id="'+e(t.id)+'" '+(t.done?'checked':'')+'><div class="content"><div class="item-title">'+e(t.title)+'</div><div class="item-sub"><span class="role-dot" style="background:'+e(who?.color||'#ccc')+'"></span> '+e(who?.name||'未担当')+(t.due?' · '+dayLabel(t.due):'')+' '+(overdue(t)?badge('期限を過ぎています','danger'):dueSoon(t)?badge('もうすぐ','warn'):'')+' '+formatPriority(t.priority)+(sub.length?' · '+subDone+'/'+sub.length+' 小項目':'')+'</div>'+(t.memo&&!compact?'<p class="small muted task-memo">'+e(t.memo)+'</p>':'')+(t.url&&!compact&&safeUrl(t.url)?'<a class="task-reference" href="'+e(safeUrl(t.url))+'" target="_blank" rel="noopener noreferrer">参考リンク ↗</a>':'')+(t.photo&&!compact?'<img class="task-thumbnail" src="'+e(t.photo)+'" alt="タスク添付写真" loading="lazy">':'')+(sub.length&&!compact?'<div class="subtasks">'+sub.slice(0,3).map(x=>'<label><input type="checkbox" data-action="toggle-subtask" data-id="'+e(t.id)+'" data-subid="'+e(x.id)+'" '+(x.done?'checked':'')+'> '+e(x.title)+'</label>').join('')+(sub.length>3?'<small class="muted">ほか '+(sub.length-3)+' 件は編集画面で確認</small>':'')+'</div>':'')+'</div>'+btn('編集','edit-task',t.id)+'</div>';
}
function renderTasks(){
 const done=state.tasks.filter(t=>t.done).length;
 let h=header('やること',btn('＋ 追加','new-task','','primary'),'役割で分けて、みんなで少しずつ');
 h+='<div class="card"><div class="row between"><b>準備の達成率</b><b>'+progress(state.tasks)+'%</b></div><div class="progress mt"><span style="width:'+progress(state.tasks)+'%"></span></div><div class="caption">'+done+' / '+state.tasks.length+' 件完了</div></div>';
 const tabs=[['all','全員分'],['me','自分の担当'],...state.roles.map(r=>[r.id,r.name])];
 h+='<div class="role-select"><label for="role-filter">担当者</label><select id="role-filter" aria-label="表示する担当者">'+tabs.map(t=>'<option value="'+e(t[0])+'" '+(taskRole===t[0]?'selected':'')+'>'+e(t[1])+'</option>').join('')+'</select></div>';
 const list=state.tasks.filter(t=>taskRole==='all'||(taskRole==='me'&&t.role===state.myRole)||t.role===taskRole).sort((a,b)=>Number(a.done)-Number(b.done)||(a.due||'9999').localeCompare(b.due||'9999'));
 h+='<div class="filterbar"><span class="small muted">'+list.length+'件のタスク</span>'+btn('✿ 準備テンプレート','template','','light tiny')+'</div>';
 h+=list.length?'<div class="list">'+list.map(t=>taskCard(t)).join('')+'</div>':empty('まだタスクはありません。<br>右上の追加ボタンかテンプレートから登録してね。');
 h+=section('役割ごとの進捗',btn('役割を編集','more','roles'));
 h+='<div class="card">'+state.roles.map(r=>{const all=state.tasks.filter(t=>t.role===r.id);return '<div class="bar-row"><div class="row between"><span><span class="role-dot" style="background:'+e(r.color)+'"></span> '+e(r.name)+'</span><small class="muted">'+all.filter(t=>t.done).length+'/'+all.length+' · '+progress(all)+'%</small></div><div class="bar-track"><span style="width:'+progress(all)+'%;background:'+e(r.color)+'"></span></div></div>'}).join('')+'</div>';
 return h;
}
function totalGifts(){return giftFunding().total}
function paidCategory(c){return n(c.manualPaid)+state.payments.filter(p=>p.category===c.id&&p.paid).reduce((s,p)=>s+n(p.amount),0)}
function totalPaid(){return state.categories.reduce((s,c)=>s+paidCategory(c),0)}
function forecastCat(c){return n(c.contract)>0?n(c.contract):n(c.estimate)}
function totalForecast(){return state.categories.reduce((s,c)=>s+forecastCat(c),0)}

function budgetInsights(){
 const honeymoonId=honeymoonCategory()?.id;
 const estimate=c=>{
  const planned=state.payments.filter(p=>p.category===c.id).reduce((v,p)=>v+Math.max(0,n(p.amount)),0);
  return Math.max(0,forecastCat(c),n(c.budget),planned,paidCategory(c));
 };
 const parts=state.categories.filter(c=>c.id!==honeymoonId).map(c=>({name:c.name||'未分類',value:estimate(c)}));
 const ceremonyCost=parts.reduce((v,c)=>v+c.value,0);
 const allExpected=state.categories.reduce((v,c)=>v+estimate(c),0)+state.extras.reduce((v,x)=>v+Math.max(0,n(x.amount)),0);
 const paymentsPaid=state.categories.reduce((v,c)=>v+Math.max(0,paidCategory(c)),0)+state.extras.filter(x=>x.paid).reduce((v,x)=>v+Math.max(0,n(x.amount)),0);
 const target=Math.max(0,n(state.budgetTotal)),funds=financeSummary();
 const paymentTotal=Math.max(paymentsPaid,allExpected,funds.weddingPlan+funds.travelPlan+funds.extraFuture);
 return {parts,ceremonyCost,target,paymentPaid:paymentsPaid,paymentTotal,
  fundingRatio:funds.weddingPlan>0&&funds.travelPlan>0&&funds.required>0&&funds.savingsSet?funds.savings/funds.required:null,
  budgetRatio:target&&ceremonyCost>0?ceremonyCost/target:null,paymentRatio:paymentTotal?paymentsPaid/paymentTotal:null};
}
function budgetProgressLine(label,ratio,color){
 const ready=ratio!==null&&Number.isFinite(ratio)&&ratio>=0;
 const value=ready?Math.round(ratio*100):0;
 return '<div class="funding-progress-line">'
  +'<div class="funding-progress-label"><span>'+e(label)+'</span><b>'+(ready?value+'%':'—')+'</b></div>'
  +'<div class="funding-progress-track" role="meter" aria-label="'+e(label)+'" aria-valuemin="0" aria-valuemax="100" '+(ready?'aria-valuenow="'+Math.min(100,value)+'"':'aria-valuetext="入力待ち"')+'>'
  +'<span style="width:'+(ready?Math.min(100,value):0)+'%;background:'+color+'"></span></div></div>';
}
function budgetDonuts(){
 const r=budgetInsights();
 const rows=[
  budgetProgressLine('資金の準備',r.fundingRatio,'#759e89'),
  budgetProgressLine('支払いの進捗',r.paymentRatio,'#83a2a1')
 ];
 if(r.budgetRatio!==null)rows.push(budgetProgressLine('予算の使用',r.budgetRatio,r.budgetRatio>1?'#b86f78':'#b68c92'));
 return '<section class="budget-charts budget-charts-main" aria-label="結婚資金と進捗">'
  +fundingBreakdownCard()
  +'<div class="funding-progress"><div class="budget-section-title"><b>進み具合</b></div>'+rows.join('')+'</div></section>';
}

function budgetComposition(){
 const r=budgetInsights(),sorted=r.parts.filter(x=>x.value>0).sort((a,b)=>b.value-a.value);
 const total=sorted.reduce((v,x)=>v+x.value,0);
 const rows=sorted.slice(0,3);
 if(sorted.length>3)rows.push({name:'その他',value:sorted.slice(3).reduce((v,x)=>v+x.value,0)});
 const colors=['#789a88','#bd9295','#c4aa80','#a0b0bf'];
 return '<section class="budget-composition"><div class="budget-section-title"><b>費用内訳</b>'+btn('全項目','money-view','categories','ghost tiny')+'</div>'
 +(total?'<div class="budget-composition-track">'+rows.map((x,i)=>'<span style="width:'+(x.value/total*100).toFixed(2)+'%;background:'+colors[i]+'"></span>').join('')+'</div>'
  +'<div class="budget-composition-rows">'+rows.map((x,i)=>'<div class="budget-composition-row"><span><i style="background:'+colors[i]+'"></i>'+e(x.name)+'</span><strong>'+Math.round(x.value/total*100)+'%</strong><small>'+yen(x.value)+'</small></div>').join('')+'</div>'
  :'<p class="caption">費用を登録すると内訳が表示されます。</p>')+'</section>';
}
function financeUpcoming(){
 const arr=[],put=(date,time,title,type,act,id)=>{
  if(typeof date==='string'&&/^\d{4}-\d{2}-\d{2}$/.test(date))
   arr.push({date,time:time||'',title:title||type,type,act,id});
 };
 state.payments.filter(x=>!x.paid).forEach(x=>put(x.due,'',x.title,'支払い','edit-payment',x.id));
 state.schedules.filter(x=>!x.done).forEach(x=>put(x.date,x.time,x.title,'予定','edit-schedule',x.id));
 state.tasks.filter(x=>!x.done).forEach(x=>put(x.due,'',x.title,'タスク','edit-task',x.id));
 state.extras.filter(x=>!x.paid).forEach(x=>put(x.due,'',x.title,'必要品','edit-extra',x.id));
 const now=today();
 arr.sort((a,b)=>(a.date<now?0:1)-(b.date<now?0:1)||a.date.localeCompare(b.date)||a.time.localeCompare(b.time));
 const rows=arr.slice(0,2);
 return '<section class="budget-upcoming"><div class="budget-section-title"><b>今後の予定</b>'+btn('一覧','more','appointments','ghost tiny')+'</div>'
 +'<div class="budget-upcoming-rows">'+(rows.length?rows.map(x=>'<button class="budget-upcoming-row" type="button" data-action="'+x.act+'" data-id="'+e(x.id)+'">'
  +'<time>'+e(x.date.slice(5).replace('-','/'))+(x.time?' '+e(x.time):'')+'</time><span><b>'+e(x.title)+'</b><small>'+e(x.type)+(x.date<now?' · 期限超過':'')+'</small></span><i aria-hidden="true">›</i></button>').join('')
  :'<p class="caption">予定が入るとここに表示されます。</p>')+'</div>'
 +'</section>';
}

/* One money dashboard, with contextual editors instead of seven nested tabs. */
function moneyFigure(label,value,action,caption='',uid=''){
 return '<button type="button" class="money-figure" data-action="'+e(action)+'" data-id="'+e(uid)+'">'
  +'<span class="money-figure-label">'+e(label)+'</span>'
  +'<strong>'+value+'</strong>'
  +'<span class="money-figure-action">'+e(caption||'編集する')+' <span aria-hidden="true">›</span></span></button>';
}
function moneyDetailItem(label,amount,sub,action,uid=''){
 return '<div class="money-detail-item"><div class="money-detail-item-text"><b>'+e(label)+'</b>'
  +(sub?'<small>'+e(sub)+'</small>':'')+'</div>'
  +'<strong>'+yen(amount)+'</strong>'
  +(action?btn('編集',action,uid,'money-detail-edit'):'')+'</div>';
}
function openMoneyDetails(kind){
 if(dialog.open)closeModal();
 let title='',body='';
 if(kind==='accounts'){
  const groups=savingsGroups();
  title='貯金の管理';
  body='<div class="money-detail-lead">貯金合計 '+yen(savingsTotals().total)+'</div>'
   +btn('＋ 貯金を追加','new-saving','','money-detail-add')
   +(groups.length?'<div class="saving-groups">'+groups.map(g=>
    '<section class="saving-group">'
    +'<div class="saving-group-top"><div class="saving-group-name"><b>'+e(g.owner)+'</b><small>'+e(g.bank)+(g.account?' · '+e(g.account):'')+'</small></div><strong>'+yen(g.amount)+'</strong></div>'
    +'<div class="saving-group-bottom">'
    +btn('＋ この口座に追加','new-saving',g.entries[0].id,'money-saving-add')
    +'<details class="saving-history"><summary>履歴 '+g.entries.length+'件</summary>'
    +'<div class="money-detail-list">'+g.entries.slice().reverse().map(x=>
      moneyDetailItem(x.date||(x.legacy?'以前の残高':'登録済み'),x.amount,
       (x.available===false?'資金計算の対象外':'')+(x.note?' · '+x.note:''),'edit-saving',x.id)
     ).join('')+'</div></details></div></section>'
   ).join('')+'</div>':'<p class="money-detail-empty">貯金の登録はまだありません。</p>')
   +'<p class="money-detail-footnote">追加した金額は合計に加算されます。以前の登録も残ります。</p>';
 }else if(kind==='gifts'){
  const total=giftFunding(),guestGifts=state.guests.filter(g=>n(g.gift)>0);
  title='ご祝儀・支援金';
  body='<div class="money-detail-lead">合計 '+yen(total.total)+'</div>'
   +btn('＋ ご祝儀を追加','new-gift','','money-detail-add')
   +(state.gifts.length||guestGifts.length
    ?'<div class="money-detail-list">'
     +state.gifts.map(g=>moneyDetailItem(g.source||'ご祝儀',g.amount,(g.inSavings?'貯金に計上済み':'')+(g.note?(g.inSavings?' · ':'')+g.note:''),'edit-gift',g.id)).join('')
     +guestGifts.map(g=>moneyDetailItem(g.name||'ゲスト',g.gift,'ゲスト欄から登録済み','edit-guest',g.id)).join('')
     +'</div>'
    :'<p class="money-detail-empty">ご祝儀を登録するとここに表示されます。</p>')
   +'<p class="money-detail-footnote">貯金に含まれるご祝儀は重複して足しません。</p>';
 }else if(kind==='payments'){
  const items=state.payments.slice().sort((a,b)=>(a.due||'9999').localeCompare(b.due||'9999'));
  title='支払いの管理';
  body=btn('＋ 支払いを追加','new-payment','','money-detail-add')
   +(items.length?'<div class="money-detail-list">'
   +items.map(p=>moneyDetailItem(p.title||'支払い',p.amount,
     (p.paid?'支払済み':'支払い予定')+(p.due?' · '+p.due.replaceAll('-','/'):''),
     'edit-payment',p.id)).join('')+'</div>'
   :'<p class="money-detail-empty">式場や旅行などの支払いを登録できます。</p>')
   +'<p class="money-detail-footnote">支払い完了は各明細の「編集」から設定できます。</p>';
 }else if(kind==='costs'){
  title='費用の内訳';
  const cats=state.categories.filter(c=>c.name!=='新婚旅行'&&c.id!=='hw-honeymoon');
  const values=cats.filter(c=>Math.max(n(c.contract),n(c.estimate),n(c.budget),n(c.manualPaid))>0);
  body=btn('＋ 費用項目を追加','new-category','','money-detail-add')
   +(values.length?'<div class="money-detail-list">'+values.map(c=>moneyDetailItem(c.name,Math.max(n(c.contract),n(c.estimate),n(c.budget),n(c.manualPaid)), '費用内訳','edit-category',c.id)).join('')+'</div>'
    :'<p class="money-detail-empty">総額だけでも管理できます。衣装や装花など、必要になったら内訳を追加してください。</p>')
   +'<div class="money-detail-secondary">'+btn('全項目を編集','money-detail-all-categories','','money-detail-edit')
    +btn('必要品を確認','money-detail','extras','money-detail-edit')+'</div>'
   +'<p class="money-detail-footnote">結婚式の総額に内訳を重複加算しません。</p>';
 }else if(kind==='categories'){
  title='費用項目';
  body=btn('＋ 費用項目を追加','new-category','','money-detail-add')
   +'<div class="money-detail-list">'+state.categories.filter(c=>c.id!==honeymoonCategory()?.id).map(c=>moneyDetailItem(c.name,Math.max(n(c.contract),n(c.estimate),n(c.budget)), '内訳','edit-category',c.id)).join('')+'</div>';
 }else if(kind==='extras'){
  title='追加で必要なもの';
  body=btn('＋ 必要品を追加','new-extra','','money-detail-add')
   +(state.extras.length?'<div class="money-detail-list">'+state.extras.map(x=>moneyDetailItem(x.title,x.amount,x.paid?'購入済み':'未購入','edit-extra',x.id)).join('')+'</div>'
   :'<p class="money-detail-empty">追加の必要品はありません。</p>');
 }else return;
 modal(title,body);dialog.classList.add('money-detail-dialog');
}
function renderMoney(){
 const f=financeSummary(),v=combinedFunding();
 const known=f.weddingPlan>0||f.travelPlan>0||f.extraFuture>0;
 const enough=known&&f.shortfall===0;
 const available=f.savings;
 const ratio=f.required>0?Math.max(0,Math.min(100,Math.round(available/f.required*100))):(known?100:0);
 const gifts=v.giftTotal+v.guestTotal;
 const missing=(!f.weddingPlan?'結婚式 ':'')+(!f.travelPlan?'新婚旅行':'');
 const glyphs={
  wedding:'<circle cx="9" cy="12" r="5"/><circle cx="15" cy="12" r="5"/>',
  travel:'<path d="M21 3 3 11l7 2 2 7L21 3Z"/><path d="m10 13 5-5"/>',
  saving:'<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M3 10h18M16 15h2"/>',
  gift:'<rect x="3" y="9" width="18" height="12" rx="2"/><path d="M3 13h18M12 9v12M12 9H8.5C4 9 4.5 3 8 3c2.5 0 4 4.5 4 6Zm0 0h3.5c4.5 0 4-6 .5-6C13.5 3 12 7.5 12 9Z"/>'
 };
 const svgIcon=(name)=>'<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+glyphs[name]+'</svg>';
 const editable=(label,value,action,arg,iconName)=>{
  return '<button type="button" class="money-tile" data-action="'+action+'" '+(arg?'data-id="'+arg+'"':'')+'>'
    +'<div class="money-tile-top"><span class="money-tile-icon" aria-hidden="true">'+svgIcon(iconName)+'</span><span class="money-tile-name">'+label+'</span><span class="money-tile-arrow" aria-hidden="true">↗</span></div>'
    +'<strong>'+(value===null?'<span class="money-blank">―</span>':yen(value))+'</strong></button>';
 };
 const costCard=(label,total,paid,action,iconName)=>{
  const remaining=Math.max(0,total-paid),pct=total>0?Math.min(100,Math.round(paid/total*100)):0;
  const amount=total>0?yen(total):'<span class="money-blank">―</span>';
  return '<button type="button" class="money-cost-card" data-action="'+action+'" aria-label="'+label+'の総額と支払済みを編集">'
   +'<div class="money-cost-head"><span class="money-cost-icon">'+svgIcon(iconName)+'</span><b>'+label+'</b><span class="money-cost-edit" aria-hidden="true">↗</span></div>'
   +'<div class="money-cost-total">総額 <strong>'+amount+'</strong></div>'
   +'<div class="money-cost-stats"><span class="money-paid"><small>支払済</small><strong>'+yen(paid)+'</strong></span>'
   +'<span class="money-remaining"><small>残額</small><strong>'+(total?yen(remaining):'<span class="money-blank">―</span>')+'</strong></span></div>'
   +'<div class="money-cost-track" role="progressbar" aria-label="'+label+'の支払進捗" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+pct+'"><span style="width:'+pct+'%"></span></div>'
   +'</button>';
 };
 let h=header('お金','<button type="button" class="btn money-add-subtle" data-action="money-add" aria-label="金額を登録">＋</button>');
 h+='<div class="money-dashboard">'
  +'<section class="money-status" aria-label="資金状況">'
  +'<div class="money-status-label">'+(enough?'残るお金':'あと必要なお金')+'</div>'
  +'<div class="money-status-value" aria-live="polite">'+(known?yen(enough?f.surplus:f.shortfall):'<span class="money-blank">―</span>')+'</div>'
  +'<div class="money-status-meter" role="progressbar" aria-label="準備できた資金の割合" aria-valuemin="0" aria-valuemax="100" aria-valuenow="'+ratio+'"><span style="width:'+ratio+'%"></span></div>'
  +'<div class="money-status-figures"><span><small>支払う</small><b>'+yen(f.required)+'</b></span>'
  +'<span><small>使える</small><b>'+yen(available)+'</b></span></div>'
  +(!known?'<div class="money-status-hint">結婚式の費用を登録してください</div>':
    missing.trim()?'<div class="money-status-hint">※ '+missing.trim()+'は未入力</div>':'')
  +'</section>'
  +'<div class="money-group-heading"><b>支出</b><span>金額をタップして編集</span></div>'
  +'<section class="money-cost-grid" aria-label="結婚式と新婚旅行の支払状況">'
  +costCard('結婚式',f.weddingPlan,f.weddingPaid,'budget-total','wedding')
  +costCard('新婚旅行',f.travelPlan,f.travelPaid,'edit-honeymoon','travel')
  +'</section>'
  +'<div class="money-group-heading"><b>資金</b><span>合計 '+yen(v.total)+'</span></div>'
  +'<section class="money-tile-grid" aria-label="資金">'
  +editable('貯金',v.savingsSet?v.savingsTotal:null,'money-detail','accounts','saving')
  +editable('ご祝儀・支援',gifts,'money-detail','gifts','gift')
  +'</section>'
  +'<section class="money-actions" aria-label="資金を登録・確認">'
  +btn('＋ 貯金','new-saving','','money-action')
  +btn('＋ ご祝儀','new-gift','','money-action')
  +btn('支払い','money-detail','payments','money-action')
  +btn('内訳','money-detail','costs','money-action')
  +'</section>'
  +(v.included?'<p class="money-help">ご祝儀 '+yen(v.included)+' は貯金に含まれています</p>':'')
  +'</div>';
 return h;
}
function paymentCalendar(){
 const [year,month]=paymentMonth.split('-').map(Number),first=new Date(year,month-1,1).getDay(),last=new Date(year,month,0).getDate();
 const weekdays=['日','月','火','水','木','金','土'];let h='<div class="card"><div class="row between mb">'+btn('‹ 前月','pay-month','-1')+'<b>'+year+'年'+month+'月</b>'+btn('翌月 ›','pay-month','1')+'</div><div class="calendar-grid">'+weekdays.map((d,i)=>'<div class="calendar-weekday '+(i===0?'error':'')+'">'+d+'</div>').join('');
 for(let i=0;i<first;i++)h+='<div></div>';
 for(let day=1;day<=last;day++){const dt=paymentMonth+'-'+String(day).padStart(2,'0'),entries=state.payments.filter(p=>p.due===dt),isToday=dt===today();h+='<button type="button" class="calendar-cell '+(isToday?'today ':'')+(paymentDateSelected===dt?'selected':'')+'" data-action="pay-day" data-id="'+dt+'"><b>'+day+'</b>'+(entries.length?'<span class="cal-dot">'+entries.length+'件</span>':'')+'</button>'}
 return h+'</div><p class="caption">日付を押すと、その日の支払い予定に絞り込めます。</p></div>';
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
 const entries=[['appointments','準備スケジュール','打合せ・試着・期限を登録','◷'],['schedule','当日のタイムライン','進行やスピーチ担当を整理','◷'],['vendors','業者・打ち合わせ','連絡先と決定事項を記録','⌂'],['ideas','アイデアボード','好きな写真やURLを保存','✿'],['packing','持ち物','前日・当日のチェック','▣'],['roles','役割の管理','名前・カラー・自分の担当を編集','♧'],['sync','ふたりで共有','リアルタイム同期の設定','⇄'],['backup','バックアップ','JSON保存・読み込み・CSV書出し','⇩'],['settings','基本設定','挙式日・ふたりの名前・通知','⚙']];
 return header('その他','','準備の記録や設定も、ここにまとめて')+'<div class="card flush">'+entries.map((v,i)=>'<button data-action="more" data-id="'+v[0]+'" style="display:flex;align-items:center;width:100%;gap:12px;border:0;background:transparent;padding:15px;border-bottom:'+(i===entries.length-1?'0':'1px solid #f2e9e5')+';text-align:left"><span style="font-size:22px;color:#c59499;width:29px;text-align:center">'+v[3]+'</span><span class="grow"><b style="font-size:13px">'+v[1]+'</b><div class="small muted" style="margin-top:3px">'+v[2]+'</div></span><span class="muted">›</span></button>').join('')+'</div>';
}

function renderAppointments(){
 const list=state.schedules.slice().sort((a,b)=>(a.date||'9999').localeCompare(b.date||'9999')||(a.time||'').localeCompare(b.time||''));
 return moreTitle('準備スケジュール')+'<div class="section-action">'+btn('＋ 予定を追加','new-schedule','','primary')+btn('カレンダー用保存','calendar-export','','ghost')+'</div>'
 +'<div class="list compact-list">'+(list.length?list.map(x=>'<div class="item '+(x.done?'done':'')+'"><input type="checkbox" class="check" data-action="toggle-schedule" data-id="'+e(x.id)+'" '+(x.done?'checked':'')+' aria-label="予定を完了"><div class="content"><b class="item-title">'+e(x.title)+'</b><div class="item-sub">'+dayLabel(x.date)+(x.time?' '+e(x.time):'')+'　'+e(nameRole(x.role))+'</div>'+(x.memo?'<div class="item-sub">'+e(x.memo)+'</div>':'')+'</div>'+btn('編集','edit-schedule',x.id)+'</div>').join(''):empty('打合せ・衣装合わせ・提出期限などを登録できます。'))+'</div>'
 +'<p class="caption">予定は期限のお知らせにも反映されます。</p>';
}
function renderPresents(){
 const all=state.presents,returned=all.filter(x=>x.returned).length;
 const right=presentView==='received'?btn('＋ お祝い','new-present','','primary'):btn('＋ お礼状','new-thanks','','primary');
 let h=header('お祝い・お返し',right);
 h+='<div class="tabs gift-tabs">'+[['received','お祝い・お返し'],['thanks','お礼状・発送']].map(x=>
  '<button type="button" class="tab '+(presentView===x[0]?'active':'')+'" data-action="present-view" data-id="'+x[0]+'">'+x[1]+'</button>'
 ).join('')+'</div>';
 if(presentView==='thanks'){
  h+='<div class="compact-summary">お礼状・内祝い・発送の管理 <b>'+state.thanks.filter(x=>x.done).length+' / '+state.thanks.length+'件 完了</b></div>';
  h+='<div class="list compact-list">'+(state.thanks.length?state.thanks.map(x=>
   '<div class="item '+(x.done?'done':'')+'"><input type="checkbox" class="check" data-action="toggle-thanks" data-id="'+e(x.id)+'" '+(x.done?'checked':'')+' aria-label="お礼を完了">'
   +'<div class="content"><b class="item-title">'+e(x.recipient)+'</b><div class="item-sub">'+e(x.type||'内祝い')+' · '+e(x.note||'')+'</div></div>'
   +btn('編集','edit-thanks',x.id)+'</div>').join(''):empty('お礼状や引出物の発送予定を登録できます。'))+'</div>';
 }else{
  h+='<div class="compact-summary">登録 <b>'+all.length+'件</b><span>お返し済 <b>'+returned+'件</b></span><span>未対応 <b>'+(all.length-returned)+'件</b></span></div>';
  h+='<div class="list compact-list">'+(all.length?all.map(x=>
   '<div class="item"><div class="content"><b class="item-title">'+e(x.sender)+'</b><div class="item-sub">'+e(x.kind||'品物')+' · '+e(x.received||'—')+(n(x.value)?' · '+yen(x.value):'')+'</div>'
   +'<div class="item-sub">'+(x.returned?'お返し済':'お返し未完了')+'：'+e(x.returnItem||'—')+(n(x.returnValue)?' · '+yen(x.returnValue):'')+'</div></div>'
   +btn('編集','edit-present',x.id)+'</div>').join(''):empty('品物・商品券・現金などのお祝いとお返しを記録できます。'))+'</div>';
  h+='<p class="caption">お祝い台帳は、ご祝儀の収入に重複加算しません。</p>';
 }
 return h;
}

function renderSubpage(){
 if(morePage==='appointments')return renderAppointments();
 if(morePage==='roles'){let h=moreTitle('役割の管理')+'<p class="page-desc">自由に追加・編集。タスクの担当に反映されます。</p>'+btn('＋ 役割追加','new-role','','primary');h+='<div class="list mt">'+state.roles.map(r=>'<div class="item"><span class="role-dot" style="width:23px;height:23px;background:'+e(r.color)+'"></span><div class="content"><b>'+e(r.name)+'</b> '+(r.id===state.myRole?badge('自分の担当','mint'):'')+'</div>'+btn('自分','set-my-role',r.id)+btn('編集','edit-role',r.id)+'</div>').join('')+'</div>';return h}
 if(morePage==='schedule')return moreTitle('当日のタイムライン')+btn('＋ 進行を追加','new-timeline','','primary')+'<div class="card mt"><div class="timeline">'+state.timeline.slice().sort((a,b)=>a.time.localeCompare(b.time)).map(x=>'<div class="timeline-item"><div><time>'+e(x.time)+'</time><b>'+e(x.title)+'</b></div><div class="small muted">'+e(nameRole(x.role))+' · '+e(x.memo||'')+'</div>'+btn('編集','edit-timeline',x.id)+'</div>').join('')+'</div>'+(state.timeline.length?'':empty('挙式、披露宴、スピーチなどを追加しましょう。'))+'</div>';
 if(morePage==='vendors')return moreTitle('業者・打ち合わせ')+btn('＋ 業者を登録','new-vendor','','primary')+'<div class="list mt">'+(state.vendors.length?state.vendors.map(v=>'<div class="item"><div class="content"><b>'+e(v.company)+'</b><div class="item-sub">'+e(v.contact||'')+' · '+e(v.phone||'')+'</div><div class="item-sub">'+e(v.decisions||'')+'</div></div>'+btn('編集','edit-vendor',v.id)+'</div>').join(''):empty('業者の連絡先と打ち合わせ履歴を保存できます。'))+'</div>';
 if(morePage==='ideas')return moreTitle('アイデアボード')+btn('＋ アイデア保存','new-idea','','primary')+'<div class="idea-grid mt">'+(state.ideas.length?state.ideas.map(v=>'<div class="idea-card">'+(v.photo?'<img src="'+e(v.photo)+'" alt="アイデア写真">':'<div style="height:110px;background:#fff0f1;display:grid;place-items:center;font-size:35px;color:#d9a8ae">✿</div>')+'<div class="idea-content"><b>'+e(v.title)+'</b><div class="small muted">'+e(v.category||'')+'</div>'+(v.url?'<a href="'+e(safeUrl(v.url))+'" target="_blank" rel="noopener noreferrer">リンクを見る ↗</a>':'')+'<div>'+btn('編集','edit-idea',v.id)+'</div></div></div>').join(''):empty('お気に入りの装花や衣装を集めましょう。'))+'</div>';
 if(morePage==='packing')return moreTitle('持ち物チェック')+btn('＋ 持ち物','new-item','','primary')+(['前日','当日'].map(stage=>section(stage)+(state.items.filter(x=>x.stage===stage).length?'<div class="list">'+state.items.filter(x=>x.stage===stage).map(x=>'<div class="item '+(x.done?'done':'')+'"><input type="checkbox" class="check" data-action="toggle-item" data-id="'+e(x.id)+'" '+(x.done?'checked':'')+'><div class="content"><b class="item-title">'+e(x.title)+'</b><div class="item-sub">'+e(x.note||'')+'</div></div>'+btn('編集','edit-item',x.id)+'</div>').join('')+'</div>':empty('まだ登録されていません。'))).join(''));

 if(morePage==='settings')return renderSettings();
 if(morePage==='backup')return renderBackup();
 if(morePage==='sync')return renderSync();
 return moreTitle('準備');
}
function renderSettings(){
 return moreTitle('基本設定')+'<div class="caption">Version 20261020r14</div><div class="card"><form data-form="settings">'+field('挙式日','date','date',state.date,true)+field('新郎の呼び名','couple0','text',state.couple[0])+field('新婦の呼び名','couple1','text',state.couple[1])+'<button class="btn primary btn-wide">設定を保存</button></form></div><div class="card"><h2>リマインド</h2><p class="small muted">アプリを開いたとき・戻ったときに期限をお知らせします。</p>'+btn(state.reminders?'通知をオフにする':'通知をオンにする','notifications','','light')+'<form data-form="reminder-settings"><div class="field"><label>何日前からお知らせする？</label><select name="reminderDays">'+[[0,'当日'],[1,'1日前'],[3,'3日前'],[7,'7日前'],[14,'14日前']].map(v=>'<option value="'+v[0]+'" '+(n(state.reminderDays)===v[0]?'selected':'')+'>'+v[1]+'</option>').join('')+'</select></div><button class="btn light btn-wide" type="submit">通知タイミングを保存</button></form><p class="caption">パートナーの変更は共有接続中にリアルタイム通知。閉じている間は配信設定が必要です。</p>'+btn('パートナー通知を許可','partner-push','','light')+'</div><div class="card"><h2>保存について</h2><p class="small muted">端末に自動保存します。iPhoneの「ホーム画面に追加」前後で、ブラウザ内の保存領域が別になる場合があります。大切なデータはバックアップを保存してください。</p>'+btn('バックアップへ','more','backup')+'</div>';
}
function renderBackup(){
 return moreTitle('バックアップと書き出し')+'<div class="card"><h2>JSONバックアップ</h2><p class="small muted">ゲスト、タスク、予算、写真などを一括保存・復元します。</p><div class="page-actions">'+btn('バックアップを保存','export-json','','primary')+btn('バックアップを読み込む','import-json')+'</div><input id="import-file" type="file" accept=".json,application/json" hidden></div><div class="card"><h2>CSV書き出し</h2><p class="small muted">Excelで使える形式で項目別に保存します。</p><div class="field"><select id="csv-section">'+ARRAYS.map(k=>'<option value="'+k+'">'+e(({tasks:'タスク',guests:'ゲスト',payments:'支払い',categories:'予算項目',gifts:'ご祝儀',roles:'役割',tables:'卓',timeline:'当日進行',vendors:'業者',ideas:'アイデア',items:'持ち物',thanks:'お礼',comments:'コメント',savingsAccounts:'貯金口座',schedules:'準備予定',extras:'必要品',presents:'お祝い・お返し'})[k])+'</option>').join('')+'</select></div>'+btn('CSVを保存','export-csv','','light')+'</div><p class="caption">JSONファイルには個人情報が含まれるため、第三者には渡さず安全に保管してください。</p>';
}

function renderSync(){
 const connected=syncEnabled();
 return moreTitle('ふたりで共有')
 +'<div class="card"><h2>パートナーとリアルタイム同期</h2>'
 +'<p class="small muted">クラウド共有にはFirebaseの接続設定が必要です。未接続でも端末保存は使えます。</p>'
 +'<div class="notice">共有コードは招待した相手にだけ渡してください。Firestoreのセキュリティ設定も必要です。</div>'
 +btn(connected?'接続設定を編集':'＋ 接続設定を登録','sync-config','','primary')+'</div>'
 +(connected?'<div class="card"><b>共有コード設定済み</b><p class="small muted">未送信の変更：'+queuedCount()+' 件</p>'+btn('接続を解除','disconnect','','danger')+'</div>':'');
}
function openSyncConfig(){
 const cfg=cloud?.config||{},code=cloud?.room||'';
 const fields='<div class="field"><label>API Key</label><input name="apiKey" required value="'+e(cfg.apiKey||'')+'" placeholder="AIza..." autocomplete="off"></div>'
 +'<div class="field"><label>Project ID</label><input name="projectId" required value="'+e(cfg.projectId||'')+'" autocomplete="off"></div>'
 +'<div class="field"><label>App ID</label><input name="appId" required value="'+e(cfg.appId||'')+'" autocomplete="off"></div>'
 +'<div class="field"><label>Auth Domain</label><input name="authDomain" value="'+e(cfg.authDomain||'')+'" autocomplete="off"></div>'
 +'<div class="field"><label>共有コード（48文字）</label><input name="room" required value="'+e(code)+'" minlength="48" maxlength="48" autocomplete="off"></div>'
 +'<div class="page-actions">'+btn('コードを発行','generate-room')+btn('コピー','copy-room')+'</div>'
 +'<div class="field"><label>Webプッシュ公開鍵（任意）</label><input name="pushPublicKey" value="'+e(cloud?.pushPublicKey||'')+'" autocomplete="off"></div>';
 modal('共有の接続設定',fields,'sync');
}

function field(label,name,type='text',value='',required=false,extra=''){
 return '<div class="field"><label for="f-'+e(name)+'">'+e(label)+'</label><input id="f-'+e(name)+'" name="'+e(name)+'" type="'+e(type)+'" value="'+e(value)+'" '+(required?'required':'')+' '+extra+'></div>';
}
function area(label,name,value=''){return '<div class="field"><label for="f-'+e(name)+'">'+e(label)+'</label><textarea id="f-'+e(name)+'" name="'+e(name)+'" rows="3">'+e(value)+'</textarea></div>'}
function choices(label,name,options,value=''){return '<div class="field"><label>'+e(label)+'</label><select name="'+e(name)+'">'+options.map(x=>'<option value="'+e(x[0])+'" '+(String(x[0])===String(value)?'selected':'')+'>'+e(x[1])+'</option>').join('')+'</select></div>'}
function selectField(name,label,opts,value){return choices(label,name,opts.map(x=>[x.id,x.name]),value)}
function checkField(label,name,value){return '<label class="row field"><input type="checkbox" name="'+e(name)+'" '+(value?'checked':'')+'> '+e(label)+'</label>'}
function modal(title,body,formType='',uid=''){
 dialog.classList.toggle('guest-dialog',formType==='guest'||formType==='present');
  modalContent.innerHTML='<div class="modal-head"><h2>'+title+'</h2><button class="close-modal" type="button" data-action="close-modal" aria-label="閉じる">×</button></div><div class="modal-body">'+(formType?'<form '+(formType==='guest'||formType==='present'?'class="guest-editor" novalidate ':'')+'data-form="'+formType+'" data-id="'+e(uid)+'">'+body+'<div class="form-actions">'+(uid?'<button type="button" class="btn danger" data-action="delete" data-id="'+e(uid)+'" data-type="'+e(formType)+'">削除</button>':'')+'<button type="button" class="btn ghost" data-action="close-modal">キャンセル</button><button class="btn primary" type="submit">保存する</button></div></form>':body)+'</div>';dialog.showModal();initializeModalPager();setupReadOnlyModalPages();
}


let dialogListPager=null;
function setDialogListPage(index){
 const p=dialogListPager;if(!p)return;
 p.index=Math.min(p.pages-1,Math.max(0,index));
 p.rows.forEach((row,i)=>row.hidden=Math.floor(i/p.size)!==p.index);
 p.nav.querySelector('.page-counter').textContent=(p.index+1)+' / '+p.pages;
 p.nav.querySelector('[data-action="dialog-prev"]').disabled=p.index===0;
 p.nav.querySelector('[data-action="dialog-next"]').disabled=p.index===p.pages-1;
}
function setupReadOnlyModalPages(){
 dialogListPager=null;
 const list=dialog.querySelector('.activity-list');
 if(!list||list.children.length<5)return;
 const rows=Array.from(list.children);
 const size=innerHeight<680?3:5;
 const nav=document.createElement('div');
 nav.className='page-navigation dialog-navigation';
 nav.innerHTML='<button type="button" class="page-arrow" data-action="dialog-prev">‹ 前</button><span class="page-counter"></span><button type="button" class="page-arrow" data-action="dialog-next">次 ›</button>';
 list.after(nav);
 dialogListPager={rows,size,index:0,pages:Math.ceil(rows.length/size),nav};
 setDialogListPage(0);
}
let editorPages=null;
function showEditorPage(index){
 if(!editorPages)return;
 const at=Math.max(0,Math.min(editorPages.pages.length-1,index));
 editorPages.index=at;
 editorPages.pages.forEach((p,i)=>p.hidden=i!==at);
 const prev=dialog.querySelector('[data-action="form-prev"]');
 const next=dialog.querySelector('[data-action="form-next"]');
 if(prev)prev.disabled=at===0;
 if(next)next.hidden=at===editorPages.pages.length-1;
 const save=editorPages.form.querySelector('.form-actions button[type="submit"]');
 if(save)save.hidden=at!==editorPages.pages.length-1;
 const count=dialog.querySelector('.editor-page-count');
 if(count)count.textContent=(at+1)+' / '+editorPages.pages.length;
}
function verifyEditorPage(index){
 if(!editorPages)return true;
 const fields=Array.from(editorPages.pages[index]?.querySelectorAll('[required]')||[]);
 const invalid=fields.find(el=>!el.checkValidity());
 if(!invalid)return true;
 try{invalid.focus({preventScroll:true})}catch{}
 toast('必須項目を入力してください');
 return false;
}
function initializeModalPager(){
 editorPages=null;
 const form=dialog.querySelector('form[data-form]');
 if(!form||form.classList.contains('guest-editor')||['saving','honeymoon','category','budget-total','gift'].includes(form.dataset.form))return;
 const actions=form.querySelector('.form-actions');
 if(!actions)return;
 const fields=Array.from(form.children).filter(x=>x!==actions);
 if(fields.length<=2)return;
 dialog.classList.add('editor-dialog');
 form.classList.add('paged-editor');
 form.noValidate=true;
 const stage=document.createElement('div');
 stage.className='editor-stage';
 const pageNav=document.createElement('div');
 pageNav.className='editor-pages';
 pageNav.innerHTML='<button type="button" class="btn ghost tiny" data-action="form-prev">‹ 戻る</button>'
  +'<span class="editor-page-count"></span>'
  +'<button type="button" class="btn ghost tiny" data-action="form-next">次へ ›</button>';
 const pages=[];
 let current=document.createElement('div'),units=0;
 current.className='editor-page';
 const limit=innerHeight<680?2.7:3.7;
 for(const field of fields){
  const weight=field.matches('.form-grid')?1.6
   :field.matches('.attachments')?2.5
   :field.querySelector('textarea')?1.65
   :field.matches('.field-hint,.caption')?.5:1;
  if(units+weight>limit&&units>0){
   pages.push(current);current=document.createElement('div');current.className='editor-page';units=0;
  }
  current.appendChild(field);units+=weight;
 }
 pages.push(current);
 pages.forEach(p=>stage.appendChild(p));
 form.insertBefore(stage,actions);
 if(pages.length>1)form.insertBefore(pageNav,actions);
 editorPages={form,pages,index:0};
 showEditorPage(0);
}
function closeModal(){
 if(!dialog.open)return;
 const focused=document.activeElement;
 if(focused&&dialog.contains(focused))focused.blur();
 dialog.close();
 editorPages=null;dialogListPager=null;
 dialog.classList.remove('editor-dialog','money-detail-dialog');
}

function modalEdit(type,uid=''){
 const plural={saving:'savingsAccounts',task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks',schedule:'schedules',extra:'extras',present:'presents'};
 const c=plural[type],x=(type==='saving'?savingRecords():state[c])?.find(v=>v.id===uid)||{};
 let b='',title='';
 if(type==='saving'){savingEditor(uid);return}
 if(type==='task'){
  title=uid?'タスクを編集':'新しいタスク';
  b=field('タスク名','title','text',x.title,true)+selectField('role','担当者',state.roles,x.role||state.myRole)+field('期限','due','date',x.due||'')+choices('優先度','priority',[['high','高い'],['normal','普通'],['low','低い']],x.priority||'normal')+area('メモ','memo',x.memo||'')+field('参考URL','url','url',x.url||'')+area('サブタスク（1行に1件）','subtasks',(x.subtasks||[]).map(s=>(s.done?'[x] ':'')+s.title).join('\n'))+'<div class="field"><label>写真添付（容量を抑えて保存）</label><input type="file" name="photo" accept="image/*"></div>'+(x.photo?'<div class="attachments"><img src="'+e(x.photo)+'" alt="添付写真">'+checkField('写真を削除','removePhoto',false)+'</div>':'');
 }else if(type==='category'){
  title=uid?'費用を編集':'費用を追加';b=field('項目名','name','text',x.name,true)+field('見積金額（円）','estimate','number',x.estimate||0,false,'min="0"')
   +'<details class="editor-more"><summary>契約額・予算など（任意）</summary><div class="editor-more-inner">'
   +field('契約額（円）','contract','number',x.contract||0,false,'min="0"')
   +field('項目別予算（円）','budget','number',x.budget||0,false,'min="0"')
   +field('登録外の支払済額（円）','manualPaid','number',x.manualPaid||0,false,'min="0"')
   +field('アイコン','icon','text',x.icon||'♡')
   +'<p class="field-hint">支払い済み金額の二重入力に注意してください。</p></div></details>';
 }else if(type==='payment'){
  title=uid?'支払いを編集':'支払い予定を追加';b=field('支払い内容','title','text',x.title,true)+choices('項目','category',state.categories.map(c=>[c.id,c.name]),x.category)+field('金額（円）','amount','number',x.amount||0,false,'min="0"')+field('支払期限','due','date',x.due||'')+selectField('payer','支払い担当',state.roles,x.payer||state.myRole)+checkField('支払い完了','paid',x.paid);
 }else if(type==='gift'){
  title=uid?'ご祝儀を編集':'ご祝儀を追加';
   b=field('誰から','source','text',x.source||'',true,'placeholder="例：祖父母／両親"')
    +field('金額（円）','amount','number',x.amount??'',true,'min="0" inputmode="numeric" placeholder="例：30000"')
    +checkField('この金額は貯金に含まれている','inSavings',x.inSavings)
    +'<details class="editor-more" '+(x.note?'open':'')+'><summary>メモ（任意）</summary><div class="editor-more-inner">'+area('メモ','note',x.note||'')+'</div></details>';
 }else if(type==='guest'){
  title=uid?'ゲストを編集':'ゲストを追加';
  b='<div class="guest-steps" role="tablist" aria-label="ゲストの入力項目">'+[['basic','基本'],['care','出欠・配慮'],['details','費用・メモ']].map((part,i)=>'<button type="button" role="tab" aria-selected="'+(i===0)+'" class="guest-step-tab '+(i===0?'active':'')+'" data-action="guest-step" data-id="'+part[0]+'">'+(i+1)+' · '+part[1]+'</button>').join('')+'</div>'
   +'<div class="guest-step-panel" data-step="basic">'+field('お名前','name','text',x.name,true)+'<div class="guest-field-grid">'+choices('関係性','relation',[['親族','親族'],['友人','友人'],['職場','職場'],['その他','その他']],x.relation||'友人')+choices('招待側','side',[['新郎側','新郎側'],['新婦側','新婦側'],['両家','両家']],x.side||'新郎側')+'</div>'+field('住所','address','text',x.address||'')+'</div>'
   +'<div class="guest-step-panel" data-step="care" hidden>'+choices('出欠','status',[['pending','未回答'],['yes','出席'],['no','欠席']],x.status||'pending')+field('アレルギー・食事の配慮','allergy','text',x.allergy||'')+'<div class="guest-switch-list">'+checkField('招待状を送付済','sent',x.sent)+checkField('お車代が必要','transport',x.transport)+checkField('宿泊が必要','stay',x.stay)+'</div></div>'
   +'<div class="guest-step-panel" data-step="details" hidden>'+field('ご祝儀（実績・円）','gift','number',x.gift||0,false,'min="0"')+checkField('ご祝儀は貯金残高に含まれる','giftInSavings',x.giftInSavings)+field('引出物','favors','text',x.favors||'')+area('メモ','memo',x.memo||'')+'</div>';
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
 }else if(type==='schedule'){
  title=uid?'予定を編集':'準備予定を追加';
  b=field('予定名','title','text',x.title||'',true)+'<div class="form-grid">'+field('日付','date','date',x.date||'',true)+field('時間','time','time',x.time||'')+'</div>'
   +selectField('role','担当者',state.roles,x.role||state.myRole)
   +choices('リマインド','remindDays',[['','通知設定に合わせる'],['0','当日'],['1','1日前'],['3','3日前'],['7','7日前']],x.remindDays??'')
   +area('メモ','memo',x.memo||'')+checkField('完了済み','done',x.done);
 }else if(type==='extra'){
  title=uid?'必要品を編集':'追加で必要なもの';
  b=field('必要なもの','title','text',x.title||'',true)+field('見込金額（円）','amount','number',x.amount||0,true,'min="0"')
   +field('必要になる日','due','date',x.due||'')+area('備考・購入場所','memo',x.memo||'')
   +checkField('購入・支払済み','paid',x.paid);
 }else if(type==='present'){
  title=uid?'お祝いを編集':'お祝いの記録';
  b='<div class="guest-steps" role="tablist" aria-label="お祝い登録">'+[['received','いただいたお祝い'],['returned','お返しの記録']].map((v,i)=>'<button type="button" role="tab" aria-selected="'+(i===0)+'" data-action="guest-step" data-id="'+v[0]+'" class="guest-step-tab '+(i===0?'active':'')+'">'+v[1]+'</button>').join('')+'</div>'
   +'<div class="guest-step-panel" data-step="received">'+field('くれた人','sender','text',x.sender||'',true)
   +choices('種類','kind',[['品物','品物'],['商品券','商品券'],['現金','現金'],['その他','その他']],x.kind||'品物')
   +field('何をもらった？','received','text',x.received||'',true)
   +field('もらったものの金額・目安（円）','value','number',x.value||0,false,'min="0"')+'</div>'
   +'<div class="guest-step-panel" data-step="returned" hidden>'+field('何を返した？','returnItem','text',x.returnItem||'')
   +field('お返し金額（円）','returnValue','number',x.returnValue||0,false,'min="0"')
   +field('お返しの予定日','returnDue','date',x.returnDue||'')+field('実際のお返し日','returnDate','date',x.returnDate||'')
   +checkField('お返し済み','returned',x.returned)+area('メモ','note',x.note||'')+'</div>';
 }else if(type==='thanks'){
  title=uid?'お礼を編集':'お礼を追加';b=field('お礼をする相手','recipient','text',x.recipient,true)+choices('種類','type',[['内祝い','内祝い'],['お礼状','お礼状'],['引出物の発送','引出物の発送'],['その他','その他']],x.type||'内祝い')+area('品物・発送・メモ','note',x.note||'')+checkField('完了','done',x.done);
 }
 modal(title,b,type,uid);
}

function showGuestStep(step){
 const form=dialog.querySelector('form[data-form="guest"],form[data-form="present"]');
 if(!form)return;
 form.querySelectorAll('.guest-step-panel').forEach(el=>{el.hidden=el.dataset.step!==step});
 form.querySelectorAll('.guest-step-tab').forEach(el=>{
  const selected=el.dataset.id===step;
  el.classList.toggle('active',selected);
  el.setAttribute('aria-selected',String(selected));
 });
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
 if(type==='setup1'){
  const y=Number(v.weddingYear),m=Number(v.weddingMonth),day=Number(v.weddingDay);
  if(!y||!m||!day){toast('挙式日の年・月・日をすべて選択してください');return}
  const date=new Date(y,m-1,day);
  if(date.getFullYear()!==y||date.getMonth()!==m-1||date.getDate()!==day){
   toast('正しい挙式日を選択してください');return
  }
  state.date=String(y)+'-'+String(m).padStart(2,'0')+'-'+String(day).padStart(2,'0');
  state.setup=1;save();render();return;
 }
 if(type==='setup2'){state.myRole=v.role;state.setup=2;save();render();return}
 if(type==='reminder-settings'){setSetting('reminderDays',Math.max(0,Math.min(30,n(v.reminderDays))));toast('リマインド日数を保存しました');return}
 if(type==='settings'){state.date=v.date;state.couple=[v.couple0.trim()||'新郎',v.couple1.trim()||'新婦'];save();if(syncEnabled())queueChange('settings','main',settingsRemote());announcePartnerChange('settings');toast('基本設定を保存しました');render();return}
 if(type==='sync'){
  const cfg={apiKey:v.apiKey.trim(),projectId:v.projectId.trim(),appId:v.appId.trim(),authDomain:v.authDomain.trim()};
  const room=v.room.trim();if(!/^[a-f0-9]{48}$/.test(room)){toast('共有コードは48文字の小文字英数字です');return}
  cloud={config:cfg,room,pushPublicKey:(v.pushPublicKey||'').trim()};localStorage.setItem(CLOUD_KEY,JSON.stringify(cloud));toast('設定を保存しました。接続を確認します');render();connect();return;
 }
 if(type==='comment'){const txt=(v.text||'').trim();if(!txt)return;write('comments',{id:id(),author:nameRole(state.myRole),text:txt,at:Date.now()});closeModal();toast('ひとことを残しました');return}
 if(type==='saving'){
  if(!v.owner?.trim()||!v.bank?.trim()||v.amount===''||!Number.isFinite(Number(v.amount))||Number(v.amount)<0){
   toast('金額・持ち主・銀行を入力してください');return
  }
  if(!state.savingsLedgerInitialized){
   const legacy=savingRecords().find(x=>x.legacy);
   state.savingsLedgerInitialized=true;
   if(legacy&&uid!==LEGACY_SAVINGS_ID){
    const record={...legacy};delete record.legacy;
    write('savingsAccounts',record,{quiet:true});
   }
  }
  const before=state.savingsAccounts.find(x=>x.id===uid)||{};
  const row={...before,id:uid||id(),owner:v.owner.trim(),purpose:(v.purpose||'').trim()||'結婚式・新婚旅行',bank:v.bank.trim(),
   account:(v.account||'').trim(),amount:Math.max(0,n(v.amount)),available:flBool(f,'available'),
   date:(v.date||'').trim()||(uid?before.date||'':today()),note:(v.note||'').trim(),kind:uid?(before.kind||'balance'):'addition'};
  delete row.legacy;
  closeModal();
  write('savingsAccounts',row);
  toast(uid?'貯金の記録を更新しました':'貯金に '+yen(row.amount)+' を追加しました');return
 }
 if(type==='savings'){closeModal();moneyView='accounts';render();return}
 if(type==='honeymoon'){
  const old=honeymoonCategory();
  const item={id:old?.id||'hw-honeymoon',name:'新婚旅行',icon:'✈',color:old?.color||'#91b9b0',estimate:Math.max(0,n(v.honeymoonTotal)),contract:Math.max(0,n(v.honeymoonTotal)),budget:Math.max(0,n(v.honeymoonBudget)),manualPaid:Math.max(0,n(v.honeymoonPaid))};
  write('categories',{...(old||{}),...item});closeModal();toast('新婚旅行費を保存しました');return;
 }
 if(type==='budget-total'){
   const amount=Math.max(0,n(v.budget)),directPaid=Math.max(0,n(v.weddingPaidDirect));
   if(v.budget===''||v.weddingPaidDirect===''||!Number.isFinite(Number(v.budget))||!Number.isFinite(Number(v.weddingPaidDirect))){
    toast('総額と支払済み金額を入力してください');return;
   }
   if(directPaid>amount){toast('支払済みは結婚式の総額以下にしてください');return}
   state.budgetTotal=amount;
   state.weddingPaidDirect=directPaid;
   save();
   if(syncEnabled())queueChange('settings','main',settingsRemote());
   announcePartnerChange('settings');
   pageByKey.delete('money|overview');
   closeModal();
   render();
   toast('結婚式費用と支払済みを更新しました');
   return;
  }
 const types={saving:'savingsAccounts',task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks',schedule:'schedules',extra:'extras',present:'presents'};
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
 if(type==='present'&&(!v.sender?.trim()||!v.received?.trim())){showGuestStep('received');(v.sender?.trim()?form.elements.received:form.elements.sender)?.focus();toast('贈ってくれた人とお祝いの内容を入力してください');return}
 if(type==='guest'&&!v.name?.trim()){showGuestStep('basic');form.elements.name?.focus();toast('ゲストのお名前を入力してください');return}
 if(type==='guest'){item.gift=Math.max(0,n(v.gift));item.giftInSavings=flBool(f,'giftInSavings');for(const x of ['transport','stay','sent'])item[x]=flBool(f,x)}
 if(type==='gift'){item.amount=Math.max(0,n(v.amount));item.inSavings=flBool(f,'inSavings')}
 if(type==='table'){item.capacity=Math.max(1,n(v.capacity)||8)}
 if(type==='role'){item.color=v.color}
 if(type==='idea'){item.url=safeUrl(v.url);if(flBool(f,'removePhoto'))delete item.photo}
 if(type==='item'||type==='thanks'||type==='schedule')item.done=flBool(f,'done');
 if(type==='extra'){item.amount=Math.max(0,n(v.amount));item.paid=flBool(f,'paid')}
 if(type==='present'){item.value=Math.max(0,n(v.value));item.returnValue=Math.max(0,n(v.returnValue));item.returned=flBool(f,'returned')}
 if(type==='task'||type==='idea'){try{const file=f.get('photo');if(file&&file.size)item.photo=await imageData(file)}catch(err){toast(err.message);return}}
 write(col,item);closeModal();toast(uid?'更新しました':'追加しました');
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
 if(added)announcePartnerChange('tasks','一括追加');
 render();toast(added?added+'件の準備タスクを追加しました':'テンプレートはすべて登録済みです');
}

function exportWeddingCalendar(){
 const escapeICS=v=>String(v??'').replaceAll('\\','\\\\').replaceAll('\n','\\n').replaceAll(',','\\,').replaceAll(';','\\;');
 const evs=state.schedules.filter(x=>x.date);
 if(!evs.length){toast('先に予定を登録してください');return}
 const stamp=new Date().toISOString().replaceAll(/[-:]/g,'').replace(/\.\d{3}Z$/,'Z');
 const lines=['BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//HAPPY WEDDING//Preparation//JA','CALSCALE:GREGORIAN','METHOD:PUBLISH'];
 for(const x of evs){
  const ymd=x.date.replaceAll('-','');
  if(!/^\d{8}$/.test(ymd))continue;
  const lead=x.remindDays===''||x.remindDays==null?Math.max(0,n(state.reminderDays??3)):Math.max(0,n(x.remindDays));
  const dateSpec=x.time&&/^\d{2}:\d{2}$/.test(x.time)?'DTSTART;TZID=Asia/Tokyo:'+ymd+'T'+x.time.replace(':','')+'00':'DTSTART;VALUE=DATE:'+ymd;
  lines.push('BEGIN:VEVENT','UID:'+escapeICS(x.id)+'@happy-wedding.local','DTSTAMP:'+stamp,dateSpec,'SUMMARY:'+escapeICS(x.title),'DESCRIPTION:'+escapeICS(x.memo||''),'BEGIN:VALARM','ACTION:DISPLAY','DESCRIPTION:'+escapeICS(x.title)+' のリマインド','TRIGGER:-P'+lead+'D','END:VALARM','END:VEVENT');
 }
 lines.push('END:VCALENDAR');
 download('happy-wedding-schedule-'+today()+'.ics',lines.join('\r\n'),'text/calendar;charset=utf-8');
 toast('カレンダー用ファイルを書き出しました。予定変更時は再度登録が必要です');
}

function download(name,text,mime){
 const blob=new Blob([mime.includes('csv')?'\ufeff':'',text],{type:mime});const u=URL.createObjectURL(blob),a=document.createElement('a');a.href=u;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(u),30000)
}
function toCsv(list){const keys=Array.from(new Set(list.flatMap(row=>Object.keys(row))));const encode=v=>'"'+String((typeof v==='object'&&v!==null)?JSON.stringify(v):(v??'')).replaceAll('"','""')+'"';return [keys.map(encode).join(','),...list.map(row=>keys.map(k=>encode(row[k])).join(','))].join('\r\n')}

function reminderCandidates(){
 const lead=Math.max(0,Math.min(30,n(state.reminderDays??3)));
 const all=[
  ...state.tasks.filter(x=>!x.done&&x.due).map(x=>({id:'task-'+x.id,title:x.title,date:x.due,lead,kind:'タスク'})),
  ...state.payments.filter(x=>!x.paid&&x.due).map(x=>({id:'payment-'+x.id,title:x.title,date:x.due,lead,kind:'支払い'})),
  ...state.schedules.filter(x=>!x.done&&x.date).map(x=>({id:'schedule-'+x.id,title:x.title,date:x.date,lead:x.remindDays===''||x.remindDays==null?lead:Math.max(0,n(x.remindDays)),kind:'予定'})),
  ...state.extras.filter(x=>!x.paid&&x.due).map(x=>({id:'extra-'+x.id,title:x.title,date:x.due,lead,kind:'必要なもの'})),
  ...state.presents.filter(x=>!x.returned&&x.returnDue).map(x=>({id:'present-'+x.id,title:x.sender+'さんへのお返し',date:x.returnDue,lead,kind:'お返し'}))
 ];
 return all.filter(x=>distance(x.date)<=x.lead).sort((a,b)=>a.date.localeCompare(b.date));
}
function remind(){
 if(!state.reminders||!state.setup)return;
 const active=reminderCandidates();
 if(!active.length)return;
 const unseen=active.filter(x=>{
  const key='happy_wedding_alert_'+today()+'_'+x.id+'_'+x.date+'_'+x.lead;
  if(localStorage.getItem(key))return false;
  try{localStorage.setItem(key,'1')}catch{}
  return true;
 });
 if(!unseen.length)return;
 const msg=unseen.length===1?unseen[0].kind+'「'+unseen[0].title+'」の期限を確認してください。':unseen.length+'件の予定・タスク・支払いなどを確認してください。';
 toast(msg);
 if('Notification' in window&&Notification.permission==='granted'&&!document.hidden){
  try{new Notification('Happy Wedding リマインド',{body:msg,icon:'./icon.svg'})}catch{}
 }
}

async function handleAction(target){
 const action=target.dataset.action,uid=target.dataset.id;
 if(!action)return;
 if(action==='sync-config'){openSyncConfig();return}
 if(action==='pager-prev'||action==='pager-next'){if(activePager)presentPage(activePager.index+(action==='pager-next'?1:-1));return}
 if(action==='dialog-prev'||action==='dialog-next'){if(dialogListPager)setDialogListPage(dialogListPager.index+(action==='dialog-next'?1:-1));return}
 if(action==='form-prev'||action==='form-next'){
  if(editorPages){
   if(action==='form-prev')showEditorPage(editorPages.index-1);
   else if(verifyEditorPage(editorPages.index))showEditorPage(editorPages.index+1);
  }
  return;
 }
 if(action==='nav'){chooseTab(uid);return}
 if(action==='more'){tab='more';morePage=uid;render();window.scrollTo(0,0);return}
 if(action==='close-modal'){closeModal();return}
 if(action==='guest-step'){showGuestStep(uid);return}
 if(action==='show-deadlines'){const alerts=reminderCandidates();modal('期限が近い予定',alerts.length?'<div class="activity-list">'+alerts.map(x=>'<div class="activity-row"><b>'+e(x.kind)+'</b>　'+e(x.title)+'<time>'+e(x.date)+(distance(x.date)<0?'・期限超過':'')+'</time></div>').join('')+'</div>':empty('確認が必要な予定はありません。'));return}
 if(action==='partner-push'){await enablePartnerPush(cloud?.pushPublicKey||'');return}

 if(action==='task-filter'){taskRole=uid;render();return}
 if(action==='money-detail'){openMoneyDetails(uid);return}
  if(action==='money-detail-all-categories'){openMoneyDetails('categories');return}
  if(action==='money-view'){openMoneyDetails(uid);return}
 if(action==='present-view'){presentView=uid;render();return}
 if(action==='pay-month'){const [y,m]=paymentMonth.split('-').map(Number);const d=new Date(y,m-1+n(uid),1);paymentMonth=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0');paymentDateSelected='';render();return}
 if(action==='pay-day'){paymentDateSelected=paymentDateSelected===uid?'':uid;render();return}
 if(action==='pay-clear'){paymentDateSelected='';render();return}
 if(action==='guest-view'){guestView=uid;render();return}
 if(action==='template'){templateTasks();return}
 if(action==='calendar-export'){exportWeddingCalendar();return}
 if(action==='money-add'){modal('金額を登録','<div class="money-add-menu">'
 +btn('結婚式の総額','budget-total','','money-menu-item')
 +btn('新婚旅行費','edit-honeymoon','','money-menu-item')
 +btn('貯金','new-saving','','money-menu-item')
 +btn('ご祝儀・支援金','new-gift','','money-menu-item')
 +'<details class="editor-more"><summary>その他の項目</summary><div class="editor-more-inner stack">'
 +btn('支払い予定','new-payment','','money-menu-item')
 +btn('必要なもの','new-extra','','money-menu-item')
 +btn('費用の内訳','new-category','','money-menu-item')
 +'</div></details></div>');return}
 if(action==='edit-savings'){openMoneyDetails('accounts');return}
 if(action==='new-saving'){if(dialog.open)closeModal();savingEditor('',uid||'');return}
 if(action==='edit-saving'){if(dialog.open)closeModal();savingEditor(uid);return}
 if(action==='edit-honeymoon'){if(dialog.open)closeModal();const c=honeymoonCategory();modal('新婚旅行費',
 '<p class="simple-editor-intro">旅行2人分の合計額を入力してください。</p>'
 +field('旅行の総額（円）','honeymoonTotal','number',c?(forecastCat(c)||n(c.budget)):0,true,'min="0" inputmode="numeric"')
 +field('明細以外の支払済み（円）','honeymoonPaid','number',c?.manualPaid||0,false,'min="0" inputmode="numeric"')
 +'<p class="money-editor-tip">支払い明細に登録した金額は自動で集計します。</p>'
 +'<details class="editor-more"><summary>旅行予算（任意）</summary><div class="editor-more-inner">'
 +field('旅行予算（円）','honeymoonBudget','number',c?.budget||0,false,'min="0" inputmode="numeric"')
 +'</div></details>','honeymoon');return}
 if(action==='budget-total'){
   if(dialog.open)closeModal();
   const f=financeSummary();
   modal('結婚式の支払い状況',
    '<div class="money-cost-editor">'
    +field('結婚式の総額（円）','budget','number',state.budgetTotal||'',true,'min="0" inputmode="numeric" placeholder="例：4800000"')
    +field('支払済み合計（円）','weddingPaidDirect','number',Math.max(n(state.weddingPaidDirect),f.weddingPaid),true,'min="0" inputmode="numeric" placeholder="例：500000"')
    +'<p class="money-editor-tip">これまでに払った金額の合計を入力。明細と重複しても二重計上しません。</p>'
    +'</div>','budget-total');return
  }
 if(action==='comment'){modal('ふたりのひとこと',area('メッセージ','text'),'comment');return}
 if(action==='toggle-task'){const x=state.tasks.find(t=>t.id===uid);if(x){write('tasks',{...x,done:!x.done});if(!x.done){completion();toast('おつかれさま！ひとつ完了 ✿')}}return}
 if(action==='toggle-subtask'){const x=state.tasks.find(t=>t.id===uid);if(x){const subId=target.dataset.subid;write('tasks',{...x,subtasks:(x.subtasks||[]).map(a=>a.id===subId?{...a,done:!a.done}:a)})}return}
 if(['toggle-payment','toggle-item','toggle-thanks','toggle-schedule','toggle-extra'].includes(action)){const c={'toggle-payment':'payments','toggle-item':'items','toggle-thanks':'thanks','toggle-schedule':'schedules','toggle-extra':'extras'}[action],x=state[c].find(t=>t.id===uid);if(x){if(action==='toggle-payment'||action==='toggle-extra')write(c,{...x,paid:!x.paid});else{write(c,{...x,done:!x.done});if(!x.done)completion()}}return}
 if(action.startsWith('new-')||action.startsWith('edit-')){if(dialog.open)closeModal();modalEdit(action.split('-')[1],action.startsWith('edit-')?uid:'');return}
 if(action==='delete'){
  const c={saving:'savingsAccounts',task:'tasks',category:'categories',payment:'payments',gift:'gifts',guest:'guests',table:'tables',role:'roles',timeline:'timeline',vendor:'vendors',idea:'ideas',item:'items',thanks:'thanks',schedule:'schedules',extra:'extras',present:'presents'}[target.dataset.type];
  if(!c)return;
  if(c==='roles'&&state.roles.length<=1){toast('役割を最低1つ残してください');return}
  if(!window.confirm('削除しますか？ 元に戻せません。'))return;
  if(c==='roles'&&state.myRole===uid)state.myRole=state.roles.find(r=>r.id!==uid)?.id||'';
  if(c==='tables')for(const g of state.guests.filter(g=>g.tableId===uid))write('guests',{...g,tableId:''},{quiet:true});
  erase(c,uid);closeModal();toast('削除しました');return;
 }
 if(action==='set-my-role'){state.myRole=uid;save();render();toast('自分の担当を変更しました');return}
 if(action==='pick-guest'){selectedGuest=uid;render();return}
 if(action==='generate-room'){const f=$('form[data-form=sync]');if(f){f.elements.room.value=roomCode();toast('共有コードを発行しました。接続設定を保存してください。')}return}
 if(action==='copy-room'){const val=$('form[data-form=sync]')?.elements.room.value||'';if(!val){toast('先に共有コードを発行してください');return}try{await navigator.clipboard.writeText(val);toast('共有コードをコピーしました')}catch{toast('コードを長押ししてコピーしてください')}return}
 if(action==='disconnect'){if(!confirm('クラウド接続を解除しますか？端末のデータは残ります。'))return;stopSync();cloud=null;localStorage.removeItem(CLOUD_KEY);status('local');render();return}
 if(action==='notifications'){if(!state.reminders&&'Notification' in window){try{await Notification.requestPermission()}catch{}}setSetting('reminders',!state.reminders);toast(state.reminders?'お知らせをオンにしました':'お知らせをオフにしました');if(state.reminders)remind();return}
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
 const navBtn=ev.target.closest('.bottom-nav [data-tab]');
 if(navBtn){ev.preventDefault();chooseTab(navBtn.dataset.tab);return;}
 const t=ev.target.closest('[data-action]');if(t){if(['toggle-task','toggle-subtask','toggle-item','toggle-thanks','toggle-payment','toggle-schedule','toggle-extra'].includes(t.dataset.action))return;ev.preventDefault();handleAction(t);return}
 const seat=ev.target.closest('[data-drop-table]');
 if(seat&&selectedGuest){assignGuest(selectedGuest,seat.dataset.dropTable);return}
});
document.addEventListener('change',async ev=>{
 const t=ev.target;
 if(t.matches('form[data-form="setup1"] [name="weddingYear"],form[data-form="setup1"] [name="weddingMonth"]')){updateSetupDays();return}
 if(t.matches('input[data-action^="toggle-"]')){handleAction(t);return}
 if(t.id==='role-filter'){taskRole=t.value;pageByKey.clear();render();return}
 if(t.id==='import-file'&&t.files?.[0]){
  if(syncEnabled()){toast('復元する前に共有接続を解除してください');return}
  try{const obj=JSON.parse((await t.files[0].text()).replace(/^\uFEFF/,''));if(!obj||!Array.isArray(obj.tasks)||!Array.isArray(obj.roles)||!Array.isArray(obj.guests)||!Array.isArray(obj.categories))throw Error('バックアップ形式が不正です');if(!confirm('現在の端末データをバックアップ内容で置き換えますか？'))return;state={...defaults(),...obj};save();render();toast('データを復元しました')}catch(err){toast('読み込みに失敗: '+err.message)}
 }
});
document.addEventListener('submit',async ev=>{const f=ev.target.closest('form[data-form]');if(!f)return;ev.preventDefault();const b=f.querySelector('button[type=submit],button:not([type])');if(b)b.disabled=true;try{
 if(editorPages){const allValid=editorPages.pages.every((p,i)=>{const bad=Array.from(p.querySelectorAll('[required]')).some(field=>!field.checkValidity());if(bad){showEditorPage(i);verifyEditorPage(i);return false}return true});if(!allValid)return}
 await submit(f)}catch(err){console.error(err);toast('保存できませんでした: '+err.message)}finally{if(b)b.disabled=false}});
document.addEventListener('dragstart',ev=>{const s=ev.target.closest('[data-guest]');if(s)ev.dataTransfer.setData('text/plain',s.dataset.guest)});
document.addEventListener('dragover',ev=>{const s=ev.target.closest('[data-drop-table]');if(s)ev.preventDefault()});
document.addEventListener('drop',ev=>{const s=ev.target.closest('[data-drop-table]');if(s){ev.preventDefault();const g=ev.dataTransfer.getData('text/plain');if(g)assignGuest(g,s.dataset.dropTable)}});
document.getElementById('header-settings').addEventListener('click',()=>{tab='more';morePage='settings';render()});
dialog.addEventListener('click',ev=>{if(ev.target===dialog)closeModal()});
window.addEventListener('online',()=>{if(syncEnabled())connect()});
window.addEventListener('focus',()=>remind());
let lastFrameWidth=window.innerWidth;
window.addEventListener('resize',()=>{if(dialog.open)return;const width=window.innerWidth;if(Math.abs(width-lastFrameWidth)>35){lastFrameWidth=width;render()}});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)remind()});
setInterval(()=>{if(!document.hidden)remind()},60000);
try{cloud=JSON.parse(localStorage.getItem(CLOUD_KEY)||'null')}catch{}
setupPartnerNotifications({getRoom:()=>cloud?.room||'',getRole:()=>nameRole(state.myRole),toast,modal});
render();setTimeout(remind,600);
if(syncEnabled())connect();
// Detect new deployments while keeping unsaved modal edits safe.
if('serviceWorker' in navigator){
 let updatePending=false,refreshing=false;
 const refreshWhenSafe=()=>{
  if(refreshing)return;
  if(dialog.open){updatePending=true;toast('最新版を検出しました。入力画面を閉じると更新します');return}
  refreshing=true;location.reload();
 };
 navigator.serviceWorker.addEventListener('controllerchange',refreshWhenSafe);
 dialog.addEventListener('close',()=>{if(updatePending)refreshWhenSafe()});
 window.addEventListener('load',()=>{
  navigator.serviceWorker.register('./sw.js',{updateViaCache:'none'})
   .then(reg=>reg.update()).catch(console.warn);
 });
 window.addEventListener('focus',()=>{
  navigator.serviceWorker.getRegistration('./')
   .then(reg=>reg?.update()).catch(()=>{});
 });
}

