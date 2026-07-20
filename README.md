# EN IPTV Player

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tizen](https://img.shields.io/badge/Tizen-5.0+-red?logo=samsung)](packages/tizen/)
[![Node](https://img.shields.io/badge/Node-18+-green?logo=node.js)](package.json)

**Open-source IPTV player for Samsung Tizen TVs and desktop browsers.** Powered by Shaka Player with a local CORS proxy server.

<p align="center">
  <i>Browse channels, play live TV, manage playlists — all from your Samsung TV remote.</i>
</p>

---

## Features

- **Samsung TV native** — Install as a `.wgt` app via Developer Mode
- **Remote control friendly** — Full Samsung remote key mapping
- **HLS / DASH / MSS** — All formats via Shaka Player
- **DRM support** — ClearKey, PlayReady
- **Built-in CORS proxy** — Bypass streaming CDN restrictions
- **Channel management** — JSON & M3U playlist support
- **Local network only** — No external servers or cloud dependencies

---

## Quick Start (Samsung TV)

```bash
# 1. Install dependencies
npm install

# 2. Generate Tizen developer certificate (one-time)
node packages/tizen/spec/generate-cert.mjs

# 3. Build the player + package as WGT
npm run tizen

# 4. Start server + proxy on your PC
npm start

# 5. Install on TV (replace with your TV IP)
node packages/tizen/spec/install.mjs --ip=192.168.x.x
```

> **Prerequisites:** Node.js 18+, [OpenSSL](https://slproweb.com/products/Win32OpenSSL.html), Samsung Developer Mode app running on TV.

---

## Requirements

### For Tizen TV
| Item | Details |
|---|---|
| Samsung Smart TV | Tizen 5.0+ (2019+ models) |
| Developer Mode app | Install from Samsung Smart Hub → Apps → Search "Developer Mode" |
| PC with Node.js | Windows, macOS, or Linux |
| Network | TV and PC on the same local network |

### For Desktop Browser
| Browser | Notes |
|---|---|
| Chrome / Edge | Best support |
| Firefox | May need CORS adjustments |
| Safari | Limited HLS support |

---

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    Your PC (Local Network)                │
│                                                          │
│  :5000 (Server)            :5001 (Proxy)                 │
│  ┌─────────────────┐      ┌──────────────────┐          │
│  │ Channel API      │      │ Pure CORS proxy  │          │
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

## Installation (Step by Step)

### 1. Generate Tizen Certificate

```bash
node packages/tizen/spec/generate-cert.mjs
```

This creates `author-cert.p12`, `distributor-cert.p12`, and `profile.xml` in `packages/tizen/`. Keep these files — reuse them for future builds.

### 2. Build the WGT Package

```bash
npm run build       # Build player SPA
npm run tizen       # Package as .wgt
```

Output: `packages/tizen/IPTV-Player.wgt`

### 3. Install on TV

**Option A — Developer Mode (recommended)**
1. On TV: Apps → Search "Developer Mode" → Install & enable → Note the IP
2. Run: `node packages/tizen/spec/install.mjs --ip=<TV_IP_ADDRESS>`
3. App appears in Apps → My Apps

**Option B — USB**
1. Copy `IPTV-Player.wgt` to USB drive
2. TV: Settings → Support → Device Care → Self Diagnosis → USB (wgt)
3. Select the `.wgt` file to install

### 4. Start the Server + Proxy

```bash
npm start
```

Or individually:
```bash
npm run server       # Channel API on :5000
npm run proxy        # CORS proxy on :5001
```

### 5. Open on TV

Open Apps → My Apps → **IPTV Player**. First launch takes a few seconds.

---

## Desktop / Browser Usage

```bash
npm install
npm start
```

Then open:
| URL | Page |
|---|---|
| `http://localhost:5000` | Landing page |
| `http://localhost:5000/enplayer` | IPTV Player |
| `http://localhost:5000/manage` | Channel Manager |

---

## Configuration

### Channel Data (`channels.json`)

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

### Environment Variables

| Variable | Default | Description |
|---|---|---|
| `VITE_PROXY_URL` | `/proxy/` | CORS proxy URL for player |

---

## Troubleshooting

| Problem | Solution |
|---|---|
| TV "Invalid certificate" | Delete `*.p12` + `profile.xml`, re-run `generate-cert.mjs` |
| App not in My Apps | Restart TV, check Developer Mode is enabled |
| Video won't play | Ensure `npm start` is running on PC, TV & PC on same network |
| Channel list empty | Configure playlist URL in Settings → Channel Source |
| Install fails | Check TV and PC are on same network, Developer Mode is active |
| 403 on streams | The proxy handles most CDN blocks — check header-rules.json |

---

## Project Structure

```
tv/
├── packages/
│   ├── server/         Channel API + static files (port 5000)
│   ├── proxy/          CORS proxy (port 5001)
│   ├── player/         Shaka Player SPA (Vite + localStorage)
│   └── tizen/          WGT build tools + certificates
├── channels.json       Channel database
├── proxies.json        Proxy server list
├── doc/                Developer documentation
└── package.json        npm workspaces root
```

---

## Development

```bash
npm run dev          # Vite dev server for player SPA
npm run build        # Build player for production
npm run tizen        # Build WGT package for Tizen
```

---

## License

MIT — see [LICENSE](LICENSE).

---

## Links

- [Tizen Build Guide](packages/tizen/README.md) — Detailed instructions for Samsung TV
- [Implementation Plan](doc/IMPLEMENTATION_PLAN.md) — For contributors
