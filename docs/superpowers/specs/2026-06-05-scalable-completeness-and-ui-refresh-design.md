# AutoMem Graph Viewer — Scalable Completeness + UI Refresh

> Design spec (brainstorming-skill convention). The working plan lives at
> `~/.claude/plans/using-superpowers-brainstorming-the-gra-fluffy-pinwheel.md`;
> this is the committed, version-controlled copy.

## Context

The graph viewer is meant to let a user explore their entire AutoMem memory
store, but two things break that promise:

1. **"Select All" loads nothing.** The "All" button set `maxNodes: 0` →
   `limit: 0` → the client emitted `limit=0` (guard was `if (params.limit != null)`
   and `0 != null` is true) → the server ran Cypher `LIMIT 0` and returned **zero
   rows**. This is the exact symptom the user reported.
2. **You can't show everything anyway.** The largest store has **10,000–50,000
   memories**. The server hard-caps snapshots at 2,000 (`min(limit, 2000)`), and
   the browser physics ran 120 synchronous `simulation.tick()` calls on the main
   thread, freezing the tab around 2,000+ nodes. Both walls bite at roughly the
   same place.
3. **Top-N-by-importance does not preserve relationships.** The server already
   orders `importance DESC, timestamp DESC`. But **both layers keep an edge only
   when BOTH endpoints are visible** (`m1.id IN $node_ids AND m2.id IN $node_ids`
   server-side; the both-endpoints filter client-side). Showing the top 500
   silently drops every edge those nodes have to memory #501+. So "top X
   important" can make missing relationships *worse*, not better.

**Chosen direction (user-approved):** Adopt **focus-and-expand** as the
completeness model — render a bounded overview, then let the user click/search
any node to pull its full neighborhood (via the existing `/graph/neighbors`) and
merge it into a live, growing in-memory graph. Completeness comes from
reachability-by-exploration, not from loading all 10k–50k at once. In parallel,
do a **visual refresh + declutter** of the UI (keep the core interaction model).

The work splits into two **separable tracks**. Track A is data/scalability;
Track B is presentation. They share `App.tsx` and `GraphCanvas.tsx`.

---

## Track A — Scalable completeness via focus-and-expand

**Reuse (do not rebuild):** `fetchGraphSnapshot`/`useGraphSnapshot`,
`fetchGraphNeighbors`/`useGraphNeighbors` (already called by the Inspector on
every selection, React-Query-deduped), `fetchGraphStats`/`useGraphStats`, the
`reheat` rAF-poll pattern, and `computeLayout`'s position-preservation via
`existingNodes.find`.

### Phase 0 — Fix `limit=0` + repurpose "Max Nodes" *(this PR)*
- `src/api/client.ts` — single chokepoint. Treat `0`/missing/`NaN` as "use the
  cap," never the floor: `const requested = params.limit && params.limit > 0 ?
  params.limit : MAX_SNAPSHOT; set('limit', min(requested, MAX_SNAPSHOT))`.
- `src/components/settings/SettingsPanel.tsx` — `[500, 2000, 5000, 0]` →
  `[500, 1000, 2000]`; relabel **"Overview size"**; drop the `'All'` case.
  Default stays `500`.

### Phase 1 — Initial overview seeding (the hinge: show *relationships*, not dots)
The landing state must show visible structure, not 500 near-edgeless islands.
**Decide the default by measurement:** load the importance-only overview and read
`returned_edges / returned_nodes`. Dense → ship importance-only top-N. Sparse →
promote a **connectivity-aware seed** (server-side degree-weighted ordering, or
top-N + bounded neighbor backfill), ≤2,000. This is the one open product decision.

### Phase 2 — Async physics ticker (stop the freeze)
Refactor `src/hooks/useForceLayout.ts`: `useMemo` keeps only construction + a
5–10-tick warmup; remove the 120-tick loop. Add `runSimulationAsync(targetAlpha)`
generalizing `reheat` (rAF loop ~3 ticks/frame, `setLayoutTick` each frame, stop
at `alpha < 0.01`, `cancelAnimationFrame` on cleanup, guard
`layoutCache.simulation !== sim`). Drive from a signature-keyed `useEffect`.
**Alpha discriminator:** capture prior node count in a ref; append (`prevCount > 0
&& newCount > prevCount`) → start alpha ~0.3; fresh → 1.0.

### Phase 3 — Merge-on-expand data model (centerpiece)
New hook `src/hooks/useExpandableGraph.ts` (`useReducer`), owned by `App.tsx`.
Snapshot stays in TanStack Query (immutable seed); the mutable growing graph is
React state on top. State `{ nodes, edges, newNodeIds, expansionAnchors }`,
actions `reset`/`merge`. Dedupe by `id`. **Append-only** (interpolation buffers
are index-keyed). `reset` on snapshot-identity change + clear `layoutCache`.
`merge` carries `centerId` (semantic neighbors often have no graph edge).

### Phase 3b — Seed-near-parent (load-bearing)
In `computeLayout`'s new-node branch: seed append nodes at (a) an
already-positioned edge-neighbor + jitter, else (b) `expansionAnchors[id]`'s
center + jitter, else (c) Fibonacci. New nodes appear next to the clicked node;
the brief `alpha≈0.3` settle only refines.

### Phase 4 — Expansion UX
`Inspector.tsx` gets an **"Expand into graph"** action (it already holds the
cached neighbor payload). `graph.newNodeIds` feeds the existing focus
depth-dimming so just-added nodes briefly highlight. Selection stays read-only;
expansion is an explicit step.

### Phase 5 — Server changes (minimal, backward-compatible)
`automem/automem/api/graph.py`: make neighbor node/edge projections return the
**same fields as the snapshot projections** (timestamp/updated_at/metadata on
nodes; properties on edges) so merged data has a uniform shape. Defensive guard:
`if limit <= 0: limit = 2000`. Purely additive.

### Known v1 limitations
- Edit/delete invalidates `['graph']` → snapshot identity changes → `reset`
  collapses expansions. *Optional mitigation:* narrow to `['graph','snapshot']`.
- Overview may be disconnected islands (expansion is the mitigation). No
  collapse/removal in v1 (append-only constraint).

---

## Track B — UI visual refresh + declutter

**Aesthetic: "Observatory of Memory."** A dark astronomical-instrument look — the
graph is a starfield, the chrome is the instrument panel. Boldness from
**atmosphere and luminance**, not a loud hue, because the eight per-type node
colors must remain the only saturated color. Signature accent is a **cold
near-white instrument light** (`#E8ECF4`), outside all eight data hues.

> **Committed but swappable.** The whole aesthetic lives in the design-token layer
> (`index.css` vars + `tailwind.config.js` + font `<link>`), so it can be
> re-skinned without touching component structure. The structural work
> (declutter, consolidation, focus-and-expand) is aesthetic-independent.

**Typography:** Display — **Fraunces**; Body/UI — **Archivo**; Mono — **JetBrains
Mono**. (None are Inter/Roboto/system.)

**Layout:** collapse z-sprawl to four tiers (canvas / chrome rails / transient /
modal). Header's four mismatched gradient buttons → one neutral ghost-icon
cluster. Purple-gradient wordmark dies.

**Keep & restyle:** hand gestures, time-travel timeline, audio/sonification,
TagCloud, MiniMap. **Cut:** BookmarksPanel, RadialMenu. **Retire:** lasso + bulk
actions (LassoOverlay, SelectionActions, useLassoSelection). **Delete dead code:**
FilterPanel.tsx, ExpandedNodeView.tsx.

**Phasing:** A — tokens + fonts; B — declutter + lasso untangle; C —
consolidation + restyle (rails, SettingsPanel re-tier); D — polish + motion
(`.atmosphere`, CSS panel-reveal stagger, focus rings). No motion library added.

---

## Suggested PR sequence
1. **PR-1** Track A Phase 0 — limit clamp + button relabel (fixes the empty-graph bug).
2. **PR-2** Track A Phase 5 — neighbor/snapshot shape parity + `limit<=0` guard.
3. **PR-3** Track B Phase A + B — tokens/fonts + dead-code/lasso removal.
4. **PR-4** Track A Phase 2 — async ticker (freeze fix).
5. **PR-5** Track A Phases 3/3b/4 — merge-on-expand.
6. **PR-6** Track B Phase C + D — consolidation, restyle, polish.

## Verification
1. limit=0 fix: selecting any overview size never emits `limit=0`; graph always non-empty.
2. No freeze: load the 2,000-overview; tab stays responsive.
3. Expansion fidelity: neighbors appear next to the clicked node, existing nodes don't jump, dedupe holds.
4. Relationship completeness: a sparsely-connected high-importance node shows its real relationships after expansion.
5. Server shape parity: an expanded node shows a timestamp in the Inspector.
6. `npm run build` + `npm run lint` clean; fonts load; accent never collides with Decision-blue nodes; gestures/timeline/audio still work.
7. Regression: search, breadcrumbs, settings sliders + reheat/reset, clustering, pathfinding, delete still function.
