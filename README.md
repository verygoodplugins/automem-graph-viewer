# AutoMem Graph Viewer

Standalone graph viewer frontend/runtime for AutoMem.

This repository is the source of truth for the visualizer service. The `automem` API keeps `/viewer` compatibility routes as the canonical entrypoint: the API bootstraps users into this standalone app, preserves URL hash tokens, and passes `server=<automem-origin>` so the browser calls the AutoMem API instead of any Railway-private host.

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

- `VITE_API_TARGET=...` for local dev proxy target (optional)
- `VITE_BASE_PATH=/viewer/` when building for non-root subpath hosting (optional)

Production Railway deployments normally do not need viewer environment variables. The viewer stores only browser-side API config (`automem_server`, `automem_token`) and should never receive database credentials or Railway private-network URLs.

Do not set these on the production viewer service:

- `VITE_API_TARGET` - dev-server proxy target only; production browser API calls use `?server=<automem-origin>` or saved server config
- `VITE_BASE` - not used; the supported build-base variable is `VITE_BASE_PATH`
- `VITE_ENABLE_HAND_CONTROLS` - obsolete; hand controls are runtime UI state

## Deployment

- Recommended Railway source: `ghcr.io/verygoodplugins/automem-graph-viewer:stable`
- Fallback source-linked Railway builds: `railway.toml` uses the repo `Dockerfile`
- Runtime server: `server.mjs` serves `dist/` with immutable cache headers on `/assets/*`

Recommended AutoMem Railway project layout:

| Service | Source | Public? | Notes |
|---|---|---|---|
| `automem` | `ghcr.io/verygoodplugins/automem:stable` | Yes | Owns auth, API routes, data access, and `/viewer/*` bootstrap |
| `automem-graph-viewer` | `ghcr.io/verygoodplugins/automem-graph-viewer:stable` | Yes | Static React/Three.js UI; no DB secrets |
| `mcp-automem` | `ghcr.io/verygoodplugins/mcp-automem:stable` | Yes | Remote MCP bridge for hosted clients |
| `falkordb` | `falkordb/falkordb:latest` | No | Private graph database |
| `qdrant` | `qdrant/qdrant:latest` or Qdrant Cloud | No/External | Vector store |

Set these variables on the `automem` API service after the viewer domain exists:

```bash
GRAPH_VIEWER_URL=https://<viewer-domain>
VIEWER_ALLOWED_ORIGINS=https://<viewer-domain>
```

Browser-to-API traffic must use the API public domain. Railway private domains are only reachable by Railway services, not by code running in a user's browser.

Keep the standalone viewer service served at `/`. Only set `VITE_BASE_PATH=/viewer/` when the built assets are actually served from the AutoMem API origin under `/viewer/`.

## CI and Release

- CI workflow (`.github/workflows/ci.yml`):
  - `npm ci`
  - `npm run lint`
  - `npm run build`
  - runtime smoke check (`/` and `/assets/*` cache headers)
- Release Please workflow (`.github/workflows/release-please.yml`):
  - manages version bumps/changelog/releases from conventional commits
- Docker Build workflow (`.github/workflows/docker-build.yml`):
  - publishes `latest` on `main`
  - publishes version tags and `stable` on release tags such as `automem-graph-viewer-v0.3.0`

## Conventional Commits

Use conventional commits for clean release notes:

- `feat:` -> minor bump
- `fix:` -> patch bump
- `feat!:` / `BREAKING CHANGE:` -> major bump
