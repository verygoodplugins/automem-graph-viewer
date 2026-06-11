import { useRef, useMemo, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import { Billboard, Text } from '@react-three/drei'
import * as THREE from 'three'
import type { SimulationNode, GraphNode } from '../lib/types'
import { PRE_SELECT } from '../lib/palette'

/**
 * Expansion frontier cue: a slowly-rotating dashed ring + "+N more" count
 * around the selected node when it still has unloaded neighbors. The dashes
 * read as "incomplete boundary — there is more world here"; a fully-expanded
 * node renders nothing, so absence reads as exhausted. Focus-and-expand is the
 * app's core model, and this is the canvas-side answer to "where is there
 * more?" (previously only visible as a disabled button deep in the inspector).
 */
interface ExpansionFrontierRingProps {
  node: SimulationNode | null
  count: number
  /** World-space ring radius (caller scales off node radius × nodeSizeScale). */
  radius: number
  animatedPositions?: React.MutableRefObject<Float32Array>
  nodeIdToIdx?: Map<string, number>
}

// Dash segmentation for the frontier ring: N short ring-arc meshes around the
// circle (mesh arcs, not THREE.Line — LineDashedMaterial misrendered under the
// instanced-emissive scene as a filled disc).
const FRONTIER_DASHES = 14
const FRONTIER_DASH_FRACTION = 0.62 // portion of each slice that is dash (vs gap)

export function ExpansionFrontierRing({
  node,
  count,
  radius,
  animatedPositions,
  nodeIdToIdx,
}: ExpansionFrontierRingProps) {
  const groupRef = useRef<THREE.Group>(null)
  const ringRef = useRef<THREE.Group>(null)

  // One shared unit arc geometry + material for all dashes; each dash is a
  // rotated instance of the same arc. Scaled to `radius` on the parent group.
  const dashGeometry = useMemo(() => {
    const sliceAngle = (Math.PI * 2) / FRONTIER_DASHES
    return new THREE.RingGeometry(0.94, 1.0, 10, 1, 0, sliceAngle * FRONTIER_DASH_FRACTION)
  }, [])
  const dashMaterial = useMemo(
    () =>
      new THREE.MeshBasicMaterial({
        color: '#e8ecf4',
        transparent: true,
        opacity: 0.5,
        side: THREE.DoubleSide,
        depthWrite: false,
      }),
    []
  )

  useFrame((state) => {
    if (!node) return
    if (groupRef.current && animatedPositions && nodeIdToIdx) {
      const idx = nodeIdToIdx.get(node.id)
      if (idx !== undefined) {
        const ap = animatedPositions.current
        const off = idx * 3
        if (off + 2 < ap.length) {
          groupRef.current.position.set(ap[off], ap[off + 1], ap[off + 2])
        }
      }
    }
    // Slow rotation keeps the dashes alive without demanding attention.
    if (ringRef.current) {
      ringRef.current.rotation.z = state.clock.elapsedTime * 0.35
    }
  })

  if (!node || count <= 0) return null

  return (
    <group ref={groupRef} position={[node.x || 0, node.y || 0, node.z || 0]}>
      <Billboard>
        <group ref={ringRef} scale={radius}>
          {Array.from({ length: FRONTIER_DASHES }, (_, i) => (
            <mesh
              key={i}
              geometry={dashGeometry}
              material={dashMaterial}
              rotation={[0, 0, (i * Math.PI * 2) / FRONTIER_DASHES]}
            />
          ))}
        </group>
        <Text
          position={[0, -(radius + 1.6), 0]}
          fontSize={1.8}
          color="#e8ecf4"
          fillOpacity={0.75}
          anchorX="center"
          anchorY="top"
          outlineWidth={0.08}
          outlineColor="#000000"
        >
          {`+${count} more`}
        </Text>
      </Billboard>
    </group>
  )
}

/**
 * Visual feedback for direct pinch selection ("pick the berry")
 * Shows a ring that tightens as pinch strength increases
 */
interface PinchPreSelectHighlightProps {
  node: SimulationNode | null
  pinchStrength: number // 0-1: how close to pinching
  color?: string
}

export function PinchPreSelectHighlight({
  node,
  pinchStrength,
  color,
}: PinchPreSelectHighlightProps) {
  const ringRef = useRef<THREE.Mesh>(null)
  const innerRingRef = useRef<THREE.Mesh>(null)
  const [prevNode, setPrevNode] = useState<SimulationNode | null>(null)
  const fadeRef = useRef(0)

  // Smooth fade in/out when node changes
  useEffect(() => {
    if (node !== prevNode) {
      setPrevNode(node)
    }
  }, [node, prevNode])

  // Animate the ring based on pinch strength
  useFrame((state, delta) => {
    // Fade in/out
    const targetFade = node ? 1 : 0
    fadeRef.current += (targetFade - fadeRef.current) * Math.min(1, delta * 8)

    if (fadeRef.current < 0.01) return
    if (!ringRef.current || !innerRingRef.current) return

    const t = state.clock.elapsedTime

    // Outer ring: pulses gently
    const outerMaterial = ringRef.current.material as THREE.MeshBasicMaterial
    const pulse = 0.4 + Math.sin(t * 3) * 0.1
    outerMaterial.opacity = pulse * fadeRef.current

    // Slow rotation
    ringRef.current.rotation.z = t * 0.5

    // Inner ring: tightens based on pinch strength
    // At 0 strength, inner ring is at same size as outer
    // At 1 strength (pinched), inner ring contracts to node size
    const innerMaterial = innerRingRef.current.material as THREE.MeshBasicMaterial
    const contractAmount = pinchStrength * 0.7 // How much it contracts (0-0.7)
    innerRingRef.current.scale.setScalar(1 - contractAmount)

    // Inner ring gets brighter and more opaque as pinch increases
    innerMaterial.opacity = (0.3 + pinchStrength * 0.5) * fadeRef.current

    // Opposite rotation for visual interest
    innerRingRef.current.rotation.z = -t * 0.8
  })

  // Use the node that's fading (current or previous)
  const displayNode = node || prevNode
  if (!displayNode || fadeRef.current < 0.01) return null

  const nodeColor = color || PRE_SELECT
  const nodeRadius = displayNode.radius || 3

  // Ring sizes
  const innerRadius = nodeRadius * 1.3
  const outerRadius = nodeRadius * 2.2

  return (
    <group position={[displayNode.x || 0, displayNode.y || 0, displayNode.z || 0]}>
      {/* Outer pulsing ring */}
      <mesh ref={ringRef}>
        <ringGeometry args={[innerRadius, outerRadius, 32]} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Inner contracting ring - shows pinch progress */}
      <mesh ref={innerRingRef}>
        <ringGeometry args={[innerRadius * 0.9, innerRadius, 32]} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.6}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

interface SelectionHighlightProps {
  node: SimulationNode | null
  color?: string
  innerRadius?: number
  outerRadius?: number
  animatedPositions?: React.MutableRefObject<Float32Array>
  nodeIdToIdx?: Map<string, number>
}

/**
 * Animated glowing ring around the selected node
 * Creates an Obsidian-like focus effect
 */
export function SelectionHighlight({
  node,
  color,
  innerRadius = 1.2,
  outerRadius = 1.8,
  animatedPositions,
  nodeIdToIdx,
}: SelectionHighlightProps) {
  const ringRef = useRef<THREE.Mesh>(null)
  const glowRef = useRef<THREE.Mesh>(null)
  const groupRef = useRef<THREE.Group>(null)

  // Ring geometry
  const ringGeometry = useMemo(() => {
    return new THREE.RingGeometry(innerRadius, outerRadius, 32)
  }, [innerRadius, outerRadius])

  // Pulsing animation + position tracking from animated positions
  useFrame((state) => {
    if (!node || !ringRef.current || !glowRef.current) return

    // Update group position from animated positions if available
    if (groupRef.current && animatedPositions && nodeIdToIdx) {
      const idx = nodeIdToIdx.get(node.id)
      if (idx !== undefined) {
        const ap = animatedPositions.current
        const off = idx * 3
        if (off + 2 < ap.length) {
          groupRef.current.position.set(ap[off], ap[off + 1], ap[off + 2])
        }
      }
    }

    const t = state.clock.elapsedTime

    // Pulse opacity
    const pulse = 0.6 + Math.sin(t * 2) * 0.2
    const material = ringRef.current.material as THREE.MeshBasicMaterial
    material.opacity = pulse

    // Slow rotation
    ringRef.current.rotation.z = t * 0.3

    // Glow pulse
    const glowMaterial = glowRef.current.material as THREE.MeshBasicMaterial
    glowMaterial.opacity = 0.3 + Math.sin(t * 3) * 0.1
    glowRef.current.scale.setScalar(1 + Math.sin(t * 2) * 0.1)
  })

  if (!node) return null

  const nodeColor = color || node.color || '#3B82F6'
  const nodeRadius = node.radius || 3

  return (
    <group ref={groupRef} position={[node.x || 0, node.y || 0, node.z || 0]}>
      {/* Inner glow sphere */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[nodeRadius * 1.5, 16, 16]} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.3}
          side={THREE.BackSide}
          depthWrite={false}
        />
      </mesh>

      {/* Selection ring - XY plane */}
      <mesh ref={ringRef} rotation={[0, 0, 0]}>
        <primitive object={ringGeometry} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.7}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>

      {/* Selection ring - XZ plane */}
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <primitive object={ringGeometry.clone()} />
        <meshBasicMaterial
          color={nodeColor}
          transparent
          opacity={0.4}
          side={THREE.DoubleSide}
          depthWrite={false}
        />
      </mesh>
    </group>
  )
}

interface ConnectedPathsHighlightProps {
  selectedNode: GraphNode | null
  connectedNodes: SimulationNode[]
  color?: string
  animatedPositions?: React.MutableRefObject<Float32Array>
  nodeIdToIdx?: Map<string, number>
}

/**
 * Highlights paths from selected node to connected nodes
 * Creates animated flowing particles along the edges
 */
export function ConnectedPathsHighlight({
  selectedNode,
  connectedNodes,
  color,
  animatedPositions,
  nodeIdToIdx,
}: ConnectedPathsHighlightProps) {
  const particlesRef = useRef<THREE.Points>(null)

  // Generate particle positions along paths
  const { positions, colors } = useMemo(() => {
    if (!selectedNode || connectedNodes.length === 0) {
      return { positions: new Float32Array(0), colors: new Float32Array(0) }
    }

    const particlesPerPath = 5
    const totalParticles = connectedNodes.length * particlesPerPath
    const positions = new Float32Array(totalParticles * 3)
    const colors = new Float32Array(totalParticles * 3)

    const selectedPos = {
      x: (selectedNode as SimulationNode).x || 0,
      y: (selectedNode as SimulationNode).y || 0,
      z: (selectedNode as SimulationNode).z || 0,
    }

    connectedNodes.forEach((node, nodeIndex) => {
      const targetPos = {
        x: node.x || 0,
        y: node.y || 0,
        z: node.z || 0,
      }

      const baseColor = new THREE.Color(color || selectedNode.color || '#3B82F6')

      for (let i = 0; i < particlesPerPath; i++) {
        const idx = (nodeIndex * particlesPerPath + i) * 3
        const t = (i + 1) / (particlesPerPath + 1)

        // Interpolate position
        positions[idx] = selectedPos.x + (targetPos.x - selectedPos.x) * t
        positions[idx + 1] = selectedPos.y + (targetPos.y - selectedPos.y) * t
        positions[idx + 2] = selectedPos.z + (targetPos.z - selectedPos.z) * t

        // Color with fade
        const fade = 1 - Math.abs(t - 0.5) * 0.5
        colors[idx] = baseColor.r * fade
        colors[idx + 1] = baseColor.g * fade
        colors[idx + 2] = baseColor.b * fade
      }
    })

    return { positions, colors }
  }, [selectedNode, connectedNodes, color])

  // Animate particles flowing along paths using animated positions when available
  useFrame((state) => {
    if (!particlesRef.current || !selectedNode || connectedNodes.length === 0) return

    const t = state.clock.elapsedTime
    const geometry = particlesRef.current.geometry
    const positionAttr = geometry.getAttribute('position') as THREE.BufferAttribute

    if (!positionAttr || positionAttr.count === 0) return

    const ap = animatedPositions?.current
    const selIdx = nodeIdToIdx?.get(selectedNode.id)
    const selectedPos =
      ap && selIdx !== undefined && selIdx * 3 + 2 < ap.length
        ? { x: ap[selIdx * 3], y: ap[selIdx * 3 + 1], z: ap[selIdx * 3 + 2] }
        : {
            x: (selectedNode as SimulationNode).x || 0,
            y: (selectedNode as SimulationNode).y || 0,
            z: (selectedNode as SimulationNode).z || 0,
          }

    const particlesPerPath = 5

    connectedNodes.forEach((node, nodeIndex) => {
      const nIdx = nodeIdToIdx?.get(node.id)
      const targetPos =
        ap && nIdx !== undefined && nIdx * 3 + 2 < ap.length
          ? { x: ap[nIdx * 3], y: ap[nIdx * 3 + 1], z: ap[nIdx * 3 + 2] }
          : { x: node.x || 0, y: node.y || 0, z: node.z || 0 }

      for (let i = 0; i < particlesPerPath; i++) {
        const idx = nodeIndex * particlesPerPath + i
        const baseT = (i + 1) / (particlesPerPath + 1)
        const flowT = (baseT + (t * 0.5) % 1) % 1

        positionAttr.setXYZ(
          idx,
          selectedPos.x + (targetPos.x - selectedPos.x) * flowT,
          selectedPos.y + (targetPos.y - selectedPos.y) * flowT,
          selectedPos.z + (targetPos.z - selectedPos.z) * flowT
        )
      }
    })

    positionAttr.needsUpdate = true
  })

  if (!selectedNode || connectedNodes.length === 0 || positions.length === 0) {
    return null
  }

  const particleCount = positions.length / 3

  return (
    <points ref={particlesRef} key={particleCount}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particleCount}
          array={positions}
          itemSize={3}
        />
        <bufferAttribute
          attach="attributes-color"
          count={particleCount}
          array={colors}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        size={2}
        vertexColors
        transparent
        opacity={0.8}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}
