# Whole-corpus search — wire the viewer to `/recall` and let any result land in the graph

**Date:** 2026-06-06
**Status:** Approved (brainstormed → advisor-reviewed → user-approved)
**Branch context:** `fix/all-nodes-visible` (search highlights rather than filters; this builds on the search-results sidebar)
**Relates to:** `2026-06-06-search-results-sidebar-spotlight-design.md` (the sidebar this feature now feeds from the server)

## Problem

Searching "bryce-adams" in the viewer returned **2 results**, even though many such memories
were stored the day before. The cause is structural, not cosmetic: **the viewer's search is
100% client-side.** It filters only the ~2,000-node overview snapshot already loaded into the
scene. The store holds ~120,000 memories, so search is blind to ~98.4% of them.

Confirmed against the live production backend: `GET /recall?query=bryce-adams` returns 10+
matches instantly (top hit: *"Bryce Adams: Australian ex-WooCommerce employee, built
Metorik…"*). The viewer showed 2 because only 2 of those happen to sit in the loaded sample.

The deeper issue: the viewer has no way to (a) search the whole store, or (b) jump to a memory
that isn't already on screen. "Find a memory and go to it" — the most basic navigation
primitive — is missing. The real search endpoint (`/recall`) is even proxied in
`vite.config.ts`, but the app never calls it. And the "2 of 2,000" counter reads like
"searched everything," hiding the gap.

## Goal

Make search find the **whole corpus**, and let clicking **any** result — including one not
currently loaded — fetch it, drop it into the graph, fly to it, and explore outward. This is
the natural completion of the focus-and-expand model the viewer already uses. The overview-first
landing and everything else stay as-is.

## Approved decisions

- **Search scope → server-side.** An active search calls `GET /recall?query=…&limit=100`
  (debounced; the SearchBar already debounces 300ms). Results come from the whole store, not
  the loaded snapshot.
- **Click any result → land it in the graph.** If the result is already in the scene, the
  existing gentle fly + frame runs. If it's off-graph, fetch its neighborhood
  (`/graph/neighbors/{id}`) and **merge the center + neighbors as a connected cluster** (not a
  lone dot), then fly to + frame it and open its detail. The Inspector's "Expand into graph"
  remains for going a hop further.
- **Counters tell the truth.** During a text search, the search badge reflects the **server**
  match count across the store (with "100+" when capped), not `matching-local / loaded`. The
  scene's StatsBar continues to report what's *loaded* (returned / total) and switches to a
  filtered count only for **tag** filters (which genuinely are client-side over loaded nodes).
- **Results list trusts the server.** Recall returns semantically-ranked matches that may not
  contain the literal term. The list shows them in backend order and does **not** re-filter
  them by substring; it unions in any local substring matches not already present, deduped by
  id, and marks rows that aren't yet in the graph.

## Why this is mostly reuse

The fly-to-and-frame + expand machinery already exists:

- Setting `selectedNode` triggers the select-to-focus effect (`App.tsx`) that flies + frames
  via `navigateForBookmarksRef`; `pendingFlyRef` gates the dramatic frame.
- `graph.expand` (`useExpandableGraph`) merges + normalizes new nodes — append-only,
  dedupe-by-id, `normalizeNode` coerces every field so a NaN importance / undefined radius
  can't poison the simulation.
- The Inspector already fetches neighbors (`useGraphNeighbors`) and builds the exact expand
  payload `{ centerId, nodes: [center, ...graph_neighbors, ...semantic_neighbors], edges }`.

The only genuinely new work is **server-side search** (`fetchRecall` + `useRecall`) and a
**path to inject an off-graph node** (`handleRemoteResultSelect`) so the existing machinery
takes over.

## Design summary

Three small data additions, then route the existing search UI through them:

1. **`fetchRecall(query, limit)` + `mapRecallResultToNode(result, typeColors)`** in
   `src/api/client.ts`. The mapper turns `result.id` + `result.memory.*` into a `GraphNode`
   via the existing `normalizeNode` (exported from `useExpandableGraph.ts`) so list rows have a
   colour and the later merge stays consistent. `MAX_RECALL = 100` mirrors the backend cap
   (`RECALL_MAX_LIMIT`).
2. **`useRecall(term, typeColors)`** in `src/hooks/useGraphData.ts` — a TanStack query keyed
   `['recall', term]`, enabled on a non-empty term, returning `{ results, count, capped }`.
3. **Routing** in `App.tsx` + `SearchResultsList.tsx`: pass server results to the list; a new
   `handleRemoteResultSelect` injects off-graph results; the counters re-label.

### `handleRemoteResultSelect(node)`

- **In graph** (`visibleNodeIds.has(node.id)`) → existing `handleResultSelect` (gentle fly +
  frame).
- **Off graph** → `queryClient.fetchQuery(['graph','neighbors', id, params])` (same key + params
  the Inspector's `useGraphNeighbors` uses, so the cache dedupes and the Inspector won't
  refetch), then `graph.expand({ centerId: id, nodes: [center, ...neighbors], edges })`, set
  `pendingFlyRef`, and `setSelectedNode(<normalized center>)`. Show a brief loading/disabled
  state on the clicked row; on fetch error, inject the bare node so the click never dead-ends.

### Data shape (pinned live against production)

`GET /recall?query=<q>&limit=<≤100>` → `{ count, results[], query, … }`. Each `result`:

- `result.id` — the memory id (top level).
- `result.memory` — the record: `content, type, importance, confidence, tags, timestamp,
  updated_at, metadata, last_accessed, relevance_score, tag_prefixes`.
- `result.memory.type` comes back as the generic label `"Memory"`, so an injected result may
  render in the fallback colour until expanded — `normalizeNode` already handles this.

## Seed-chain safety (verified in code)

A just-injected node needs a finite seed position before the camera flies to it. `graph.expand`
maps *every* added node — including the center — to `centerId` in `expansionAnchors`, so the
center anchors to **itself**. In `seedNewNode` that falls through cleanly: branch (a) finds no
*positioned* edge-neighbor (the island is brand-new), branch (b) does
`existingById.get(centerId)` → `undefined` → skip, branch (c) Fibonacci returns a finite
position. Fly-to never targets origin/NaN; the island is seeded then force-relaxed by its own
edges.

## Out of scope (v1)

- Persisting injected nodes across a snapshot-identity reset (changing overview size/filter, or
  an edit/delete collapses back to the overview — existing v1 limitation, unchanged here).
- Spotlighting nodes that aren't loaded. The in-scene spotlight keys off the local
  `matchesSearch` predicate, so when the list reads "10+" the scene still highlights only the
  matches already in the snapshot. Intentional: the list is the whole-store surface; the
  spotlight is an in-view affordance; clicking a row brings its target into the scene.
- Pagination / "load more" beyond the 100-result cap (surface "100+, refine" instead).

## Verification

1. Search "bryce-adams" → the list shows the full server set (10+), not 2; off-graph rows are
   marked.
2. Click an off-graph result → it injects as a connected cluster, the camera flies to + frames
   it, the Inspector opens on it with the correct type/colour; "Expand into graph" goes a hop
   further.
3. Click an in-graph result → unchanged (gentle fly + frame).
4. The search badge reflects total store matches ("100+" when capped); the StatsBar no longer
   reads "2 of 2,000" as if exhaustive.
5. Clear search → the list closes and the spotlight lifts; injected nodes persist (append-only)
   and stay explorable until a snapshot-identity reset.
6. `npm run build` (typecheck + lint) clean; existing spotlight, breadcrumbs, Inspector expand,
   settings/reheat still work.

The detailed, file-by-file implementation steps live in the implementation plan.
