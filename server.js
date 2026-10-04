import express from 'express';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());
app.use(express.static(path.join(__dirname, 'public')));

const PORT = Number(process.env.PORT || 10000);
const SPREADSHEET_ID = process.env.SPREADSHEET_ID || '15nILp9YRstyve00bY3N5xfL4SlWhlvtLu411XV3GHDY';
const KUPROXNPP_LOGIN_SPREADSHEET_ID = process.env.KUPROXNPP_LOGIN_SPREADSHEET_ID || '1ZTAoTecbxR0HDa1hGWxyDHFI1FTdkE1d6UsTjAkom84';
const JWT_SECRET = process.env.JWT_SECRET || 'change-this-secret-before-production';
const OTHER_SERVICES_URL = 'https://script.google.com/macros/s/AKfycbypRjGqX3SqsQy_bi3mzDZhX0NvUEOHBZJZzacxK2o67rP-8iv5w30Xzb63D-I-imMd/exec';
const ONLINE_TTL_MS = 15000;
const ANONYMOUS_NAME = '名無しさん＠早く土曜になってほしい';
const SESSION_COOKIE = 'sevench_session';
const USER_COOKIE = 'sevench_user';
const ADMIN_MIN_PRIORITY = 200;
const ADMIN_SESSION_MAX_AGE = 1000 * 60 * 60 * 24 * 30;

let sheetsPromise;
function getSheets() {
  if (!sheetsPromise) {
    const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || '';
    const b64 = process.env.GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '';
    if (!raw && !b64) throw new Error('GOOGLE_SERVICE_ACCOUNT_JSON または GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 が未設定です。');
    const credentials = raw ? JSON.parse(raw) : JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    const auth = new google.auth.GoogleAuth({ credentials, scopes: ['https://www.googleapis.com/auth/spreadsheets'] });
    sheetsPromise = auth.getClient().then(client => google.sheets({ version: 'v4', auth: client }));
  }
  return sheetsPromise;
}

function cleanText(value, max = 10000) {
  let text = String(value ?? '').replace(/\u0000/g, '').replace(/<\/?[A-Za-z][^>]*>/g, '').replace(/javascript\s*:/gi, '').replace(/on[a-z]+\s*=\s*/gi, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  return text.length > max ? text.slice(0, max) : text;
}
function normalizeId(v) { return cleanText(v, 100).replace(/^thread_/i, ''); }
function normalizeRole(v) {
  const x = String(v ?? '').trim().toLowerCase();
  if (x === 'system') return 'SYSTEM';
  if (['owner', 'admin', 'moderator', 'sureowner'].includes(x)) return x;
  return '';
}
function rolePriority(role) {
  return ({ SYSTEM: 500, owner: 400, admin: 300, moderator: 200, sureowner: 100 })[normalizeRole(role)] || 0;
}
function chooseRole(a, b) { return rolePriority(b) > rolePriority(a) ? normalizeRole(b) : normalizeRole(a); }
function bool(v) { if (typeof v === 'boolean') return v; return ['true','1','yes','y','on','はい'].includes(String(v ?? '').trim().toLowerCase()); }
function parseDate(v) {
  if (v instanceof Date) return v;
  if (typeof v === 'number' && v > 20000 && v < 100000) return new Date(Math.round((v - 25569) * 86400000));
  const n = String(v ?? '').trim();
  if (!n) return null;
  const d = new Date(n.replace(/年/g, '/').replace(/月/g, '/').replace(/日/g, '').replace(/\./g, '/').replace(/-/g, '/'));
  return Number.isNaN(d.getTime()) ? null : d;
}
function fmtDate(v) { const d = parseDate(v); if (!d) return ''; return d.toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo', hour12: false }).replace(/\//g,'/'); }
function fmtShort(v) { const d = parseDate(v); if (!d) return ''; return new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(d).replace(/-/g,'/'); }
function createUserId() { return crypto.randomBytes(8).toString('base64url').slice(0, 10); }
function getClientUserId(req, res) {
  let id = cleanText(req.cookies[USER_COOKIE] || '', 100);
  if (!/^[A-Za-z0-9_-]{10,100}$/.test(id)) { id = createUserId(); res.cookie(USER_COOKIE, id, { maxAge: 1000*60*60*24*365*5, sameSite: 'lax' }); }
  return id;
}
function adminToken(req) { return String(req.cookies[SESSION_COOKIE] || '').trim(); }
function getAdmin(req) {
  const token = adminToken(req);
  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET);
    if (!payload?.userId || !payload?.role || rolePriority(payload.role) < ADMIN_MIN_PRIORITY) return null;
    return payload;
  } catch { return null; }
}
function signAdmin(userId, username, role) {
  return jwt.sign({ userId, username, role: normalizeRole(role) }, JWT_SECRET, { expiresIn: '30d' });
}

async function valuesGet(spreadsheetId, range) {
  const sheets = await getSheets();
  const r = await sheets.spreadsheets.values.get({ spreadsheetId, range, majorDimension: 'ROWS', valueRenderOption: 'UNFORMATTED_VALUE' });
  return r.data.values || [];
}
async function valuesAppend(spreadsheetId, range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', insertDataOption: 'INSERT_ROWS', resource: { values: [values] } });
}
async function valuesUpdate(spreadsheetId, range, values) {
  const sheets = await getSheets();
  await sheets.spreadsheets.values.update({ spreadsheetId, range, valueInputOption: 'USER_ENTERED', resource: { values } });
}

async function readThreads() {
  const rows = await valuesGet(SPREADSHEET_ID, 'threads!A:S');
  return rows.filter((r,i)=>!(i===0 && String(r[0]||'').toLowerCase()==='active')).map((r,i)=>({
    rowNumber: i+1,
    active: bool(r[0]), ownerIp: cleanText(r[1],100), title: cleanText(r[2],300), id: normalizeId(r[3]), count: Number(r[4] || 0), date: parseDate(r[5])?.getTime() || 0, updated: parseDate(r[6])?.getTime() || parseDate(r[5])?.getTime() || 0, writable: r.length>7?bool(r[7]):true, pinned:r.length>8?bool(r[8]):false, pink:r.length>11?bool(r[11]):false, wild:['Y','TRUE','1'].includes(String(r[12]||'').trim().toUpperCase()), privatePassword:r.length>13?cleanText(r[13],500):'', unlimited:r.length>14?bool(r[14]):false, locked:r.length>15?bool(r[15]):false, official:r.length>16?bool(r[16]):false, adminOnly:r.length>17?bool(r[17]):false, systemKey:r.length>18?cleanText(r[18],100):''
  })).filter(t=>t.id&&t.title&&t.date);
}

function isNumberedType(type) { return ['NORMAL','SYSTEM','ADMIN_ADD','LOCK','LIMIT'].includes(String(type||'').toUpperCase()); }
function isPrivateType(type) { return ['THREADDATE','THREAD_ADMIN_MANAGEMENT','ADMIN_MANAGEMENT'].includes(String(type||'').toUpperCase()); }
function parseNameTrip(raw) {
  const s = cleanText(raw,200); if (!s) return { username: ANONYMOUS_NAME, trip:'' };
  const at = s.lastIndexOf('@'); const hash = s.slice(0, at>=0?at:s.length).lastIndexOf('#');
  if (hash >= 0) return { username: s.slice(0,hash) || ANONYMOUS_NAME, trip: cleanText(s.slice(hash+1),200).replace(/^@/,'') };
  return { username: s.slice(0, at>=0?at:s.length) || ANONYMOUS_NAME, trip:'' };
}
function displayUserId(userId, role) {
  const id = cleanText(userId,200) || 'UNKNOWN'; const r = normalizeRole(role);
  if (r==='SYSTEM') return 'SYSTEM★'; if (r==='owner') return id+'★'; if (r==='admin') return id+'+admin'; if (r==='moderator') return id+'+MOD'; return id;
}
function displayName(username, userId, role, trip='') {
  const r = normalizeRole(role); if (r==='SYSTEM') return 'SYSTEM';
  let name = cleanText(username,200) || ANONYMOUS_NAME;
  if (trip && !['SYSTEM','owner','admin','moderator'].includes(r)) name += ' ◆'+cleanText(trip,200);
  return name;
}

async function readOwners(threadId) {
  const rows = await valuesGet(SPREADSHEET_ID, 'threads_owner!A:F').catch(()=>[]);
  return rows.filter((r,i)=>i>0 && normalizeId(r[0])===threadId && bool(r[5]??true)).map(r=>({userId:cleanText(r[1],200),trip:cleanText(r[3],200)}));
}
async function readPosts(threadId, viewerUserId='') {
  const [rows, owners] = await Promise.all([valuesGet(SPREADSHEET_ID, 'post!A:L'), readOwners(threadId)]);
  const ownerUsers = new Set(owners.map(x=>x.userId).filter(Boolean));
  const ownerTrips = new Set(owners.map(x=>x.trip).filter(Boolean));
  const seenBroadcast = new Set();
  const raw = [];
  for (let i=0;i<rows.length;i++) {
    const r=rows[i]; if(i===0 && (String(r[1]||'').toLowerCase()==='threadid'||String(r[2]||'').toLowerCase()==='userid')) continue;
    if (!r || r.length<8) continue;
    const active=bool(r[0]); const target=String(r[1]??'').trim();
    if (normalizeId(target)!==threadId && target!=='all') continue;
    const type=(cleanText(r[9],50).toUpperCase() || (normalizeRole(r[4])==='SYSTEM'?'SYSTEM':'NORMAL'));
    const visible=cleanText(r[10],100); if(type==='THREADDATE' && visible!==viewerUserId) continue;
    if(type!=='THREADDATE' && !isNumberedType(type) && type!=='NORMAL') continue;
    const d=parseDate(r[7]); if(!d) continue;
    if(target==='all') { const key=d.getTime()+'|'+String(r[6]||'')+'|'+String(r[8]||''); if(seenBroadcast.has(key)) continue; seenBroadcast.add(key); }
    const userId=cleanText(r[2],200); const username=cleanText(r[5],200); const content=String(r[6]??''); let role=cleanText(r[4],100); const trip=cleanText(r[8],200);
    if(ownerUsers.has(userId)||ownerTrips.has(trip)) role=chooseRole(role,'sureowner');
    const parsed=parseNameTrip(username); const deleted=!active&&type==='NORMAL';
    raw.push({rowNumber:i+1,threadId,userId:deleted?'ID:UNKNOWN':(userId||'ID:UNKNOWN'),displayUserId:deleted?'不明':displayUserId(userId,role),username:deleted?'あぼーん':parsed.username,displayName:deleted?'あぼーん':displayName(parsed.username,userId,role,trip),role:deleted?'':role,content:deleted?(content||'削除済み'):content,date:d.getTime(),dateText:fmtDate(d),tripId:trip,tripName:trip,active,deleted,numberable:isNumberedType(type),special:type!=='NORMAL',specialType:type,private:!!visible||isPrivateType(type),visibleUserId:visible});
  }
  raw.sort((a,b)=>a.date-b.date||a.rowNumber-b.rowNumber);
  let number=0;
  for(const p of raw){ if(p.numberable && !p.private){ number++; p.postNumber=number; } else p.postNumber=0; }
  return raw;
}

async function threadCounts() {
  const [rows, threads] = await Promise.all([valuesGet(SPREADSHEET_ID, 'post!A:L').catch(()=>[]), readThreads().catch(()=>[])]);
  const counts = new Map(); const updated = new Map(); const seen = new Set(); const threadIds = threads.map(t=>t.id);
  for(let i=0;i<rows.length;i++){
    const r=rows[i]; if(i===0 && String(r[1]||'').toLowerCase()==='threadid') continue; if(!r||r.length<8||!bool(r[0])) continue;
    const target=String(r[1]??'').trim(); const type=(cleanText(r[9],50).toUpperCase() || (normalizeRole(r[4])==='SYSTEM'?'SYSTEM':'NORMAL')); if(!isNumberedType(type)&&type!=='NORMAL') continue;
    const d=parseDate(r[7]); if(!d) continue; const t=d.getTime();
    if(target==='all'){
      const key=t+'|'+String(r[6]||'')+'|'+String(r[8]||''); if(seen.has(key)) continue; seen.add(key);
      for(const id of threadIds){ counts.set(id,(counts.get(id)||0)+1); updated.set(id,Math.max(updated.get(id)||0,t)); }
      continue;
    }
    const id=normalizeId(target); counts.set(id,(counts.get(id)||0)+1); updated.set(id,Math.max(updated.get(id)||0,t));
  }
  return {counts,updated};
}

async function publicThreadList() {
  const [threads, data] = await Promise.all([readThreads(),threadCounts()]);
  return threads.map(t=>({...t,count:data.counts.get(t.id)||0,updated:data.updated.get(t.id)||t.updated,dateText:fmtShort(t.date),updatedText:fmtShort(data.updated.get(t.id)||t.updated)})).sort((a,b)=>(b.pinned?1:0)-(a.pinned?1:0)||Number(b.updated)-Number(a.updated));
}

async function siteAccessAllowed() {
  try { const rows=await valuesGet(SPREADSHEET_ID,'info!B1:B2'); const enabled=bool(rows?.[0]?.[0]); const reason=String(rows?.[1]?.[0]||'').trim(); return enabled?{allowed:true}:{allowed:false,reason:reason||'現在、サイトは停止しています。'}; } catch { return {allowed:true}; }
}
async function privatePassword(thread) { return thread.privatePassword || ''; }

async function getThread(threadId, req, password='') {
  const id=normalizeId(threadId); const threads=await readThreads(); const base=threads.find(t=>t.id===id); if(!base) throw new Error('指定されたスレッドが存在しません。');
  const isAdmin=!!getAdmin(req);
  if(base.adminOnly&&!isAdmin) throw new Error('このスレッドは管理者専用です。');
  if(base.privatePassword && !isAdmin && password!==base.privatePassword) { const e=new Error('このPRIVATEスレッドは認証が必要です。'); e.code='PRIVATE_AUTH_REQUIRED'; throw e; }
  const posts=await readPosts(id,getClientUserId(req,{cookie:()=>{}}));
  const count=posts.filter(p=>p.numberable&&!p.private).length;
  return {...base,count,updatedText:fmtShort(base.updated),dateText:fmtShort(base.date),posts};
}

function getClientIp(req){ return String(req.headers['x-forwarded-for']||req.ip||'').split(',')[0].trim(); }
const onlineMap = new Map();
function touchOnline(hash){ const now=Date.now(); const key=cleanText(hash||'',200).replace(/[^A-Za-z0-9_\-:.]/g,'')||'anon'; onlineMap.set(key,now); for(const [k,v] of onlineMap) if(now-v>ONLINE_TTL_MS) onlineMap.delete(k); return onlineMap.size; }

async function loginAdmin(username,password){
  const rows=await valuesGet(KUPROXNPP_LOGIN_SPREADSHEET_ID,'date!A:K');
  let match=null;
  for(let i=1;i<rows.length;i++){ const r=rows[i]||[]; if(String(r[2]||'').trim().toLowerCase()===String(username||'').trim().toLowerCase()&&String(r[3]||'')===String(password||'')){match=r;break;} }
  if(!match) return {success:false,message:'ユーザー名またはパスワードが正しくありません。'};
  const userId=String(match[1]||'').trim(); const adminRows=await valuesGet(KUPROXNPP_LOGIN_SPREADSHEET_ID,'admin!A:E').catch(()=>[]); let role='';
  for(const r of adminRows){ if(String(r[1]||'').trim().toLowerCase()!=='service')continue; if(String(r[2]||'').trim()!=='fuiZC6Etzm4tq0bh')continue; if(String(r[3]||'').trim()!==userId)continue; role=rolePriority(r[4])>rolePriority(role)?normalizeRole(r[4]):role; }
  if(rolePriority(role)<ADMIN_MIN_PRIORITY) return {success:false,code:'ADMIN_ROLE_REQUIRED',message:'このアカウントにはmoderator以上の管理者権限がありません。'};
  return {success:true,userId,username:String(match[2]||''),role,sessionToken:signAdmin(userId,String(match[2]||''),role)};
}

async function createThread(title, req) {
  const admin=getAdmin(req); if(!admin||rolePriority(admin.role)<ADMIN_MIN_PRIORITY) throw new Error('スレッドを作成するにはmoderator以上の管理者権限が必要です。');
  const cleanTitle=cleanText(title,300); if(!cleanTitle) throw new Error('スレッド名を入力してください。');
  const id=String(Date.now())+String(Math.floor(Math.random()*1000)); const now=new Date(); const ip=getClientIp(req);
  await valuesAppend(SPREADSHEET_ID,'threads!A:S',[true,ip,cleanTitle,id,'0',now,now,true,false,false,false,false,'','',false,false,false,false,'']);
  return {success:true,thread:{id,title:cleanTitle,count:0,date:now.getTime(),updated:now.getTime(),dateText:fmtShort(now),updatedText:fmtShort(now)}};
}

const appHtml = () => `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>7ちゃんねる Render</title><style>
:root{--bg:#fff;--panel:#f7f7f7;--border:#ddd;--text:#111;--muted:#777;--accent:#2457a6;--green:#008000;--red:#c00}*{box-sizing:border-box}body{margin:0;background:var(--bg);color:var(--text);font-family:"MS PGothic","IPAMonaPGothic","Yu Gothic",sans-serif}.top{display:flex;gap:6px;align-items:center;flex-wrap:wrap;padding:9px 12px;border-bottom:1px solid var(--border);background:#fafafa}.top button{border:1px solid #aaa;background:#eee;padding:5px 10px;cursor:pointer;font-weight:bold}.top button.green{background:#27ae60;color:#fff;border-color:#27ae60}.top button.blue{background:#2457a6;color:#fff;border-color:#2457a6}.top .online{margin-left:auto;color:#555;font-size:.9rem}.wrap{max-width:1100px;margin:auto;padding:12px}.brand{font-size:28px;font-weight:bold;color:#06c;margin:10px 0;cursor:pointer}.panel{border:1px solid var(--border);background:#fff}.list{padding:0}.thread{padding:12px;border-bottom:1px solid #eee;cursor:pointer}.thread:hover{background:#f7fbff}.thread-title{font-size:17px;color:#00f;font-weight:bold}.thread-meta{font-size:12px;color:#888;margin-top:4px}.detail{display:none}.detail.active{display:block}.list.active{display:block}.post{padding:8px 10px;border-bottom:1px solid #eee}.post-head{font-size:.9rem;line-height:1.5}.post-num{color:#777}.name{color:var(--green);font-weight:bold}.id{color:#666;font-size:.9em}.date{color:#888;font-size:.8em}.body{margin:3px 0 0 14px;white-space:pre-wrap;overflow-wrap:anywhere;line-height:1.55}.compose{padding:12px;background:#f7f7f7;border-top:1px solid #ddd}.compose input,.compose textarea{width:100%;padding:8px;border:1px solid #bbb;margin-bottom:8px;font:inherit}.compose textarea{min-height:90px;resize:vertical}.row{display:flex;gap:8px;flex-wrap:wrap}.row button{padding:7px 14px;border:1px solid #999;background:#eee;cursor:pointer}.row .primary{background:#2457a6;color:#fff;border-color:#2457a6}.archive{display:none}.archive.active{display:block}.back{margin:10px 0}.hint{padding:10px;background:#fffbe6;border:1px solid #ddc65c;font-size:13px}.modal{display:none;position:fixed;inset:0;background:rgba(0,0,0,.55);align-items:center;justify-content:center;z-index:50}.modal.show{display:flex}.modal-card{background:#fff;width:min(420px,92vw);padding:18px;border-radius:10px}.modal-card input{width:100%;padding:9px;margin:6px 0 10px}.status{min-height:20px;color:#c00;font-size:13px}.service{background:#555!important;color:#fff!important;border-color:#555!important}.rmark{color:#888;font-size:.72em;margin-left:1px}.error{padding:20px;color:#c00}@media(max-width:700px){.top .online{width:100%;margin-left:0}.brand{font-size:23px}}
</style></head><body><div class="top"><button class="green" id="archiveBtn">過去ログ倉庫</button><button class="blue" id="adminBtn">管理者</button><button class="service" id="serviceBtn">他サービス</button><span class="online">現在：<b id="onlineCount">--</b> 人が閲覧中</span></div><div class="wrap"><div class="brand" id="homeBtn">7ちゃんねる</div><div id="homeView"><div id="threadList" class="panel list"></div><div class="compose"><div class="row"><button class="primary" id="refreshBtn">更新</button><button id="createThreadBtn" style="display:none">スレ立て</button></div></div></div><div id="threadView" class="detail"><div class="back row"><button id="backBtn">← トップへ戻る</button><button id="archiveBackBtn" style="display:none">← 戻る（過去スレリスト）</button></div><div class="panel"><div style="padding:12px;border-bottom:1px solid #ddd"><h2 id="threadTitle" style="margin:0"></h2><div id="threadMeta" class="thread-meta"></div></div><div id="posts"></div><div id="compose" class="compose"><input id="name" placeholder="名前（省略可）"><textarea id="content" placeholder="内容を入力してください"></textarea><div class="row"><button class="primary" id="postBtn">書き込む</button></div><div id="postStatus" class="status"></div></div></div></div><div id="archiveView" class="archive"><div class="back row"><button id="archiveHomeBtn">← ホーム</button></div><div id="archiveList" class="panel"></div></div></div><div id="loginModal" class="modal"><div class="modal-card"><h3>管理者ログイン</h3><input id="adminUser" placeholder="ユーザー名"><input id="adminPass" type="password" placeholder="パスワード"><div id="loginStatus" class="status"></div><div class="row"><button class="primary" id="loginBtn">ログイン</button><button id="loginClose">閉じる</button></div></div></div><div id="threadModal" class="modal"><div class="modal-card"><h3>新規スレッド</h3><input id="newThreadTitle" placeholder="スレッド名"><div id="threadCreateStatus" class="status"></div><div class="row"><button class="primary" id="newThreadBtn">作成</button><button id="threadClose">閉じる</button></div></div></div><div id="privateModal" class="modal"><div class="modal-card"><h3>PRIVATEスレッド</h3><p>パスワードを入力してください。</p><input id="privatePass" type="password" placeholder="パスワード"><div id="privateStatus" class="status"></div><div class="row"><button class="primary" id="privateBtn">開く</button></div></div></div><script>
const SERVICE_URL=${JSON.stringify(OTHER_SERVICES_URL)};const state={currentThread:null,archive:false,archiveDirect:false,privatePassword:''};
const $=id=>document.getElementById(id);function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}function postBody(v){let h=esc(v);h=h.replace(/(https?:\\/\\/[^\\s<]+)/g,u=>'<a href="'+u+'" target="_blank" rel="noopener noreferrer">'+u+'</a>');h=h.replace(/&gt;&gt;(\\d+)/g,'<span style="color:#00f">$&</span>');h=h.replace(/\\n/g,'<br>');return h}
async function api(url,opt={}){const r=await fetch(url,{headers:{'Content-Type':'application/json',...(opt.headers||{})},...opt});const d=await r.json().catch(()=>({success:false,message:'JSON応答を解釈できませんでした。'}));if(!r.ok&&d.code!=='PRIVATE_AUTH_REQUIRED')throw new Error(d.message||'通信エラー');return d}
function show(view){$('homeView').style.display=view==='home'?'block':'none';$('threadView').style.display=view==='thread'?'block':'none';$('archiveView').className='archive'+(view==='archive'?' active':'')}
async function loadHome(){state.archive=false;state.archiveDirect=false;show('home');const d=await api('/api/threads');const list=$('threadList');if(!d.success){list.innerHTML='<div class="error">'+esc(d.message)+'</div>';return}const visible=d.threads.filter(t=>t.active&&(t.pinned||(Date.now()-(t.updated||t.date)<=12*60*60*1000)||t.unlimited));list.innerHTML=visible.length?visible.map(t=>'<div class="thread" onclick="openThread(\''+encodeURIComponent(t.id)+'\')"><div class="thread-title">'+esc(t.title)+' ('+Number(t.count||0)+')</div><div class="thread-meta">ID: thread_'+esc(t.id)+' / '+esc(t.updatedText||'')+'</div></div>').join(''):'<div style="padding:18px;color:#666">現在表示できるスレッドはありません。</div>'}
async function openThread(id,archiveMode=false){id=decodeURIComponent(String(id));state.archive=archiveMode;state.archiveDirect=archiveMode;show('thread');$('compose').style.display=archiveMode?'none':'block';$('archiveBackBtn').style.display=archiveMode?'inline-block':'none';$('backBtn').style.display=archiveMode?'none':'inline-block';$('threadTitle').textContent='読み込み中...';$('posts').innerHTML='<div style="padding:15px">読み込み中...</div>';let url='/api/thread/'+encodeURIComponent(id);if(state.privatePassword)url+='?password='+encodeURIComponent(state.privatePassword);const d=await api(url);if(d.code==='PRIVATE_AUTH_REQUIRED'){openPrivate(id);return}if(!d.success){$('posts').innerHTML='<div class="error">'+esc(d.message)+'</div>';return}state.currentThread=d.thread;state.privatePassword='';$('threadTitle').textContent=d.thread.title;const meta=(archiveMode?'過去ログ / ':'')+d.posts.filter(p=>p.numberable&&!p.private).length+' レス / ID: thread_'+d.thread.id;$('threadMeta').textContent=meta;renderPosts(d.posts)}
function renderPosts(posts){const arr=(posts||[]).slice().sort((a,b)=>Number(a.date)-Number(b.date)||Number(a.rowNumber)-Number(b.rowNumber));$('posts').innerHTML=arr.length?arr.map(p=>{const suffix='·R';const num=p.numberable&&!p.private?'<span class="post-num">'+Number(p.postNumber)+' ： </span>':'';const id='ID:'+esc(p.displayUserId||'不明')+'<span class="rmark">'+suffix+'</span>';return '<div class="post"><div class="post-head">'+num+'<span class="name">'+esc(p.displayName||p.username||'名無しさん')+'</span> <span class="id">'+id+'</span> <span class="date">：'+esc(p.dateText||'')+'</span></div><div class="body">'+postBody(p.deleted?'削除済み':p.content)+'</div></div>'}).join(''):'<div style="padding:18px;color:#666">投稿がありません。</div>'}
async function loadArchive(){state.archive=true;state.archiveDirect=false;show('archive');const d=await api('/api/archive');const list=$('archiveList');if(!d.success){list.innerHTML='<div class="error">'+esc(d.message)+'</div>';return}list.innerHTML=d.threads.length?d.threads.map(t=>'<div class="thread" onclick="openArchiveThread(\''+encodeURIComponent(t.id)+'\')"><div class="thread-title">'+esc(t.title)+' ('+Number(t.count||0)+')</div><div class="thread-meta">'+(t.permanent?'永久保存':'期限: '+esc(t.expiryText||''))+' / '+esc(t.updatedText||'')+'</div></div>').join(''):'<div style="padding:18px;color:#666">過去スレはありません。</div>'}
function openArchiveThread(id){openThread(id,true)}function openPrivate(id){$('privateModal').classList.add('show');$('privateModal').dataset.thread=id;$('privatePass').value='';$('privatePass').focus()}
$('privateBtn').onclick=async()=>{const id=$('privateModal').dataset.thread;state.privatePassword=$('privatePass').value;const d=await api('/api/thread/'+encodeURIComponent(id)+'?password='+encodeURIComponent(state.privatePassword));if(d.code==='PRIVATE_AUTH_REQUIRED'){$('privateStatus').textContent='パスワードが違います。';return}$('privateModal').classList.remove('show');if(state.archive)openThread(id,true);else openThread(id,false)};
$('archiveBtn').onclick=loadArchive;$('archiveHomeBtn').onclick=loadHome;$('homeBtn').onclick=loadHome;$('backBtn').onclick=loadHome;$('archiveBackBtn').onclick=loadArchive;$('refreshBtn').onclick=loadHome;$('serviceBtn').onclick=()=>{window.location.href=SERVICE_URL};
$('postBtn').onclick=async()=>{if(!state.currentThread)return;const status=$('postStatus');status.textContent='';const body={username:$('name').value,content:$('content').value,password:state.privatePassword};try{const d=await api('/api/thread/'+encodeURIComponent(state.currentThread.id)+'/posts',{method:'POST',body:JSON.stringify(body)});if(!d.success)throw new Error(d.message||'投稿できませんでした。');$('content').value='';await openThread(state.currentThread.id,false)}catch(e){status.textContent=e.message}}
$('adminBtn').onclick=()=>{$('loginStatus').textContent='';$('loginModal').classList.add('show')};$('loginClose').onclick=()=>{$('loginModal').classList.remove('show')};$('loginBtn').onclick=async()=>{const d=await api('/api/admin/login',{method:'POST',body:JSON.stringify({username:$('adminUser').value,password:$('adminPass').value})});if(!d.success){$('loginStatus').textContent=d.message||'ログイン失敗';return}$('loginModal').classList.remove('show');$('createThreadBtn').style.display='inline-block';alert('管理者ログインしました。')};$('createThreadBtn').onclick=()=>{$('threadCreateStatus').textContent='';$('threadModal').classList.add('show')};$('threadClose').onclick=()=>{$('threadModal').classList.remove('show')};$('newThreadBtn').onclick=async()=>{try{const d=await api('/api/threads',{method:'POST',body:JSON.stringify({title:$('newThreadTitle').value})});if(!d.success)throw new Error(d.message);$('threadModal').classList.remove('show');$('newThreadTitle').value='';loadHome()}catch(e){$('threadCreateStatus').textContent=e.message}};
async function heartbeat(){try{const hash=localStorage.getItem('7ch_userhash_r')||crypto.randomUUID();localStorage.setItem('7ch_userhash_r',hash);const d=await api('/api/online',{method:'POST',body:JSON.stringify({hash})});$('onlineCount').textContent=String(d.count??0)}catch{}}setInterval(heartbeat,3000);heartbeat();
function route(){const p=new URLSearchParams(location.search);if(p.get('log')==='1'){if(p.get('thread'))openThread(p.get('thread'),true);else loadArchive()}else if(p.get('thread'))openThread(p.get('thread'),false);else loadHome()}route();
</script></body></html>`;

app.get('/', (req,res)=>res.type('html').send(appHtml()));
app.get('/api/threads', async (req,res)=>{ try { const access=await siteAccessAllowed(); if(!access.allowed)return res.status(403).json({success:false,message:access.reason}); const threads=await publicThreadList(); const admin=getAdmin(req); res.json({success:true,threads,role:admin?.role||''}); } catch(e){ res.status(500).json({success:false,message:e.message}); }});
app.get('/api/archive', async (req,res)=>{ try { const [threads,data]=await Promise.all([readThreads(),threadCounts()]); const now=Date.now(); const list=threads.map(t=>({...t,count:data.counts.get(t.id)||0,updated:data.updated.get(t.id)||t.updated})).filter(t=>!t.privatePassword&&!t.adminOnly).map(t=>{const permanent=t.unlimited||t.count>=1000||t.systemKey==='permanent_chat';const past=!t.active||!t.updated||now-t.updated>=12*60*60*1000;return {...t,permanent,archived:past||permanent,expiry:permanent?'':(t.updated? t.updated+7*24*60*60*1000:0),expiryText:permanent?'永久保存':fmtShort(t.updated? t.updated+7*24*60*60*1000:0)};}).filter(t=>t.archived).sort((a,b)=>(b.permanent?1:0)-(a.permanent?1:0)||b.updated-a.updated); res.json({success:true,threads:list}); }catch(e){res.status(500).json({success:false,message:e.message});} });
app.get('/api/thread/:id', async (req,res)=>{ try { const t=await getThread(req.params.id,req,String(req.query.password||'')); res.json({success:true,thread:{...t,privatePassword:undefined},posts:t.posts}); } catch(e){ res.status(e.code==='PRIVATE_AUTH_REQUIRED'?403:404).json({success:false,code:e.code||'',message:e.message}); }});
app.post('/api/thread/:id/posts', async (req,res)=>{ try { const access=await siteAccessAllowed(); if(!access.allowed)return res.status(403).json({success:false,message:access.reason}); const id=normalizeId(req.params.id); const threads=await readThreads(); const thread=threads.find(x=>x.id===id); if(!thread)return res.status(404).json({success:false,message:'指定されたスレッドが存在しません。'}); const admin=getAdmin(req); if(thread.adminOnly&&!admin)return res.status(403).json({success:false,message:'このスレッドは管理者専用です。'}); if(thread.privatePassword&&String(req.body.password||'')!==thread.privatePassword&&!admin)return res.status(403).json({success:false,code:'PRIVATE_AUTH_REQUIRED',message:'このPRIVATEスレッドは認証が必要です。'}); if((thread.locked||thread.writable===false)&&!admin)return res.status(403).json({success:false,message:'このスレッドはLOCK中です。'}); const content=cleanText(req.body.content,10000); if(!content)return res.status(400).json({success:false,message:'投稿内容を入力してください。'}); if(!thread.unlimited&&content.split('\n').length>5)return res.status(400).json({success:false,message:'通常スレッドでは5行以上の文章を投稿できません。'}); const uid=admin?.userId||getClientUserId(req,res); const role=admin?.role||''; const username=parseNameTrip(req.body.username||'').username; const ip=getClientIp(req); const now=new Date(); await valuesAppend(SPREADSHEET_ID,'post!A:L',[true,id,uid,ip,role,username,content,now,'','NORMAL','','']); res.json({success:true}); }catch(e){res.status(400).json({success:false,message:e.message});} });
app.post('/api/threads', async (req,res)=>{ try {const t=await createThread(req.body.title,req);res.json(t);}catch(e){res.status(403).json({success:false,message:e.message});}});
app.post('/api/admin/login', async (req,res)=>{try{const r=await loginAdmin(req.body.username,req.body.password);if(r.success){res.cookie(SESSION_COOKIE,r.sessionToken,{httpOnly:true,secure:true,sameSite:'lax',maxAge:ADMIN_SESSION_MAX_AGE});delete r.sessionToken;}res.json(r)}catch(e){res.status(500).json({success:false,message:e.message})}});
app.post('/api/admin/logout',(req,res)=>{res.clearCookie(SESSION_COOKIE);res.json({success:true})});
app.get('/api/admin/me',(req,res)=>{const a=getAdmin(req);res.json({authenticated:!!a,userId:a?.userId||'',username:a?.username||'',role:a?.role||''})});
app.post('/api/online',(req,res)=>res.json({success:true,count:touchOnline(req.body.hash)}));
app.get('/healthz',(req,res)=>res.json({ok:true,service:'7ch-render'}));
app.listen(PORT,()=>console.log('7ch Render listening on '+PORT));
