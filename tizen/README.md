# Tizen OS Build — IPTV Player

Packages the IPTV web app into a `.wgt` package installable on your Samsung AU8000 (Tizen 6.0).

## Prerequisites

1. **Node.js** — Already have it (used for the main project)
2. **Samsung Developer Mode app** — Install from Samsung Smart Hub on your TV
   - Go to **Apps** → Search **"Developer Mode"** → Install and enable it
   - Note the IP address shown on TV
3. **A code signing certificate** — We generate a self-signed one below (no Tizen Studio needed)

## Step 1 — Generate Developer Certificate

Run this once to create your Tizen certificate files:

```bash
cd tizen
node spec/generate-cert.mjs
```

This creates:
- `tizen/author-cert.p12` — Your personal developer certificate
- `tizen/distributor-cert.p12` — Distributor certificate
- `tizen/profile.xml` — Signing profile

**The certificate files are important — keep them safe, reuse for future builds.**

## Step 2 — Build the Web App

From the project root:

```bash
npm run build
```

This outputs the production build to `tv/dist/`.

## Step 3 — Package the Tizen .wgt

```bash
cd tizen
node package.mjs
```

This does:
1. Copies everything from `dist/` into `tizen/temp-wgt/`
2. Adds `config.xml` and icons at the correct paths
3. Signs it with your developer certificate
4. Outputs: `tizen/IPTV-Player.wgt`

## Step 4 — Install on TV

### Option A — Via Samsung Developer Mode (simplest)

1. On your TV, open **Developer Mode** app → Note the IP
2. On your PC:
   ```bash
   cd tizen
   node spec/install.mjs --ip <TV_IP_ADDRESS>
   ```
3. The app appears in **Apps** → **My Apps** on your TV

### Option B — Via USB (no network)

1. Copy `IPTV-Player.wgt` to a USB drive
2. On TV: **Settings** → **Support** → **Device Care** → **Self Diagnosis** → **USB (wgt)**
3. Select the `.wgt` file to install

## Step 5 — Run on TV

- Open **Apps** → **My Apps** → **IPTV Player**
- First launch may take a few seconds
- The app connects through the CORS proxy on your PC (same as the browser version)

---

## Build Shortcut (Everything in One Command)

From the project root, run the full build + package pipeline:

```bash
npm run build
cd tizen && node package.mjs && cd ..
```

---

## File Structure

```
tv/
├── dist/                         # Vite build output (gitignored)
├── tizen/
│   ├── README.md                 # This file
│   ├── config.xml                # Tizen web app manifest
│   ├── icons/
│   │   ├── icon_128.png          # App icon (128x128)
│   │   └── icon_192.png          # App icon (192x192)
│   ├── spec/
│   │   ├── generate-cert.mjs     # One-time cert generation script
│   │   └── install.mjs           # Install .wgt to TV via Developer Mode
│   ├── package.mjs               # Build & sign the .wgt
│   ├── profile.xml               # Signing profile (generated)
│   ├── author-cert.p12           # Cert (generated, gitignored)
│   ├── distributor-cert.p12      # Cert (generated, gitignored)
│   └── IPTV-Player.wgt           # Output (generated, gitignored)
├── src/
├── vite.config.js
└── package.json
```

## Troubleshooting

| Problem | Fix |
|---|---|
| TV says "Invalid certificate" | Delete `*.p12` and `profile.xml`, re-run `generate-cert.mjs` |
| App doesn't appear after install | Restart TV, check **Apps** → **My Apps** again |
| Video won't play | Make sure the CORS proxy (`npm run proxy`) is running on your PC |
| Install fails | Ensure TV and PC are on the same network, Developer Mode is enabled |
| .wgt file too large | Shaka Player is ~800KB, total is ~1MB — well under Tizen's 10MB limit |
