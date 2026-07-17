import http from 'http';
import https from 'https';
import os from 'os';
import { URL } from 'url';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = parseInt(process.argv[2], 10) || 5001;

const logsDir = path.resolve('logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, 'proxy.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const ANSI = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', bold: '\x1b[1m' };
const CAT = {
  INFO:  { label: ' INFO ', ansi: ANSI.blue },
  PROXY: { label: 'PROXY ', ansi: ANSI.cyan },
  WARN:  { label: ' WARN ', ansi: ANSI.yellow },
  ERROR: { label: 'ERROR ', ansi: ANSI.red },
};

function log(message, category = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const cat = CAT[category] || CAT.INFO;
  const line = `${ts} ${cat.label} │ ${message}`;
  console.log(`${ANSI.dim}${ts}${ANSI.reset} ${cat.ansi}${cat.label}${ANSI.reset} │ ${message}`);
  logStream.write(line + '\n');
}

function getNetworkIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function showBanner(ip, ruleCount) {
  const sep = '─'.repeat(50);
  console.log(`\n${ANSI.bold}╔${sep}╗${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.cyan}${ANSI.bold}EN IPTV — Proxy Server${ANSI.reset}             ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╠${sep}╣${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Local:${ANSI.reset}   http://localhost:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Network:${ANSI.reset} http://${ip}:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  if (ruleCount > 0) console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.dim}Rules:${ANSI.reset}    ${ruleCount}                              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╚${sep}╝${ANSI.reset}\n`);
  log(`Listening on http://0.0.0.0:${PORT}`, 'INFO');
  log(`Network: http://${ip}:${PORT}`, 'INFO');
}

// ── Header Rules ───────────────────────────────────────────────
const headerRulesFile = path.resolve(__dirname, 'header-rules.json');
let headerRules = [];
try {
  if (fs.existsSync(headerRulesFile)) {
    const raw = fs.readFileSync(headerRulesFile, 'utf8');
    headerRules = JSON.parse(raw).map(r => ({ ...r, _re: new RegExp(r.match, 'i') }));
    log(`Loaded ${headerRules.length} header rule(s)`, 'INFO');
  } else {
    log('No header-rules.json found — using default headers only', 'WARN');
  }
} catch (e) {
  log(`Failed to load header-rules.json: ${e.message}`, 'ERROR');
}

function applyHeaderRules(hostname, cleanHeaders, url) {
  for (const rule of headerRules) {
    if (rule._re.test(hostname)) {
      for (const [k, v] of Object.entries(rule.headers)) cleanHeaders[k] = v;
      log(`  └─ matched rule "${rule.name}"`);
      return rule.name;
    }
  }
  if (!cleanHeaders['origin']) cleanHeaders['origin'] = url.protocol + '//' + url.hostname;
  if (!cleanHeaders['referer']) cleanHeaders['referer'] = url.protocol + '//' + url.hostname + '/';
  return null;
}
// ──────────────────────────────────────────────────────────────

const httpsAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true, maxSockets: 50 });

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`, 'ERROR');
  log(`  ${err.stack?.split('\n').slice(1, 3).join(' ')}`, 'ERROR');
});
process.on('unhandledRejection', (err) => {
  log(`UNHANDLED REJECTION: ${err?.message || err}`, 'ERROR');
});

http.createServer(async (req, res) => {
  const rawUrl = req.url;
  const method = req.method;

  if (rawUrl === '/' || rawUrl === '') {
    const ip = getNetworkIp();
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end(`<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>EN Proxy</title>
<style>body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#0d1117;color:#c9d1d9;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0;padding:20px}
.card{text-align:center;max-width:400px}
h1{font-size:24px;margin:0 0 8px 0;color:#fff}
.status{display:inline-block;margin-top:12px;padding:4px 16px;border-radius:20px;background:#23863633;color:#3fb950;font-size:14px}
.url{color:#58a6ff;font-family:monospace;margin:16px 0;font-size:15px}
.hint{color:#8b949e;font-size:13px}
</style></head>
<body><div class="card">
<h1>🔌 Proxy Server</h1>
<div class="status">● Running</div>
<div class="url">http://${ip}:${PORT}</div>
<div class="hint">Configure this URL in the Player or Channel Manager settings.</div>
</div></body></html>`);
    return;
  }

  try {
    const target = rawUrl.slice(1);
    if (!target.startsWith('http://') && !target.startsWith('https://')) {
      res.writeHead(400); res.end('Invalid proxy URL. Usage: http://proxy:PORT/http://target.url/stream');
      return;
    }

    const url = new URL(target);
    const mod = url.protocol === 'https:' ? https : http;
    const blockedHeaders = ['host', 'connection', 'keep-alive'];
    const cleanHeaders = Object.fromEntries(
      Object.entries(req.headers).filter(([k]) => !blockedHeaders.includes(k.toLowerCase()))
    );
    applyHeaderRules(url.hostname, cleanHeaders, url);
    if (!cleanHeaders['user-agent']) {
      cleanHeaders['user-agent'] = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36';
    }

    log(`${method} ${url.hostname}${url.pathname.slice(0, 80)}`, 'PROXY');

    let responded = false;
    req.setTimeout(30000, () => { if (!responded) { log(`Timeout ${url.hostname}`, 'WARN'); req.destroy(); } });

    const proxyReq = mod.request(target, {
      method,
      agent: url.protocol === 'https:' ? httpsAgent : undefined,
      headers: { ...cleanHeaders, host: url.hostname },
      timeout: 15000,
    }, (proxyRes) => {
      responded = true;
      if (proxyRes.statusCode === 403) {
        log(`403 ${url.hostname}${url.pathname.slice(0, 60)}`, 'WARN');
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
    if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
  }
}).listen(PORT, () => {
  const ip = getNetworkIp();
  showBanner(ip, headerRules.length);
});
