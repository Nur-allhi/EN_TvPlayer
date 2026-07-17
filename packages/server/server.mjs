import http from 'http';
import https from 'https';
import os from 'os';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PORT = parseInt(process.argv[2], 10) || 5000;
const HTTPS_PORT = parseInt(process.argv[3], 10) || 5443;

// ── Logging ────────────────────────────────────────────────────
const logsDir = path.resolve(__dirname, '..', '..', 'logs');
if (!fs.existsSync(logsDir)) fs.mkdirSync(logsDir, { recursive: true });
const logFile = path.join(logsDir, 'server.log');
const logStream = fs.createWriteStream(logFile, { flags: 'a' });

const ANSI = { reset: '\x1b[0m', dim: '\x1b[2m', cyan: '\x1b[36m', green: '\x1b[32m', yellow: '\x1b[33m', red: '\x1b[31m', blue: '\x1b[34m', magenta: '\x1b[35m', bold: '\x1b[1m' };
const CAT = {
  INFO:    { label: ' INFO ', ansi: ANSI.blue },
  CHANNEL: { label: 'CHANNL', ansi: ANSI.magenta },
  WARN:    { label: ' WARN ', ansi: ANSI.yellow },
  ERROR:   { label: 'ERROR ', ansi: ANSI.red },
};

export function log(message, category = 'INFO') {
  const ts = new Date().toISOString().replace('T', ' ').substring(0, 19);
  const cat = CAT[category] || CAT.INFO;
  const line = `${ts} ${cat.label} │ ${message}`;
  console.log(`${ANSI.dim}${ts}${ANSI.reset} ${cat.ansi}${cat.label}${ANSI.reset} │ ${message}`);
  logStream.write(line + '\n');
}

// ── Router ─────────────────────────────────────────────────────
class Router {
  constructor() {
    this.routes = [];
  }

  _add(method, pattern, handler) {
    const parts = pattern.split('/').filter(Boolean);
    this.routes.push({ method, pattern, parts, handler });
  }

  get(pattern, handler) { this._add('GET', pattern, handler); }
  post(pattern, handler) { this._add('POST', pattern, handler); }
  put(pattern, handler) { this._add('PUT', pattern, handler); }
  delete(pattern, handler) { this._add('DELETE', pattern, handler); }

  match(method, rawPath) {
    const pathParts = rawPath.split('/').filter(Boolean);
    for (const route of this.routes) {
      if (route.method && route.method !== method) continue;
      const params = {};
      let matched = true;
      if (route.parts.length === 1 && route.parts[0] === '*') {
        // Catch-all
        params.wild = pathParts.join('/');
        return { handler: route.handler, params };
      }
      if (route.parts.length !== pathParts.length) {
        // Check if last part is wildcard
        if (route.parts.length > 0 && route.parts[route.parts.length - 1] === '*') {
          const prefixLen = route.parts.length - 1;
          if (pathParts.length < prefixLen) { matched = false; continue; }
          for (let i = 0; i < prefixLen; i++) {
            if (route.parts[i].startsWith(':')) {
              params[route.parts[i].slice(1)] = pathParts[i];
            } else if (route.parts[i] !== pathParts[i]) {
              matched = false; break;
            }
          }
          if (matched) {
            params.wild = pathParts.slice(prefixLen).join('/');
            return { handler: route.handler, params };
          }
        }
        matched = false;
        continue;
      }
      for (let i = 0; i < route.parts.length; i++) {
        if (route.parts[i].startsWith(':')) {
          params[route.parts[i].slice(1)] = pathParts[i];
        } else if (route.parts[i] !== pathParts[i]) {
          matched = false; break;
        }
      }
      if (matched) return { handler: route.handler, params };
    }
    return null;
  }

  log(message, category = 'INFO') {
    return log(message, category);
  }

  serveJson(res, data, status = 200) {
    res.writeHead(status, {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
    });
    res.end(JSON.stringify(data));
  }

  corsHeaders(methods = 'GET, POST, PUT, DELETE, OPTIONS') {
    return {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': methods,
      'Access-Control-Allow-Headers': 'content-type',
    };
  }

  readBody(req) {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', chunk => { body += chunk; });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }
}

// ── Banner ─────────────────────────────────────────────────────
function getNetworkIp() {
  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const iface of ifaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) return iface.address;
    }
  }
  return '127.0.0.1';
}

function showBanner(ip, channelCount) {
  const sep = '─'.repeat(50);
  console.log(`\n${ANSI.bold}╔${sep}╗${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.cyan}${ANSI.bold}EN IPTV — Channel Server${ANSI.reset}           ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╠${sep}╣${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Local:${ANSI.reset}   http://localhost:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Network:${ANSI.reset} http://${ip}:${PORT}              ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Player:${ANSI.reset}  http://${ip}:${PORT}/enplayer      ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Manage:${ANSI.reset}  http://${ip}:${PORT}/manage        ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}M3U:${ANSI.reset}     http://${ip}:${PORT}/api/playlist.m3u ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}                                            ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.dim}Channels:${ANSI.reset} ${channelCount}                          ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╚${sep}╝${ANSI.reset}\n`);
  log(`Listening on http://0.0.0.0:${PORT}`, 'INFO');
  log(`Network: http://${ip}:${PORT}`, 'INFO');
  log(`Player:  http://${ip}:${PORT}/enplayer`, 'INFO');
  log(`Manage:  http://${ip}:${PORT}/manage`, 'INFO');
}

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`, 'ERROR');
  log(`  ${err.stack?.split('\n').slice(1, 3).join(' ')}`, 'ERROR');
});
process.on('unhandledRejection', (err) => {
  log(`UNHANDLED REJECTION: ${err?.message || err}`, 'ERROR');
});

function channelCount() {
  try {
    const raw = fs.readFileSync(path.resolve(__dirname, '..', '..', 'channels.json'), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

// ── Self-signed certificate for HTTPS ──────────────────────────
async function ensureCert() {
  const certDir = path.resolve(__dirname, '..', '..', 'certs');
  if (!fs.existsSync(certDir)) fs.mkdirSync(certDir, { recursive: true });
  const keyPath = path.join(certDir, 'server.key');
  const certPath = path.join(certDir, 'server.cert');
  if (fs.existsSync(keyPath) && fs.existsSync(certPath)) {
    return { key: fs.readFileSync(keyPath, 'utf8'), cert: fs.readFileSync(certPath, 'utf8') };
  }
  log('Generating self-signed certificate for HTTPS...', 'INFO');
  const selfsigned = await import('selfsigned');
  const s = selfsigned.default || selfsigned;
  const attrs = [{ name: 'commonName', value: 'localhost' }, { name: 'organizationName', value: 'EN IPTV' }];
  const pems = await s.generate(attrs, { days: 3650, keySize: 2048, extensions: [{ name: 'subjectAltName', altNames: [{ type: 2, value: 'localhost' }, { type: 7, ip: '127.0.0.1' }] }] });
  fs.writeFileSync(keyPath, pems.private);
  fs.writeFileSync(certPath, pems.cert);
  log('Certificate generated: ' + certPath, 'INFO');
  return { key: pems.private, cert: pems.cert };
}

// ── Handler builder ────────────────────────────────────────────
async function createHandler() {
  const router = new Router();

  const { registerChannelsRoutes } = await import('./routes/channels.mjs');
  const { registerProxiesRoutes } = await import('./routes/proxies.mjs');
  const { registerStaticRoutes } = await import('./routes/static.mjs');

  registerChannelsRoutes(router);
  registerProxiesRoutes(router);
  registerStaticRoutes(router);

  router.post('/log', (req, res) => {
    router.readBody(req).then((body) => {
      try {
        const { level, message } = JSON.parse(body);
        log(`[Player] ${message}`, level === 'ERROR' ? 'ERROR' : 'INFO');
      } catch {}
      res.writeHead(204); res.end();
    });
  });

  const PROXY_TARGET = process.env.PROXY_TARGET || 'http://127.0.0.1:5001';

  return async (req, res) => {
    const rawPath = req.url.indexOf('?') >= 0 ? req.url.slice(0, req.url.indexOf('?')) : req.url;
    const method = req.method;

    if (method === 'OPTIONS') {
      res.writeHead(204, router.corsHeaders());
      res.end();
      return;
    }

    try {
      if (req.url.startsWith('/proxy/')) {
        const targetUrl = req.url.slice('/proxy/'.length);
        if (!targetUrl) { res.writeHead(400); res.end('Missing target URL'); return; }
        const fullUrl = PROXY_TARGET + '/' + targetUrl;
        log(`Proxy: ${targetUrl.slice(0, 80)}...`, 'INFO');
        http.get(fullUrl, (proxyRes) => {
          const headers = { 'Access-Control-Allow-Origin': '*' };
          for (const [k, v] of Object.entries(proxyRes.headers)) {
            if (!['access-control-allow-origin', 'connection', 'keep-alive', 'transfer-encoding'].includes(k)) {
              headers[k] = v;
            }
          }
          res.writeHead(proxyRes.statusCode, headers);
          proxyRes.pipe(res);
        }).on('error', (e) => {
          log(`Proxy error: ${e.message}`, 'ERROR');
          if (!res.headersSent) { res.writeHead(502); res.end('Proxy error: ' + e.message); }
        });
        return;
      }

      const match = router.match(method, rawPath);
      if (match) {
        req.params = match.params;
        req.log = log;
        await match.handler(req, res);
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    } catch (e) {
      log(`Server error: ${e.message}`, 'ERROR');
      if (!res.headersSent) { res.writeHead(500); res.end('Server error'); }
    }
  };
}

// ── Start ──────────────────────────────────────────────────────
async function startServer() {
  const tls = await ensureCert();
  const handler = await createHandler();

  http.createServer(handler).listen(PORT);
  https.createServer(tls, handler).listen(HTTPS_PORT);

  const ip = getNetworkIp();
  const sep = '─'.repeat(50);
  console.log(`\n${ANSI.bold}╔${sep}╗${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.cyan}${ANSI.bold}EN IPTV — Channel Server${ANSI.reset}           ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╠${sep}╣${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Local:${ANSI.reset}   http://localhost:${PORT}               ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}               https://localhost:${HTTPS_PORT}             ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Network:${ANSI.reset} http://${ip}:${PORT}               ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}               https://${ip}:${HTTPS_PORT}             ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Player:${ANSI.reset}  http://${ip}:${PORT}/enplayer       ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}               https://${ip}:${HTTPS_PORT}/enplayer   ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.green}Manage:${ANSI.reset}  http://${ip}:${PORT}/manage         ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}                                            ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}║${ANSI.reset}  ${ANSI.dim}Channels:${ANSI.reset} ${channelCount()}                          ${ANSI.bold}║${ANSI.reset}`);
  console.log(`${ANSI.bold}╚${sep}╝${ANSI.reset}\n`);
  log(`HTTP  → 0.0.0.0:${PORT}`, 'INFO');
  log(`HTTPS → 0.0.0.0:${HTTPS_PORT}`, 'INFO');
  log(`Network: http://${ip}:${PORT}/enplayer`, 'INFO');
  log(`Network: https://${ip}:${HTTPS_PORT}/enplayer`, 'INFO');
  log(`Manage:  http://${ip}:${PORT}/manage`, 'INFO');
}

startServer().catch(e => { console.error('Server startup failed:', e); process.exit(1); });
