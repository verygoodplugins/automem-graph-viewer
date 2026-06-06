import { useMemo, useRef, useState, useEffect } from "react";
import { useFrame } from "@react-three/fiber";
import * as THREE from "three";
import type { Cluster } from "@/hooks/useClusterDetection";

interface ClusterBoundariesProps {
  clusters: Cluster[];
  visible: boolean;
  opacity?: number;
  hoveredClusterId?: string | null;
}

const FADE_SPEED = 3;
const FADE_DURATION_MS = 1200;
// Additive blending (below) accumulates overlapping dots into a glowing core,
// so the per-dot opacity stays modest while the lobe still reads as a luminous
// nebula against the dark scene. These were near-invisible at 0.12/normal blend.
const BASE_OPACITY = 0.22;
const HOVER_OPACITY = 0.45;

// Nebula-style point cloud: very small dots distributed through the volume
function generateNebulaPoints(radius: number, count: number): Float32Array {
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) {
    // Random points within the sphere volume (not just surface)
    // Use cube-root distribution for even volume fill
    const r = radius * Math.cbrt(Math.random());
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);

    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  return positions;
}

function ClusterBoundary({
  cluster,
  targetOpacity,
  isHovered,
}: {
  cluster: Cluster;
  targetOpacity: number;
  isHovered: boolean;
}) {
  const materialRef = useRef<THREE.PointsMaterial>(null);
  const currentOpacityRef = useRef(0);

  const effectiveTarget = isHovered ? HOVER_OPACITY : targetOpacity;

  // Denser fill so the volume reads as a continuous haze, not sparse specks.
  const pointCount = Math.max(140, Math.floor(cluster.radius * 6));

  const positions = useMemo(
    () => generateNebulaPoints(cluster.radius, pointCount),
    [cluster.radius, pointCount],
  );

  useFrame((_, delta) => {
    if (materialRef.current) {
      const diff = effectiveTarget - currentOpacityRef.current;
      currentOpacityRef.current += diff * Math.min(1, delta * FADE_SPEED);
      materialRef.current.opacity = currentOpacityRef.current;
    }
  });

  const color = useMemo(() => new THREE.Color(cluster.color), [cluster.color]);

  return (
    <points
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
        size={1.1}
        transparent
        opacity={0}
        sizeAttenuation
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  );
}

/**
 * Renders nebula-like point cloud boundaries around detected clusters.
 * Very small dots distributed through the cluster volume — can't be
 * confused with memory nodes.
 */
export function ClusterBoundaries({
  clusters,
  visible,
  opacity = BASE_OPACITY,
  hoveredClusterId,
}: ClusterBoundariesProps) {
  const [displayClusters, setDisplayClusters] = useState<Cluster[]>(() =>
    visible ? clusters : [],
  );

  useEffect(() => {
    if (visible) {
      setDisplayClusters(clusters);
      return;
    }
    const timeout = window.setTimeout(
      () => setDisplayClusters([]),
      FADE_DURATION_MS,
    );
    return () => window.clearTimeout(timeout);
  }, [visible, clusters]);

  if (displayClusters.length === 0) return null;

  return (
    <group>
      {displayClusters.map((cluster) => (
        <ClusterBoundary
          key={cluster.id}
          cluster={cluster}
          targetOpacity={visible ? opacity : 0}
          isHovered={hoveredClusterId === cluster.id}
        />
      ))}
    </group>
  );
}
