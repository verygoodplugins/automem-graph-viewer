import { useMemo } from 'react'
import type { GraphNode, ClusterMode, GraphEdge } from '../lib/types'

export interface Cluster {
  id: string
  label: string
  color: string
  nodeIds: Set<string>
  // Deterministic Fibonacci-sphere anchor (NOT averaged from member positions).
  centroid: { x: number; y: number; z: number }
  // Estimated lobe radius — members settle into a ball roughly this big around
  // the anchor; consumed by the nebula hull + label offset.
  radius: number
  // Nodes actually anchored into this lobe (single-assignment). This drives the
  // hull size, label count, and force — it's what you SEE in the lobe.
  memberCount: number
  // Raw multi-membership tag frequency (how many nodes carry this cluster's tag,
  // before single-assignment claimed some for smaller/more-specific lobes). Always
  // >= memberCount in entity mode; equal in the single-membership modes. Surfaced
  // in the label as "N grouped · M tagged" so a big tag over a small lobe reads as
  // intentional, not broken.
  taggedCount: number
  topTags: string[]
  typeBreakdown: Record<string, number>
}

interface UseClusterDetectionOptions {
  nodes: GraphNode[]
  edges: GraphEdge[]
  mode: ClusterMode
  typeColors?: Record<string, string>
}

// Generate consistent colors for arbitrary cluster keys
function hashColor(str: string): string {
  let hash = 0
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash)
  }
  const hue = Math.abs(hash) % 360
  return `hsl(${hue}, 60%, 50%)`
}

/**
 * Detect clusters based on the selected mode
 * Returns cluster assignments and computed boundaries
 */
export function useClusterDetection({
  nodes,
  edges,
  mode,
  typeColors = {},
}: UseClusterDetectionOptions): Cluster[] {
  return useMemo(() => {
    if (mode === 'none' || nodes.length === 0) {
      return []
    }

    // Group nodes by cluster key
    const nodeGroups = new Map<string, GraphNode[]>()

    if (mode === 'type') {
      // Group by memory type
      for (const node of nodes) {
        const key = node.type
        if (!nodeGroups.has(key)) {
          nodeGroups.set(key, [])
        }
        nodeGroups.get(key)!.push(node)
      }
    } else if (mode === 'tags') {
      // Group by primary tag (first tag)
      // Nodes with the same first tag belong to the same cluster
      for (const node of nodes) {
        const key = node.tags[0] || 'untagged'
        if (!nodeGroups.has(key)) {
          nodeGroups.set(key, [])
        }
        nodeGroups.get(key)!.push(node)
      }
    } else if (mode === 'entity') {
      // Group by entity tags (entity:category:name)
      for (const node of nodes) {
        for (const tag of node.tags) {
          if (!tag.startsWith('entity:')) continue
          // Parse entity:category:name → key "category:name"
          const parts = tag.split(':')
          if (parts.length < 3) continue
          const entityKey = parts.slice(1).join(':') // e.g. "person:dana"
          if (!nodeGroups.has(entityKey)) {
            nodeGroups.set(entityKey, [])
          }
          nodeGroups.get(entityKey)!.push(node)
        }
      }
    } else if (mode === 'semantic') {
      // Group by connected components using edges
      // Nodes connected by strong relationships form clusters
      const visited = new Set<string>()
      const nodeById = new Map(nodes.map(n => [n.id, n]))

      // Build adjacency list from edges with strength > 0.5
      const adj = new Map<string, string[]>()
      for (const edge of edges) {
        if (edge.strength >= 0.5) {
          // GraphEdge source/target are always strings
          const source = edge.source
          const target = edge.target

          if (!adj.has(source)) adj.set(source, [])
          if (!adj.has(target)) adj.set(target, [])
          adj.get(source)!.push(target)
          adj.get(target)!.push(source)
        }
      }

      // Find connected components via BFS
      let clusterIndex = 0
      for (const node of nodes) {
        if (visited.has(node.id)) continue

        const queue = [node.id]
        const component: GraphNode[] = []

        while (queue.length > 0) {
          const id = queue.shift()!
          if (visited.has(id)) continue
          visited.add(id)

          const n = nodeById.get(id)
          if (n) component.push(n)

          const neighbors = adj.get(id) || []
          for (const neighborId of neighbors) {
            if (!visited.has(neighborId) && nodeById.has(neighborId)) {
              queue.push(neighborId)
            }
          }
        }

        if (component.length > 0) {
          // Derive a meaningful label from the most common tags
          const tagCounts = new Map<string, number>()
          for (const n of component) {
            for (const tag of n.tags) {
              if (tag.startsWith('entity:')) continue // skip entity tags
              tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
            }
          }
          const sortedTags = [...tagCounts.entries()].sort((a, b) => b[1] - a[1])
          const baseKey = sortedTags.length > 0
            ? sortedTags.slice(0, 2).map(([tag]) => tag).join(' + ')
            : `Cluster ${clusterIndex}`
          clusterIndex++
          let key = baseKey
          let duplicateIndex = 2
          while (nodeGroups.has(key)) {
            key = `${baseKey} (${duplicateIndex})`
            duplicateIndex++
          }
          nodeGroups.set(key, component)
        }
      }
    }

    // --- Deterministic spread anchors (position-independent) ----------------
    // Each surviving cluster gets a fixed anchor on a Fibonacci sphere, ordered
    // by a stable key sort so anchors never reshuffle between renders. The force
    // layer (useForceLayout) pulls members toward these anchors; forceCollide
    // then spreads them into a ball, so members land tight around the anchor.
    // centroid IS the anchor (not averaged from positions — that was the old
    // circular dependency) and radius is an estimate of the settled ball, both
    // consumed by ClusterBoundaries (nebula hull) + ClusterLabels (offset).
    const BASE_SHELL = 120
    const SHELL_FACTOR = 1.1
    const CLUSTER_BASE = 18
    const RADIUS_K = 6

    // Candidate clusters: every group with >= 2 raw (multi-membership) members.
    // entity mode can produce hundreds of these (one per entity tag) — they are
    // NOT all rendered or anchored; the active set below restricts to a handful.
    interface CandidateCluster {
      key: string
      uniqueNodes: GraphNode[]
    }

    const candidates: CandidateCluster[] = []
    for (const [key, groupNodes] of nodeGroups) {
      // Deduplicate nodes (entity mode can push the same node multiple times).
      const seenIds = new Set<string>()
      const uniqueNodes = groupNodes.filter((n) => {
        if (seenIds.has(n.id)) return false
        seenIds.add(n.id)
        return true
      })
      if (uniqueNodes.length < 2) continue // Skip single-node clusters
      candidates.push({ key, uniqueNodes })
    }

    // --- Active set + single-assignment (the fix for "label says 49, lobe empty")
    // A personal corpus yields ~800 entity clusters, but only a handful can render
    // or anchor legibly. Restrict force + shell + labels to ONE active set — the
    // top-N candidates by tag frequency — so all four agree on the same universe.
    //
    // Then assign each node to the SMALLEST active cluster it belongs to (most
    // specific), tie-broken by key. Smallest-wins is right for "everything about
    // Dana" — BUT only when the contest is the rendered set. Smallest-wins across
    // all 800 sent members into invisible micro-clusters (Dana 11/114, Railway
    // 4/49); smallest-wins across the active 16 keeps them in a lobe you can see.
    // This single-assignment is the force anchor AND the rendered membership, so a
    // label counts exactly what's pulled into its lobe — no multi-membership inflation.
    const MAX_ACTIVE_CLUSTERS = 16 // keep in sync with MAX_VISIBLE_CLUSTERS in GraphCanvas
    const activeSet = [...candidates]
      .sort((a, b) => b.uniqueNodes.length - a.uniqueNodes.length) // largest tag-count first
      .slice(0, MAX_ACTIVE_CLUSTERS)

    // Claim smallest-first so a node in {Railway:49, Jack:419} lands in Railway.
    // Then drop clusters that retained < 2 members and reassign: a node claimed
    // by a now-dropped cluster must be re-offered to a larger surviving cluster
    // it also belongs to, else it ends up claimed-but-unassigned — no anchor
    // (yanked to origin by the `?? 0` fallback) and no hull. Dropping a cluster
    // only FREES nodes, so survivors' memberships grow monotonically across
    // passes; the loop converges in at most one drop per cluster.
    let surviving = [...activeSet]
    let assignedNodes = new Map<string, GraphNode[]>()
    for (let pass = 0; pass <= activeSet.length; pass++) {
      const assignOrder = [...surviving].sort(
        (a, b) =>
          a.uniqueNodes.length - b.uniqueNodes.length ||
          (a.key < b.key ? -1 : a.key > b.key ? 1 : 0),
      )
      assignedNodes = new Map<string, GraphNode[]>()
      const claimed = new Set<string>()
      for (const c of assignOrder) {
        const mine: GraphNode[] = []
        for (const n of c.uniqueNodes) {
          if (claimed.has(n.id)) continue
          claimed.add(n.id)
          mine.push(n)
        }
        assignedNodes.set(c.key, mine)
      }
      const next = surviving.filter(
        (c) => (assignedNodes.get(c.key)?.length ?? 0) >= 2,
      )
      if (next.length === surviving.length) break // stable — nothing dropped
      surviving = next
    }

    interface PendingCluster {
      key: string
      nodes: GraphNode[] // single-assignment members (what the lobe actually holds)
      taggedCount: number // raw multi-membership tag frequency
      radius: number
    }

    // `surviving` already holds only clusters with >= 2 assigned members (the
    // loop's stable state). Sort by key for a STABLE Fibonacci anchor across renders.
    const pending: PendingCluster[] = surviving
      .map((c) => {
        const nodes = assignedNodes.get(c.key) ?? []
        return {
          key: c.key,
          nodes,
          taggedCount: c.uniqueNodes.length,
          radius: CLUSTER_BASE + RADIUS_K * Math.cbrt(Math.max(nodes.length, 1)),
        }
      })
      .sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))

    const clusterCount = pending.length
    const meanRadius =
      clusterCount > 0
        ? pending.reduce((sum, p) => sum + p.radius, 0) / clusterCount
        : 0
    // Spread the lobes far enough apart that they don't overlap. Scales with the
    // ACTIVE cluster count (<= MAX_ACTIVE_CLUSTERS) and mean lobe size — NOT the
    // ~800 raw candidates, which blew the shell out to ~850 and left members
    // stranded 5x their lobe radius short of the anchor.
    const shellRadius = Math.max(
      BASE_SHELL,
      SHELL_FACTOR * meanRadius * Math.sqrt(clusterCount),
    )
    const goldenAngle = Math.PI * (1 + Math.sqrt(5))

    const clusters: Cluster[] = pending.map((p, i) => {
      // Deterministic Fibonacci-sphere anchor. A lone cluster sits at the origin.
      let ax = 0
      let ay = 0
      let az = 0
      if (clusterCount > 1) {
        const phi = Math.acos(1 - (2 * (i + 0.5)) / clusterCount)
        const theta = goldenAngle * i
        ax = shellRadius * Math.sin(phi) * Math.cos(theta)
        ay = shellRadius * Math.sin(phi) * Math.sin(theta)
        az = shellRadius * Math.cos(phi)
      }

      // Determine color
      let color: string
      if (mode === 'type' && typeColors[p.key]) {
        color = typeColors[p.key]
      } else {
        color = hashColor(p.key)
      }

      // Compute metadata from the ASSIGNED members (what the lobe holds), not the
      // raw tag set — so topTags/typeBreakdown describe what's actually rendered.
      const tagCounts = new Map<string, number>()
      const typeCounts: Record<string, number> = {}
      for (const node of p.nodes) {
        typeCounts[node.type] = (typeCounts[node.type] || 0) + 1
        for (const tag of node.tags) {
          // Skip entity tags in topTags except in entity mode
          if (tag.startsWith('entity:') && mode !== 'entity') continue
          tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1)
        }
      }
      const topTags = [...tagCounts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([tag]) => tag)

      // Derive display label — for entity mode, capitalize the entity name
      let label = p.key
      if (mode === 'entity') {
        // key is "category:name" e.g. "person:dana" → "Dana"
        const namePart = p.key.includes(':') ? p.key.split(':').pop()! : p.key
        label = namePart.charAt(0).toUpperCase() + namePart.slice(1)
      }

      return {
        id: p.key,
        label,
        color,
        nodeIds: new Set(p.nodes.map((n) => n.id)),
        centroid: { x: ax, y: ay, z: az },
        radius: p.radius,
        memberCount: p.nodes.length,
        taggedCount: p.taggedCount,
        topTags,
        typeBreakdown: typeCounts,
      }
    })

    return clusters
  }, [nodes, edges, mode, typeColors])
}

/**
 * Get cluster assignment for a node
 */
export function getNodeCluster(nodeId: string, clusters: Cluster[]): Cluster | null {
  for (const cluster of clusters) {
    if (cluster.nodeIds.has(nodeId)) {
      return cluster
    }
  }
  return null
}
