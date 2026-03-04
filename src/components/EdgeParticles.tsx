/**
 * EdgeParticles - Animated particles flowing along edges
 *
 * Creates a subtle, ambient effect where tiny particles flow along
 * relationship edges. Speed and density correlate with edge strength.
 */

import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { GraphEdge, SimulationNode } from '@/lib/types'

interface EdgeParticlesProps {
  edges: GraphEdge[]
  nodes: SimulationNode[]
  enabled?: boolean
  particlesPerEdge?: number
  animatedPositions?: React.MutableRefObject<Float32Array>
  nodeIdToIdx?: Map<string, number>
}

// Maximum particles to render for performance
const MAX_PARTICLES = 2000
const PARTICLE_SIZE = 0.3

export function EdgeParticles({
  edges,
  nodes,
  enabled = true,
  particlesPerEdge = 3,
  animatedPositions,
  nodeIdToIdx,
}: EdgeParticlesProps) {
  const pointsRef = useRef<THREE.Points>(null)
  const progressRef = useRef<Float32Array | null>(null)
  const edgeDataRef = useRef<{ start: THREE.Vector3; end: THREE.Vector3; speed: number; color: THREE.Color }[]>([])
  // Store the actual clamped value so useFrame uses the same count as geometry creation
  const actualParticlesPerEdgeRef = useRef(particlesPerEdge)

  // Build node position lookup
  const nodePositions = useMemo(() => {
    const map = new Map<string, THREE.Vector3>()
    nodes.forEach(node => {
      map.set(node.id, new THREE.Vector3(node.x ?? 0, node.y ?? 0, node.z ?? 0))
    })
    return map
  }, [nodes])

  // Create particle geometry and initial positions
  const { geometry, particleCount } = useMemo(() => {
    if (!enabled || edges.length === 0) {
      return { geometry: new THREE.BufferGeometry(), particleCount: 0 }
    }

    // Limit total particles
    const actualParticlesPerEdge = Math.min(
      particlesPerEdge,
      Math.floor(MAX_PARTICLES / edges.length)
    )
    actualParticlesPerEdgeRef.current = actualParticlesPerEdge
    const count = Math.min(edges.length * actualParticlesPerEdge, MAX_PARTICLES)

    const positions = new Float32Array(count * 3)
    const colors = new Float32Array(count * 3)
    const progress = new Float32Array(count)
    const edgeData: { start: THREE.Vector3; end: THREE.Vector3; speed: number; color: THREE.Color }[] = []

    let particleIndex = 0

    edges.forEach(edge => {
      const startPos = nodePositions.get(edge.source)
      const endPos = nodePositions.get(edge.target)

      if (!startPos || !endPos) return

      // Parse edge color
      const edgeColor = new THREE.Color(edge.color || '#666666')

      for (let i = 0; i < actualParticlesPerEdge && particleIndex < count; i++) {
        // Random starting progress along edge
        const p = Math.random()
        progress[particleIndex] = p

        // Store edge data for this particle
        edgeData.push({
          start: startPos.clone(),
          end: endPos.clone(),
          speed: 0.15 + edge.strength * 0.25, // Stronger = faster
          color: edgeColor,
        })

        // Set initial position
        const x = startPos.x + (endPos.x - startPos.x) * p
        const y = startPos.y + (endPos.y - startPos.y) * p
        const z = startPos.z + (endPos.z - startPos.z) * p

        positions[particleIndex * 3] = x
        positions[particleIndex * 3 + 1] = y
        positions[particleIndex * 3 + 2] = z

        // Set color with some alpha variation
        colors[particleIndex * 3] = edgeColor.r
        colors[particleIndex * 3 + 1] = edgeColor.g
        colors[particleIndex * 3 + 2] = edgeColor.b

        particleIndex++
      }
    })

    progressRef.current = progress
    edgeDataRef.current = edgeData

    const geo = new THREE.BufferGeometry()
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3))
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3))

    return { geometry: geo, particleCount: particleIndex }
  }, [edges, nodePositions, enabled, particlesPerEdge])

  // Animate particles along edges (using animated positions when available)
  useFrame((_, delta) => {
    if (!enabled || !pointsRef.current || !progressRef.current || particleCount === 0) return

    const positions = pointsRef.current.geometry.attributes.position
    const progress = progressRef.current
    const edgeData = edgeDataRef.current
    const ap = animatedPositions?.current

    // If animated positions available, update edge start/end from them
    if (ap && ap.length > 0 && nodeIdToIdx) {
      let edgeIndex = 0
      for (const edge of edges) {
        const srcIdx = nodeIdToIdx.get(edge.source)
        const tgtIdx = nodeIdToIdx.get(edge.target)
        if (srcIdx === undefined || tgtIdx === undefined) continue
        for (let j = 0; j < actualParticlesPerEdgeRef.current && edgeIndex < edgeData.length; j++) {
          edgeData[edgeIndex].start.set(ap[srcIdx * 3], ap[srcIdx * 3 + 1], ap[srcIdx * 3 + 2])
          edgeData[edgeIndex].end.set(ap[tgtIdx * 3], ap[tgtIdx * 3 + 1], ap[tgtIdx * 3 + 2])
          edgeIndex++
        }
      }
    }

    for (let i = 0; i < particleCount; i++) {
      progress[i] += delta * edgeData[i].speed

      if (progress[i] > 1) {
        progress[i] = progress[i] % 1
      }

      const p = progress[i]
      const { start, end } = edgeData[i]

      positions.array[i * 3] = start.x + (end.x - start.x) * p
      positions.array[i * 3 + 1] = start.y + (end.y - start.y) * p
      positions.array[i * 3 + 2] = start.z + (end.z - start.z) * p
    }

    positions.needsUpdate = true
  })

  // Update edge data when nodes move
  useMemo(() => {
    if (edgeDataRef.current.length === 0) return

    let edgeIndex = 0
    edges.forEach(edge => {
      const startPos = nodePositions.get(edge.source)
      const endPos = nodePositions.get(edge.target)

      if (!startPos || !endPos) return

      for (let i = 0; i < actualParticlesPerEdgeRef.current && edgeIndex < edgeDataRef.current.length; i++) {
        edgeDataRef.current[edgeIndex].start.copy(startPos)
        edgeDataRef.current[edgeIndex].end.copy(endPos)
        edgeIndex++
      }
    })
  }, [nodePositions, edges])

  if (!enabled || particleCount === 0) return null

  return (
    <points ref={pointsRef} geometry={geometry}>
      <pointsMaterial
        size={PARTICLE_SIZE}
        vertexColors
        transparent
        opacity={0.6}
        sizeAttenuation
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </points>
  )
}
