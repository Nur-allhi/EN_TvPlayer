# Contributing to EN IPTV Player

Thank you for your interest in contributing! This document outlines how to contribute effectively.

---

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How to Contribute](#how-to-contribute)
- [Development Setup](#development-setup)
- [Project Structure](#project-structure)
- [Coding Guidelines](#coding-guidelines)
- [Submitting Changes](#submitting-changes)
- [Release Process](#release-process)

---

## Code of Conduct

- Be respectful and constructive
- Welcome newcomers
- Focus on what's best for the community

---

## Getting Started

1. Fork the repository
2. Clone your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/EN_TvPlayer.git
   cd EN_TvPlayer
   ```
3. Install dependencies:
   ```bash
   npm install
   ```
4. Create a feature branch:
   ```bash
   git checkout -b feature/your-feature-name
   ```

---

## How to Contribute

### Reporting Bugs

Before creating a bug report:
- Check if the issue already exists in [Issues](https://github.com/Nur-allhi/EN_TvPlayer/issues)
- Try the latest release version

When reporting a bug, include:
- **Description** — What happened vs. what you expected
- **Steps to reproduce** — Clear steps to trigger the bug
- **Environment** — TV model, browser, OS, app version
- **Screenshots/Logs** — If available

### Suggesting Features

- Open a [Feature Request](https://github.com/Nur-allhi/EN_TvPlayer/issues/new?template=feature_request.md)
- Describe the problem your feature solves
- Explain how it should work

### Code Contributions

- Look for issues labeled `good first issue` or `help wanted`
- Comment on an issue to claim it before starting work
- Keep pull requests focused — one feature/fix per PR

---

## Development Setup

### Prerequisites

- Node.js 18+
- npm 9+
- (Optional) Tizen Studio for TV testing

### Running Locally

```bash
# Start dev server (browser)
npm run dev

# Build for production
npm run build

# Build WGT for Tizen TV
npm run tizen

# Start backend servers
npm start
```

### Testing on TV

1. Enable Developer Mode on your Samsung TV
2. Build the WGT: `npm run tizen`
3. Install using Tizen Studio or USB

---

## Project Structure

```
packages/
├── server/          # Node.js API server (port 5000)
│   └── server.mjs   # Channel API + static file serving
├── proxy/           # CORS proxy (port 5001)
│   └── proxy.mjs    # Streaming CDN proxy with header rules
├── player/          # Frontend SPA (Vite + Shaka Player)
│   └── src/
│       ├── main.js      # App initialization + remote handling
│       ├── player.js    # Shaka Player integration
│       ├── settings.js  # Settings page + focus management
│       ├── remote.js    # Samsung remote key mapping
│       ├── ui.js        # Channel list + sidebar rendering
│       ├── config.js    # Settings + version management
│       └── styles.css   # All styles
└── tizen/           # Tizen WGT packaging
    ├── package.mjs   # Build script
    └── config.xml    # Tizen app manifest
```

---

## Coding Guidelines

### JavaScript

- Use ES modules (`import`/`export`)
- No comments unless absolutely necessary
- Use `const`/`let` — no `var`
- Prefer `async/await` over callbacks
- Use descriptive variable names

### CSS

- Use `vw`/`vh` units for responsive sizing
- Use CSS custom properties for colors
- Mobile-first / TV-first approach
- Keep specificity low

### Commits

Use conventional commit messages:
```
feat: add dark mode toggle
fix: resolve focus loss on save
docs: update installation guide
refactor: simplify proxy logic
```

---

## Submitting Changes

1. **Push** your branch to your fork
2. **Create a Pull Request** to the `dev` branch
3. Fill in the PR template with:
   - Description of changes
   - Screenshots (if UI changes)
   - Testing done
4. Wait for review and address feedback

### PR Checklist

- [ ] Code follows project style
- [ ] No console errors
- [ ] Tested on browser (if applicable)
- [ ] Tested on Tizen TV (if applicable)
- [ ] Documentation updated (if needed)

---

## Release Process

1. Features are merged into `dev` for testing
2. When stable, `dev` is merged into `main`
3. Version is bumped in `package.json`
4. A new git tag is created: `vX.X.X`
5. GitHub Release is published with WGT attached

### Version Numbering

- **MAJOR** — Breaking changes
- **MINOR** — New features
- **PATCH** — Bug fixes

---

## Questions?

- Open a [Discussion](https://github.com/Nur-allhi/EN_TvPlayer/discussions)
- Join the community

Thank you for contributing!
