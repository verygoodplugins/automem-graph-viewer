import { useRef, useEffect, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type { SimulationNode } from '@/lib/types'

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
    for (let i = 0; i < cur.length; i++) {
      cur[i] += (tgt[i] - cur[i]) * t
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
