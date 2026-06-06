# Search → Sidebar Results + Graph Spotlight + Fly-to-Frame

**Date:** 2026-06-06
**Status:** Approved (brainstormed → advisor-reviewed → user-approved)
**Branch context:** `fix/all-nodes-visible` (all nodes stay rendered; search highlights rather than filters)

## Problem

Typing in the search box today only *highlights* matching nodes in the 3D graph (a subtle
pulse + brighten, others dimmed to ~50%) and shows a `matched / total` count badge. There
is no way to **see the list** of what matched, and no way to **jump** to a result. The
right-side sidebar (`Inspector`) only ever shows a single selected node's detail.

## Goal

Make search a first-class navigation surface:

1. An active search populates the **sidebar with a clickable list** of matching memories.
2. Matching nodes get a **strong, unmistakable spotlight** in the graph; the rest recede but
   stay visible (consistent with this branch's all-nodes-visible direction).
3. **Clicking a result flies the camera in and frames** that node, then opens its full detail.

## Approved decisions

- **Click a result →** the sidebar switches to that node's full single-memory detail
  (the normal `Inspector`), with a **"← Back to results"** affordance to return to the list.
- **Graph highlight →** strong spotlight: matches scale up + glow/pulse + labels; non-matches
  dim hard (~15–20%, desaturated) but remain visible.
- **Camera →** fly **in and frame** the node (animate orbit target *and* zoom distance),
  ~600ms ease-out-cubic, reusing the existing cluster fly-in math.
- **Search scope →** **client-side** over the already-loaded snapshot (≤ `maxNodes` = 500).
  No backend search endpoint in v1.

## Design summary

The sidebar view is **derived from existing state** (`selectedNode`, `searchTerm`) — no new
mode enum:

- `selectedNode` set → node detail (`Inspector`); a "← Back to results" link shows only when a
  search is also active.
- else `searchTerm` non-empty → results list (new `SearchResultsList`), panel auto-opens.
- else → empty → panel collapses (existing behavior).

Starting/changing a search clears the current selection so results show. "← Back to results"
just clears the selection; with the search still active, the list reappears.

**Graph precedence** is a single clean switch, `spotlightActive = !selectedNode && searchTerm
&& matchingIds.size > 0`:

- Results view (no selection) → spotlight owns the scene (matches up/bright/pulsing, non-matches
  hard-dimmed + desaturated).
- Detail view (node selected) → the existing selection-focus depth-dimming owns the scene;
  non-neighbor search matches keep a thin accent tint so they aren't lost. Deselect → spotlight
  returns.

This avoids the two dimming systems (search-spotlight and selection-focus) multiplying against
each other.

## Reuse (most primitives already exist)

- Match detection: `matchingIds` in `GraphCanvas` and the count predicate in `App` (unified into
  a shared `src/lib/searchMatch.ts`).
- Camera fly-in: generalize `navigateToCluster` → `navigateToNode(x,y,z,radius)` with closer framing.
- Highlight pipeline: the per-instance scale/color/opacity loop in `InstancedNodes`.
- Selection ring: `SelectionHighlight` already mounts on arrival.
- Labels: `LODLabels` already force-includes search matches and caps the on-screen count at ~10.

## Out of scope (v1)

- Backend full-store search (results limited to the loaded snapshot).
- Virtualized result list (≤500 lightweight rows render fine in a scroll container).
- Persisting expansions/selection across snapshot-identity changes (existing v1 limitation).

The detailed, file-by-file implementation steps and verification live in the implementation plan.
