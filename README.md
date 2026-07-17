# EN IPTV Player

Open-source IPTV streaming platform for Samsung Tizen TVs and web browsers. Powered by Shaka Player.

```
tv/
├── packages/
│   ├── server/           Channel API + static file server (port 5000)
│   │   ├── routes/       channels.mjs, proxies.mjs, static.mjs
│   │   └── public/       Landing page + manage UI
│   ├── proxy/            Pure CORS proxy (port 5001)
│   ├── player/           Shaka Player SPA (Vite + localStorage settings)
│   └── tizen/            WGT build tools + certs
├── channels.json         Channel database
├── proxies.json          Proxy server list
└── package.json          npm workspaces root
```

## Quick Start

```bash
npm install
npm run start        # Starts server (:5000) + proxy (:5001)
```

Or start individually:

```bash
npm run server       # Channel management + static files on :5000
npm run proxy        # CORS proxy on :5001
```

### Development

```bash
npm run dev          # Vite dev server for player SPA
npm run build        # Build player for production
npm run tizen        # Build WGT package for Tizen TV
```

## Access

| URL | Description |
|---|---|
| `http://localhost:5000` | Landing page |
| `http://localhost:5000/enplayer` | IPTV Player |
| `http://localhost:5000/manage` | Channel Manager |
| `http://localhost:5001` | CORS Proxy |

## Configuration

### Player Settings (localStorage)

On first launch, the player shows a settings page. All settings are stored in `localStorage`:

| Field | Description |
|---|---|
| `playlistUrl` | M3U or JSON playlist URL for channel discovery |
| `channels` | Cached channel array |
| `channelsFetched` | Timestamp of last playlist fetch |
| `singleChannelUrl` | Single channel URL for on-demand playback |
| `singleUseProxy` | Whether to proxy the single channel |

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_PROXY_URL` | `/proxy/` | CORS proxy URL (player dev/build) |

### Data Files

| File | Description |
|---|---|
| `channels.json` | All channels with proxy refs + DRM |
| `proxies.json` | Named proxy server list (shared) |

### Channel Fields

```json
{
  "name": "Channel 1",
  "url": "https://stream.example.com/playlist.m3u8",
  "channelNumber": 1,
  "useProxy": true,
  "proxyUrl": "http://192.168.0.136:5001",
  "drm": { "keyId": "...", "key": "..." }
}
```

## Deployment

### Tizen TV

```bash
npm run tizen                # Build WGT
node packages/tizen/install.mjs --ip=192.168.x.x   # Upload to TV
```

Requires [OpenSSL](https://slproweb.com/products/Win32OpenSSL.html) and Developer Mode app running on the TV.

### Standalone Server

```bash
node packages/server/server.mjs
node packages/proxy/proxy.mjs
```

### Cloudflare Worker (CORS Proxy)

The proxy logic in `packages/proxy/proxy.mjs` can be adapted for Cloudflare Workers — just the request filter and header rules.

## License

MIT
