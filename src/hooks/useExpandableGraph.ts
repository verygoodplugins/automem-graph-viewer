import { useReducer, useEffect, useCallback } from 'react'
import type { GraphNode, GraphEdge, GraphSnapshot } from '@/lib/types'
import { normalizeNode } from '@/lib/normalizeNode'

/**
 * The live, growing in-memory graph that sits on top of the immutable snapshot.
 *
 * The TanStack-Query snapshot is a bounded overview (≤2,000 nodes). This reducer
 * lets the user grow that overview by expanding any node's neighborhood (fetched
 * via /graph/neighbors and merged here). Completeness comes from reachability-by-
 * exploration rather than loading the entire 10k–50k corpus at once.
 *
 * Invariants:
 *  - **Append-only.** Existing node indices never move or reorder.
 *    `usePositionInterpolation` keys its Float32 buffers by array index and SNAPS
 *    (not lerps) when the count changes, so any reorder would teleport nodes.
 *  - **Dedupe by id** for both nodes and edges.
 *  - **reset on snapshot identity change.** A new overview size / filter produces a
 *    new query object → reset. This collapses expansions back to the overview
 *    (documented v1 limitation).
 *  - **Every merged node is normalized.** Neighbor projections omit
 *    timestamp/updated_at/metadata and could in principle carry non-finite
 *    importance/confidence. Merged raw into the simulation, a node with an
 *    undefined radius or NaN importance poisons forceCollide (`d.radius * …`),
 *    the Fibonacci/seed math (`50 + (1 - importance) * 100`), and the time-travel
 *    min/max scan — collapsing the whole graph on the first expand. Normalizing in
 *    the reducer is the single mitigation and also makes expansion correct against
 *    today's backend without waiting on the server shape-parity change.
 *
 * `normalizeNode` itself lives in `@/lib/normalizeNode` (a pure, non-React
 * module) so the API client can reuse the exact same normalization without
 * pulling hook code into the API layer.
 */

interface ExpandableGraphState {
  nodes: GraphNode[]
  edges: GraphEdge[]
  /** Node ids added by the most recent expansion (for transient highlight). */
  newNodeIds: Set<string>
  /** newNodeId → centerId of the expansion that introduced it (seed anchor). */
  expansionAnchors: Map<string, string>
  /** Internal O(1) dedupe sets. */
  nodeIds: Set<string>
  edgeIds: Set<string>
}

type ExpandableGraphAction =
  | { type: 'reset'; nodes: GraphNode[]; edges: GraphEdge[]; typeColors: Record<string, string> }
  | {
      type: 'expand'
      centerId: string
      nodes: GraphNode[]
      edges: GraphEdge[]
      typeColors: Record<string, string>
    }

const INITIAL_STATE: ExpandableGraphState = {
  nodes: [],
  edges: [],
  newNodeIds: new Set(),
  expansionAnchors: new Map(),
  nodeIds: new Set(),
  edgeIds: new Set(),
}

function reducer(
  state: ExpandableGraphState,
  action: ExpandableGraphAction,
): ExpandableGraphState {
  switch (action.type) {
    case 'reset': {
      const nodeIds = new Set<string>()
      const nodes: GraphNode[] = []
      for (const n of action.nodes) {
        if (!n.id || nodeIds.has(n.id)) continue
        nodeIds.add(n.id)
        nodes.push(normalizeNode(n, action.typeColors))
      }

      const edgeIds = new Set<string>()
      const edges: GraphEdge[] = []
      for (const e of action.edges) {
        if (!e.id || edgeIds.has(e.id)) continue
        edgeIds.add(e.id)
        edges.push(e)
      }

      return {
        nodes,
        edges,
        newNodeIds: new Set(),
        expansionAnchors: new Map(),
        nodeIds,
        edgeIds,
      }
    }

    case 'expand': {
      const { centerId, typeColors } = action

      const newNodeIds = new Set<string>()
      const addedNodes: GraphNode[] = []
      for (const n of action.nodes) {
        if (!n.id || state.nodeIds.has(n.id) || newNodeIds.has(n.id)) continue
        newNodeIds.add(n.id)
        addedNodes.push(normalizeNode(n, typeColors))
      }

      const addedEdges: GraphEdge[] = []
      const addedEdgeIds = new Set<string>()
      for (const e of action.edges) {
        if (!e.id || state.edgeIds.has(e.id) || addedEdgeIds.has(e.id)) continue
        addedEdgeIds.add(e.id)
        addedEdges.push(e)
      }

      // Nothing genuinely new — keep prior state identity so no layout rebuild or
      // re-render churn is triggered.
      if (addedNodes.length === 0 && addedEdges.length === 0) {
        return state
      }

      const nodeIds = addedNodes.length ? new Set(state.nodeIds) : state.nodeIds
      const edgeIds = addedEdges.length ? new Set(state.edgeIds) : state.edgeIds
      const expansionAnchors = addedNodes.length
        ? new Map(state.expansionAnchors)
        : state.expansionAnchors

      for (const n of addedNodes) {
        nodeIds.add(n.id)
        expansionAnchors.set(n.id, centerId)
      }
      for (const e of addedEdges) {
        edgeIds.add(e.id)
      }

      return {
        nodes: addedNodes.length ? [...state.nodes, ...addedNodes] : state.nodes,
        edges: addedEdges.length ? [...state.edges, ...addedEdges] : state.edges,
        newNodeIds,
        expansionAnchors,
        nodeIds,
        edgeIds,
      }
    }

    default:
      return state
  }
}

export interface ExpandPayload {
  centerId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
}

export interface ExpandableGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  newNodeIds: Set<string>
  expansionAnchors: Map<string, string>
  expand: (payload: ExpandPayload) => void
}

const EMPTY_TYPE_COLORS: Record<string, string> = {}

/**
 * Owns the mutable growing graph. Seeded (and reset) from the immutable snapshot;
 * grown by `expand`.
 */
export function useExpandableGraph(
  snapshot: GraphSnapshot | undefined,
): ExpandableGraph {
  const [state, dispatch] = useReducer(reducer, INITIAL_STATE)

  const typeColors = snapshot?.meta?.type_colors ?? EMPTY_TYPE_COLORS

  // Reset to the overview whenever the snapshot identity changes (new size/filter,
  // or an edit/delete that invalidated the query). Structural sharing in TanStack
  // Query keeps `snapshot` referentially stable across no-op refetches, so a
  // genuinely unchanged overview does NOT collapse live expansions.
  useEffect(() => {
    if (!snapshot) return
    dispatch({
      type: 'reset',
      nodes: snapshot.nodes,
      edges: snapshot.edges,
      typeColors: snapshot.meta?.type_colors ?? EMPTY_TYPE_COLORS,
    })
  }, [snapshot])

  const expand = useCallback(
    (payload: ExpandPayload) => {
      dispatch({
        type: 'expand',
        centerId: payload.centerId,
        nodes: payload.nodes,
        edges: payload.edges,
        typeColors,
      })
    },
    [typeColors],
  )

  return {
    nodes: state.nodes,
    edges: state.edges,
    newNodeIds: state.newNodeIds,
    expansionAnchors: state.expansionAnchors,
    expand,
  }
}
