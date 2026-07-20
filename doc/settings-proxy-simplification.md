# Settings & Proxy Simplification Plan

## Goal

Simplify the settings UI, remove the confusing global proxy URL / single-channel playback, and make the app rely purely on per-channel `useProxy` / `proxyUrl` properties from the channel management API JSON.

---

## Files Modified

| File | Changes |
|---|---|
| `packages/player/src/settings.js` | Merge sections 1+2 → "Channel Source"; remove sections 3 (Proxy) & 4 (Single Play); remove `handlePlaySingle`, `normalizeProxyUrl`, `deriveProxyUrl`, `refreshLastFetched`; fix M3U `proxy="false"` parser |
| `packages/player/src/main.js` | Fix M3U `proxy="false"` parser (lines 300-301); update `refreshFromApi` to use playlist URL origin instead of `config.apiUrl` |
| `packages/player/src/config.js` | Remove `proxyUrl`, `singleProxyUrl`, `singleUseProxy`, `singleChannelUrl` from defaults; remove `getEffectiveProxyUrl()`, `envProxyUrl`, `proxyUrl` getter, `apiUrl` getter |
| `packages/player/src/player.js` | Rewrite request filter (lines 57-70) — no global `config.useProxy`/`config.proxyUrl` fallback, purely per-channel `useProxy` + `proxyUrl` |

---

## Step-by-Step Implementation

### Step 1 — `config.js`

1. Remove `proxyUrl`, `singleProxyUrl`, `singleUseProxy`, `singleChannelUrl` from `settingsDefaults`
2. Remove `envProxyUrl` constant
3. Remove `getEffectiveProxyUrl()` function
4. Remove `proxyUrl` getter from default export
5. Remove `apiUrl` getter from default export

### Step 2 — `player.js` (request filter)

Remove the global `config.useProxy` gate and `config.proxyUrl` fallback. The filter now reads `useProxy` and `proxyUrl` exclusively from the current channel's data (as provided by the JSON API / M3U parser).

### Step 3 — `main.js` (M3U parser, `parseM3u`)

Fix `proxy="false"` bug: instead of blindly setting `ch.proxyUrl = proxyMatch[1]`, check if the value is `"false"` / `"no"` / `"0"` and set `ch.useProxy = false` instead.

### Step 4 — `main.js` (`refreshFromApi`)

Replace `config.apiUrl` with the playlist URL origin so the refresh fallback works without the proxy-derived API URL.

### Step 5 — `settings.js` (M3U parser, `parseM3u`)

Same fix as Step 3 for the duplicate parser in settings.js.

### Step 6 — `settings.js` (UI)

1. Merge sections 1 (Add Playlist) and 2 (Re-fetch Playlist) into a single **"Channel Source"** section with a playlist URL input + Fetch button + last-fetched status
2. Remove section 3 (Proxy Server) — entire div, URL input, change listener
3. Remove section 4 (Play Single Channel) — entire div, URL input, proxy checkbox, proxy URL input, play button, all listeners
4. Remove functions: `handlePlaySingle()`, `normalizeProxyUrl()`, `deriveProxyUrl()`, `refreshLastFetched()`
5. Remove auto-proxy-URL logic from `handleFetch()` and `handleRefresh()`

---

## Resulting Settings UI

```
┌──────────────────────────────────────┐
│  Settings                            │
│  ───────                             │
│                                      │
│  Channel Source                      │
│  Enter your channel management API   │
│  URL (JSON or M3U).                  │
│                                      │
│  ┌──────────────────────────────────┐│
│  │ https://your-api.com/channels   ││
│  └──────────────────────────────────┘│
│  [Fetch]                             │
│  Last fetched: Just now              │
│                                      │
└──────────────────────────────────────┘
```

---

## Data Flow After Changes

```
Settings → enter API URL → Fetch
  → fetch(URL) → JSON:
     [{ name, url, channelNumber, useProxy: true, proxyUrl: "/proxy/", drm }]
  → stored in localStorage
  → click channel
  → player.js filter:
       currentChannel.useProxy === true ?
         → request.uris[0] = currentChannel.proxyUrl + originalUrl
         → e.g. "/proxy/https://cdn.com/stream.mpd"
       currentChannel.useProxy !== true ?
         → no proxy prefix, fetch directly
```
