import { useState, useCallback, useMemo, useEffect, useRef } from 'react'
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceCenter,
  forceCollide,
  forceRadial,
  forceX,
  forceY,
  forceZ,
} from 'd3-force-3d'
import type { PositionForce3D } from 'd3-force-3d'
import type {
  GraphNode,
  GraphEdge,
  SimulationNode,
  SimulationLink,
  ForceConfig,
} from '../lib/types'
import { DEFAULT_FORCE_CONFIG } from '../lib/types'

// Maps the 0–1 cluster-strength config knob to a real d3 force strength. Tuned
// empirically (headless physics probe over a 2000-node entity-mode graph): at
// the default 0.3 knob this yields s≈0.9, strong enough to drag members onto
// their anchor (all 16 lobes centered) once charge is damped on anchored nodes.
const CLUSTER_FORCE_SCALE = 3.0
// forceManyBody (charge) at full strength across 2000 nodes overwhelms the
// cluster force — lobes never tighten. Damp charge on anchored nodes to this
// fraction so members settle into a compact ball around their anchor. 0.10 was
// the probe sweet spot: tightest lobe with a positive surface-to-surface gap
// (going to 0.08 overshot into overlap).
const CLUSTER_CHARGE_DAMP = 0.1
// forceRadial pulls every node toward origin-centered importance shells, which
// fights the off-origin cluster anchors. When clustering is active, anchored
// nodes get zero radial pull so the cluster force fully owns their position.
const CLUSTER_RADIAL_DAMP = 0

interface UseForceLayoutOptions {
  nodes: GraphNode[]
  edges: GraphEdge[]
  forceConfig?: ForceConfig
  /**
   * newNodeId → centerId of the expansion that introduced it. Used to seed
   * newly-merged nodes next to the node the user clicked instead of letting them
   * fly in from a random Fibonacci-shell position.
   */
  expansionAnchors?: Map<string, string>
  /**
   * nodeId → deterministic cluster anchor {x,y,z}. When present, a genuine
   * forceX/Y/Z pulls each member toward its anchor so cluster modes physically
   * separate into spatial lobes. Single-valued per node (the caller collapses
   * multi-membership to one dominant anchor) so a node is never pulled to dead
   * space between two anchors.
   */
  clusterAnchors?: Map<string, { x: number; y: number; z: number }>
  /** 0–1 cluster pull strength (from clusterConfig.clusterStrength). */
  clusterForceStrength?: number
  /**
   * Structural cluster signature (the cluster MODE, not the strength). Folded
   * into the layout cache key so flipping modes rebuilds + re-settles, while a
   * strength-slider drag (same mode) mutates the live force in place instead.
   */
  clusterSignature?: string
}

interface LayoutState {
  nodes: SimulationNode[]
  isSimulating: boolean
}

// Module-level cache that survives React Strict Mode and HMR
// This is outside React's lifecycle so it persists across component recreation
const layoutCache = {
  signature: '',
  nodes: [] as SimulationNode[],
  simulation: null as ReturnType<typeof forceSimulation> | null,
  // Single source of truth for the settle alpha decision. computeLayout picks the
  // starting alpha (0.3 gentle append / 0.7 cluster-mode relocate / 1.0 fresh
  // overview) and the settle effect reads it, so the discriminator is never
  // duplicated and can't drift between the two call sites.
  lastSettleAlpha: 1,
  // The cluster MODE the cached layout was built for. A change here means the
  // anchors moved (members must relocate), so we settle from a firmer alpha than
  // a plain node-append even though every node survives.
  clusterSignature: '',
}

// Helper to create data signature
// Samples ~20 evenly-spaced nodes rather than just the first and last, so
// changes in the middle of the list (e.g. after importance filtering) are detected.
function createDataSignature(nodes: GraphNode[]): string {
  if (nodes.length === 0) return ''
  const step = Math.max(1, Math.floor(nodes.length / 20))
  let sig = String(nodes.length)
  for (let i = 0; i < nodes.length; i += step) {
    sig += `-${nodes[i].id.slice(-8)}`
  }
  return sig
}

// Companion to createDataSignature for the edge set. An edges-only expansion
// (e.g. a new link between two already-loaded nodes) leaves the node signature
// unchanged, so without this the layout cache would skip the recompute and the
// new link would never reach the simulation. Samples ~20 evenly-spaced edges by
// their endpoint pair, mirroring the node sampling above.
function createEdgeSignature(edges: GraphEdge[]): string {
  if (edges.length === 0) return '0'
  const step = Math.max(1, Math.floor(edges.length / 20))
  let sig = String(edges.length)
  for (let i = 0; i < edges.length; i += step) {
    sig += `-${edges[i].source.slice(-6)}:${edges[i].target.slice(-6)}`
  }
  return sig
}

// Small random offset (±half the span) so co-seeded nodes don't stack exactly.
function jitter(span: number): number {
  return (Math.random() - 0.5) * span
}

/**
 * Seed a brand-new (no preserved position) node. Prefer landing it right next to
 * something already on screen so an expansion grows outward from where the user
 * clicked rather than teleporting in from a random shell:
 *   (a) an already-positioned edge-neighbor, else
 *   (b) the expansion's center (clicked node), else
 *   (c) the importance-shell Fibonacci fallback (used for the initial overview).
 */
function seedNewNode(
  node: GraphNode,
  index: number,
  total: number,
  existingById: Map<string, SimulationNode>,
  adjacency: Map<string, string[]>,
  expansionAnchors?: Map<string, string>,
): { x: number; y: number; z: number } {
  // (a) positioned edge-neighbor
  const neighborIds = adjacency.get(node.id)
  if (neighborIds) {
    for (const nid of neighborIds) {
      const anchor = existingById.get(nid)
      if (anchor) {
        return {
          x: (anchor.x ?? 0) + jitter(30),
          y: (anchor.y ?? 0) + jitter(30),
          z: (anchor.z ?? 0) + jitter(30),
        }
      }
    }
  }

  // (b) expansion center
  const centerId = expansionAnchors?.get(node.id)
  if (centerId) {
    const center = existingById.get(centerId)
    if (center) {
      return {
        x: (center.x ?? 0) + jitter(30),
        y: (center.y ?? 0) + jitter(30),
        z: (center.z ?? 0) + jitter(30),
      }
    }
  }

  // (c) Fibonacci sphere — initial overview distribution; high importance = center
  const phi = Math.acos(1 - (2 * (index + 0.5)) / total)
  const theta = Math.PI * (1 + Math.sqrt(5)) * index
  const radius = 50 + (1 - node.importance) * 100
  return {
    x: radius * Math.sin(phi) * Math.cos(theta),
    y: radius * Math.sin(phi) * Math.sin(theta),
    z: radius * Math.cos(phi),
  }
}

// Helper to run the force simulation (pure function, no React)
function computeLayout(
  nodes: GraphNode[],
  edges: GraphEdge[],
  forceConfig: ForceConfig,
  existingNodes: SimulationNode[],
  expansionAnchors?: Map<string, string>,
  clusterAnchors?: Map<string, { x: number; y: number; z: number }>,
  clusterForceStrength = 0,
  clusterSignature = ''
): SimulationNode[] {
  // O(1) lookup of preserved positions (also powers seed-near-parent).
  const existingById = new Map(existingNodes.map((n) => [n.id, n]))

  // Undirected adjacency over the current edge set, so a new node can be seeded
  // beside any already-positioned node it links to.
  const adjacency = new Map<string, string[]>()
  for (const e of edges) {
    if (!adjacency.has(e.source)) adjacency.set(e.source, [])
    if (!adjacency.has(e.target)) adjacency.set(e.target, [])
    adjacency.get(e.source)!.push(e.target)
    adjacency.get(e.target)!.push(e.source)
  }

  // Create simulation nodes with initial positions
  let matchedExisting = 0
  const simNodes: SimulationNode[] = nodes.map((node, i) => {
    // Check if we have existing position for this node
    const existing = existingById.get(node.id)
    if (existing) {
      matchedExisting++
      return {
        ...node,
        x: existing.x,
        y: existing.y,
        z: existing.z,
        vx: existing.vx || 0,
        vy: existing.vy || 0,
        vz: existing.vz || 0,
      }
    }

    const seed = seedNewNode(node, i, nodes.length, existingById, adjacency, expansionAnchors)
    return {
      ...node,
      x: seed.x,
      y: seed.y,
      z: seed.z,
      vx: 0,
      vy: 0,
      vz: 0,
    }
  })

  // Create node lookup
  const nodeById = new Map(simNodes.map((n) => [n.id, n]))

  // Create links (only between nodes present in the snapshot)
  const links: SimulationLink[] = edges
    .filter((e) => nodeById.has(e.source) && nodeById.has(e.target))
    .map((e) => ({
      source: e.source,
      target: e.target,
      strength: e.strength,
      type: e.type,
    }))

  // Identify isolated nodes (no edges in the current snapshot) so we can apply
  // a stronger radial force to keep them visible rather than letting them drift
  // to the far periphery under pure charge repulsion.
  const connectedNodeIds = new Set<string>()
  for (const link of links) {
    connectedNodeIds.add(link.source as string)
    connectedNodeIds.add(link.target as string)
  }

  // Cluster force is live only when anchors were supplied for this mode.
  const hasAnchor = !!clusterAnchors && clusterAnchors.size > 0

  // Stop existing simulation
  if (layoutCache.simulation) {
    layoutCache.simulation.stop()
  }

  // Create 3D force simulation
  const simulation = forceSimulation(simNodes, 3)
    .force(
      'link',
      forceLink(links)
        .id((d: SimulationNode) => d.id)
        .distance((d: SimulationLink) => {
          const baseDistance = forceConfig.linkDistance
          return baseDistance + (1 - d.strength) * baseDistance
        })
        .strength((d: SimulationLink) => d.strength * forceConfig.linkStrength)
    )
    .force(
      'charge',
      forceManyBody().strength((d: SimulationNode) =>
        // Anchored nodes get damped charge so the cluster force can pull them
        // into a tight lobe; everyone else keeps full repulsion.
        hasAnchor && clusterAnchors!.has(d.id)
          ? forceConfig.chargeStrength * CLUSTER_CHARGE_DAMP
          : forceConfig.chargeStrength,
      ),
    )
    .force('center', forceCenter(0, 0, 0).strength(forceConfig.centerStrength))
    .force(
      'collision',
      forceCollide()
        .radius((d: SimulationNode) => d.radius * forceConfig.collisionRadius)
        .strength(0.7)
    )
    .force(
      'radial',
      forceRadial(
        (d: SimulationNode) => 30 + (1 - d.importance) * 70,
        0,
        0,
        0
      ).strength((d: SimulationNode) => {
        // An anchored node is governed by the cluster force; the origin-centered
        // radial pull would fight its off-origin anchor, so damp it hard.
        if (hasAnchor && clusterAnchors!.has(d.id)) return CLUSTER_RADIAL_DAMP
        // Isolated nodes (no edges in snapshot) get a much stronger radial pull so
        // they stay on their importance shell and remain visible in the viewport.
        // Connected nodes use a gentle 0.3 strength — link forces position them.
        return connectedNodeIds.has(d.id) ? 0.3 : 0.8
      })
    )
    .alphaDecay(0.02)
    .velocityDecay(0.3)

  // Cluster force: pull each anchored member toward its deterministic anchor with
  // a genuine d3 forceX/Y/Z. forceCollide then spreads members into a ball around
  // the anchor, so cluster modes physically separate into distinct lobes. Strength
  // is mutated live (without a rebuild) on a strength-slider change — see the
  // strength effect in the hook below.
  if (hasAnchor) {
    const s = clusterForceStrength * CLUSTER_FORCE_SCALE
    const strengthFor = (d: SimulationNode) => (clusterAnchors!.has(d.id) ? s : 0)
    simulation
      .force(
        'clusterX',
        forceX((d: SimulationNode) => clusterAnchors!.get(d.id)?.x ?? 0).strength(
          strengthFor,
        ),
      )
      .force(
        'clusterY',
        forceY((d: SimulationNode) => clusterAnchors!.get(d.id)?.y ?? 0).strength(
          strengthFor,
        ),
      )
      .force(
        'clusterZ',
        forceZ((d: SimulationNode) => clusterAnchors!.get(d.id)?.z ?? 0).strength(
          strengthFor,
        ),
      )
  }

  // Store simulation reference in cache for reheat / async settling
  layoutCache.simulation = simulation

  // Warm up just enough that frame 0 isn't a raw seed sphere, then stop the
  // internal d3 timer. Settling is driven afterwards by runSimulationAsync,
  // which ticks a few times per animation frame so the main thread never
  // blocks (the old 120-tick synchronous loop froze the tab around 2k nodes).
  // On expansion (append) existing nodes keep their positions and new nodes are
  // seeded near their parents, so we skip the warmup to avoid jostling the
  // graph before the gentle settle.
  //
  // Append = every prior node survived AND the graph didn't more-than-double.
  //  - Expansion (+N neighbors): all prior survive, N < prior  → append (gentle).
  //  - Edges-only expansion (neighbors already present): prior survive, +0 nodes
  //    but new links → still append (gentle), not a full re-settle.
  //  - Overview resize 500→2000: top-500 ⊂ top-2000 so all survive, but +1500
  //    is not < 500 → fresh (full settle).
  //  - Overview 2000→500 / filter change: many prior vanish → fresh.
  const allPriorSurvived =
    existingNodes.length > 0 && matchedExisting === existingNodes.length
  const grewModestly = simNodes.length - existingNodes.length < existingNodes.length
  const isAppend = allPriorSurvived && grewModestly

  // A cluster-mode flip keeps every node (looks like a gentle append) but moves
  // the anchors, so members must relocate. Detect it and settle from a firmer
  // alpha than a plain append, while still avoiding the full fresh re-settle.
  const clusterChanged = clusterSignature !== layoutCache.clusterSignature
  layoutCache.clusterSignature = clusterSignature

  let settleAlpha: number
  if (isAppend && !clusterChanged) {
    settleAlpha = 0.3 // gentle: existing nodes barely move, new neighbors settle
  } else if (allPriorSurvived && clusterChanged) {
    settleAlpha = 0.7 // firmer: relocate members to their new cluster anchors
  } else {
    settleAlpha = 1.0 // fresh overview / filter change
  }
  layoutCache.lastSettleAlpha = settleAlpha

  const warmupTicks = settleAlpha <= 0.3 ? 0 : 8
  simulation.alpha(1)
  for (let i = 0; i < warmupTicks; i++) {
    simulation.tick()
  }
  simulation.stop()

  return simNodes
}

export function useForceLayout({
  nodes,
  edges,
  forceConfig = DEFAULT_FORCE_CONFIG,
  expansionAnchors,
  clusterAnchors,
  clusterForceStrength = 0,
  clusterSignature = '',
}: UseForceLayoutOptions): LayoutState & { reheat: () => void; layoutTick: number } {
  const [isSimulating, setIsSimulating] = useState(false)
  const [layoutTick, setLayoutTick] = useState(0)

  // Handle to the in-flight rAF settling loop so we can cancel it on cleanup or
  // when a newer layout supersedes it.
  const rafRef = useRef<number | null>(null)

  // The memo must build the simulation with the CURRENT strength, but must not
  // re-run when only the strength changes (that's a live mutation, not a rebuild
  // — see the strength effect below). Reading it through a ref keeps it out of
  // the memo's dependency array.
  const clusterForceStrengthRef = useRef(clusterForceStrength)
  clusterForceStrengthRef.current = clusterForceStrength

  // Compute layout synchronously (construction + tiny warmup only), with
  // module-level caching. Immune to React Strict Mode double-invocation.
  const layoutNodes = useMemo(() => {
    if (nodes.length === 0) {
      layoutCache.signature = ''
      layoutCache.nodes = []
      return []
    }

    // Key on nodes AND edges AND force config AND cluster MODE: an edges-only
    // expansion or a force-slider change leaves the node set identical, but each
    // must rebuild the simulation (new links / new forces). forceConfig is folded
    // in by value so parent re-render identity churn doesn't trigger needless
    // recomputes. clusterSignature is the cluster MODE only (NOT the strength) —
    // a strength-slider tick mutates the live force in place instead of rebuilding
    // ~2000 nodes per drag frame.
    const signature =
      createDataSignature(nodes) +
      `|e:${createEdgeSignature(edges)}` +
      `|f:${JSON.stringify(forceConfig)}` +
      `|c:${clusterSignature}`

    // Check cache - if signature matches, return cached nodes
    if (signature === layoutCache.signature && layoutCache.nodes.length > 0) {
      return layoutCache.nodes
    }

    // Compute new layout
    const computed = computeLayout(
      nodes,
      edges,
      forceConfig,
      layoutCache.nodes,
      expansionAnchors,
      clusterAnchors,
      clusterForceStrengthRef.current,
      clusterSignature,
    )

    // Update cache
    layoutCache.signature = signature
    layoutCache.nodes = computed

    return computed
    // clusterForceStrength is intentionally NOT a dependency — it's read via ref
    // and applied live by the strength effect, so a slider drag never rebuilds.
  }, [nodes, edges, forceConfig, expansionAnchors, clusterAnchors, clusterSignature])

  // Drive the simulation asynchronously: a few ticks per animation frame,
  // bumping layoutTick each frame so consumers (usePositionInterpolation)
  // re-sync the mutated node positions. Generalizes the old reheat poll into a
  // reusable settler parameterized by a starting alpha. The internal d3 timer
  // is stopped (in computeLayout) so ticking happens only here — never on the
  // main thread in a blocking loop, and never double-ticked.
  const runSimulationAsync = useCallback((targetAlpha: number) => {
    const sim = layoutCache.simulation
    if (!sim) return

    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current)
      rafRef.current = null
    }

    sim.alpha(targetAlpha)
    setIsSimulating(true)

    const step = () => {
      // A newer computeLayout replaced (and stopped) this simulation — bail so
      // overlapping loops never mutate the shared layoutCache concurrently
      // (matters under React Strict Mode's double-invoked effects).
      if (layoutCache.simulation !== sim) {
        rafRef.current = null
        setIsSimulating(false)
        return
      }

      sim.tick()
      sim.tick()
      sim.tick()
      setLayoutTick((t) => t + 1)

      if (sim.alpha() > 0.01) {
        rafRef.current = requestAnimationFrame(step)
      } else {
        rafRef.current = null
        setIsSimulating(false)
      }
    }

    rafRef.current = requestAnimationFrame(step)
  }, [])

  // Kick off settling whenever a new layout is built. The starting alpha is
  // chosen once in computeLayout and stashed on layoutCache (0.3 gentle append /
  // 0.7 cluster-mode relocate / 1.0 fresh overview), so the two call sites can
  // never disagree.
  useEffect(() => {
    if (layoutNodes.length === 0) return

    runSimulationAsync(layoutCache.lastSettleAlpha)

    return () => {
      if (rafRef.current != null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [layoutNodes, runSimulationAsync])

  // Reheat re-energizes the current simulation at a moderate alpha.
  const reheat = useCallback(() => {
    runSimulationAsync(0.5)
  }, [runSimulationAsync])

  // Strength-slider changes at the SAME cluster mode (cache hit, no rebuild):
  // mutate the live cluster force in place and re-energize. d3's .strength(fn)
  // re-runs the force's internal initialize() over the stored nodes, so the new
  // strength takes effect on the next tick. Guarded by prevStrengthRef so this
  // fires only on an actual strength change — never on the initial build (the
  // memo already created the force at the right strength) and never piggybacking
  // on a mode flip (which the 0.7 relocate-settle owns).
  const prevStrengthRef = useRef(clusterForceStrength)
  useEffect(() => {
    if (prevStrengthRef.current === clusterForceStrength) return
    prevStrengthRef.current = clusterForceStrength

    const sim = layoutCache.simulation
    if (!sim) return
    const cx = sim.force('clusterX') as
      | PositionForce3D<SimulationNode>
      | undefined
    if (!cx) return // no cluster force on this layout (mode === 'none')

    const s = clusterForceStrength * CLUSTER_FORCE_SCALE
    const strengthFor = (d: SimulationNode) =>
      clusterAnchors && clusterAnchors.has(d.id) ? s : 0
    cx.strength(strengthFor)
    ;(sim.force('clusterY') as PositionForce3D<SimulationNode>).strength(
      strengthFor,
    )
    ;(sim.force('clusterZ') as PositionForce3D<SimulationNode>).strength(
      strengthFor,
    )
    runSimulationAsync(0.5)
  }, [clusterForceStrength, clusterAnchors, runSimulationAsync])

  return { nodes: layoutNodes, isSimulating, reheat, layoutTick }
}
