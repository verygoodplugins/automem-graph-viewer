# AutoMem Graph Viewer

Standalone graph viewer frontend/runtime for AutoMem.

This repository is the source of truth for the visualizer service. The `automem` API keeps `/viewer` compatibility routes that redirect/bootstrap into this app.

## Requirements

- Node.js 20+
- npm 10+

## Quick Start

```bash
npm ci
npm run dev
```

Build and run production static server:

```bash
npm run build
npm run start
```

Default runtime URL: `http://localhost:3000`

## Environment

Copy `.env.example` and set values as needed:

- `VITE_ENABLE_HAND_CONTROLS=false` (default; opt-in experimental)
- `VITE_API_TARGET=...` for local dev proxy target (optional)
- `VITE_BASE_PATH=/` when building for non-root subpath hosting (optional)

## Deployment

- Railway: uses `railway.toml` and `Dockerfile`
- Runtime server: `server.mjs` serves `dist/` with immutable cache headers on `/assets/*`

## CI and Release

- CI workflow (`.github/workflows/ci.yml`):
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - runtime smoke check (`/` and `/assets/*` cache headers)
- Release Please workflow (`.github/workflows/release-please.yml`):
  - manages version bumps/changelog/releases from conventional commits

## Conventional Commits

Use conventional commits for clean release notes:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `feat!:` / `BREAKING CHANGE:` -> major bump
