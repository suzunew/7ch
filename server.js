const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 10000);
const GAS_URL = 'https://script.google.com/macros/s/AKfycby-dEiWyuKtqTuNpRu4uZxDQsH7mGIQT_K9II1kVH_tNUkp2sPB_0hKN-HoBVKLbZuYvw/exec';
const OTHER_SERVICES_URL = 'https://script.google.com/macros/s/AKfycbypRjGqX3SqsQy_bi3mzDZhX0NvUEOHBZJZzacxK2o67rP-8iv5w30Xzb63D-I-imMd/exec';

function send(res, code, type, body) {
  res.writeHead(code, {
    'Content-Type': type,
    'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    Pragma: 'no-cache'
  });
  res.end(body);
}

function getClientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const real = String(req.headers['x-real-ip'] || '').trim();
  const socket = String(req.socket && req.socket.remoteAddress || '').trim();
  const ip = forwarded || real || socket;
  return ip.replace(/^::ffff:/i, '');
}

async function parseJsonResponse(response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error('GAS APIからJSONを取得できませんでした。HTTP ' + response.status + ' / ' + text.slice(0, 200));
  }
}

async function gasGet(action, data, req) {
  const params = new URLSearchParams({ renderApi: '1', action: String(action || '') });
  const payload = Object.assign({}, data || {});
  if (!payload.clientIp && req) payload.clientIp = getClientIp(req);
  Object.keys(payload).forEach(key => {
    const value = payload[key];
    if (value !== undefined && value !== null && value !== '') params.set(key, typeof value === 'object' ? JSON.stringify(value) : String(value));
  });
  const response = await fetch(GAS_URL + '?' + params.toString(), {
    method: 'GET',
    redirect: 'follow',
    cache: 'no-store',
    headers: { Accept: 'application/json' }
  });
  return parseJsonResponse(response);
}

async function gasPost(action, data, req) {
  const payload = Object.assign({}, data || {}, { action: String(action || '') });
  if (!payload.clientIp && req) payload.clientIp = getClientIp(req);
  const response = await fetch(GAS_URL + '?renderApi=1&action=' + encodeURIComponent(action), {
    method: 'POST',
    redirect: 'follow',
    cache: 'no-store',
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      Accept: 'application/json'
    },
    body: JSON.stringify(payload)
  });
  return parseJsonResponse(response);
}

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, char => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  })[char]);
}

function attr(value) {
  return esc(value).replace(/`/g, '&#96;');
}

const html = `<!doctype html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>7ちゃんねる R</title>
<style>
*{box-sizing:border-box}
:root{--blue:#2457a6;--blue2:#3479d8;--line:#ccc;--bg:#fff;--muted:#666;--danger:#b00020}
html,body{margin:0;padding:0;background:#fff;color:#111;font-family:"MS PGothic",IPAMonaPGothic,"Yu Gothic",Meiryo,sans-serif}
button,input,textarea,select{font:inherit}
button{cursor:pointer}
.topbar{display:flex;align-items:center;gap:6px;flex-wrap:wrap;background:#f5f5f5;border-bottom:1px solid #ccc;padding:8px 10px;position:sticky;top:0;z-index:50}
.topbar button{padding:5px 10px;border:1px solid #aaa;background:#eee;color:#111;border-radius:3px}
.topbar .green{background:#27ae60;border-color:#188b48;color:#fff}
.topbar .blue{background:var(--blue);border-color:#1c4480;color:#fff}
.topbar .create{background:#fff3cd;border-color:#d8b23e}
.topbar .service{margin-left:auto}
.online{font-size:12px;color:#555;white-space:nowrap}
.counter{font-size:12px;color:#2457a6;white-space:nowrap}
.wrap{width:min(1100px,100%);margin:0 auto;padding:10px}
.brand{font-size:22px;font-weight:bold;margin:3px 0 10px;cursor:pointer;user-select:none}
.rmark{color:#2457a6}
.panel{border:1px solid var(--line);background:#fff;margin-top:8px}
.panel-title{background:#f2f2f2;padding:7px 10px;border-bottom:1px solid var(--line);font-weight:bold}
.list{padding:0}
.row{padding:9px 10px;border-bottom:1px solid #e5e5e5;cursor:pointer}
.row:hover{background:#fafafa}
.small{font-size:12px;color:#666}
.notice{padding:12px;color:#666}
.error{padding:12px;color:var(--danger);white-space:pre-wrap}
.back{margin:8px 0}
.back button{padding:6px 11px;border:1px solid #aaa;background:#eee}
.posts{padding:0}
.post{padding:8px 10px;border-bottom:1px solid #ddd}
.head{display:flex;gap:6px;align-items:baseline;flex-wrap:wrap;line-height:1.45}
.num{color:#555}
.name{font-weight:bold;color:#008000}
.uid{color:#555;font-size:12px}
.date{color:#888;font-size:12px}
.body{white-space:pre-wrap;word-break:break-word;padding:4px 0 0 8px;line-height:1.55}
.form{border-top:1px solid #ccc;padding:10px}
.form input,.form textarea{width:100%;padding:8px;border:1px solid #bbb;background:#fff}
.form textarea{min-height:90px;resize:vertical}
.actions{display:flex;gap:6px;flex-wrap:wrap;margin-top:7px}
.actions button{padding:7px 13px;border:1px solid #999;background:#eee}
.actions .primary{background:var(--blue);border-color:#1c4480;color:#fff}
.status{margin-top:7px;min-height:18px;font-size:12px;color:#666}
.hidden{display:none!important}
.card{border:1px solid #ccd8e8;background:#f8fbff;padding:10px;margin:8px 0}
.vote-box{border:1px solid #ccc;background:#fafafa;padding:10px;margin-top:8px}
.vote-option{display:block;width:100%;text-align:left;padding:7px 9px;margin:4px 0;border:1px solid #bbb;background:#fff}
.vote-option.selected{background:#eef4ff;border-color:#2867c7}
.vote-count{color:#555;font-size:12px;float:right}
.modal{position:fixed;inset:0;background:rgba(0,0,0,.5);display:none;align-items:center;justify-content:center;z-index:1000;padding:15px}
.modal.show{display:flex}
.box{width:min(540px,96vw);max-height:90vh;overflow:auto;background:#fff;border:1px solid #999;padding:16px;box-shadow:0 12px 40px rgba(0,0,0,.25)}
.box h3{margin:0 0 12px}
.box label{display:block;font-weight:bold;margin:10px 0 5px}
.box input,.box textarea,.box select{width:100%;padding:8px;border:1px solid #bbb}
.check-row{display:flex;gap:12px;flex-wrap:wrap;margin-top:8px}
.check-row label{display:flex;gap:4px;align-items:center;font-weight:normal;margin:0}
.check-row input{width:auto}
.lock{color:#900;font-weight:bold}
.private{color:#666;font-size:11px}
.direct-back{display:none;margin-bottom:8px}
.realtime{font-size:11px;color:#777}
@media(max-width:700px){.topbar .service{margin-left:0}.wrap{padding:7px}.brand{font-size:20px}}
</style>
</head>
<body>
<div class="topbar">
  <button id="homeBtn" type="button">ホーム</button>
  <button id="archiveBtn" class="green" type="button">過去スレ</button>
  <button id="createBtn" class="create" type="button">スレ作成</button>
  <button id="loginBtn" type="button">管理者ログイン</button>
  <button id="logoutBtn" class="hidden" type="button">ログアウト</button>
  <button id="otherBtn" class="blue service" type="button">他サービス</button>
  <span id="online" class="online">現在: -- 人</span>
  <span id="totalAccess" class="counter">累計: --</span>
</div>
<div class="wrap">
  <div class="brand" id="brandHome">7ちゃんねる <span class="rmark">R</span></div>
  <div id="directBack" class="direct-back"><button id="directBackBtn" type="button">← 戻る（過去スレリスト）</button></div>
  <div id="app"></div>
  <div id="realtimeStatus" class="realtime">リアルタイム更新中</div>
</div>
<div id="loginModal" class="modal">
  <div class="box">
    <h3>管理者ログイン</h3>
    <label for="adminUser">ユーザー名</label>
    <input id="adminUser" autocomplete="username">
    <label for="adminPass">パスワード</label>
    <input id="adminPass" type="password" autocomplete="current-password">
    <div class="actions"><button id="loginSubmit" class="primary" type="button">ログイン</button><button id="loginClose" type="button">閉じる</button></div>
    <div id="loginMsg" class="status"></div>
  </div>
</div>
<div id="createModal" class="modal">
  <div class="box">
    <h3>スレッド作成</h3>
    <label for="threadTitle">スレッドタイトル</label>
    <input id="threadTitle" maxlength="300" placeholder="スレッドタイトル">
    <div class="check-row">
      <label><input id="threadPink" type="checkbox"> ピンク</label>
      <label><input id="threadWild" type="checkbox"> 荒野</label>
      <label><input id="threadOfficial" type="checkbox"> 公式</label>
      <label><input id="threadPrivate" type="checkbox"> PRIVATE</label>
    </div>
    <label for="threadPassword">PRIVATEパスワード（PRIVATE時のみ）</label>
    <input id="threadPassword" type="password" maxlength="72" placeholder="8～72文字">
    <div class="actions"><button id="createSubmit" class="primary" type="button">作成する</button><button id="createClose" type="button">閉じる</button></div>
    <div id="createMsg" class="status"></div>
  </div>
</div>
<div id="privateModal" class="modal">
  <div class="box">
    <h3>PRIVATEスレッド</h3>
    <p class="small">このスレッドを閲覧するにはパスワード認証が必要です。</p>
    <input id="privatePassword" type="password" placeholder="パスワード">
    <div class="actions"><button id="privateSubmit" class="primary" type="button">認証する</button><button id="privateClose" type="button">閉じる</button></div>
    <div id="privateMsg" class="status"></div>
  </div>
</div>
<script>
const USER_KEY='sevench_r_uid_v2';
const ADMIN_KEY='sevench_r_admin_v2';
const OTHER_SERVICES_URL=${JSON.stringify(OTHER_SERVICES_URL)};
let userId=localStorage.getItem(USER_KEY)||'';
if(!userId){userId=(crypto&&crypto.randomUUID?crypto.randomUUID():'r_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2)).replace(/[^A-Za-z0-9_-]/g,'').slice(0,24);localStorage.setItem(USER_KEY,userId)}
let adminSession=localStorage.getItem(ADMIN_KEY)||'';
let currentThreadId='';
let currentArchive=false;
let lastThreadSignature='';
let lastListSignature='';
let lastVoteSignature='';
let pendingPrivateThread='';
let pendingPrivateArchive=false;
let realtimeThreadTimer=null;
let realtimeListTimer=null;
let realtimeVoteTimer=null;
let inflightThread=false;
let inflightList=false;
let inflightVote=false;
let currentVoteState=null;

function apiGet(action,data){
  const params=new URLSearchParams({action:String(action||'')});
  Object.keys(data||{}).forEach(k=>{const v=data[k];if(v!==undefined&&v!==null&&v!=='')params.set(k,typeof v==='object'?JSON.stringify(v):String(v))});
  return fetch('/api?'+params.toString(),{cache:'no-store',headers:{Accept:'application/json'}}).then(r=>r.json());
}
function apiPost(action,data){
  return fetch('/api/'+encodeURIComponent(action),{method:'POST',cache:'no-store',headers:{'Content-Type':'application/json',Accept:'application/json'},body:JSON.stringify(Object.assign({},data||{}))}).then(r=>r.json());
}
function unwrap(resp){const d=resp&&resp.data!==undefined?resp.data:resp;if(resp&&resp.success===false)throw new Error(resp.message||'通信に失敗しました。');if(d&&d.success===false)throw new Error(d.message||'処理に失敗しました。');return d||{};}
function escHtml(v){return String(v==null?'':v).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function idSuffix(post){const p=String(post&&post.platform||'G').toUpperCase()==='R'?'R':'G';return '·'+p;}
function showOther(show){document.getElementById('otherBtn').classList.toggle('hidden',!show)}
function setDirectBack(show){document.getElementById('directBack').style.display=show?'block':'none'}
function setStatus(text){document.getElementById('realtimeStatus').textContent=String(text||'リアルタイム更新中')}
function signature(value){return JSON.stringify(value,function(k,v){if(k==='dateText'||k==='updatedText')return v;return v})}
function home(push=true){currentArchive=false;currentThreadId='';lastThreadSignature='';lastListSignature='';setDirectBack(false);showOther(true);if(push)history.replaceState({},'',location.pathname);loadHome(true)}
function archive(push=true){currentArchive=true;currentThreadId='';lastThreadSignature='';setDirectBack(false);showOther(false);if(push)history.replaceState({},'',location.pathname+'?log=1');loadArchive(true)}
function goOther(){window.location.href=OTHER_SERVICES_URL}
function openLogin(){document.getElementById('loginModal').classList.add('show');document.getElementById('loginMsg').textContent=''}
function closeLogin(){document.getElementById('loginModal').classList.remove('show')}
function openCreate(){if(!adminSession){openLogin();document.getElementById('createMsg').textContent='スレッド作成には管理者ログインが必要です。';return}document.getElementById('createModal').classList.add('show');document.getElementById('createMsg').textContent=''}
function closeCreate(){document.getElementById('createModal').classList.remove('show')}
function openPrivate(){document.getElementById('privateModal').classList.add('show');document.getElementById('privateMsg').textContent='';document.getElementById('privatePassword').value=''}
function closePrivate(){document.getElementById('privateModal').classList.remove('show')}
function setAdminUi(){document.getElementById('loginBtn').classList.toggle('hidden',!!adminSession);document.getElementById('logoutBtn').classList.toggle('hidden',!adminSession)}
function loadOnline(){apiGet('online',{userHash:userId}).then(unwrap).then(d=>{document.getElementById('online').textContent='現在: '+Number(d.count||0).toLocaleString('ja-JP')+' 人'}).catch(()=>{})}
function loadSiteInfo(){apiGet('site_info',{}).then(unwrap).then(d=>{document.getElementById('totalAccess').textContent='累計: '+Number(d.totalAccess||0).toLocaleString('ja-JP')}).catch(()=>{})}
function touchAccess(){apiPost('touch_access',{}).then(unwrap).then(d=>{document.getElementById('totalAccess').textContent='累計: '+Number(d.totalAccess||0).toLocaleString('ja-JP')}).catch(()=>loadSiteInfo())}
function checkSiteAccess(){return apiGet('siteaccess',{}).then(unwrap)}
function renderMessageList(title,list,empty){
  return '<div class="panel"><div class="panel-title">'+escHtml(title)+'</div><div class="list">'+(list.length?list.map(t=>'<div class="row" data-id="'+attr(t.id)+'"><b>'+escHtml(t.title||'')+'</b><div class="small">'+escHtml(t.id||'')+' ・ '+Number(t.count||0)+'レス ・ '+escHtml(t.updatedText||t.dateText||'')+(t.private?' ・ PRIVATE':'')+(t.locked?' ・ LOCK':'')+'</div></div>').join(''):'<div class="notice">'+escHtml(empty)+'</div>')+'</div></div>';
}
function bindThreadRows(list,isArchive){document.querySelectorAll('.row[data-id]').forEach(el=>el.addEventListener('click',()=>openThread(el.getAttribute('data-id'),isArchive)))}
function renderVote(state){
  currentVoteState=state||null;
  const box=document.getElementById('voteBox');
  if(!box||!state||!state.enabled){if(box)box.innerHTML='';return}
  const selected=Array.isArray(state.selectedChoices)?state.selectedChoices:(state.selected?[state.selected]:[]);
  box.innerHTML='<div style="font-weight:bold;margin-bottom:7px;">'+escHtml(state.question||'投票')+'</div>'+(state.multiple?'<div class="small">複数選択可</div>':'')+state.options.map((o)=>'<button type="button" class="vote-option '+(selected.includes(o)?'selected':'')+'" data-vote="'+attr(o)+'"><span>'+escHtml(o)+'</span><span class="vote-count">'+Number(state.counts&&state.counts[o]||0)+'票</span></button>').join('')+'<div id="voteMsg" class="status"></div>';
  box.querySelectorAll('[data-vote]').forEach(btn=>btn.addEventListener('click',()=>castVote(btn.getAttribute('data-vote'))));
}
function castVote(choice){
  if(!currentVoteState||!currentVoteState.enabled)return;
  let selected=Array.isArray(currentVoteState.selectedChoices)?currentVoteState.selectedChoices.slice():[];
  if(currentVoteState.multiple){selected=selected.includes(choice)?selected.filter(v=>v!==choice):selected.concat([choice])}else selected=[choice];
  const msg=document.getElementById('voteMsg');if(msg)msg.textContent='投票中...';
  apiPost('cast_vote',{voterId:userId,choices:selected}).then(unwrap).then(state=>{renderVote(state);}).catch(e=>{if(msg)msg.textContent=e.message});
}
function loadVote(silent){
  if(inflightVote)return;inflightVote=true;
  apiGet('vote_state',{voterId:userId}).then(unwrap).then(state=>{const sig=signature(state);if(sig!==lastVoteSignature||!silent){lastVoteSignature=sig;const box=document.getElementById('voteBox');if(box)renderVote(state)}}).catch(()=>{}).finally(()=>{inflightVote=false});
}
function loadHome(initial){
  currentArchive=false;showOther(true);setDirectBack(false);setStatus('リアルタイム更新中');
  if(initial)document.getElementById('app').innerHTML='<div class="panel"><div class="panel-title">スレッド一覧</div><div class="notice">読み込み中...</div></div>';
  apiGet('threads',{adminSessionToken:adminSession}).then(unwrap).then(data=>{
    const list=Array.isArray(data.threads)?data.threads:[];
    const sig=signature(list.map(t=>[t.id,t.count,t.updated,t.locked,t.writable]));
    if(initial||sig!==lastListSignature){
      lastListSignature=sig;
      document.getElementById('app').innerHTML='<div class="actions" style="justify-content:flex-start;"><button id="homeCreateInline" class="primary" type="button">スレッド作成</button></div>'+renderMessageList('スレッド一覧',list,'スレッドがありません。')+'<div id="voteBox" class="vote-box"></div>';
      document.getElementById('homeCreateInline').addEventListener('click',openCreate);
      bindThreadRows(list,false);
      loadVote(false);
    }
  }).catch(e=>{if(initial)document.getElementById('app').innerHTML='<div class="error">'+escHtml(e.message)+'</div>'});
}
function loadArchive(initial){
  currentArchive=true;showOther(false);setDirectBack(false);setStatus('過去スレ更新中');
  if(initial)document.getElementById('app').innerHTML='<div class="panel"><div class="panel-title">過去スレリスト</div><div class="notice">読み込み中...</div></div>';
  apiGet('archives',{}).then(unwrap).then(data=>{
    const list=Array.isArray(data.threads)?data.threads:[];const sig=signature(list.map(t=>[t.id,t.count,t.updated]));
    if(initial||sig!==lastListSignature){lastListSignature=sig;document.getElementById('app').innerHTML=renderMessageList('過去スレリスト',list,'過去スレがありません。');bindThreadRows(list,true)}
  }).catch(e=>{if(initial)document.getElementById('app').innerHTML='<div class="error">'+escHtml(e.message)+'</div>'});
}
function openThread(id,isArchive,push=true){
  currentThreadId=String(id||'').trim();currentArchive=!!isArchive;lastThreadSignature='';showOther(false);setDirectBack(currentArchive);setStatus('リアルタイム更新中');
  if(push)history.replaceState({},'',location.pathname+(currentArchive?'?log=1&thread=':'?thread=')+encodeURIComponent(currentThreadId));
  document.getElementById('app').innerHTML='<div class="panel"><div class="notice">スレッドを読み込み中...</div></div>';
  fetchThread(false).catch(e=>{document.getElementById('app').innerHTML='<div class="error">'+escHtml(e.message)+'</div>'});
}
function threadPayload(){return {threadId:currentThreadId,userHash:userId,clientUserId:userId,adminSessionToken:adminSession}}
function fetchThread(silent){
  if(!currentThreadId||inflightThread)return Promise.resolve();
  inflightThread=true;
  const action=currentArchive?'archive_thread':'thread';
  return apiGet(action,threadPayload()).then(unwrap).then(data=>{
    if(!data||data.success===false){if(data&&data.code==='PRIVATE_AUTH_REQUIRED'){pendingPrivateThread=currentThreadId;pendingPrivateArchive=currentArchive;openPrivate();throw new Error('PRIVATE認証が必要です。')}throw new Error(data&&data.message||'スレッドを取得できませんでした。')}
    const sig=signature({thread:data.thread||{},posts:(data.posts||[]).map(p=>[p.rowNumber,p.postNumber,p.date,p.active,p.content,p.platform,p.specialType])});
    if(!silent||sig!==lastThreadSignature){lastThreadSignature=sig;renderThread(data)}
    return data;
  }).finally(()=>{inflightThread=false});
}
function renderThread(data){
  const t=data.thread||{};const posts=Array.isArray(data.posts)?data.posts:[];const oldName=document.getElementById('postName')?.value||'';const oldBody=document.getElementById('postBody')?.value||'';
  const form=!currentArchive?'<div class="form"><input id="postName" maxlength="200" placeholder="名前（省略可）"><br><br><textarea id="postBody" placeholder="内容を入力してください"></textarea><div class="actions"><button id="sendPostBtn" class="primary" type="button">書き込む</button></div><div id="postMsg" class="status"></div></div>':'';
  document.getElementById('app').innerHTML='<div class="back"><button id="threadBack">← '+(currentArchive?'過去スレリスト':'スレ一覧')+'</button></div><div class="panel"><div class="panel-title">'+escHtml(t.title||'')+' <span class="small">'+Number(t.count||posts.filter(p=>p.numberable).length||0)+'レス</span></div><div class="small" style="padding:6px 10px;">thread_'+escHtml(t.id||currentThreadId)+(t.private?' ・ PRIVATE':'')+(t.locked?' ・ LOCK':'')+'</div><div class="posts">'+renderPosts(posts)+'</div>'+form+'</div>';
  document.getElementById('threadBack').addEventListener('click',()=>currentArchive?archive():home());
  if(!currentArchive){const name=document.getElementById('postName');const body=document.getElementById('postBody');name.value=oldName;body.value=oldBody;document.getElementById('sendPostBtn').addEventListener('click',sendPost);if(t.private){}if(t.locked&&!adminSession){document.getElementById('sendPostBtn').disabled=true;document.getElementById('postMsg').textContent='このスレッドはLOCK中です。'}}
}
function renderPosts(posts){
  if(!posts.length)return '<div class="notice">投稿がありません。</div>';
  const sorted=posts.slice().sort((a,b)=>Number(a.date||0)-Number(b.date||0)||Number(a.rowNumber||0)-Number(b.rowNumber||0));
  return sorted.map((p,i)=>{
    const numberable=!!p.numberable;const num=p.postNumber||i+1;const deleted=!!p.deleted;const suffix=(!p.special&&!deleted&&p.role!=='SYSTEM')||deleted?idSuffix(p):'';
    return '<div class="post">'+(numberable?'<div class="head"><span class="num">'+escHtml(num)+' ：</span><span class="name">'+escHtml(deleted?'あぼーん':(p.displayName||p.username||'名無しさん'))+'</span><span class="uid">ID:'+escHtml(deleted?'不明':(p.displayUserId||p.userId||'不明'))+suffix+'</span><span class="date">：'+escHtml(p.dateText||'')+'</span></div>':'<div class="head"><span class="name">'+escHtml(deleted?'あぼーん':(p.displayName||p.username||'名無しさん'))+'</span><span class="uid">ID:'+escHtml(deleted?'不明':(p.displayUserId||p.userId||'不明'))+suffix+'</span><span class="date">：'+escHtml(p.dateText||'')+'</span></div>')+'<div class="body">'+escHtml(p.content||'')+'</div></div>';
  }).join('');
}
function sendPost(){
  const name=document.getElementById('postName')?.value||'';const body=document.getElementById('postBody')?.value||'';const msg=document.getElementById('postMsg');const btn=document.getElementById('sendPostBtn');
  if(!body.trim()){msg.textContent='本文を入力してください。';return}
  btn.disabled=true;msg.textContent='送信中...';
  apiPost('post',{threadId:currentThreadId,username:name,content:body,clientUserId:userId,adminSessionToken:adminSession,privatePassword:sessionStorage.getItem('sevench_r_private_'+currentThreadId)||''}).then(unwrap).then(result=>{
    document.getElementById('postBody').value='';msg.textContent='投稿しました。';lastThreadSignature='';fetchThread(true);
  }).catch(e=>{if(String(e.message).includes('PRIVATE')){sessionStorage.removeItem('sevench_r_private_'+currentThreadId);pendingPrivateThread=currentThreadId;pendingPrivateArchive=currentArchive;openPrivate()}msg.textContent=e.message}).finally(()=>{btn.disabled=false});
}
function login(){
  const username=document.getElementById('adminUser').value;const password=document.getElementById('adminPass').value;const msg=document.getElementById('loginMsg');msg.textContent='ログイン中...';
  apiPost('admin_login',{username,password}).then(unwrap).then(data=>{adminSession=data.sessionToken||'';if(adminSession)localStorage.setItem(ADMIN_KEY,adminSession);setAdminUi();msg.textContent='ログインしました。';setTimeout(closeLogin,300);if(!currentThreadId)loadHome(true)}).catch(e=>{msg.textContent=e.message});
}
function logout(){apiPost('admin_logout',{adminSessionToken:adminSession}).catch(()=>{}).finally(()=>{adminSession='';localStorage.removeItem(ADMIN_KEY);setAdminUi();if(!currentThreadId)loadHome(true)})}
function createThread(){
  if(!adminSession){openLogin();return}
  const title=document.getElementById('threadTitle').value.trim();const msg=document.getElementById('createMsg');
  if(!title){msg.textContent='タイトルを入力してください。';return}
  const privateEnabled=document.getElementById('threadPrivate').checked;const password=document.getElementById('threadPassword').value;
  if(privateEnabled&&password.length<8){msg.textContent='PRIVATEパスワードは8文字以上です。';return}
  msg.textContent='作成中...';document.getElementById('createSubmit').disabled=true;
  apiPost('create_thread',{title,clientUserId:userId,pink:document.getElementById('threadPink').checked,wild:document.getElementById('threadWild').checked,official:document.getElementById('threadOfficial').checked,private:privateEnabled,privatePassword:password,adminSessionToken:adminSession}).then(unwrap).then(data=>{closeCreate();home();if(data.thread&&data.thread.id)openThread(data.thread.id,false)}).catch(e=>{msg.textContent=e.message}).finally(()=>{document.getElementById('createSubmit').disabled=false});
}
function verifyPrivate(){
  const pw=document.getElementById('privatePassword').value;const msg=document.getElementById('privateMsg');if(!pendingPrivateThread)return;msg.textContent='認証中...';
  apiPost('verify_private',{threadId:pendingPrivateThread,password:pw,userHash:userId}).then(unwrap).then(data=>{if(!data.authenticated)throw new Error(data.message||'パスワードが違います。');sessionStorage.setItem('sevench_r_private_'+pendingPrivateThread,pw);const id=pendingPrivateThread;const archiveMode=pendingPrivateArchive;closePrivate();pendingPrivateThread='';pendingPrivateArchive=false;openThread(id,archiveMode,false)}).catch(e=>{msg.textContent=e.message});
}
function startRealtime(){
  if(realtimeThreadTimer)clearInterval(realtimeThreadTimer);if(realtimeListTimer)clearInterval(realtimeListTimer);if(realtimeVoteTimer)clearInterval(realtimeVoteTimer);
  realtimeThreadTimer=setInterval(()=>{if(currentThreadId&&!currentArchive)fetchThread(true).catch(()=>{})},700);
  realtimeListTimer=setInterval(()=>{if(!currentThreadId){if(currentArchive)loadArchive(false);else loadHome(false)}},1800);
  realtimeVoteTimer=setInterval(()=>{if(!currentThreadId)loadVote(true)},2500);
}
function boot(){
  setAdminUi();loadOnline();loadSiteInfo();touchAccess();setInterval(loadOnline,3000);startRealtime();
  checkSiteAccess().then(state=>{if(state&&!state.allowed){document.getElementById('app').innerHTML='<div class="error">'+escHtml(state.reason||'現在、サイトを利用できません。')+'</div>';return}const p=new URLSearchParams(location.search);const log=p.get('log')==='1';const thread=p.get('thread');if(log&&thread){currentArchive=true;currentThreadId=thread;showOther(false);setDirectBack(true);openThread(thread,true,false)}else if(log){archive(false)}else if(thread){openThread(thread,false,false)}else{home(false)}}).catch(()=>home(false));
}
document.getElementById('homeBtn').addEventListener('click',()=>home());
document.getElementById('archiveBtn').addEventListener('click',()=>archive());
document.getElementById('createBtn').addEventListener('click',openCreate);
document.getElementById('loginBtn').addEventListener('click',openLogin);
document.getElementById('logoutBtn').addEventListener('click',logout);
document.getElementById('otherBtn').addEventListener('click',goOther);
document.getElementById('brandHome').addEventListener('click',()=>home());
document.getElementById('loginSubmit').addEventListener('click',login);
document.getElementById('loginClose').addEventListener('click',closeLogin);
document.getElementById('createSubmit').addEventListener('click',createThread);
document.getElementById('createClose').addEventListener('click',closeCreate);
document.getElementById('privateSubmit').addEventListener('click',verifyPrivate);
document.getElementById('privateClose').addEventListener('click',closePrivate);
document.getElementById('directBackBtn').addEventListener('click',()=>archive());
boot();
</script>
</body>
</html>`;

function proxy(action, method, data, req) {
  return method === 'POST' ? gasPost(action, data, req) : gasGet(action, data, req);
}

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (url.pathname === '/healthz') return send(res, 200, 'application/json; charset=utf-8', JSON.stringify({ ok: true, service: '7ch-render-r' }));
    if (url.pathname === '/api') {
      const action = url.searchParams.get('action') || '';
      if (!action) return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ success: false, message: 'actionが必要です。' }));
      const data = {};
      for (const [k, v] of url.searchParams.entries()) if (k !== 'action') data[k] = v;
      const result = await proxy(action, 'GET', data, req);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
    }
    if (url.pathname.startsWith('/api/')) {
      const action = decodeURIComponent(url.pathname.slice(5));
      let raw = '';
      for await (const chunk of req) raw += chunk;
      let data = {};
      try { data = raw ? JSON.parse(raw) : {}; } catch (error) { return send(res, 400, 'application/json; charset=utf-8', JSON.stringify({ success: false, message: 'JSONが不正です。' })); }
      const result = await proxy(action, 'POST', data, req);
      return send(res, 200, 'application/json; charset=utf-8', JSON.stringify(result));
    }
    if (url.pathname === '/' || url.pathname === '/index.html') return send(res, 200, 'text/html; charset=utf-8', html);
    return send(res, 404, 'text/plain; charset=utf-8', 'Not Found');
  } catch (error) {
    return send(res, 500, 'application/json; charset=utf-8', JSON.stringify({ success: false, message: String(error && error.message ? error.message : error) }));
  }
});

server.listen(PORT, '0.0.0.0', () => console.log('7ch Render R listening on ' + PORT));
