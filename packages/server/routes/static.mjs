import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

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

export function serveStatic(res, filePath) {
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
      res.writeHead(404); res.end('Not found');
    } else {
      res.writeHead(500); res.end('Internal error');
    }
  }
}

export function registerStaticRoutes(router) {
  // Landing page
  router.get('/', (req, res) => {
    serveStatic(res, path.join(PUBLIC_DIR, 'index.html'));
  });

  // Management UI
  router.get('/manage', (req, res) => {
    serveStatic(res, path.join(PUBLIC_DIR, 'manage', 'index.html'));
  });
  router.get('/manage/*', (req, res) => {
    const subPath = req.params.wild || '';
    const filePath = path.join(PUBLIC_DIR, 'manage', subPath);
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      serveStatic(res, path.join(PUBLIC_DIR, 'manage', 'index.html'));
    } else {
      serveStatic(res, filePath);
    }
  });

  // Player SPA (built output)
  router.get('/enplayer', (req, res) => {
    servePlayerApp(res);
  });
  router.get('/enplayer/*', (req, res) => {
    const subPath = req.params.wild || '';
    servePlayerApp(res, subPath);
  });
}

function servePlayerApp(res, subPath) {
  const playerDist = path.resolve('packages/player/dist');
  if (subPath) {
    const filePath = path.join(playerDist, subPath);
    if (fs.existsSync(filePath) && !fs.statSync(filePath).isDirectory()) {
      serveStatic(res, filePath);
      return;
    }
  }
  if (fs.existsSync(path.join(playerDist, 'index.html'))) {
    serveStatic(res, path.join(playerDist, 'index.html'));
  } else {
    res.writeHead(302, { Location: 'http://localhost:5173/' });
    res.end();
  }
}
