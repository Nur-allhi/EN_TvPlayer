import http from 'http';
import https from 'https';
import os from 'os';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.argv[2], 10) || 8080;

const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}
const logFile = path.join(logsDir, 'proxy.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const ANSI = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', bold: '\x1b[1m' };
const CAT = {
  INFO:    { label: ' INFO ', ansi: ANSI.blue },
  START:   { label: ' START', ansi: ANSI.green },
  PROXY:   { label: 'PROXY ', ansi: ANSI.cyan },
  CHANNEL: { label: 'CHANNL', ansi: ANSI.magenta },
  WARN:    { label: ' WARN ', ansi: ANSI.yellow },
  ERROR:   { label: 'ERROR ', ansi: ANSI.red },
};

function log(message, category = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const cat = CAT[category] || CAT.INFO;
  const line = `${ts} ${cat.label} │ ${message}`;
  const colorLine = `${ANSI.dim}${ts}${ANSI.reset} ${cat.ansi}${cat.label}${ANSI.reset} │ ${message}`;
  console.log(colorLine);
  logStream.write(line + '\n');
}

function getNetworkIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return '127.0.0.1';
}

function showBanner(ip, channelCount, ruleCount) {
  const sep = '─'.repeat(50);
  console.log(`\n${ANSI.bold}╔${sep}╗${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.cyan}${ANSI.bold}TV SERVER — CORS Proxy & Channel API${ANSI.reset}      ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╠${sep}╣${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Local:${ANSI.reset}   http://localhost:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Network:${ANSI.reset} http://${ip}:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Manage:${ANSI.reset}  http://${ip}:${PORT}/manage        ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}TV API:${ANSI.reset}  http://${ip}:${PORT}/api/          ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}                                            ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.dim}Channels:${ANSI.reset} ${channelCount}                          ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.dim}Rules:${ANSI.reset}    ${ruleCount}                              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╚${sep}╝${ANSI.reset}\n`);
  log(`Listening on http://0.0.0.0:${PORT}`, 'START');
  log(`Network URL: http://${ip}:${PORT}`, 'START');
  log(`Manage UI:  http://${ip}:${PORT}/manage`, 'START');
  log(`Channels:   ${channelCount} loaded`, 'START');
}

// ── Header Rules ───────────────────────────────────────────────
const headerRulesFile = path.resolve('header-rules.json');
let headerRules = [];
try {
  if (fs.existsSync(headerRulesFile)) {
    const raw = fs.readFileSync(headerRulesFile, 'utf8');
    headerRules = JSON.parse(raw).map(r => ({ ...r, _re: new RegExp(r.match, 'i') }));
    log(`Loaded ${headerRules.length} header rule(s) from header-rules.json`, 'INFO');
  } else {
    log('No header-rules.json found — using default headers only', 'WARN');
  }
} catch (e) {
    log(`Failed to load header-rules.json: ${e.message}`, 'ERROR');
}

function applyHeaderRules(hostname, cleanHeaders, url) {
  for (const rule of headerRules) {
    if (rule._re.test(hostname)) {
      for (const [k, v] of Object.entries(rule.headers)) {
        cleanHeaders[k] = v;
      }
      log(`  └─ matched rule "${rule.name}" → ${JSON.stringify(rule.headers)}`);
      return rule.name;
    }
  }
  if (!cleanHeaders['origin']) cleanHeaders['origin'] = url.protocol + '//' + url.hostname;
  if (!cleanHeaders['referer']) cleanHeaders['referer'] = url.protocol + '//' + url.hostname + '/';
  log('  └─ no rule matched, using fallback headers');
  return null;
}
// ──────────────────────────────────────────────────────────────

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 50 });

// ── Channels Data ─────────────────────────────────────────────
const CHANNELS_FILE = path.resolve('channels.json');

function readChannels() {
  try {
    const raw = fs.readFileSync(CHANNELS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeChannels(channels) {
  channels.sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999));
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2) + '\n', 'utf8');
}
// ──────────────────────────────────────────────────────────────

// ── MIME Types ────────────────────────────────────────────────
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
};

function serveStatic(res, filePath) {
  try {
    const data = fs.readFileSync(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Access-Control-Allow-Origin': '*',
      'Cache-Control': ext === '.html' ? 'no-cache' : 'max-age=31536000',
    });
    res.end(data);
  } catch (e) {
    if (e.code === 'ENOENT') {
      res.writeHead(404);
      res.end('Not found');
    } else {
      res.writeHead(500);
      res.end('Internal error');
    }
  }
}

function serveJson(res, data, status = 200) {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  });
  res.end(JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

function corsHeaders(methods = 'GET, POST, PUT, DELETE, OPTIONS') {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': methods,
    'Access-Control-Allow-Headers': 'content-type',
  };
}
// ──────────────────────────────────────────────────────────────

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`, 'ERROR');
  log(`  ${err.stack?.split('\n').slice(1, 3).join(' ')}`, 'ERROR');
});
process.on('unhandledRejection', (err) => {
  log(`UNHANDLED REJECTION: ${err?.message || err}`, 'ERROR');
});

http.createServer(async (req, res) => {
  const rawUrl = req.url;
  // Use a trailing-slash trick so new URL doesn't collapse leading // in the path.
  // Proxy URLs arrive as /http://host/path — we need the raw path for routing
  // but must not mangle double-slashes that new URL would collapse.
  const pathEnd = rawUrl.indexOf('?');
  const rawPath = pathEnd >= 0 ? rawUrl.slice(0, pathEnd) : rawUrl;
  const rawQuery = pathEnd >= 0 ? rawUrl.slice(pathEnd) : '';
  const method = req.method;

  try {
    // ── Log Endpoint ────────────────────────────────────────
    if (rawPath === '/log' && method === 'POST') {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        try {
          const data = JSON.parse(body);
          log(`PLAYER ${data.level || 'INFO'} ${data.message}`, 'INFO');
        } catch {
          log(`PLAYER RAW ${body}`);
        }
        res.writeHead(200, { 'Access-Control-Allow-Origin': '*' });
        res.end('ok');
      });
      return;
    }
    if (rawPath === '/log' && method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    // ── Channels API ────────────────────────────────────────
    // GET /api/channels
    if (rawPath === '/api/channels' && method === 'GET') {
      serveJson(res, readChannels());
      return;
    }
    // POST /api/channels
    if (rawPath === '/api/channels' && method === 'POST') {
      const body = await readBody(req);
      const channel = JSON.parse(body);
      const channels = readChannels();
      channels.push(channel);
      writeChannels(channels);
      log(`Added #${channels.length} "${channel.name}"`, 'CHANNEL');
      serveJson(res, channel, 201);
      return;
    }
    // PUT /api/channels/:id
    const putMatch = rawPath.match(/^\/api\/channels\/(\d+)$/);
    if (putMatch && method === 'PUT') {
      const id = parseInt(putMatch[1], 10);
      const body = await readBody(req);
      const update = JSON.parse(body);
      const channels = readChannels();
      if (id < 0 || id >= channels.length) {
        res.writeHead(404); res.end('Not found');
        return;
      }
      channels[id] = { ...channels[id], ...update };
      writeChannels(channels);
      log(`Updated #${id} "${update.name}"`, 'CHANNEL');
      serveJson(res, channels[id]);
      return;
    }
    // DELETE /api/channels/:id
    const delMatch = rawPath.match(/^\/api\/channels\/(\d+)$/);
    if (delMatch && method === 'DELETE') {
      const id = parseInt(delMatch[1], 10);
      const channels = readChannels();
      if (id < 0 || id >= channels.length) {
        res.writeHead(404); res.end('Not found');
        return;
      }
      const removed = channels.splice(id, 1)[0];
      writeChannels(channels);
      log(`Deleted #${id} "${removed.name}"`, 'CHANNEL');
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }
    // OPTIONS for /api/channels/*
    if (rawPath.startsWith('/api/') && method === 'OPTIONS') {
      res.writeHead(204, corsHeaders());
      res.end();
      return;
    }

    // ── Static Files ────────────────────────────────────────
    // Management UI
    if (rawPath === '/manage' || rawPath.startsWith('/manage/')) {
      const sub = rawPath.slice('/manage'.length) || '/';
      const filePath = path.resolve('manage', sub.slice(1) || 'index.html');
      serveStatic(res, filePath);
      return;
    }
    // ── CORS Proxy ──────────────────────────────────────────
    // Use req.url.slice(1) directly — must NOT go through URL.parse because
    // that collapses // in paths like /http://host/stream → /http:/host/stream
    const target = rawUrl.slice(1);
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      // Show a helpful landing page with channel count
      const channelCount = readChannels().length;
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>TV Server</title>
<style>
body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{text-align:center;max-width:400px}
h1{font-size:28px;margin:0 0 8px 0;color:#ffffff}
.count{font-size:64px;font-weight:700;color:#58a6ff;margin:20px 0}
.count-label{font-size:16px;color:#8b949e}
.btn{display:inline-block;margin-top:24px;padding:12px 32px;background:#238636;color:#fff;text-decoration:none;border-radius:8px;font-size:16px;font-weight:600;transition:background .15s}
.btn:hover{background:#2ea043}
.footer{margin-top:32px;font-size:13px;color:#484f58}
</style>
</head>
<body>
<div class="card">
<h1>TV Server</h1>
<div class="count">${channelCount}</div>
<div class="count-label">channels loaded</div>
<a class="btn" href="/manage">Channel Manager</a>
<div class="footer">CORS proxy &amp; channel API</div>
</div>
</body>
</html>`);
      return;
    }

    const url = new URL(target);
    const mod = url.protocol === 'https:' ? https : http;

    const blockedHeaders = ['host', 'connection', 'keep-alive'];
    const cleanHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) => !blockedHeaders.includes(k.toLowerCase()))
    );
    const ruleName = applyHeaderRules(url.hostname, cleanHeaders, url);
    if (!cleanHeaders['user-agent']) {
      cleanHeaders['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    }

    log(`${method} ${url.hostname}${url.pathname.slice(0, 80)}`, 'PROXY');

    let responded = false;

    req.setTimeout(30000, () => { log(`Request timeout ${url.hostname}`, 'WARN'); req.destroy(); });
    const proxyReq = mod.request(target, {
      method,
      agent: url.protocol === 'https:' ? httpsAgent : undefined,
      headers: { ...cleanHeaders, host: url.hostname },
      timeout: 15000,
    }, (proxyRes) => {
      responded = true;
      if (proxyRes.statusCode === 403) {
        const respHeaders = {};
        for (const [k, v] of Object.entries(proxyRes.headers)) {
          if (/^(x-cache|x-served-by|x-amz|www-authenticate|content-type|server)/i.test(k)) {
            respHeaders[k] = v;
          }
        }
        log(`403 ${url.hostname}${url.pathname.slice(0, 60)} → ${JSON.stringify(respHeaders)}`, 'WARN');
      } else if (proxyRes.statusCode >= 500) {
        log(`${proxyRes.statusCode} ${url.hostname}${url.pathname.slice(0, 60)}`, 'WARN');
      }
      res.writeHead(proxyRes.statusCode, {
        'Access-Control-Allow-Origin': '*',
        ...Object.fromEntries(
          Object.entries(proxyRes.headers).filter(([k]) => !/^access-control-allow-origin$/i.test(k))
        ),
      });
      const cleanup = () => { proxyRes.destroy(); res.destroy(); };
      res.on('error', (e) => { if (e.message === 'aborted') return; log(`Response error: ${e.message}`, 'ERROR'); cleanup(); });
      proxyRes.on('error', (e) => { if (e.message === 'aborted') return; log(`Upstream error: ${e.message}`, 'ERROR'); cleanup(); });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => { if (e.message.includes('certificate')) return; log(`Request error: ${e.message}`, 'ERROR'); if (!responded) { responded = true; res.writeHead(502); res.end('Proxy error: ' + e.message); } });
    proxyReq.on('timeout', () => { if (!responded) { proxyReq.destroy(); responded = true; res.writeHead(504); res.end('Proxy timeout'); } });
    req.on('error', (e) => { log(`Client error: ${e.message}`, 'ERROR'); proxyReq.destroy(); });
    req.pipe(proxyReq, { end: true });
  } catch (e) {
    log(`Server error: ${e.message}`, 'ERROR');
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Server error');
    }
  }
}).listen(PORT, () => {
  const ip = getNetworkIp();
  const channelCount = readChannels().length;
  showBanner(ip, channelCount, headerRules.length);
});
