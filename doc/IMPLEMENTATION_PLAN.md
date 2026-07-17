# Dynamic Channels — Implementation Plan

## Goal
One server (`cors-proxy.mjs` + `channels.json`) serves both TV and web apps. Channel management via browser UI. No rebuild for channel changes.

---

## Step 1: Create management UI (`manage/index.html`)

A single HTML+JS page served by the proxy at `/manage`.

**Features:**
- Table listing all channels (name, number, URL, DRM, useProxy)
- **Add** channel button → inline form
- **Edit** button per row → pre-filled inline form  
- **Delete** button per row with confirm
- **Test** button per row → probe channel URL to check if stream is reachable (optional, can skip for now)
- All changes hit REST API immediately
- Live reload after CRUD

**Fields per channel:**
- `name` (text)
- `channelNumber` (number)
- `url` (text, stream URL)
- `useProxy` (checkbox, default true)
- `drm.keyId` (text, optional)
- `drm.key` (text, optional)

---

## Step 2: Add CRUD API routes to `cors-proxy.mjs`

Add route handling at the top of the request handler (before the proxy catch-all):

### Routes

| Method | Path | Body | Response |
|---|---|---|---|
| `GET` | `/api/channels` | — | `200` JSON array of channels |
| `POST` | `/api/channels` | channel object | `201` created channel |
| `PUT` | `/api/channels/:id` | partial/full channel | `200` updated channel |
| `DELETE` | `/api/channels/:id` | — | `204` no content |

### Persistence
- Read/write `channels.json` file synchronously (small file, single-user)
- On write: sort by `channelNumber` before saving
- Keep a backup of the last good state on write errors

### CORS
- `Access-Control-Allow-Origin: *` on all API responses (already the pattern)

### Pre-flight
- Handle `OPTIONS` requests for all API routes

---

## Step 3: Serve static files from `cors-proxy.mjs`

Add static file serving for:
- `/manage` → serves `manage/index.html`
- `/player` or `/` → serves `dist/index.html` (the built app) + assets

**Implementation:**
- Before proxy catch-all, check if the path matches a known static route
- Use `fs.readFileSync` to load and serve the file (with `Content-Type`)
- Cache HTML in memory, reload on file change (or just read each time for simplicity)

### Static routes

| Path | File |
|---|---|
| `/manage` | `./manage/index.html` |
| `/` | `./dist/index.html` |
| `/assets/*` | `./dist/assets/*` |
| `/src/styles.css` | `./src/styles.css` |

This makes the proxy a self-contained server — one process to run everything.

---

## Step 4: Update `src/config.js`

Add `apiUrl` derived from `proxyUrl`:

```js
// Compute API base URL from proxy URL
// TV: proxyUrl = 'http://192.168.0.136:8080/' → apiUrl = 'http://192.168.0.136:8080'
// Dev: proxyUrl = '/proxy/' → apiUrl = '' (use relative /api, proxied by Vite)
apiUrl: (() => {
  if (proxyUrl.startsWith('http')) {
    return new URL(proxyUrl).origin;
  }
  return '';
})(),
```

---

## Step 5: Update `src/main.js`

Replace static import of `channels.json` with async fetch:

```js
// Before: import channelsData from '../channels.json';

// At init time:
async function loadChannels() {
  try {
    const url = config.apiUrl
      ? config.apiUrl + '/api/channels'
      : '/api/channels';
    const resp = await fetch(url);
    if (resp.ok) return await resp.json();
  } catch (e) {
    console.warn('Failed to fetch channels from API, using fallback');
  }
  // Fallback to bundled channels.json
  const { default: fallback } = await import('../channels.json');
  return fallback;
}

// init() becomes async
async function init() {
  // ...
  channels = await loadChannels();
  // ...
}
```

Also add a **"Refresh Channels"** action (triggered by remote button or exposed in UI):

```js
// Expose for remote/UI
export async function refreshChannels() {
  const newChannels = await loadChannels();
  if (newChannels && newChannels.length > 0) {
    channels = newChannels;
    ui.refreshChannelList(channels);
  }
}
```

---

## Step 6: Update `src/ui.js`

Add `refreshChannelList()` to re-render the channel list without restart:

```js
export function refreshChannelList(newChannels) {
  channels = newChannels;
  currentIndex = -1;
  focusedIndex = 0;
  renderChannelList();
  updateFocus();
}
```

---

## Step 7: Update `vite.config.js`

Add `/api` proxy rule in both `server` and `preview` configs:

```js
proxy: {
  '/proxy': { /* existing */ },
  '/log': { /* existing */ },
  '/api': {
    target: 'http://localhost:8080',
    changeOrigin: true,
  },
},
```

---

## Step 8: Create `Turn_On_TV_server.bat`

```bat
@echo off
title TV Server
echo Starting TV Server...
echo.
ipconfig | findstr /i "IPv4"
echo.
echo Management UI: http://localhost:8080/manage
echo Player: http://localhost:8080/
echo.
node cors-proxy.mjs
pause
```

---

## Step 9: Rebuild WGT

```bash
npm run tizen
```

Install the new WGT on TV. After this, channel edits via `/manage` are immediately visible on refresh — no more rebuilds for channel changes.

---

## File Change Summary

| File | Action |
|---|---|
| `manage/index.html` | **Create** — management UI |
| `cors-proxy.mjs` | **Edit** — add API routes + static file serving |
| `src/config.js` | **Edit** — add `apiUrl` |
| `src/main.js` | **Edit** — fetch channels from API, add refreshChannels |
| `src/ui.js` | **Edit** — add refreshChannelList |
| `vite.config.js` | **Edit** — proxy `/api` in dev/preview |
| `Turn_On_TV_server.bat` | **Create** — one-click launcher |

---

## Future Ideas (not planned now)

- Channel import/export (M3U playlist format)
- Auto-reload TV app after channel edit (WebSocket push)
- Channel categories/groups
- EPG data
