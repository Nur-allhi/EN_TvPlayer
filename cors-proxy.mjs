import http from 'http';
import https from 'https';
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

function log(message) {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const line = `[${ts}] ${message}`;
  console.log(line);
  logStream.write(line + '\n');
}

// ── Header Rules ───────────────────────────────────────────────
const headerRulesFile = path.resolve('header-rules.json');
let headerRules = [];
try {
  if (fs.existsSync(headerRulesFile)) {
    const raw = fs.readFileSync(headerRulesFile, 'utf8');
    headerRules = JSON.parse(raw).map(r => ({ ...r, _re: new RegExp(r.match, 'i') }));
    log(`Loaded ${headerRules.length} header rule(s) from header-rules.json`);
  } else {
    log('No header-rules.json found — using default headers only');
  }
} catch (e) {
  log(`WARN failed to load header-rules.json: ${e.message}`);
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
          log(`PLAYER ${data.level || 'INFO'} ${data.message}`);
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
      log(`CHANNELS added "${channel.name}" (${channels.length} total)`);
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
      log(`CHANNELS updated #${id} "${update.name}"`);
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
      log(`CHANNELS deleted #${id} "${removed.name}"`);
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
    // Player app (built dist)
    if (rawPath === '/' || rawPath.startsWith('/assets/') || rawPath.startsWith('/src/')) {
      let filePath;
      if (rawPath === '/' || rawPath === '/index.html') {
        filePath = path.resolve('dist/index.html');
      } else {
        filePath = path.resolve(rawPath.slice(1));  // strips leading /
      }
      serveStatic(res, filePath);
      return;
    }

    // ── CORS Proxy ──────────────────────────────────────────
    // Use req.url.slice(1) directly — must NOT go through URL.parse because
    // that collapses // in paths like /http://host/stream → /http:/host/stream
    const target = rawUrl.slice(1);
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      // If nothing matched, show a helpful index
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<!DOCTYPE html>
<html><head><title>TV Server</title>
<style>body{font-family:sans-serif;background:#0d1117;color:#c9d1d9;padding:40px;text-align:center}a{color:#58a6ff}</style>
<body>
<h1>TV Server Running</h1>
<p><a href="/manage">Channel Manager</a></p>
<p><a href="/">Player</a></p>
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

    log(`PROXY ${method} ${url.hostname}${url.pathname.slice(0, 80)} → Origin: ${cleanHeaders['origin']} Referer: ${cleanHeaders['referer']}`);

    let responded = false;

    req.setTimeout(30000, () => { log(`TIMEOUT request ${url.hostname}`); req.destroy(); });
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
        log(`PROXY 403 on ${url.hostname}${url.pathname.slice(0, 60)} → ${JSON.stringify(respHeaders)}`);
      } else if (proxyRes.statusCode >= 500) {
        log(`PROXY ${proxyRes.statusCode} on ${url.hostname}${url.pathname.slice(0, 60)}`);
      }
      res.writeHead(proxyRes.statusCode, {
        'Access-Control-Allow-Origin': '*',
        ...Object.fromEntries(
          Object.entries(proxyRes.headers).filter(([k]) => !/^access-control-allow-origin$/i.test(k))
        ),
      });
      proxyRes.on('error', (e) => { if (e.message === 'aborted') return; log(`PROXY response error: ${e.message}`); res.destroy(); });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (e) => { if (e.message.includes('certificate')) return; log(`PROXY error: ${e.message}`); if (!responded) { responded = true; res.writeHead(502); res.end('Proxy error: ' + e.message); } });
    proxyReq.on('timeout', () => { proxyReq.destroy(); if (!responded) { responded = true; res.writeHead(504); res.end('Proxy timeout'); } });
    req.on('error', (e) => { log(`REQ error: ${e.message}`); proxyReq.destroy(); });
    req.pipe(proxyReq);
  } catch (e) {
    log(`SERVER error: ${e.message}`);
    if (!res.headersSent) {
      res.writeHead(500);
      res.end('Server error');
    }
  }
}).listen(PORT, () => log(`TV Server running on http://localhost:${PORT}`));
