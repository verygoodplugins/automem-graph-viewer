# AGENTS.md

This file provides guidance to coding agents when working with code in this repository.

> This is the single source of truth. `CLAUDE.md` is a one-line `@AGENTS.md` import (Claude Code reads CLAUDE.md, not AGENTS.md, and expands the import in place at launch); every other agent reads this file directly. Put shared guidance here; add Claude-only notes below the import line in `CLAUDE.md`.

## Commands

```bash
npm run dev          # Vite dev server on :5173 (proxies /graph, /recall, /memory, /health to :8001)
npm run dev:all      # Dev server + iPhone hand-tracking bridge together (scripts/dev-all.mjs)
npm run build        # typecheck + Vite build → dist/
npm run start        # Serve dist/ via server.mjs on :3000
npm run lint         # ESLint
npm run typecheck    # tsc -b only
npm run seed         # Seed local DB with test data
npm run seed:reset   # Reset + re-seed
```

There is no test runner — `lint` + `typecheck` (both part of `build`) are the only static gates.

## Architecture

**Stack:** React 18 + TypeScript + Vite SPA. Three.js/R3F for 3D rendering. TanStack Query for data fetching. Tailwind + Radix UI for UI. d3-force-3d for physics simulation.

**Backend dependency:** The app calls a separate AutoMem API (default `http://localhost:8001` in dev). All API calls go through `src/api/client.ts` which reads auth from `localStorage.getItem('automem_token')` or URL params (`?token=`, `#token=`). The `TokenPrompt` component gates the whole app until a token is stored. Endpoints used: `GET /graph/snapshot`, `GET /graph/neighbors/{id}`, `GET /graph/stats`, `GET|PATCH /memory/{id}`, `GET /health`.

**Two deployment modes:**
- Standalone: served at root `/`, token entered via UI
- Embedded: served under `/viewer/` on the AutoMem API origin, token passed via URL hash `#token=xxx`

**Completeness model — focus-and-expand (the central data decision):**
A store can hold 10k–50k memories, but the server hard-caps `/graph/snapshot` at **2,000 rows** (`min(limit, 2000)`), and the physics simulation runs on the main thread (the scaling wall around 2k+ nodes). So the app does **not** try to load everything. Instead:
1. `useGraphSnapshot` (TanStack Query) fetches a bounded **overview** snapshot.
2. `useExpandableGraph` is a reducer holding a **live, growing in-memory graph** layered on top of that immutable snapshot. Clicking/searching a node fetches its neighborhood via `/graph/neighbors/{id}` and **merges** it in. Completeness comes from reachability-by-exploration, not from one giant load.
3. Invariants of that reducer (violating them teleports or collapses the graph): **append-only** — existing node array indices never move (`usePositionInterpolation` keys its Float32 buffers by index and *snaps* on count change); **dedupe by id**; **reset on snapshot-identity change** (new overview size/filter collapses expansions back to the overview — a documented v1 limitation); **every merged node is normalized** to a full snapshot shape so a NaN importance/undefined radius can't poison `forceCollide` / seed math / time-travel scans.

Design rationale lives in `docs/superpowers/specs/`.

**Render data flow:**
1. Snapshot + expansions produce a `GraphSnapshot` (`nodes[]`, `edges[]`, `stats`, `meta.type_colors`).
2. `useForceLayout` runs the d3-force-3d simulation, mutating node x/y/z **in place**; call `reheat()` to restart it.
3. `GraphCanvas` renders the positioned nodes/edges with R3F (`@react-three/fiber`) plus postprocessing bloom/vignette.

**Key component / hook roles:**
- `App.tsx` — root state owner (~1k lines); all filter/force/display config and the gesture toggle live here and pass down
- `GraphCanvas` — the Three.js scene; exposes `onReheatReady` and `onResetViewReady` callbacks to give the parent imperative handles
- `useExpandableGraph` — the append-only in-memory graph that merges expanded neighborhoods (see invariants above)
- `useForceLayout` — wraps d3-force-3d; mutates node x/y/z in place; `reheat()` restarts the sim
- `usePositionInterpolation` — index-keyed Float32 position buffers; the reason index stability matters
- `Inspector` — right-side resizable panel (react-resizable-panels); collapses when `selectedNode` is null
- `SettingsPanel` — right-docked drawer for force physics, display, clustering, relationship visibility

**Hand gesture system:**
Always available at runtime — toggled by a UI button into `gestureControlEnabled` state in `App.tsx` (there is **no** build-time env var or constant gate). Source is MediaPipe Hands by default, with an optional iPhone LiDAR bridge over WebSocket (`scripts/hand-tracking-server.js`, default `:8766`, launched alongside the dev server by `npm run dev:all`). When the toggle is off, hand components still mount but are inert.

**Path aliases:** `@/` → `src/`

## Environment Variables

Copy `.env.example`. Key vars:
- `VITE_API_TARGET` — backend URL for the dev proxy (default `http://localhost:8001`)
- `VITE_BASE_PATH` — set to `/viewer/` when deploying as a subpath (e.g. embedded in AutoMem API)

The dev server proxies `/graph`, `/recall`, `/memory`, and `/health` to `VITE_API_TARGET`.

## Production Server

`server.mjs` is a zero-dependency Node.js HTTP server (no Express). Serves `dist/` with:
- `Cache-Control: immutable` for `/assets/*`
- SPA fallback to `index.html` for all non-asset routes
- Configured via `PORT` and `HOST` env vars

## CI / Release

- `ci.yml`: `npm ci → lint → build` plus a smoke check on cache headers.
- Release Please (`release-please.yml`) manages version bumps/changelog from conventional commits — **never** manually bump `package.json` version.
- `docs-dispatch.yml`: pushes to `main` dispatch a `docs-update` event to `verygoodplugins/automem-website` for files mapped in that repo's `file-doc-map.json`.
- `docker-build.yml` builds the container; Railway deploys via `railway.toml` + `Dockerfile`.
