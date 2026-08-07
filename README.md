# EN IPTV Player

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Tizen](https://img.shields.io/badge/Tizen-5.0+-red?logo=samsung)](packages/tizen/)
[![Node](https://img.shields.io/badge/Node-18+-green?logo=node.js)](package.json)
[![Version](https://img.shields.io/badge/version-0.8.0-blue)](.)
[![Release](https://img.shields.io/github/v/release/Nur-allhi/EN_TvPlayer)](https://github.com/Nur-allhi/EN_TvPlayer/releases)

**Open-source IPTV player for Samsung Tizen TVs and desktop browsers.** Powered by Shaka Player with a local CORS proxy.

---

## Downloads

| Release | WGT | Date |
|---|---|---|
| **v0.8.0** | [EN-IPTV_Player_stable_0.8.0.wgt](https://github.com/Nur-allhi/EN_TvPlayer/releases/tag/v0.8.0) | 2026-08-07 |
| v0.7.0 | [EN-IPTV_Player_stable_0.7.0.wgt](https://github.com/Nur-allhi/EN_TvPlayer/releases/tag/v0.7.0) | 2026-08-05 |
| v0.6.0 | [EN-IPTV_Player_stable_0.6.0.wgt](https://github.com/Nur-allhi/EN_TvPlayer/releases/tag/v0.6.0) | 2026-07-30 |

> **Note:** WGT files are Samsung Tizen TV application packages. See [Installation](#installation) below.

---

## Features

- **Samsung TV native** — Install as `.wgt` app via Developer Mode or USB
- **Remote control friendly** — Full Samsung remote key mapping (DPAD, number pad, color keys)
- **Intuitive settings page** — Horizontal tab navigation, spatial arrow-key navigation, 10-foot UX design
- **Playlist management** — Add, edit, delete playlists with inline input fields
- **HLS / DASH / MSS** — All streaming formats via Shaka Player
- **DRM support** — ClearKey, PlayReady (including DRM license from MPD URL)
- **Per-channel proxy toggle** — Enable/disable CORS proxy per channel from the side menu; setting persists across sessions via localStorage
- **Built-in CORS proxy** — Bypass streaming CDN restrictions with configurable header rules
- **Channel management** — Bulk delete, bulk proxy toggle, import/export (M3U + JSON), add channels via URL or file upload
- **Local network only** — No external servers, no cloud, no telemetry

---

## Installation

### For Samsung Tizen TV

1. **Enable Developer Mode** on your TV:
   - Go to `Menu` → `Apps` → press `1-2-3-4-5` on your remote
   - Enable "Developer Mode" and enter your PC's IP address
   - Restart the TV

2. **Install the WGT:**
   - Download the `.wgt` file from [Releases](https://github.com/Nur-allhi/EN_TvPlayer/releases)
   - Use [Tizen Studio](https://developer.tizen.org/development/tizen-studio/download) or the `tizen` CLI:
     ```bash
     tizen install -n EN-IPTV_Player.wgt -s <TV_IP_ADDRESS>
     ```
   - Or copy to USB and install manually

3. **Start the app:**
   - Open from "My Apps" on your TV
   - Settings page opens automatically when no channels are loaded

### For Desktop Browser

```bash
git clone https://github.com/Nur-allhi/EN_TvPlayer.git
cd EN_TvPlayer
npm install
npm start
```

Then open `http://localhost:5000/enplayer` in your browser.

---

## Quick Start

```bash
npm install
npm start
```

Then open `http://localhost:5000/enplayer` in your browser.

For full Tizen TV setup, see [Tizen Build Guide](packages/tizen/README.md).

---

## Screenshots

| Player View | Settings Page |
|---|---|
| *Channel list + Video playback* | *Playlist management with tabs* |

> Coming soon: actual screenshots

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
├── reference/          Design references (HTML, SVG)
├── doc/                Developer documentation
├── channels.json       Channel database
├── proxies.json        Proxy server list
├── CONTRIBUTING.md     Contribution guidelines
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

## Development

```bash
npm run dev          # Vite dev server for player SPA (hot reload)
npm run build        # Build player for production
npm run tizen        # Build WGT package for Tizen TV
npm run server       # Channel API server only
npm run proxy        # CORS proxy only
```

### Building for Tizen

```bash
npm run tizen        # Builds, signs, and packages the .wgt file
```

The output WGT file will be at `packages/tizen/EN-IPTV_Player_stable_X.X.X(commit).wgt`

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

## Contributing

We welcome contributions! See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

Ways to contribute:
- Report bugs via [GitHub Issues](https://github.com/Nur-allhi/EN_TvPlayer/issues)
- Suggest features
- Submit pull requests
- Improve documentation

---

## Changelog

### v0.8.0 (2026-08-07)
- **Code cleanup** — Extracted shared utilities (`parseM3u`, `processStreamUrl`, `fetchPlaylist`, `escapeHtml`) into `utils.js`
- **Removed dead code** — Deleted stale test file targeting removed element IDs
- **Documentation** — Updated Tizen build guide to match actual implementation
- **Security** — Removed personal DRM keys from version control, added `channels.json` to `.gitignore`
- **Hardcoded values cleanup** — Removed developer-machine-specific paths from Tizen packaging scripts
- **Stale branches** — Removed 7 merged fix/* branches

### v0.7.0 (2026-08-05)
- **Settings page redesign** — Two-panel layout with left nav + main content, matching Samsung Tizen design guidelines
- **Spatial navigation** — Full arrow-key navigation (up/down/left/right) with zone-aware focus
- **Playlist management** — Add, edit, delete playlists with inline input fields
- **Input focus sync** — Keyboard focus matches visual focus for seamless typing
- **Responsive layout** — Viewport-based sizing, keyboard no longer shrinks the page
- **New app icon** — Custom SVG icon matching the app's design language
- **WGT build naming** — Filename includes version type (stable/beta) and commit hash
- **DRM/CDM fixes** — Correct cleanup order prevents playback stuck on Tizen
- **ClearKey URL parsing** — Extracts DRM license from MPD URL query parameter
- Fixed black screen on Tizen, backspace closing settings, cursor movement in inputs

### v0.6.0 (2026-07-30)
- Per-channel proxy toggle with localStorage persistence
- CORS proxy suggestion toast on stream failure
- Settings page opens automatically when no channels loaded
- Bulk delete and bulk proxy toggle in channel manager
- M3U + JSON import/export (URL upload + file upload)
- Centered card modals with responsive fixed width

---

## License

MIT — see [LICENSE](LICENSE).

---

## Links

- [Releases](https://github.com/Nur-allhi/EN_TvPlayer/releases) — Download WGT files
- [Tizen Build Guide](packages/tizen/README.md) — Detailed instructions for Samsung TV
- [Implementation Plan](doc/IMPLEMENTATION_PLAN.md) — Project roadmap for contributors
- [Contributing Guidelines](CONTRIBUTING.md) — How to contribute
