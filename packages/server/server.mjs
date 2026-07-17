import http from 'http';
import os from 'os';
import fs from 'fs';
import path from 'path';

const PORT = parseInt(process.argv[2], 10) || 5000;

// ── Logging ────────────────────────────────────────────────────
const logsDir = path.resolve('logs');
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

// ── Setup ──────────────────────────────────────────────────────
const router = new Router();

// Register route modules
const { registerChannelsRoutes } = await import('./routes/channels.mjs');
const { registerProxiesRoutes } = await import('./routes/proxies.mjs');
const { registerStaticRoutes } = await import('./routes/static.mjs');

registerChannelsRoutes(router);
registerProxiesRoutes(router);
registerStaticRoutes(router);

process.on('uncaughtException', (err) => {
  log(`UNCAUGHT EXCEPTION: ${err.message}`, 'ERROR');
  log(`  ${err.stack?.split('\n').slice(1, 3).join(' ')}`, 'ERROR');
});
process.on('unhandledRejection', (err) => {
  log(`UNHANDLED REJECTION: ${err?.message || err}`, 'ERROR');
});

function channelCount() {
  try {
    const raw = fs.readFileSync(path.resolve('channels.json'), 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data.length : 0;
  } catch { return 0; }
}

// ── Server ─────────────────────────────────────────────────────
http.createServer(async (req, res) => {
  const rawPath = req.url.indexOf('?') >= 0 ? req.url.slice(0, req.url.indexOf('?')) : req.url;
  const method = req.method;

  // CORS preflight
  if (method === 'OPTIONS') {
    res.writeHead(204, router.corsHeaders());
    res.end();
    return;
  }

  try {
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
}).listen(PORT, () => {
  showBanner(getNetworkIp(), channelCount());
});
