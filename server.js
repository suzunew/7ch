const http = require('http');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const GAS_API_URL = String(process.env.GAS_API_URL || 'https://script.google.com/macros/s/AKfycby-dEiWyuKtqTuNpRu4uZxDQsH7mGIQT_K9II1kVH_tNUkp2sPB_0hKN-HoBVKLbZuYvw/exec').replace(/\/+$/, '');
const GAS_API_KEY = String(process.env.GAS_API_KEY || '7ch-render-2026-10-04-KUPROXNPP-API-9f3e2c8a');
const FETCH_TIMEOUT_MS = Number(process.env.GAS_FETCH_TIMEOUT_MS || 25000);
const FETCH_RETRIES = Math.max(0, Number(process.env.GAS_FETCH_RETRIES || 2));

function send(res, status, body, type = 'text/html; charset=utf-8', extraHeaders = {}) {
  const data = Buffer.from(String(body), 'utf8');
  res.writeHead(status, Object.assign({
    'Content-Type': type,
    'Content-Length': data.length,
    'Cache-Control': 'no-store, max-age=0',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'strict-origin-when-cross-origin'
  }, extraHeaders));
  res.end(data);
}

function clientIp(req) {
  const forwarded = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const raw = forwarded || String(req.socket && req.socket.remoteAddress || '').trim();
  return raw.replace(/^::ffff:/i, '').trim();
}

function patchArgsForClientIp(method, args, ip) {
  const a = Array.isArray(args) ? args.slice() : [];
  if (!ip) return a;
  if (method === 'getSiteAccessStatePublic') a[0] = ip;
  if (method === 'createThread') { a[2] = ip; a[9] = 'R'; }
  if (method === 'submitPost') { a[4] = ip; a[8] = 'R'; }
  if (method === 'recordReferralInvite') a[2] = ip;
  return a;
}

async function readBody(req) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 1024 * 1024) throw new Error('リクエストが大きすぎます。');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchWithRetry(url, options = {}) {
  let lastError = null;
  for (let attempt = 0; attempt <= FETCH_RETRIES; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
      return await fetch(url, Object.assign({}, options, { signal: controller.signal }));
    } catch (error) {
      lastError = error;
      if (attempt < FETCH_RETRIES) await new Promise(resolve => setTimeout(resolve, 250 * (attempt + 1)));
    } finally {
      clearTimeout(timer);
    }
  }
  throw lastError || new Error('外部APIへの接続に失敗しました。');
}

async function rpc(req, res) {
  try {
    const raw = await readBody(req);
    const input = raw ? JSON.parse(raw) : {};
    const action = String(input.action || input.method || '').trim();
    if (!action) return send(res, 400, JSON.stringify({ ok: false, success: false, message: 'API操作が指定されていません。' }), 'application/json; charset=utf-8');
    const args = patchArgsForClientIp(action, Array.isArray(input.args) ? input.args : [], clientIp(req));
    const response = await fetchWithRetry(GAS_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Accept': 'application/json',
        'User-Agent': '7ch-Render-API/3.0'
      },
      body: JSON.stringify({ key: GAS_API_KEY, action, args })
    });
    const bodyText = await response.text();
    if (!response.ok) {
      return send(res, 502, JSON.stringify({
        ok: false,
        success: false,
        message: 'GAS API HTTP ' + response.status,
        upstream: bodyText.slice(0, 3000)
      }), 'application/json; charset=utf-8');
    }
    let payload;
    try {
      payload = JSON.parse(bodyText);
    } catch (error) {
      return send(res, 502, JSON.stringify({
        ok: false,
        success: false,
        message: 'GAS APIの応答がJSONではありません。',
        upstream: bodyText.slice(0, 3000)
      }), 'application/json; charset=utf-8');
    }
    return send(res, 200, JSON.stringify({
      ok: payload && payload.ok !== false,
      success: payload && payload.success !== false,
      result: payload && Object.prototype.hasOwnProperty.call(payload, 'result') ? payload.result : payload,
      message: payload && payload.message ? payload.message : ''
    }), 'application/json; charset=utf-8');
  } catch (error) {
    const message = String(error && error.message ? error.message : error);
    return send(res, 502, JSON.stringify({ ok: false, success: false, message: 'GAS API接続エラー: ' + message }), 'application/json; charset=utf-8');
  }
}

function runnerShim() {
  return `<script>
(function(){
  'use strict';
  const RENDER_BASE = window.location.origin;
  function makeRunner(state){
    const target={
      withSuccessHandler:function(fn){return makeRunner({success:typeof fn==='function'?fn:state.success,failure:state.failure,user:state.user});},
      withFailureHandler:function(fn){return makeRunner({success:state.success,failure:typeof fn==='function'?fn:state.failure,user:state.user});},
      withUserObject:function(obj){return makeRunner({success:state.success,failure:state.failure,user:obj});}
    };
    return new Proxy(target,{get:function(obj,prop){
      if(prop in obj)return obj[prop];
      return function(){
        const args=Array.prototype.slice.call(arguments);
        fetch(RENDER_BASE+'/api/rpc',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:String(prop),args:args}),cache:'no-store'})
        .then(function(r){return r.text().then(function(t){let d;try{d=JSON.parse(t);}catch(e){throw new Error('Render API応答エラー: '+(t||('HTTP '+r.status)));}if(!r.ok||d.ok===false){throw new Error(d.message||('HTTP '+r.status));}return d;});})
        .then(function(d){if(state.success)state.success(d.result!==undefined?d.result:d);})
        .catch(function(e){if(state.failure)state.failure(e);});
        return undefined;
      };
    }});
  }
  window.google=window.google||{};
  window.google.script=window.google.script||{};
  window.google.script.run=makeRunner({success:null,failure:null,user:null});
})();
</script>`;
}

function rewriteGasHtml(html) {
  let out = String(html || '');
  out = out.replace(/<base\b[^>]*>/gi, '');
  out = out.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, '');
  out = out.replace(/<iframe\b[^>]*\/?>/gi, '');
  out = out.replace(/<script\b[^>]*src=["'][^"']*(?:googleusercontent|script\.google\.com|gstatic\.com)[^"']*["'][^>]*>[\s\S]*?<\/script>/gi, '');
  out = out.replace(/@import\s+url\(['"]https?:\/\/fonts\.googleapis\.com[^)]*\);?/gi, '');
  out = out.replace(/https:\/\/api64\.ipify\.org\?format=json/g, '/api/client-ip');
  out = out.replace(/https:\/\/api\.ipify\.org\?format=json/g, '/api/client-ip');
  out = out.replace(/window\.top\.location\.href/g, 'window.location.href');
  out = out.replace(/window\.parent\.location\.href/g, 'window.location.href');
  const shim = runnerShim();
  if (/<head[^>]*>/i.test(out)) out = out.replace(/<head[^>]*>/i, m => m + shim);
  else out = shim + out;
  return out;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, ch => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[ch]));
}

async function page(req, res, parsed) {
  try {
    const target = new URL(GAS_API_URL);
    target.search = parsed.search || '';
    target.searchParams.set('raw', '1');
    target.searchParams.set('render', '1');
    const response = await fetchWithRetry(target.toString(), {
      headers: {
        'Accept': 'text/html,text/plain;q=0.9,*/*;q=0.8',
        'User-Agent': '7ch-Render/3.0'
      },
      redirect: 'follow'
    });
    const html = await response.text();
    if (!response.ok) return send(res, 502, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1>GAS接続エラー</h1><pre>'+escapeHtml(html.slice(0,5000))+'</pre>');
    const rewritten = rewriteGasHtml(html);
    send(res, 200, rewritten, 'text/html; charset=utf-8', {
      'Content-Security-Policy': "frame-ancestors 'self' *; block-all-mixed-content"
    });
  } catch (error) {
    send(res, 502, '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><h1>Render→GAS接続エラー</h1><pre>'+escapeHtml(String(error && error.message ? error.message : error))+'</pre>');
  }
}

function clientIpJson(req, res) {
  const ip = clientIp(req);
  return send(res, 200, JSON.stringify({ success: true, ip }), 'application/json; charset=utf-8');
}

function health(req, res) {
  return send(res, 200, JSON.stringify({ ok: true, service: '7ch-render', time: new Date().toISOString() }), 'application/json; charset=utf-8');
}

const server = http.createServer(async (req, res) => {
  try {
    const parsed = new URL(req.url, 'http://render.local');
    if (req.method === 'GET' && (parsed.pathname === '/healthz' || parsed.pathname === '/api/health')) return health(req, res);
    if (req.method === 'GET' && parsed.pathname === '/api/client-ip') return clientIpJson(req, res);
    if (req.method === 'POST' && parsed.pathname === '/api/rpc') return rpc(req, res);
    if (req.method === 'GET') return page(req, res, parsed);
    return send(res, 405, JSON.stringify({ ok: false, success: false, message: 'Method Not Allowed' }), 'application/json; charset=utf-8', { Allow: 'GET, POST' });
  } catch (error) {
    return send(res, 500, JSON.stringify({ ok: false, success: false, message: String(error && error.message ? error.message : error) }), 'application/json; charset=utf-8');
  }
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('7ch Render server listening on ' + PORT);
});
