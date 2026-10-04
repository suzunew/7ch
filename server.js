const http = require('http');

const PORT = Number(process.env.PORT || 10000);
const GAS_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycby-dEiWyuKtqTuNpRu4uZxDQsH7mGIQT_K9II1kVH_tNUkp2sPB_0hKN-HoBVKLbZuYvw/exec';

function buildGasUrl(path) {
  const base = String(GAS_WEB_APP_URL || '').trim().replace(/\/$/, '');
  if (!/^https:\/\/script\.google\.com\/macros\/s\/[^\s]+\/exec$/i.test(base)) {
    return '';
  }
  const p = String(path || '');
  if (!p) return base + '?render=1';
  return base + (p.indexOf('?') >= 0 ? p + '&render=1' : p + '?render=1');
}

function pageHtml() {
  const gasUrl = buildGasUrl('');
  const configured = !!gasUrl;
  const safeUrl = configured ? JSON.stringify(gasUrl) : '""';
  return `<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="referrer" content="no-referrer">
<title>7ちゃんねる R</title>
<style>
html,body{margin:0;width:100%;height:100%;background:#fff;overflow:hidden}body{font-family:Arial,"Hiragino Kaku Gothic ProN",Meiryo,sans-serif}.shell{width:100%;height:100%;position:relative;background:#fff}.app{width:100%;height:100%;border:0;display:block}.setup{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#f5f5f5;padding:24px;box-sizing:border-box}.setup-box{width:min(640px,100%);background:#fff;border:1px solid #ddd;border-radius:12px;padding:24px;box-sizing:border-box;box-shadow:0 10px 30px rgba(0,0,0,.08)}.setup h1{margin:0 0 10px;font-size:20px}.setup p{font-size:14px;line-height:1.7;color:#555}.setup code{display:block;padding:10px;background:#f5f5f5;border-radius:6px;word-break:break-all}.setup button{margin-top:12px;padding:10px 16px;border:0;border-radius:6px;background:#2457a6;color:#fff;font-weight:bold;cursor:pointer}
</style>
</head>
<body>
<div class="shell" id="shell">
${configured ? `<iframe class="app" src=${safeUrl} title="7ちゃんねる R" allow="autoplay; clipboard-write; fullscreen"></iframe>` : `<div class="setup"><div class="setup-box"><h1>7ちゃんねる Render版</h1><p><strong>server.js</strong> の <code>GAS_WEB_APP_URL</code> に、現在使っているGASウェブアプリの <code>/exec</code> URLを貼り付けてください。</p><p>例:</p><code>https://script.google.com/macros/s/xxxxxxxxxxxxxxxx/exec</code><p>Google Cloud、サービスアカウント、環境変数は不要です。</p></div></div>`}
</div>
</body>
</html>`;
}

const server = http.createServer((req, res) => {
  const path = String(req.url || '').split('?')[0];
  if (path === '/health') {
    res.writeHead(200, {'Content-Type': 'text/plain; charset=utf-8'});
    res.end('ok');
    return;
  }
  res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(pageHtml());
});

server.listen(PORT, '0.0.0.0');
