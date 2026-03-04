import { useMemo, useRef, useState, useEffect } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import type { Cluster } from '@/hooks/useClusterDetection'

interface ClusterBoundariesProps {
  clusters: Cluster[]
  visible: boolean
  opacity?: number
}

const FADE_SPEED = 3
// Time (ms) for opacity to decay below 0.01 at 60fps with FADE_SPEED=3:
// 0.3 * (1 - min(1, FADE_SPEED/60))^n < 0.01  →  n ≈ 67 frames ≈ 1200ms
const FADE_DURATION_MS = 1200

// Generate points on a sphere surface for dotted effect
function generateSpherePoints(radius: number, count: number): Float32Array {
  const positions = new Float32Array(count * 3)

  // Fibonacci sphere distribution for even spacing
  const goldenRatio = (1 + Math.sqrt(5)) / 2
  const angleIncrement = Math.PI * 2 * goldenRatio

  for (let i = 0; i < count; i++) {
    const t = i / count
    const inclination = Math.acos(1 - 2 * t)
    const azimuth = angleIncrement * i

    const x = Math.sin(inclination) * Math.cos(azimuth) * radius
    const y = Math.sin(inclination) * Math.sin(azimuth) * radius
    const z = Math.cos(inclination) * radius

    positions[i * 3] = x
    positions[i * 3 + 1] = y
    positions[i * 3 + 2] = z
  }

  return positions
}

/**
 * A single cluster boundary sphere made of points
 */
function ClusterBoundary({
  cluster,
  targetOpacity = 0.3,
}: {
  cluster: Cluster
  targetOpacity?: number
}) {
  const pointsRef = useRef<THREE.Points>(null)
  const materialRef = useRef<THREE.PointsMaterial>(null)
  const currentOpacityRef = useRef(0)

  const pointCount = Math.max(100, Math.floor(cluster.radius * 8))

  const positions = useMemo(() => {
    return generateSpherePoints(cluster.radius, pointCount)
  }, [cluster.radius, pointCount])

  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.05
      pointsRef.current.rotation.x += delta * 0.02
    }
    // Smooth fade
    if (materialRef.current) {
      const diff = targetOpacity - currentOpacityRef.current
      currentOpacityRef.current += diff * Math.min(1, delta * FADE_SPEED)
      materialRef.current.opacity = currentOpacityRef.current
    }
  })

  const color = useMemo(() => {
    return new THREE.Color(cluster.color)
  }, [cluster.color])

  return (
    <points
      ref={pointsRef}
      position={[cluster.centroid.x, cluster.centroid.y, cluster.centroid.z]}
    >
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={pointCount}
          array={positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial
        ref={materialRef}
        color={color}
        size={1.5}
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
      />
    </points>
  )
}

/**
 * Renders dotted sphere boundaries around detected clusters
 */
export function ClusterBoundaries({
  clusters,
  visible,
  opacity = 0.3,
}: ClusterBoundariesProps) {
  const [displayClusters, setDisplayClusters] = useState<Cluster[]>(() =>
    visible ? clusters : []
  )

  useEffect(() => {
    if (visible) {
      setDisplayClusters(clusters)
      return
    }
    // Keep mounted long enough for opacity to fully decay, then unmount
    const timeout = window.setTimeout(() => setDisplayClusters([]), FADE_DURATION_MS)
    return () => window.clearTimeout(timeout)
  }, [visible, clusters])

  if (displayClusters.length === 0) return null

  return (
    <group>
      {displayClusters.map((cluster) => (
        <ClusterBoundary
          key={cluster.id}
          cluster={cluster}
          targetOpacity={visible ? opacity : 0}
        />
      ))}
    </group>
  )
}
