# EN IPTV Player v0.1 — Implementation Plan

> ⚠️ This document is intended for **contributors and developers**. For user-facing documentation, see the [main README](../README.md).

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        User's Network                               │
│                                                                      │
│  :5000 (HTTPS)                                                       │
│  ┌───────────────────────────────────────────┐                      │
│  │ server.mjs                                │                      │
│  │                                           │                      │
│  │  GET  /                Landing page       │  packages/server/    │
│  │  GET  /enplayer        Player SPA         │                      │
│  │  GET  /manage          Management UI      │                      │
│  │  GET  /api/channels    Channel CRUD       │                      │
│  │  GET  /api/playlist.m3u  M3U export       │                      │
│  │  GET  /api/proxies     Proxy CRUD         │                      │
│  └───────────────────────────────────────────┘                      │
│                                                                      │
│  :5001 (user configurable)                                           │
│  ┌───────────────────────────────────────────┐                      │
│  │ proxy.mjs                                 │  packages/proxy/     │
│  │ Pure CORS proxy — no channel/API logic    │                      │
│  └───────────────────────────────────────────┘                      │
│                                                                      │
│  Player App (hosted anywhere or local SPA)                           │
│  ┌───────────────────────────────────────────┐                      │
│  │ localStorage settings:                     │  packages/player/   │
│  │  • playlistUrl → fetch channels            │                      │
│  │  • channels[] → cached channel list        │                      │
│  │  • Single Channel overlay → URL + proxy    │                      │
│  └───────────────────────────────────────────┘                      │
└─────────────────────────────────────────────────────────────────────┘
```

## Data Storage

| File | Location | Purpose |
|---|---|---|
| `channels.json` | root | All channels with proxy refs + DRM |
| `proxies.json` | root | Named proxy server list (shared) |
| `localStorage` | browser | Player settings: playlist URL, cached channels |

## Player Settings (localStorage — 3 options)

```
┌─────────────────────────────────┐
│ SETTINGS                         │
│                                  │
│ 1. Add Playlist                  │
│    [https://server:5000/api/...] │
│    [ Fetch Playlist ]            │
│                                  │
│ 2. Re-fetch Playlist             │
│    Last fetched: 2 min ago       │
│    [ Refresh Now ]               │
│                                  │
│ 3. Play Single Channel    [⊕]   │
│    URL [________________]        │
│    Use Proxy [✓]                 │
│    Proxy URL [______________]    │
│    [▶ Play]                      │
└─────────────────────────────────┘
```

- **First launch** (localStorage empty) → show Settings page
- **Normal launch** → show cached channel list immediately
- **Right sidebar** → gear icon opens Settings page in main content

## Per-Channel Proxy (from Channel Management)

```
channels.json entry:
{
  "name": "Channel 1",
  "url": "https://stream.example.com/playlist.m3u8",
  "channelNumber": 1,
  "useProxy": true,
  "proxyUrl": "http://192.168.0.136:5001",
  "drm": null
}

proxies.json:
[
  { "id": 1, "name": "Local Proxy", "url": "http://192.168.0.136:5001" },
  { "id": 2, "name": "Cloudflare Worker", "url": "https://proxy.example.com" }
]
```

---

# Phase-by-Phase Implementation

## Phase 1: Monorepo Restructure

**Goal:** Split the monolithic `cors-proxy.mjs` into separate server + proxy packages.

### Steps

1. **Create package directories**
   ```
   packages/server/routes/
   packages/server/public/manage/
   packages/proxy/
   packages/player/src/
   packages/tizen/
   ```

2. **Extract `packages/proxy/proxy.mjs`** — pure CORS proxy only:
   - Remove channel CRUD, static file serving, manage UI routes
   - Keep: proxy logic, header rules, logging, banner
   - Move `header-rules.json` to `packages/proxy/`

3. **Create `packages/server/server.mjs`** — channel API + static files + landing page:
   - Move channel CRUD (read/write channels.json) to `routes/channels.mjs`
   - Move manage UI serving to `routes/static.mjs`
   - Add `routes/proxies.mjs` (CRUD for proxies.json)

4. **Create landing page** `packages/server/public/index.html`:
   - 3 cards: EN Player, Channel Management, Proxy Server
   - Simple dark theme matching manage UI

5. **Move `manage/index.html`** to `packages/server/public/manage/index.html`

6. **Move `src/`** to `packages/player/src/`

7. **Move `tizen/`** to `packages/tizen/`

8. **Create root `package.json`** with npm workspaces

### Commit
```
git commit -m "phase 1: monorepo restructure — split server/proxy/player/tizen packages"
```

---

## Phase 2: Player Settings Page

**Goal:** Configurable player with settings persistence in localStorage.

### Steps

1. **Create `packages/player/src/config.js`** — runtime config, reads localStorage:
   ```js
   const defaults = {
     playlistUrl: '',
     proxyUrl: '',
     channels: [],
     channelsFetched: null
   };

   export function getSettings() {
     try {
       const raw = localStorage.getItem('en_settings');
       return raw ? { ...defaults, ...JSON.parse(raw) } : defaults;
     } catch { return defaults; }
   }

   export function saveSettings(s) {
     localStorage.setItem('en_settings', JSON.stringify(s));
   }
   ```

2. **Create `packages/player/src/settings.js`** — settings page HTML + logic:
   - Renders the 3-section settings panel
   - Handles playlist URL fetch
   - Handles single channel overlay dialog

3. **Update `packages/player/src/main.js`**:
   - First launch → show settings
   - Normal → show cached channels
   - Right sidebar → gear icon → open settings

4. **Add right sidebar settings entry** to `packages/player/src/ui.js`:
   - "⚙ Settings" button at top of sidebar panel

### Commit
```
git commit -m "phase 2: player settings page with localStorage persistence"
```

---

## Phase 3: M3U Support & Proxy Management

**Goal:** Industry-standard M3U playlist + multi-proxy support.

### Steps

1. **M3U export** `routes/channels.mjs`:
   ```
   GET /api/playlist.m3u
   → text/plain
   → #EXTM3U / #EXTINF format
   ```

2. **M3U import** in manage UI:
   - Paste external M3U URL → fetch + parse → copy channels into channels.json
   - Store source URL in channels.json metadata
   - "Sync" button re-fetches and merges

3. **Create `routes/proxies.mjs`**:
   | Method | Path | Description |
   |---|---|---|
   | GET | /api/proxies | List all proxies |
   | POST | /api/proxies | Add proxy |
   | PUT | /api/proxies/:id | Update proxy |
   | DELETE | /api/proxies/:id | Delete proxy |

4. **Update manage UI**:
   - "Proxy Servers" section (add/edit/delete named proxies)
   - Per-channel form: "Use Proxy" toggle + dropdown from proxy list
   - M3U import button

### Commit
```
git commit -m "phase 3: M3U playlist support and proxy management UI"
```

---

## Phase 4: Landing Page & Polish

**Goal:** User-friendly entry point and ship-ready tooling.

### Steps

1. **Create landing page** `packages/server/public/index.html`:
   - 3 cards with icons:
     - ▶ **EN Player** → `/enplayer`
     - ⚙ **Channels** → `/manage`
     - 🔌 **Proxy** → status info + docs link
   - Dark theme, responsive

2. **Update bat scripts**:
   - `Turn_On_TV_server.bat` starts both server + proxy
   - `dev.bat` updated for monorepo paths

3. **Remove old root files**:
   - Delete `cors-proxy.mjs`
   - Delete `index.html` (root player) if superseded
   - Clean up any orphaned files

4. **Rebuild WGT**:
   - `npm run build && node packages/tizen/package.mjs`
   - Baked-in default settings still overridable via localStorage

### Commit
```
git commit -m "phase 4: landing page, bat scripts, cleanup, WGT rebuild"
```

---

## Phase 5: Documentation & Open Source Ready

**Goal:** Community-friendly documentation.

### Steps

1. **README.md**:
   - Project overview
   - Quick start guide
   - Architecture diagram (ASCII)
   - Configuration reference
   - Deployment guide (Vercel/Cloudflare)

2. **Dockerfile** (optional):
   - Docker Compose for server + proxy
   - Environment variables for ports

3. **Contributing guide**

### Commit
```
git commit -m "phase 5: documentation and open source readiness"
```

---

## File Structure (Final)

```
tv/
├── packages/
│   ├── server/
│   │   ├── public/
│   │   │   ├── index.html           Landing page
│   │   │   └── manage/
│   │   │       └── index.html       Channel management app
│   │   ├── routes/
│   │   │   ├── channels.mjs         Channel CRUD + M3U
│   │   │   ├── proxies.mjs          Proxy CRUD
│   │   │   └── static.mjs           Static file serving
│   │   ├── server.mjs              Entry point
│   │   └── package.json
│   ├── proxy/
│   │   ├── proxy.mjs               Pure CORS proxy
│   │   ├── header-rules.json
│   │   └── package.json
│   ├── player/
│   │   ├── public/
│   │   ├── src/
│   │   │   ├── main.js             App entry
│   │   │   ├── player.js           Shaka wrapper
│   │   │   ├── ui.js               Channel list + sidebar
│   │   │   ├── settings.js         Settings page (NEW)
│   │   │   ├── config.js           Runtime config (NEW)
│   │   │   └── remote.js           Remote control
│   │   ├── vite.config.js
│   │   └── package.json
│   └── tizen/
│       ├── package.mjs
│       ├── config.xml
│       └── ... (unchanged)
├── channels.json                   Shared data
├── proxies.json                    Proxy list (NEW)
├── package.json                    Root workspace
├── README.md
└── doc/
    ├── IMPLEMENTATION_PLAN.md      This file
    └── PLAN.md                     Legacy plan
```

## App Data Flow

```
┌─ First Launch ─────────────────────────────┐
│ localStorage empty                           │
│ → Show settings page                         │
│ → User enters Playlist URL → Fetch           │
│ → Server returns channels (JSON or M3U)     │
│ → Cached to localStorage                     │
│ → Show channel list                          │
└──────────────────────────────────────────────┘

┌─ Normal Launch ─────────────────────────────┐
│ localStorage has cached channels             │
│ → Show channel list immediately              │
│ → User can open Settings → Re-fetch          │
│ → User can open Settings → Single Channel    │
└──────────────────────────────────────────────┘

┌─ Channel Playback ──────────────────────────┐
│ User taps channel                            │
│   if channel.useProxy && channel.proxyUrl:   │
│     → prepend proxy URL to stream            │
│   else:                                      │
│     → direct fetch                           │
│ → Play via Shaka Player                      │
└──────────────────────────────────────────────┘
```
