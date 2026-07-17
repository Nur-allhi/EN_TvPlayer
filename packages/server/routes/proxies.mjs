import fs from 'fs';
import path from 'path';

const PROXIES_FILE = path.resolve('proxies.json');

export function readProxies() {
  try {
    const raw = fs.readFileSync(PROXIES_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

function writeProxies(proxies) {
  fs.writeFileSync(PROXIES_FILE, JSON.stringify(proxies, null, 2) + '\n', 'utf8');
}

export function registerProxiesRoutes(router) {
  router.get('/api/proxies', (req, res) => {
    router.serveJson(res, readProxies());
  });

  router.post('/api/proxies', async (req, res) => {
    const body = await router.readBody(req);
    const proxy = JSON.parse(body);
    if (!proxy.name || !proxy.url) {
      res.writeHead(400); res.end('name and url required');
      return;
    }
    const proxies = readProxies();
    const id = proxies.length > 0 ? Math.max(...proxies.map(p => p.id)) + 1 : 1;
    proxy.id = id;
    proxies.push(proxy);
    writeProxies(proxies);
    router.log(`Added proxy "${proxy.name}" (${proxy.url})`, 'INFO');
    router.serveJson(res, proxy, 201);
  });

  router.put('/api/proxies/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = await router.readBody(req);
    const update = JSON.parse(body);
    const proxies = readProxies();
    const idx = proxies.findIndex(p => p.id === id);
    if (idx === -1) { res.writeHead(404); res.end('Not found'); return; }
    proxies[idx] = { ...proxies[idx], ...update, id };
    writeProxies(proxies);
    router.log(`Updated proxy #${id}`, 'INFO');
    router.serveJson(res, proxies[idx]);
  });

  router.delete('/api/proxies/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    let proxies = readProxies();
    const idx = proxies.findIndex(p => p.id === id);
    if (idx === -1) { res.writeHead(404); res.end('Not found'); return; }
    const removed = proxies.splice(idx, 1)[0];
    writeProxies(proxies);
    router.log(`Deleted proxy "${removed.name}"`, 'INFO');
    res.writeHead(204, router.corsHeaders());
    res.end();
  });
}
