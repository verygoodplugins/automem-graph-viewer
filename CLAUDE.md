# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Vite dev server on :5173 (proxies /graph, /memory, /health to :8001)
npm run dev:all      # Dev server + runtime server together (scripts/dev-all.mjs)
npm run build        # typecheck + Vite build → dist/
npm run start        # Serve dist/ via server.mjs on :3000
npm run lint         # ESLint
npm run typecheck    # tsc -b only
npm run seed         # Seed local DB with test data
npm run seed:reset   # Reset + re-seed
```

## Architecture

**Stack:** React 18 + TypeScript + Vite SPA. Three.js/R3F for 3D rendering. TanStack Query for data fetching. Tailwind + Radix UI for UI. d3-force-3d for physics simulation.

**Backend dependency:** The app calls a separate AutoMem API (default `http://localhost:8001` in dev). All API calls go through `src/api/client.ts` which reads auth from `localStorage.getItem('automem_token')` or URL params (`?token=`, `#token=`). The `TokenPrompt` component gates the whole app until a token is stored.

**Two deployment modes:**
- Standalone: served at root `/`, token entered via UI
- Embedded: served under `/viewer/` on the AutoMem API origin, token passed via URL hash `#token=xxx`

**Data flow:**
1. `useGraphSnapshot` (TanStack Query) → `fetchGraphSnapshot` → `GET /graph/snapshot`
2. Returns `GraphSnapshot` with `nodes[]`, `edges[]`, `stats`, `meta.type_colors`
3. `useForceLayout` runs d3-force-3d simulation to assign x/y/z positions on nodes in-place
4. `GraphCanvas` renders the positioned nodes/edges using R3F (`@react-three/fiber`) with postprocessing bloom/vignette

**Key component roles:**
- `App.tsx` — root state owner; all filter/force/display config lives here and is passed down
- `GraphCanvas` — the Three.js scene; exposes `onReheatReady` and `onResetViewReady` callbacks to give parent imperative handles
- `Inspector` — right-side resizable panel (react-resizable-panels); collapses when `selectedNode` is null
- `SettingsPanel` — right-docked settings drawer for force physics, display, clustering, relationship visibility
- `useForceLayout` — wraps d3-force-3d; mutates node x/y/z in place; call `reheat()` to restart simulation

**Hand gesture system (opt-in):**
Enabled via `VITE_ENABLE_HAND_CONTROLS=true`. Uses MediaPipe Hands or iPhone LiDAR bridge (WebSocket on `:8766`). The feature tree is gated at `src/App.tsx` via `HAND_CONTROLS_ENABLED` constant. When disabled, all hand-related components still mount but are inert.

**Path aliases:** `@/` → `src/`

## Environment Variables

Copy `.env.example`. Key vars:
- `VITE_API_TARGET` — backend URL for dev proxy (default `http://localhost:8001`)
- `VITE_ENABLE_HAND_CONTROLS` — set `true` to enable MediaPipe gesture UI
- `VITE_BASE_PATH` — set to `/viewer/` when deploying as a subpath (e.g. embedded in AutoMem API)

## Production Server

`server.mjs` is a zero-dependency Node.js HTTP server (no Express). Serves `dist/` with:
- `Cache-Control: immutable` for `/assets/*`
- SPA fallback to `index.html` for all non-asset routes
- Configured via `PORT` and `HOST` env vars

## CI / Release

CI runs `npm ci → lint → build` plus a smoke check on cache headers. Release Please manages version bumps from conventional commits — never manually bump `package.json` version.
