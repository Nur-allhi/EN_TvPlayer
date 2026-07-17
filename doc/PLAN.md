# IPTV Player — TV Mode Build

> **Superseded by `IMPLEMENTATION_PLAN.md` in this folder for the v0.1 architecture.**
> This file is kept for reference of the original Tizen TV Mode build.

## Goal
A lightweight, optimized version of the IPTV player designed for Samsung Smart TV browsers (Tizen). Minimal footprint, low CPU/RAM usage, remote control friendly.

## Build Results
| Component | Size | Gzipped |
|---|---|---|
| App code (ui/player/remote) | 6.86 KB | 2.97 KB |
| CSS | 2.17 KB | 0.87 KB |
| HTML | 1.37 KB | 0.58 KB |
| **Shaka Player** | 812.86 KB | 268.23 KB |
| **Total** | **~823 KB** | **~273 KB** |

---

## Tech Stack

| Component | Current App | TV Mode |
|---|---|---|
| Framework | React (~40KB) | Vanilla JS (0KB) |
| UI Library | React DOM | Plain DOM manipulation |
| Player | Shaka Player (~350KB) | Shaka Player (kept, but optimized) |
| Backend | Firebase (~200KB) | None — static JSON config |
| Build Tool | Vite | Vite (minimal config) |
| Bundle Size | ~600KB+ | ~150KB gzipped |

## Architecture

```
C:\Dev_Projects\IPTV\tv\
├── PLAN.md                 # This file
├── cors-proxy.mjs          # Standalone CORS proxy
├── index.html              # Single entry point
├── src/
│   ├── main.js             # App init, routing
│   ├── player.js           # Shaka Player wrapper (optimized)
│   ├── ui.js               # DOM manipulation (no framework)
│   ├── channels.js         # Channel list from static JSON
│   ├── remote.js           # Samsung remote control handler
│   ├── styles.css          # Minimal dark theme CSS
│   └── config.js           # App config (proxy URL, defaults)
├── channels.json           # Static channel list (exported from Firebase)
├── package.json
├── vite.config.js          # Minimal Vite config
└── dist/                   # Production build output
```

## Design Principles

1. **Single HTML file** — Everything loads from one page
2. **No SPA routing** — Just one view (player + channel sidebar)
3. **No animations** — Pure DOM updates
4. **No popups/modals** — Everything inline
5. **Dark theme only** — Black background, minimal colors
6. **Hardware decoding** — Let the TV chip do the work
7. **Low memory** — Small buffers, minimal caching

## UI Layout

```
┌─────────────────────────────────────────────┐
│  ┌──────────┐                               │
│  │ Channel  │  ┌─────────────────────────┐  │
│  │   List   │  │                         │  │
│  │          │  │     VIDEO PLAYER        │  │
│  │ > Ch 1   │  │                         │  │
│  │   Ch 2   │  │                         │  │
│  │   Ch 3   │  └─────────────────────────┘  │
│  │   Ch 4   │  Ch Name    Resolution  Live  │
│  │   Ch 5   │                               │
│  └──────────┘                               │
│           Samsung Remote: ▲▼ Select  ◄ Back │
└─────────────────────────────────────────────┘
```

- Channel list on left (scrollable with remote)
- Video player takes remaining space
- Current channel info at bottom
- No menus, no settings, no admin panel

## Remote Control Mapping

| Remote Button | Action |
|---|---|
| ▲ / ▼ | Navigate channel list |
| ◄ / ► | Volume up/down (TV native) |
| Enter / OK | Select channel, play |
| Return / Back | Toggle channel list overlay |
| Play/Pause | Toggle playback |
| Number keys (0-9) | Jump to channel by number |
| Color buttons | Reserved for future |

## Implementation Phases

### P1 — Scaffold & Static Channel List
- [ ] Create project structure
- [ ] Minimal Vite config (vanilla JS, no React)
- [ ] `channels.json` — static channel list (manual export from Firebase or fetched from a URL)
- [ ] Basic HTML skeleton
- [ ] Dark theme CSS

### P2 — Video Player
- [ ] Integrate Shaka Player (optimized config)
- [ ] Low-power buffer settings:
  ```
  bufferingGoal: 30      (was 120)
  rebufferingGoal: 3     (was 5)
  bufferBehind: 10       (was 30)
  segmentPrefetchLimit: 5 (was 10)
  ```
- [ ] Auto-detect format (HLS/DASH) from URL
- [ ] DRM support (clearKeys for encrypted streams)

### P3 — Channel List UI
- [ ] Render channel list from `channels.json`
- [ ] Highlight currently playing channel
- [ ] Scroll with remote ▲/▼
- [ ] Select with Enter/OK
- [ ] Show current channel name + resolution at bottom

### P4 — Remote Control
- [ ] Key event listener (`keydown` on `document`)
- [ ] Map Samsung remote keys (keyCodes)
- [ ] Channel navigation (▲/▼)
- [ ] Channel selection (Enter)
- [ ] Back button (toggle sidebar)
- [ ] Number key input for direct channel jump

### P5 — CORS Proxy Integration
- [ ] Configurable proxy URL in `config.js`
- [ ] Default: `http://<PC_IP>:8080/`
- [ ] Proxy wrapping logic (same as main app)
- [ ] Skip proxy for channels with `useProxy: false`

### P6 — Optimization & Build
- [ ] Tree-shake Shaka Player (import only needed modules)
- [ ] Minify CSS (no unused rules)
- [ ] Gzip/brotli compression
- [ ] Lighthouse audit for TV performance
- [ ] Test on Samsung TV browser

### P7 — Advanced Features (Optional)
- [ ] EPG (Electronic Program Guide) — if needed
- [ ] Favorite channels
- [ ] Auto-retry on stream failure
- [ ] Last-watched channel memory (localStorage)

## Channels Data Format

Static `channels.json` (exported from Firebase):

```json
[
  {
    "name": "BBC News HD",
    "url": "http://example.com/live/bbcnews.m3u8",
    "channelNumber": 1,
    "useProxy": true,
    "drm": null
  },
  {
    "name": "Discovery HD",
    "url": "http://example.com/live/discovery.m3u8",
    "channelNumber": 2,
    "useProxy": true,
    "drm": {
      "keyId": "abcdef1234567890",
      "key": "1234567890abcdef1234567890abcdef"
    }
  }
]
```

## Shaka Player Config (Optimized for TV)

```js
{
  streaming: {
    bufferingGoal: 30,
    rebufferingGoal: 3,
    bufferBehind: 10,
    segmentPrefetchLimit: 5,
    startAtSegmentBoundary: true,
    retryParameters: {
      maxAttempts: 3,
      baseDelay: 1000,
      backoffFactor: 2,
      fuzzFactor: 0.5,
      timeout: 15000,
    },
  },
  abr: {
    enabled: true,
    switchInterval: 5,
    bandwidthUpgradeTarget: 0.6,
    bandwidthDowngradeTarget: 0.9,
    defaultBandwidthEstimate: 5000000,
  },
  manifest: {
    hls: {
      ignoreManifestProgramDateTime: true,
    },
  },
}
```

## Samsung TV Browser Constraints

| Constraint | Impact | Mitigation |
|---|---|---|
| **WebKit engine** (not Chromium) | Some JS features missing | Use ES2015 target, no optional chaining |
| **Limited RAM** (~1-2GB shared) | Large buffers cause crashes | Small buffer sizes (30s max) |
| **Slow CPU** (ARM, 1-2 cores) | Software decoding fails | Hardware decoding via MSE |
| **No Web Crypto API** (older Tizen) | AES-128 HLS fails | Skip encrypted HLS or use PlayReady |
| **No service workers** | No offline support | Accept — live TV needs network anyway |
| **No localStorage limit awareness** | Storage may be full | Use sessionStorage or nothing |
| **Remote control only** | No keyboard/mouse | Full remote mapping required |

## CORS Proxy on Local Network

The proxy runs on your PC. The TV accesses it via your PC's local IP:

```
TV Browser → http://192.168.x.x:8080/http://stream-server.com/live.m3u8
                ↓
           Your PC (proxy)
                ↓
           Stream Server
```

- Ensure PC firewall allows port 8080
- Both TV and PC on same network
- Proxy started with `node cors-proxy.mjs`

## Serving the Build

After building, serve the `dist/` folder with a simple HTTP server:

```bash
# Using Node.js
npx serve dist -l 3000

# Or using Python
cd dist && python -m http.server 3000
```

TV accesses: `http://192.168.x.x:3000`

## Testing Checklist

- [ ] App loads on Samsung TV browser
- [ ] Channel list renders correctly
- [ ] Remote ▲/▼ navigates channels
- [ ] Enter selects and plays channel
- [ ] HLS streams play smoothly
- [ ] DASH streams play smoothly
- [ ] DRM channels decrypt correctly
- [ ] No memory leaks after 30 min playback
- [ ] Channel switching is fast (< 3 seconds)
- [ ] Back button toggles sidebar
- [ ] No console errors
