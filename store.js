
import {queueChange,startSync,stopSync,roomCode as createRoomCode,queuedCount} from './sync.js';
const KEY='happy_wedding_2026_data_v1';
const ROLE_SEEDS=[['groom','新郎','#c6a7d5'],['bride','新婦','#e59bab'],['parents','両家の親','#d6bb91'],['reception','受付係','#9dc8b8'],['host','司会・友人幹事','#b6bddd'],['planner','プランナー','#c9b09f']];
const BUDGET_SEEDS=[['venue','会場','⌂'],['attire','衣装','♕'],['media','写真・映像','▣'],['food','料理','♧'],['flower','装花','✿'],['gift','引出物','♡'],['paper','ペーパーアイテム','✉'],['show','演出','♫'],['after','二次会','✧'],['honeymoon','新婚旅行','✈']];
export const COLLECTIONS=['roles','tasks','categories','payments','gifts','guests','tables','timeline','vendors','ideas','packing','thanks','comments'];
const uid=()=>typeof crypto!=='undefined'&&crypto.randomUUID?crypto.randomUUID():Math.random().toString(36).slice(2)+Date.now().toString(36);
const fresh=()=>({
  schema:1,
  meta:{date:'2027-02-20',budget:0,groom:'新郎',bride:'新婦',setup:0},
  prefs:{selfRole:'groom',tab:'home',taskFilter:'all',guestFilter:'all',more:'menu',notifications:false,cloudConfig:null,cloudRoom:''},
  roles:ROLE_SEEDS.map(([id,name,color])=>({id,name,color})),
  categories:BUDGET_SEEDS.map(([id,name,icon])=>({id,name,icon,budget:0,estimate:0,contract:0,paid:0})),
  tasks:[],payments:[],gifts:[],guests:[],tables:[],timeline:[],vendors:[],ideas:[],packing:[],thanks:[],comments:[]
});
let state;
try{const raw=localStorage.getItem(KEY);state=raw?JSON.parse(raw):fresh()}catch{state=fresh()}
if(!state||typeof state!=='object'||!state.meta)state=fresh();
for(const key of COLLECTIONS)if(!Array.isArray(state[key]))state[key]=[];
state.meta={...fresh().meta,...state.meta};
state.prefs={...fresh().prefs,...state.prefs};
let notify=()=>{};
let cloud='local';
let syncing=false;
export const get=()=>state;
export const makeId=uid;
export const getCloud=()=>cloud;
export const getQueueCount=queuedCount;
export function listen(fn){notify=fn}
function write(){
 try{localStorage.setItem(KEY,JSON.stringify(state));notify();return true}
 catch(e){console.error(e);alert('端末の保存領域がいっぱいです。写真を減らすかJSONバックアップを保存してください。');return false}
}
export function update(kind,item,remove=false){
 if(!COLLECTIONS.includes(kind))throw Error('Unknown data collection');
 const idx=state[kind].findIndex(x=>x.id===item.id);
 if(remove){if(idx!==-1)state[kind].splice(idx,1)}
 else if(idx===-1)state[kind].push(item);
 else state[kind][idx]=item;
 const ok=write();if(ok&&syncing)queueChange(kind,item.id,remove?null:item,remove);
 return ok;
}
export function updateMeta(patch){
 const allow=['date','budget','groom','bride','setup'];
 for(const k of allow)if(Object.hasOwn(patch,k))state.meta[k]=patch[k];
 const ok=write();if(ok&&syncing)queueChange('meta','settings',{...state.meta});
 return ok;
}
export function updatePrefs(patch){state.prefs={...state.prefs,...patch};return write()}
export const currency=n=>'¥'+(Number(n)||0).toLocaleString('ja-JP');
export const toNum=v=>Math.max(0,Math.round(Number(v)||0));
export const parseDate=v=>new Date((v||'2027-02-20')+'T12:00:00');
export function addDays(date,days){const x=parseDate(date);x.setDate(x.getDate()+days);return x.toLocaleDateString('sv-SE')}
export function addMonths(date,months){const x=parseDate(date);x.setMonth(x.getMonth()+months);return x.toLocaleDateString('sv-SE')}
export function daysTo(date){const d=new Date(date+'T00:00:00');const n=new Date();n.setHours(0,0,0,0);return Math.round((d-n)/86400000)}
export const shortDate=d=>d?d.replace(/^\d{4}-/,'').replace('-','/'):'未設定';
export const getRole=id=>state.roles.find(r=>r.id===id)||{id,name:'未設定',color:'#cabfba'};
export const sum=(items,key)=>items.reduce((s,a)=>s+(Number(a[key])||0),0);
export function totals(){const s=state;const commitments=sum(s.categories,'contract');const estimates=sum(s.categories,'estimate');const spent=sum(s.categories,'paid');const gift=sum(s.gifts,'amount')+sum(s.guests,'giftAmount');const categoryBudget=sum(s.categories,'budget');const cost=commitments||estimates;const budget=Number(s.meta.budget)||categoryBudget;return {commitments,estimates,spent,gift,categoryBudget,cost,budget,outOfPocket:cost-gift,unpaid:Math.max(0,cost-spent),over:budget>0&&cost>budget}}
export function backup(){return JSON.stringify({...state,prefs:{...state.prefs,cloudConfig:null,cloudRoom:''}},null,2)}
export function restore(raw){
 const obj=JSON.parse(raw);
 if(!obj||!obj.meta||!COLLECTIONS.every(x=>Array.isArray(obj[x])))throw Error('バックアップの形式が違います');
 stopCloud();
 state={...fresh(),...obj,prefs:{...fresh().prefs,...obj.prefs,cloudConfig:null,cloudRoom:''}};
 write();
}
export function markCloud(status){cloud=status;notify()}
export function stopCloud(){stopSync();syncing=false;markCloud('local')}
export async function connectCloud(config,room){
 if(!navigator.onLine)throw Error('初回のクラウド接続にはインターネットが必要です');
 stopCloud();
 updatePrefs({cloudConfig:config,cloudRoom:room});
 await startSync(config,room,entry=>{
  if(entry.collection==='meta'){if(entry.value){state.meta={...state.meta,...entry.value};write()}return}
  if(!COLLECTIONS.includes(entry.collection))return;
  const ix=state[entry.collection].findIndex(x=>x.id===entry.id);
  if(entry.deleted){if(ix>=0)state[entry.collection].splice(ix,1)}
  else if(entry.value){if(ix>=0)state[entry.collection][ix]=entry.value;else state[entry.collection].push(entry.value)}
  write();
 },status=>markCloud(status),empty=>{
  syncing=true;
  if(empty){
   queueChange('meta','settings',state.meta);
   for(const kind of COLLECTIONS)for(const item of state[kind])queueChange(kind,item.id,item);
  }
  notify();
 });
 markCloud('connecting');
}
export function makeRoom(){return createRoomCode()}
export function download(filename,content,mime='application/octet-stream'){
 const blob=new Blob([content],{type:mime});const url=URL.createObjectURL(blob);
 const a=document.createElement('a');a.href=url;a.download=filename;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1500);
}
export const csvEscape=v=>'"'+String(v??'').replaceAll('"','""').replaceAll('\n',' ')+'"';
export function exportCsv(kind){
 const rows=state[kind]||[];
 const columns={tasks:['title','roleId','due','priority','done','memo','url'],guests:['name','relation','side','rsvp','address','allergy','giftAmount','favor','travel','hotel','invited','tableId'],categories:['name','budget','estimate','contract','paid'],payments:['name','categoryId','amount','due','payer','paid'],gifts:['name','amount'],thanks:['name','type','due','done']};
 const cols=columns[kind]||Array.from(new Set(rows.flatMap(x=>Object.keys(x))));
 const text='\uFEFF'+[cols.join(','),...rows.map(r=>cols.map(c=>csvEscape(r[c])).join(','))].join('\r\n');
 download('wedding-'+kind+'-'+new Date().toISOString().slice(0,10)+'.csv',text,'text/csv;charset=utf-8');
}
export function sampleTimeline(){
 if(state.timeline.length)return false;
 [['08:00','新郎新婦','お支度開始'],['10:30','プランナー','最終確認'],['11:00','新郎新婦','挙式'],['12:00','司会・友人幹事','披露宴スタート'],['14:30','新郎新婦','お開き・お見送り']].forEach(([time,owner,title])=>update('timeline',{id:uid(),time,owner,title,memo:''}));
 return true;
}
export function createTemplate(){
 const defs=[
  [-6,'会場・日程を決定','groom','high'],
  [-6,'ゲストの候補を相談','bride','high'],
  [-5,'衣装のイメージ・試着予約','bride','normal'],
  [-5,'写真・映像業者を検討','groom','normal'],
  [-4,'招待状の準備を開始','bride','high'],
  [-4,'受付・スピーチを依頼','groom','normal'],
  [-3,'招待状を発送','bride','high'],
  [-3,'料理・引出物を検討','groom','normal'],
  [-2,'装花・演出の打ち合わせ','bride','normal'],
  [-2,'BGMリストを作成','groom','normal'],
  [-2,'席次表とゲスト情報の確認','bride','high'],
  [-1,'出欠を最終確定','groom','high'],
  [-1,'業者・式場の最終見積確認','groom','high'],
  [-1,'当日の進行・持ち物を確認','bride','high'],
  [0,'受付・スタッフへ最終連絡','groom','high'],
  [0,'結婚式当日を楽しむ！','bride','high'],
  [1,'お礼状・内祝いの手配','bride','normal'],
  [1,'写真・アルバムの受け取り確認','groom','normal']
 ];
 const existing=new Set(state.tasks.filter(t=>t.templateKey).map(t=>t.templateKey));
 let added=0;
 for(const [offset,title,roleId,priority] of defs){
  const templateKey='wedding-template-'+offset+'-'+title;
  if(existing.has(templateKey))continue;
  const due=offset===1?addDays(state.meta.date,14):addMonths(state.meta.date,offset);
  update('tasks',{id:uid(),title,roleId,due,priority,memo:'準備スケジュールから追加',url:'',photo:'',subtasks:[],done:false,templateKey});
  added++;
 }
 return added;
}
