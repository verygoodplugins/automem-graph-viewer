import { useCallback } from 'react'
import { Text, Billboard } from '@react-three/drei'
import type { ThreeEvent } from '@react-three/fiber'
import type { Cluster } from '../hooks/useClusterDetection'

interface ClusterLabelsProps {
  clusters: Cluster[]
  visible: boolean
  hoveredClusterId?: string | null
  onClusterHover?: (cluster: Cluster | null) => void
  onClusterClick?: (cluster: Cluster) => void
}

interface ClusterLabelProps {
  cluster: Cluster
  isHovered: boolean
  anyHovered: boolean
  onHover?: (cluster: Cluster | null) => void
  onClick?: (cluster: Cluster) => void
}

function ClusterLabel({ cluster, isHovered, anyHovered, onHover, onClick }: ClusterLabelProps) {
  // Position label above the cluster centroid
  const yOffset = cluster.radius + 8

  const titleSize = isHovered ? 4 : 3
  const subtitleOpacity = isHovered ? 1.0 : anyHovered ? 0.4 : 0.7
  const titleOpacity = isHovered ? 1.0 : anyHovered ? 0.5 : 1.0

  const handlePointerOver = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover?.(cluster)
      document.body.style.cursor = 'pointer'
    },
    [cluster, onHover]
  )

  const handlePointerOut = useCallback(
    (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      onHover?.(null)
      document.body.style.cursor = 'default'
    },
    [onHover]
  )

  const handleClick = useCallback(
    (e: ThreeEvent<MouseEvent>) => {
      e.stopPropagation()
      onClick?.(cluster)
    },
    [cluster, onClick]
  )

  return (
    <group
      position={[cluster.centroid.x, cluster.centroid.y + yOffset, cluster.centroid.z]}
    >
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          fontSize={titleSize}
          color={cluster.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.15}
          outlineColor="#000000"
          fillOpacity={titleOpacity}
          maxWidth={60}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onClick={handleClick}
        >
          {cluster.label}
        </Text>
        <Text
          fontSize={1.8}
          color="#94A3B8"
          anchorX="center"
          anchorY="top"
          position={[0, -0.5, 0]}
          outlineWidth={0.1}
          outlineColor="#000000"
          fillOpacity={subtitleOpacity}
          onPointerOver={handlePointerOver}
          onPointerOut={handlePointerOut}
          onClick={handleClick}
        >
          {cluster.memberCount} memories
          {cluster.topTags.length > 0 ? ` · ${cluster.topTags.slice(0, 3).join(', ')}` : ''}
        </Text>
      </Billboard>
    </group>
  )
}

export function ClusterLabels({
  clusters,
  visible,
  hoveredClusterId,
  onClusterHover,
  onClusterClick,
}: ClusterLabelsProps) {
  if (!visible || clusters.length === 0) return null

  const anyHovered = hoveredClusterId != null

  return (
    <group>
      {clusters.map((cluster) => (
        <ClusterLabel
          key={cluster.id}
          cluster={cluster}
          isHovered={hoveredClusterId === cluster.id}
          anyHovered={anyHovered}
          onHover={onClusterHover}
          onClick={onClusterClick}
        />
      ))}
    </group>
  )
}
