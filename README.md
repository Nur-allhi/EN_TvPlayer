# EN IPTV Player

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tizen](https://img.shields.io/badge/Tizen-5.0+-red?logo=samsung)](packages/tizen/)
[![Node](https://img.shields.io/badge/Node-18+-green?logo=node.js)](package.json)
[![Version](https://img.shields.io/badge/version-0.5.0-blue)](.)

**Open-source IPTV player for Samsung Tizen TVs and desktop browsers.** Powered by Shaka Player with a local CORS proxy.

---

## Features

- **Samsung TV native** — Install as `.wgt` app via Developer Mode or USB
- **Remote control friendly** — Full Samsung remote key mapping (DPAD, number pad, color keys)
- **HLS / DASH / MSS** — All streaming formats via Shaka Player
- **DRM support** — ClearKey, PlayReady
- **Per-channel proxy toggle** — Enable/disable CORS proxy per channel from the side menu; setting persists across sessions via localStorage
- **Built-in CORS proxy** — Bypass streaming CDN restrictions with configurable header rules
- **Channel management** — Bulk delete, bulk proxy toggle, import/export (M3U + JSON), add channels via URL or file upload
- **Settings page** — Configure playlist URL, manage channels, import playlists — opens automatically when no channels are loaded
- **Local network only** — No external servers, no cloud, no telemetry

---

## Quick Start

```bash
npm install
npm start
```

Then open `http://localhost:5000/enplayer` in your browser.

For full Tizen TV setup, see [Tizen Build Guide](packages/tizen/README.md).

---

## Per-Channel Proxy Toggle

Some CDNs block cross-origin requests (CORS). When a stream fails to load, a toast suggests enabling the proxy:

1. Open the **right sidebar** (menu button or right arrow on remote)
2. Find the **Proxy** toggle for the current channel
3. Click **Proxy: OFF** → it changes to **Proxy: ON**
4. The channel reloads automatically through the proxy

**Persistence:** Proxy settings are saved to localStorage. On the next session, channels with proxy enabled will continue to route through the proxy automatically.

**Console logging:** Look for `[PROXY] SKIP (proxy off):` or `[PROXY] PROC:` messages to confirm proxy behavior.

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your PC (Local Network)                │
│                                                          │
│  :5000 (Server)            :5001 (Proxy)                 │
│  ┌─────────────────┐      ┌──────────────────┐          │
│  │ Channel API      │      │ CORS proxy       │          │
│  │ Static files     │      │ Header rules     │          │
│  │ Landing page     │      │ Request filter   │          │
│  │ Manage UI        │      └──────────────────┘          │
│  └─────────────────┘              ↑                      │
│         ↑                          │                      │
│         │                          │                      │
│         └──────────┬───────────────┘                      │
│                    │                                      │
│         ┌──────────────────────┐                          │
│         │   IPTV Player SPA    │  ← Samsung TV / Browser  │
│         │ (Shaka + Settings)   │                          │
│         └──────────────────────┘                          │
└─────────────────────────────────────────────────────────┘
```

---

## Project Structure

```
tv/
├── packages/
│   ├── server/         Channel API + static files (port 5000)
│   ├── proxy/          CORS proxy (port 5001) + header rules
│   ├── player/         Shaka Player SPA (Vite + localStorage)
│   └── tizen/          WGT build tools + certificates
├── channels.json       Channel database
├── proxies.json        Proxy server list
├── doc/                Developer documentation
└── package.json        npm workspaces root
```

---

## Configuration

### Channel Data (`channels.json`)

```json
{
  "name": "Channel 1",
  "url": "https://stream.example.com/playlist.m3u8",
  "channelNumber": 1,
  "useProxy": false,
  "proxyUrl": "http://192.168.0.136:5001",
  "drm": { "keyId": "...", "key": "..." }
}
```

Fields:
- `useProxy` — Whether to route through the CORS proxy (can be toggled from the UI)
- `proxyUrl` — Proxy server endpoint (auto-set when proxy is enabled from UI)
- `drm` — Optional DRM configuration

### Proxy Header Rules (`packages/proxy/header-rules.json`)

Customize request/response headers for specific CDN origins:

```json
[
  {
    "match": "amazon.cdn.example.com",
    "response": { "set": { "Access-Control-Allow-Origin": "*" } }
  }
]
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| TV "Invalid certificate" | Delete `*.p12` + `profile.xml`, re-run `generate-cert.mjs` |
| App not in My Apps | Restart TV, check Developer Mode is enabled |
| Video won't play | Try enabling **Proxy** from the right sidebar for that channel |
| "Stream not loading" toast | Open right sidebar → toggle Proxy from OFF to ON |
| Channel list empty | Settings page opens automatically — paste your playlist URL or upload a file |
| Install fails | Check TV and PC are on same network, Developer Mode is active |
| 403 on streams | Enable per-channel proxy or check `header-rules.json` |

---

## Development

```bash
npm run dev          # Vite dev server for player SPA (hot reload)
npm run build        # Build player for production
npm run tizen        # Build WGT package for Tizen TV
npm run server       # Channel API server only
npm run proxy        # CORS proxy only
```

---

## Changelog

### 0.5.0 (2026-07-30)
- Per-channel proxy toggle with localStorage persistence
- CORS proxy suggestion toast on stream failure
- Settings page opens automatically when no channels loaded
- Bulk delete and bulk proxy toggle in channel manager
- M3U + JSON import/export (URL upload + file upload)
- Reduced manifest retry attempts for faster failure feedback
- Centered card modals with responsive fixed width

---

## License

MIT — see [LICENSE](LICENSE).

---

## Links

- [Tizen Build Guide](packages/tizen/README.md) — Detailed instructions for Samsung TV
- [Implementation Plan](doc/IMPLEMENTATION_PLAN.md) — Project roadmap for contributors
