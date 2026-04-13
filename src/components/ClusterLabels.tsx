import { Text, Billboard } from '@react-three/drei'
import type { Cluster } from '../hooks/useClusterDetection'

interface ClusterLabelsProps {
  clusters: Cluster[]
  visible: boolean
}

function ClusterLabel({ cluster }: { cluster: Cluster }) {
  // Position label above the cluster centroid
  const yOffset = cluster.radius + 8

  return (
    <group
      position={[cluster.centroid.x, cluster.centroid.y + yOffset, cluster.centroid.z]}
    >
      <Billboard follow lockX={false} lockY={false} lockZ={false}>
        <Text
          fontSize={3}
          color={cluster.color}
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.15}
          outlineColor="#000000"
          fillOpacity={1}
          maxWidth={60}
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
          fillOpacity={0.7}
        >
          {cluster.memberCount} memories
          {cluster.topTags.length > 0 ? ` · ${cluster.topTags.slice(0, 3).join(', ')}` : ''}
        </Text>
      </Billboard>
    </group>
  )
}

export function ClusterLabels({ clusters, visible }: ClusterLabelsProps) {
  if (!visible || clusters.length === 0) return null

  return (
    <group>
      {clusters.map((cluster) => (
        <ClusterLabel key={cluster.id} cluster={cluster} />
      ))}
    </group>
  )
}
