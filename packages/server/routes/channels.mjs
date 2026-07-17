import fs from 'fs';
import path from 'path';

const CHANNELS_FILE = path.resolve('channels.json');

export function readChannels() {
  try {
    const raw = fs.readFileSync(CHANNELS_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

export function writeChannels(channels) {
  channels.sort((a, b) => (a.channelNumber || 999) - (b.channelNumber || 999));
  fs.writeFileSync(CHANNELS_FILE, JSON.stringify(channels, null, 2) + '\n', 'utf8');
}

export function exportM3u() {
  const channels = readChannels();
  let m3u = '#EXTM3U\n';
  for (const ch of channels) {
    const num = ch.channelNumber || '';
    let attrs = `tvg-name="${escapeM3u(ch.name)}" channel-number="${num}" group-title="${escapeM3u(ch.group || '')}"`;
    if (ch.useProxy !== false && ch.proxyUrl) {
      attrs += ` proxy="${escapeM3u(ch.proxyUrl)}"`;
    }
    m3u += `#EXTINF:-1 ${attrs},${escapeM3u(ch.name)}\n`;
    if (ch.drm && ch.drm.keyId && ch.drm.key) {
      m3u += '#KODIPROP:inputstream=inputstream.adaptive\n';
      m3u += '#KODIPROP:inputstream.adaptive.manifest_type=mpd\n';
      m3u += '#KODIPROP:inputstream.adaptive.license_type=clearkey\n';
      m3u += `#KODIPROP:inputstream.adaptive.license_key=${escapeM3u(ch.drm.keyId)}:${escapeM3u(ch.drm.key)}\n`;
    }
    m3u += ch.url + '\n';
  }
  return m3u;
}

function escapeM3u(s) {
  return String(s).replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

export function registerChannelsRoutes(router) {
  router.get('/api/channels', (req, res) => {
    router.serveJson(res, readChannels());
  });

  router.get('/api/playlist.m3u', (req, res) => {
    const m3u = exportM3u();
    res.writeHead(200, {
      'Content-Type': 'audio/x-mpegurl; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Content-Disposition': 'attachment; filename="playlist.m3u"',
    });
    res.end(m3u);
  });

  router.post('/api/channels', async (req, res) => {
    const body = await router.readBody(req);
    const channel = JSON.parse(body);
    const channels = readChannels();
    channels.push(channel);
    writeChannels(channels);
    router.log(`Added #${channels.length} "${channel.name}"`, 'CHANNEL');
    router.serveJson(res, channel, 201);
  });

  router.put('/api/channels/:id', async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const body = await router.readBody(req);
    const update = JSON.parse(body);
    const channels = readChannels();
    if (id < 0 || id >= channels.length) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    channels[id] = { ...channels[id], ...update };
    writeChannels(channels);
    router.log(`Updated #${id} "${update.name}"`, 'CHANNEL');
    router.serveJson(res, channels[id]);
  });

  router.delete('/api/channels/:id', (req, res) => {
    const id = parseInt(req.params.id, 10);
    const channels = readChannels();
    if (id < 0 || id >= channels.length) {
      res.writeHead(404); res.end('Not found');
      return;
    }
    const removed = channels.splice(id, 1)[0];
    writeChannels(channels);
    router.log(`Deleted #${id} "${removed.name}"`, 'CHANNEL');
    res.writeHead(204, router.corsHeaders());
    res.end();
  });
}
