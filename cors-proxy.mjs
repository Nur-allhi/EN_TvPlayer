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
// Load header-rules.json — an array of { name, match (regex), headers }.
// First matching rule wins; if none matches, fall back to default behavior.
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
  // fallback: set origin/referer to the target domain
  if (!cleanHeaders['origin']) cleanHeaders['origin'] = url.protocol + '//' + url.hostname;
  if (!cleanHeaders['referer']) cleanHeaders['referer'] = url.protocol + '//' + url.hostname + '/';
  log('  └─ no rule matched, using fallback headers');
  return null;
}
// ──────────────────────────────────────────────────────────────

// Accept self-signed certs (common for CDNs behind MITM proxies and dev setups)
const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 50 });

http.createServer((req, res) => {
  // Player log endpoint — receives JSON log events from the browser
  if (req.url === '/log' && req.method === 'POST') {
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
  if (req.url === '/log' && req.method === 'OPTIONS') {
    res.writeHead(204, { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type' });
    res.end();
    return;
  }

  const target = req.url.slice(1);
  if (!target.startsWith('http://') && !target.startsWith('https://')) {
    res.writeHead(400);
    res.end('Usage: GET /<target-url>');
    log(`BAD_REQUEST ${req.url}`);
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

  log(`PROXY ${req.method} ${url.hostname}${url.pathname.slice(0, 80)} → Origin: ${cleanHeaders['origin']} Referer: ${cleanHeaders['referer']}`);

  let responded = false;

  req.setTimeout(30000, () => { log(`TIMEOUT request ${url.hostname}`); req.destroy(); });
  const proxyReq = mod.request(target, { method: req.method, agent: url.protocol === 'https:' ? httpsAgent : undefined, headers: { ...cleanHeaders, host: url.hostname }, timeout: 15000 }, (proxyRes) => {
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
}).listen(PORT, () => log(`CORS proxy running on http://localhost:${PORT}`));
