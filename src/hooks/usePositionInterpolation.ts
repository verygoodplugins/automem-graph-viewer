import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { SimulationNode, GraphEdge } from '@/lib/types'

interface PositionInterpolationConfig {
  lerpSpeed?: number
  layoutTick?: number
}

/**
 * Manages animated node positions with smooth interpolation.
 * Supports layered overrides for cluster forces and selection gravity.
 * Must be called inside a R3F Canvas context (uses useFrame).
 */
export function usePositionInterpolation(
  layoutNodes: SimulationNode[],
  config: PositionInterpolationConfig = {}
) {
  const { lerpSpeed = 5, layoutTick = 0 } = config
  const nodeCount = layoutNodes.length

  const currentPositions = useRef(new Float32Array(0))
  const targetPositions = useRef(new Float32Array(0))
  const basePositions = useRef(new Float32Array(0))

  // Track whether we've had a first initialization (to snap, not lerp)
  const initializedRef = useRef(false)

  // Node ID to array index mapping
  const nodeIdToIdx = useMemo(() => {
    const map = new Map<string, number>()
    layoutNodes.forEach((n, i) => {
      map.set(n.id, i)
    })
    return map
  }, [layoutNodes])

  // Initialize/resize position arrays when node count changes
  useEffect(() => {
    const size = nodeCount * 3
    if (currentPositions.current.length !== size) {
      currentPositions.current = new Float32Array(size)
      targetPositions.current = new Float32Array(size)
      basePositions.current = new Float32Array(size)
      initializedRef.current = false
    }
  }, [nodeCount])

  // Update base and target positions when layout changes or simulation ticks
  useEffect(() => {
    for (let i = 0; i < layoutNodes.length; i++) {
      const n = layoutNodes[i]
      const offset = i * 3
      basePositions.current[offset] = n.x ?? 0
      basePositions.current[offset + 1] = n.y ?? 0
      basePositions.current[offset + 2] = n.z ?? 0
    }
    targetPositions.current.set(basePositions.current)
    if (!initializedRef.current) {
      currentPositions.current.set(basePositions.current)
      initializedRef.current = true
    }
  }, [layoutNodes, layoutTick])

  // Lerp current positions toward targets each frame
  useFrame((_, delta) => {
    const cur = currentPositions.current
    const tgt = targetPositions.current
    if (cur.length === 0) return

    const t = Math.min(1, delta * lerpSpeed)
    let maxDelta = 0
    for (let i = 0; i < cur.length; i++) {
      const diff = tgt[i] - cur[i]
      cur[i] += diff * t
      const absDiff = Math.abs(diff)
      if (absDiff > maxDelta) maxDelta = absDiff
    }
  })

  return {
    currentPositions,
    targetPositions,
    basePositions,
    nodeIdToIdx,
  }
}

/**
 * Read the current animated position for a node by index.
 * Falls back to (0,0,0) if index is out of range.
 */
export function readAnimatedPosition(
  positions: Float32Array,
  idx: number,
  out: { x: number; y: number; z: number } = { x: 0, y: 0, z: 0 }
) {
  const off = idx * 3
  if (off + 2 < positions.length) {
    out.x = positions[off]
    out.y = positions[off + 1]
    out.z = positions[off + 2]
  } else {
    out.x = 0
    out.y = 0
    out.z = 0
  }
  return out
}

/**
 * Apply selection gravity - pull connected nodes toward the selected node.
 * Modifies targetPositions in-place.
 */
export function applySelectionGravity(
  selectedNodeId: string | null,
  layoutNodes: SimulationNode[],
  edges: GraphEdge[],
  nodeIdToIdx: Map<string, number>,
  basePositions: Float32Array,
  targetPositions: Float32Array,
  strength: number = 0.5
) {
  // Reset targets to base
  targetPositions.set(basePositions)

  if (!selectedNodeId || layoutNodes.length === 0) return

  const selIdx = nodeIdToIdx.get(selectedNodeId)
  if (selIdx === undefined) return

  const selX = basePositions[selIdx * 3]
  const selY = basePositions[selIdx * 3 + 1]
  const selZ = basePositions[selIdx * 3 + 2]

  // BFS to find depths
  const adjacency = new Map<string, Set<string>>()
  edges.forEach(e => {
    if (!adjacency.has(e.source)) adjacency.set(e.source, new Set())
    if (!adjacency.has(e.target)) adjacency.set(e.target, new Set())
    adjacency.get(e.source)!.add(e.target)
    adjacency.get(e.target)!.add(e.source)
  })

  const depths = new Map<string, number>()
  depths.set(selectedNodeId, 0)
  const queue = [{ id: selectedNodeId, depth: 0 }]
  while (queue.length > 0) {
    const { id, depth } = queue.shift()!
    if (depth >= 3) continue
    const neighbors = adjacency.get(id)
    if (!neighbors) continue
    for (const nId of neighbors) {
      if (!depths.has(nId)) {
        depths.set(nId, depth + 1)
        queue.push({ id: nId, depth: depth + 1 })
      }
    }
  }

  // Arrange depth-1 nodes in a sphere around the selected node
  const depth1Ids = Array.from(depths.entries())
    .filter(([, d]) => d === 1)
    .map(([id]) => id)

  const neighborRadius = 25

  depth1Ids.forEach((id, i) => {
    const idx = nodeIdToIdx.get(id)
    if (idx === undefined) return

    // Fibonacci sphere arrangement
    const phi = Math.acos(1 - (2 * (i + 0.5)) / Math.max(depth1Ids.length, 1))
    const theta = Math.PI * (1 + Math.sqrt(5)) * i

    const tx = selX + neighborRadius * Math.sin(phi) * Math.cos(theta)
    const ty = selY + neighborRadius * Math.sin(phi) * Math.sin(theta)
    const tz = selZ + neighborRadius * Math.cos(phi)

    const bx = basePositions[idx * 3]
    const by = basePositions[idx * 3 + 1]
    const bz = basePositions[idx * 3 + 2]

    // Blend between base position and sphere position
    targetPositions[idx * 3] = bx + (tx - bx) * strength
    targetPositions[idx * 3 + 1] = by + (ty - by) * strength
    targetPositions[idx * 3 + 2] = bz + (tz - bz) * strength
  })

  // Depth 2: slight pull toward selected node
  const depth2Pull = strength * 0.25
  Array.from(depths.entries())
    .filter(([, d]) => d === 2)
    .forEach(([id]) => {
      const idx = nodeIdToIdx.get(id)
      if (idx === undefined) return

      const bx = basePositions[idx * 3]
      const by = basePositions[idx * 3 + 1]
      const bz = basePositions[idx * 3 + 2]

      targetPositions[idx * 3] = bx + (selX - bx) * depth2Pull
      targetPositions[idx * 3 + 1] = by + (selY - by) * depth2Pull
      targetPositions[idx * 3 + 2] = bz + (selZ - bz) * depth2Pull
    })

  // Unconnected nodes: gentle push outward from selected node
  const pushStrength = strength * 0.08
  layoutNodes.forEach((n, i) => {
    if (depths.has(n.id)) return
    const idx = i
    const bx = basePositions[idx * 3]
    const by = basePositions[idx * 3 + 1]
    const bz = basePositions[idx * 3 + 2]

    const dx = bx - selX
    const dy = by - selY
    const dz = bz - selZ
    const dist = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1

    targetPositions[idx * 3] = bx + (dx / dist) * pushStrength * 30
    targetPositions[idx * 3 + 1] = by + (dy / dist) * pushStrength * 30
    targetPositions[idx * 3 + 2] = bz + (dz / dist) * pushStrength * 30
  })
}

/**
 * Apply cluster attraction - pull nodes toward their cluster centroids.
 * Modifies targetPositions in-place (blended on top of existing targets).
 */
export function applyClusterAttraction(
  clusterAssignments: Map<string, { cx: number; cy: number; cz: number }>,
  nodeIdToIdx: Map<string, number>,
  _basePositions: Float32Array,
  targetPositions: Float32Array,
  strength: number
) {
  if (strength <= 0) return

  clusterAssignments.forEach((centroid, nodeId) => {
    const idx = nodeIdToIdx.get(nodeId)
    if (idx === undefined) return

    const offset = idx * 3
    const bx = targetPositions[offset]
    const by = targetPositions[offset + 1]
    const bz = targetPositions[offset + 2]

    targetPositions[offset] = bx + (centroid.cx - bx) * strength * 0.3
    targetPositions[offset + 1] = by + (centroid.cy - by) * strength * 0.3
    targetPositions[offset + 2] = bz + (centroid.cz - bz) * strength * 0.3
  })
}
