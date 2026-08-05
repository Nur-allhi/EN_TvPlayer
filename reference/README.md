# Reference Designs

This folder contains design references used during development.

## Files

| File | Description |
|---|---|
| `settings.html` | Reference design for the settings page layout (two-panel with left nav) |
| `EnTvplayer_icon.svg` | Source SVG for the app icon |

## Usage

These files are for reference only. The actual implementation is in:
- `packages/player/src/settings.js` — Settings page logic
- `packages/player/src/styles.css` — Styles matching the reference
- `packages/tizen/icon.png` — Rendered icon from the SVG

## Design Language

- **Accent color:** `#ED421F` (orange-red)
- **Background:** `#0d1117` (dark)
- **Card background:** `#161b22`
- **Text:** `#fff` primary, `#8b949e` secondary
- **Font:** System UI / One UI Sans
- **Base font size:** 28px (1.4vw responsive)
