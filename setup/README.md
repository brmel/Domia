# Setup & Start

Cross-platform scripts to install Domia and launch it. Everything below works on
**macOS, Windows, and Linux** — the `.sh`/`.cmd` wrappers just call the shared
Node scripts (`setup.mjs`, `start.mjs`), so behaviour is identical everywhere.

## Prerequisites

- **Node.js 18 or newer** — https://nodejs.org
- A **Google Gemini API key** — https://aistudio.google.com/apikey

## 1. Setup (once)

Installs dependencies (`npm ci`), installs the Playwright Chromium browser
(on Linux with its system libraries — may prompt for sudo once), clears stale
build output, and creates a local `.env`.

| OS | Command |
|----|---------|
| macOS / Linux | `bash setup/setup.sh` |
| Windows | `setup\setup.cmd` (or double-click it) |
| Any | `npm run setup` |

Then open `.env` and set `GOOGLE_API_KEY=<your key>`.

## 2. Start

| Target | macOS / Linux | Windows | Any |
|--------|---------------|---------|-----|
| Desktop app | `bash setup/start.sh` | `setup\start.cmd` | `npm run dev` |
| CLI run | `bash setup/start.sh cli -- run --url <url> --prompt "<goal>"` | `setup\start.cmd cli -- run --url <url> --prompt "<goal>"` | `npm run cli -- run ...` |
| HTTP server | `bash setup/start.sh server` | `setup\start.cmd server` | `npm run server` |

## 3. Package a distributable

Builds a native installer for the current OS via electron-builder
(`.dmg` on macOS, `.exe`/NSIS on Windows, `AppImage`/`.deb` on Linux):

```
npm run package
```

## Verify the install

```
npm run doctor             # fast health check: Node, deps, Chromium, API key
```

Full gates (what CI runs):

```
npm run typecheck          # 0 errors
npm run check:architecture # boundaries intact
npm test                   # e2e suite (real browser + DB)
```
