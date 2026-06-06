/**
 * GraphCanvas - High-performance 3D memory visualization
 *
 * Performance optimizations:
 * - Instanced mesh rendering for nodes (1 draw call for all nodes)
 * - Batched LineSegments for edges (1 draw call for all edges)
 * - Reduced geometry complexity (12x12 segments vs 32x32)
 * - LOD for labels (only show labels for nearby/selected nodes)
 * - Optional post-processing (performance mode toggle)
 * - Single useFrame callback for all animations
 *
 * Interaction model (simplified):
 * - Mouse: Click nodes to select, OrbitControls for navigation
 * - Hand gestures: Two-hand pinch to pan/zoom/rotate; one-hand fist grab to pan
 */

import {
  useRef,
  useMemo,
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
} from "react";
import { Canvas, useFrame, useThree, ThreeEvent } from "@react-three/fiber";
import { OrbitControls, Text, Billboard } from "@react-three/drei";
import { EffectComposer, Bloom, Vignette } from "@react-three/postprocessing";
import * as THREE from "three";
import { useForceLayout } from "../hooks/useForceLayout";
import { usePositionInterpolation } from "@/hooks/usePositionInterpolation";
import { useHandGestures, GestureState } from "../hooks/useHandGestures";
import { useIPhoneHandTracking } from "../hooks/useIPhoneHandTracking";
import { useHandLockAndGrab } from "../hooks/useHandLockAndGrab";
import type {
  GraphNode,
  GraphEdge,
  SimulationNode,
  ForceConfig,
  DisplayConfig,
  ClusterConfig,
  RelationshipVisibility,
} from "../lib/types";
import {
  DEFAULT_FORCE_CONFIG,
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_CLUSTER_CONFIG,
  DEFAULT_RELATIONSHIP_VISIBILITY,
} from "../lib/types";
import {
  useClusterDetection,
  type Cluster,
} from "../hooks/useClusterDetection";
import { ClusterBoundaries } from "./ClusterBoundaries";
import { ClusterLabels } from "./ClusterLabels";

interface NodeFocusState {
  depth: number;
  opacity: number;
  isInFocus: boolean;
}

const SELECTION_DEPTH_OPACITY = [1.0, 1.0, 0.7, 0.4];
const SELECTION_DEFAULT_OPACITY = 0.15;
// Cap how many cluster hulls/labels render so tags/entity modes (which can yield
// dozens of small clusters) don't bury the scene in floating text. We keep the
// largest N by member count; the force still anchors every cluster.
const MAX_VISIBLE_CLUSTERS = 16;
import {
  SelectionHighlight,
  PinchPreSelectHighlight,
} from "./SelectionHighlight";
import { getEdgeStyle } from "../lib/edgeStyles";
import { matchesSearch } from "../lib/searchMatch";
import { EdgeParticles } from "./EdgeParticles";
import { MiniMap } from "./MiniMap";
import type { OrbitControls as OrbitControlsImpl } from "three-stdlib";

// Get iPhone WebSocket URL from URL params or default
function useIPhoneUrl() {
  const [iphoneUrl, setIphoneUrl] = useState("ws://localhost:8766/ws");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const url = params.get("iphone_url");
    if (url) {
      setIphoneUrl(url);
    }
  }, []);

  return iphoneUrl;
}

// Vibrant type colors for clear visual distinction on dark backgrounds
const VIBRANT_TYPE_COLORS: Record<string, string> = {
  Decision: "#f59e0b",
  Pattern: "#10b981",
  Insight: "#8b5cf6",
  Preference: "#ec4899",
  Context: "#3b82f6",
  Style: "#06b6d4",
  Habit: "#f97316",
  Memory: "#6366f1",
};

// Performance constants
const SPHERE_SEGMENTS = 12; // Reduced from 32 - good enough for small spheres
const LABEL_DISTANCE_THRESHOLD = 80; // Only show labels for nodes within this distance
const MAX_VISIBLE_LABELS = 10; // Maximum labels to show at once (for LOD)

interface GraphCanvasProps {
  nodes: GraphNode[];
  edges: GraphEdge[];
  selectedNode: GraphNode | null;
  hoveredNode: GraphNode | null;
  searchTerm: string;
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeHover: (node: GraphNode | null) => void;
  gestureControlEnabled?: boolean;
  trackingSource?: "mediapipe" | "iphone";
  onGestureStateChange?: (state: GestureState) => void;
  onTrackingInfoChange?: (info: {
    source: "mediapipe" | "iphone";
    iphoneUrl: string;
    iphoneConnected: boolean;
    hasLiDAR: boolean;
    phoneConnected: boolean;
    bridgeIps: string[];
    phonePort: number | null;
  }) => void;
  performanceMode?: boolean;
  forceConfig?: ForceConfig;
  displayConfig?: DisplayConfig;
  clusterConfig?: ClusterConfig;
  relationshipVisibility?: RelationshipVisibility;
  typeColors?: Record<string, string>;
  // Expansion: seed newly-merged nodes next to the node the user expanded from.
  expansionAnchors?: Map<string, string>;
  onReheatReady?: (reheat: () => void) => void;
  onResetViewReady?: (resetView: () => void) => void;
  // Expose an imperative camera-navigation handle to the parent (used by the
  // inspector navigate action, search-result clicks, and breadcrumb jumps).
  // The parent passes a node id (+ optional frame flag); GraphCanvas resolves the
  // node's LIVE position and either re-targets gently or flies in + frames it.
  // The minimap keeps the cheaper re-target navigator.
  onNavigateForBookmarks?: (
    fn: (nodeId: string, frame?: boolean) => void,
  ) => void;
  // Pathfinding: highlight path nodes and edges
  pathNodeIds?: Set<string>;
  pathEdgeKeys?: Set<string>;
  pathSourceId?: string | null;
  pathTargetId?: string | null;
  isPathSelecting?: boolean;
  // Time Travel: filter nodes by timestamp
  timeTravelActive?: boolean;
  timeTravelVisibleNodes?: Set<string>;
  // Tag cloud filtering
  tagFilteredNodeIds?: Set<string>;
  hasTagFilter?: boolean;
  // Cluster interaction
  onClusterSelect?: (cluster: Cluster | null) => void;
}

export function GraphCanvas({
  nodes,
  edges,
  selectedNode,
  hoveredNode,
  searchTerm,
  onNodeSelect,
  onNodeHover,
  gestureControlEnabled = false,
  trackingSource: source = "mediapipe",
  onGestureStateChange,
  onTrackingInfoChange,
  performanceMode = false,
  forceConfig = DEFAULT_FORCE_CONFIG,
  displayConfig = DEFAULT_DISPLAY_CONFIG,
  clusterConfig = DEFAULT_CLUSTER_CONFIG,
  relationshipVisibility = DEFAULT_RELATIONSHIP_VISIBILITY,
  typeColors = {},
  expansionAnchors,
  onReheatReady,
  onResetViewReady,
  onNavigateForBookmarks,
  pathNodeIds,
  pathEdgeKeys,
  pathSourceId,
  pathTargetId,
  isPathSelecting,
  timeTravelActive = false,
  timeTravelVisibleNodes,
  tagFilteredNodeIds,
  hasTagFilter = false,
  onClusterSelect,
}: GraphCanvasProps) {
  // MiniMap state
  const [cameraState, setCameraState] = useState({
    x: 0,
    y: 0,
    z: 320,
    zoom: 1,
  });
  const [layoutNodesForMiniMap, setLayoutNodesForMiniMap] = useState<
    SimulationNode[]
  >([]);
  // Bimanual grab state for visual feedback
  const [bimanualActive, setBimanualActive] = useState(false);
  const navigateToRef = useRef<((x: number, y: number) => void) | null>(null);

  const handleMiniMapNavigate = useCallback((x: number, y: number) => {
    navigateToRef.current?.(x, y);
  }, []);

  // Minimap navigation: cheap re-target only (no dolly).
  const handleNavigateToReady = useCallback(
    (fn: (x: number, y: number) => void) => {
      navigateToRef.current = fn;
    },
    [],
  );

  // Parent navigation: "fly in + frame" a node by id. Routed to the
  // inspector/search/breadcrumb handle so result clicks travel to + frame the node.
  const handleNavigateToNodeReady = useCallback(
    (fn: (nodeId: string, frame?: boolean) => void) => {
      onNavigateForBookmarks?.(fn);
    },
    [onNavigateForBookmarks],
  );

  // Get iPhone WebSocket URL (from URL param or default)
  const iphoneUrl = useIPhoneUrl();

  // MediaPipe hand tracking (webcam)
  const { gestureState: mediapipeState, isEnabled: mediapipeActive } =
    useHandGestures({
      enabled: gestureControlEnabled && source === "mediapipe",
      onGestureChange:
        source === "mediapipe" ? onGestureStateChange : undefined,
    });

  // iPhone hand tracking (WebSocket)
  const {
    gestureState: iphoneState,
    isConnected: iphoneConnected,
    hasLiDAR,
    phoneConnected,
    bridgeIps,
    phonePort,
  } = useIPhoneHandTracking({
    enabled: gestureControlEnabled && source === "iphone",
    serverUrl: iphoneUrl,
    onGestureChange: source === "iphone" ? onGestureStateChange : undefined,
  });

  // Use whichever source is active
  const gestureState = source === "iphone" ? iphoneState : mediapipeState;
  const gesturesActive =
    source === "iphone" ? iphoneConnected : mediapipeActive;

  useEffect(() => {
    onTrackingInfoChange?.({
      source,
      iphoneUrl,
      iphoneConnected,
      hasLiDAR,
      phoneConnected,
      bridgeIps,
      phonePort,
    });
  }, [
    onTrackingInfoChange,
    source,
    iphoneUrl,
    iphoneConnected,
    hasLiDAR,
    phoneConnected,
    bridgeIps,
    phonePort,
  ]);

  return (
    <div
      className={`relative w-full h-full transition-shadow duration-300 ${bimanualActive ? "ring-2 ring-inset ring-white/40 shadow-[inset_0_0_30px_rgba(232,236,244,0.15)]" : ""}`}
    >
      <Canvas
        camera={{ position: [0, 0, 320], fov: 60, near: 0.1, far: 10000 }}
        gl={{
          antialias: !performanceMode,
          alpha: true,
          powerPreference: "high-performance",
        }}
        style={{
          // Transparent so the fixed `.atmosphere` backdrop (gradient-mesh,
          // contour grid, grain) shows through the WebGL clear.
          background: "transparent",
        }}
        frameloop={performanceMode ? "demand" : "always"}
      >
        <Scene
          nodes={nodes}
          edges={edges}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          searchTerm={searchTerm}
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
          gestureState={gestureState}
          gestureControlEnabled={gestureControlEnabled && gesturesActive}
          performanceMode={performanceMode}
          forceConfig={forceConfig}
          displayConfig={displayConfig}
          clusterConfig={clusterConfig}
          relationshipVisibility={relationshipVisibility}
          typeColors={typeColors}
          expansionAnchors={expansionAnchors}
          onReheatReady={onReheatReady}
          onResetViewReady={onResetViewReady}
          onCameraStateChange={setCameraState}
          onLayoutNodesChange={setLayoutNodesForMiniMap}
          onNavigateToReady={handleNavigateToReady}
          onNavigateToNodeReady={handleNavigateToNodeReady}
          pathNodeIds={pathNodeIds}
          pathEdgeKeys={pathEdgeKeys}
          pathSourceId={pathSourceId}
          pathTargetId={pathTargetId}
          isPathSelecting={isPathSelecting}
          timeTravelActive={timeTravelActive}
          timeTravelVisibleNodes={timeTravelVisibleNodes}
          tagFilteredNodeIds={tagFilteredNodeIds}
          hasTagFilter={hasTagFilter}
          onBimanualGrabChange={setBimanualActive}
          onClusterSelect={onClusterSelect}
        />
      </Canvas>

      {/* MiniMap Navigator */}
      <MiniMap
        nodes={layoutNodesForMiniMap}
        selectedNode={selectedNode}
        cameraPosition={cameraState}
        cameraZoom={cameraState.zoom}
        onNavigate={handleMiniMapNavigate}
        visible={!performanceMode && layoutNodesForMiniMap.length > 0}
        size={140}
      />
    </div>
  );
}

interface SceneProps extends Omit<
  GraphCanvasProps,
  "onGestureStateChange" | "onTrackingInfoChange"
> {
  gestureState: GestureState;
  gestureControlEnabled: boolean;
  performanceMode: boolean;
  onResetViewReady?: (resetView: () => void) => void;
  onCameraStateChange?: (state: {
    x: number;
    y: number;
    z: number;
    zoom: number;
  }) => void;
  onLayoutNodesChange?: (nodes: SimulationNode[]) => void;
  onNavigateToReady?: (fn: (x: number, y: number) => void) => void;
  onNavigateToNodeReady?: (
    fn: (nodeId: string, frame?: boolean) => void,
  ) => void;
  // Pathfinding
  pathNodeIds?: Set<string>;
  pathEdgeKeys?: Set<string>;
  pathSourceId?: string | null;
  pathTargetId?: string | null;
  isPathSelecting?: boolean;
  // Time Travel
  timeTravelActive?: boolean;
  timeTravelVisibleNodes?: Set<string>;
  // Tag cloud filtering
  tagFilteredNodeIds?: Set<string>;
  hasTagFilter?: boolean;
  // Bimanual world-manipulation feedback
  onBimanualGrabChange?: (active: boolean) => void;
}

function Scene({
  nodes,
  edges,
  selectedNode,
  hoveredNode,
  searchTerm,
  onNodeSelect,
  onNodeHover,
  gestureState,
  gestureControlEnabled,
  performanceMode,
  forceConfig = DEFAULT_FORCE_CONFIG,
  displayConfig = DEFAULT_DISPLAY_CONFIG,
  clusterConfig = DEFAULT_CLUSTER_CONFIG,
  relationshipVisibility = DEFAULT_RELATIONSHIP_VISIBILITY,
  typeColors = {},
  expansionAnchors,
  onReheatReady,
  onResetViewReady,
  onCameraStateChange,
  onLayoutNodesChange,
  onNavigateToReady,
  onNavigateToNodeReady,
  pathNodeIds,
  pathEdgeKeys,
  pathSourceId,
  pathTargetId,
  isPathSelecting: _isPathSelecting,
  timeTravelActive = false,
  timeTravelVisibleNodes,
  tagFilteredNodeIds,
  hasTagFilter = false,
  onBimanualGrabChange,
  onClusterSelect,
}: SceneProps) {
  const { camera } = useThree();

  // Cluster detection runs on the RAW nodes (position-independent now — it only
  // reads tags/type/edges) and feeds deterministic anchors into the layout below,
  // so it must be computed BEFORE useForceLayout.
  const clusters = useClusterDetection({
    nodes,
    edges,
    mode: clusterConfig.mode,
    typeColors,
  });

  // Single-valued anchor per node for the cluster FORCE. A node may belong to
  // several clusters (entity mode: multiple entity: tags); averaging their anchors
  // would pull it to dead space between lobes (in neither). Instead pick ONE
  // dominant cluster deterministically — the smallest cluster it belongs to (most
  // specific), tie-broken by smallest cluster id. Multi-membership is preserved
  // for boundaries/labels/affinity-highlighting; only the force anchor collapses.
  const clusterAnchorsByNodeId = useMemo(() => {
    const anchor = new Map<string, { x: number; y: number; z: number }>();
    const bestSize = new Map<string, number>();
    // Sort by id ascending so the tiebreak (equal member counts) is deterministic.
    const ordered = [...clusters].sort((a, b) =>
      a.id < b.id ? -1 : a.id > b.id ? 1 : 0,
    );
    for (const cluster of ordered) {
      const size = cluster.memberCount;
      cluster.nodeIds.forEach((nodeId) => {
        const prev = bestSize.get(nodeId);
        // Strictly smaller wins; equal sizes keep the earlier (smaller-id) cluster.
        if (prev === undefined || size < prev) {
          bestSize.set(nodeId, size);
          anchor.set(nodeId, cluster.centroid);
        }
      });
    }
    return anchor;
  }, [clusters]);

  const {
    nodes: layoutNodes,
    isSimulating,
    reheat,
    layoutTick,
  } = useForceLayout({
    nodes,
    edges,
    forceConfig,
    expansionAnchors,
    clusterAnchors: clusterAnchorsByNodeId,
    // Passed UNCONDITIONALLY (not gated on mode !== 'none'): the force only exists
    // when anchors exist (mode !== 'none' → non-empty map), so keeping strength
    // constant across mode toggles means a mode flip never spuriously trips the
    // live strength-mutation effect — only the firmer relocate-settle runs.
    clusterForceStrength: clusterConfig.clusterStrength,
    clusterSignature: clusterConfig.mode,
  });

  // Live, always-current view of the simulated nodes. navigateToNode reads this
  // by id so it flies to a node's CURRENT position — the snapshot node objects
  // App holds don't carry the in-place simulation x/y/z, only layoutNodes do.
  const layoutNodesRef = useRef(layoutNodes);
  layoutNodesRef.current = layoutNodes;

  // Live view of whether the sim is still settling. A frame-fly to a freshly
  // injected off-graph node must KEEP following it: the append-settle moves that
  // node for ~1–2s after the 600ms fly would otherwise end, leaving the camera
  // frozen on empty space. navigateToNode reads this each frame to decide when
  // to stop tracking.
  const simRef = useRef(isSimulating);
  simRef.current = isSimulating;

  // Depth-based selection dimming: auto-spotlight when a node is selected
  const focusStates = useMemo(() => {
    const result = new Map<string, NodeFocusState>();
    if (!selectedNode) {
      layoutNodes.forEach((n) => {
        result.set(n.id, { depth: -1, opacity: 1.0, isInFocus: true });
      });
      return result;
    }
    const adjacency = new Map<string, Set<string>>();
    edges.forEach((e) => {
      if (!adjacency.has(e.source)) adjacency.set(e.source, new Set());
      if (!adjacency.has(e.target)) adjacency.set(e.target, new Set());
      adjacency.get(e.source)!.add(e.target);
      adjacency.get(e.target)!.add(e.source);
    });
    const depths = new Map<string, number>();
    depths.set(selectedNode.id, 0);
    const queue = [{ id: selectedNode.id, depth: 0 }];
    while (queue.length > 0) {
      const { id, depth } = queue.shift()!;
      if (depth >= 3) continue;
      const neighbors = adjacency.get(id);
      if (!neighbors) continue;
      for (const nId of neighbors) {
        if (!depths.has(nId)) {
          depths.set(nId, depth + 1);
          queue.push({ id: nId, depth: depth + 1 });
        }
      }
    }
    // Find entity-affinity nodes: share entity tags with selected node
    const selectedEntityTags = selectedNode.tags.filter((t) =>
      t.startsWith("entity:"),
    );
    const entityAffinitySet = new Set<string>();
    if (selectedEntityTags.length > 0) {
      for (const n of layoutNodes) {
        if (n.id === selectedNode.id) continue;
        if (n.tags.some((t) => selectedEntityTags.includes(t))) {
          entityAffinitySet.add(n.id);
        }
      }
    }

    layoutNodes.forEach((n) => {
      const depth = depths.get(n.id) ?? Infinity;
      if (depth < SELECTION_DEPTH_OPACITY.length) {
        result.set(n.id, {
          depth,
          opacity: SELECTION_DEPTH_OPACITY[depth],
          isInFocus: true,
        });
      } else if (entityAffinitySet.has(n.id)) {
        // Entity-affinity nodes: visible as if depth 3 even without direct edges
        result.set(n.id, {
          depth: 3,
          opacity: SELECTION_DEPTH_OPACITY[3],
          isInFocus: true,
        });
      } else {
        result.set(n.id, {
          depth: -1,
          opacity: SELECTION_DEFAULT_OPACITY,
          isInFocus: false,
        });
      }
    });
    return result;
  }, [layoutNodes, edges, selectedNode]);

  // Position interpolation system. The cluster force now lives in the simulation,
  // so node positions come straight from the sim — there's no post-hoc target
  // override to apply. We only need the animated positions and the id→index map.
  const { currentPositions: animPositions, nodeIdToIdx } =
    usePositionInterpolation(layoutNodes, { lerpSpeed: 5, layoutTick });

  // Cap how many hulls/labels render (see MAX_VISIBLE_CLUSTERS). tags/entity modes
  // can produce dozens of small clusters; we keep the largest N by member count.
  // The force still anchors every cluster — this only thins the rendered overlay.
  const visibleClusters = useMemo(() => {
    if (clusters.length <= MAX_VISIBLE_CLUSTERS) return clusters;
    return [...clusters]
      .sort((a, b) => b.memberCount - a.memberCount)
      .slice(0, MAX_VISIBLE_CLUSTERS);
  }, [clusters]);

  // Display clusters: hull + label centroid/radius recomputed from where the
  // force-anchored members ACTUALLY settled, not from the deterministic anchor.
  // The anchor (clusterAnchorsByNodeId, built from `clusters`) still drives the
  // FORCE; this only moves the drawn hull/label onto the real node clump, so a
  // lobe's hull can never float over empty space regardless of physics tuning.
  //
  // Members are the single-assigned set (anchor === this cluster's centroid by
  // reference) — i.e. exactly the nodes the force pulls here, which is what you
  // see in the lobe. Nodes a smaller cluster claimed settled elsewhere and are
  // excluded so they don't drag the centroid into dead space.
  //
  // MUST depend on layoutTick: the sim mutates layoutNodes x/y/z in place (array
  // reference stays stable), so layoutTick is the only signal that positions
  // moved. Keying on layoutNodes alone would compute once at seed and never track
  // the settle. Limitation: a bimodal cluster (two sub-blobs) centers in the gap
  // between them — still strictly better than a hull over nothing.
  const displayClusters = useMemo(() => {
    const PAD = 6; // breathing room beyond the member spread
    const FLOOR = 12; // minimum visible hull for tiny/tight lobes
    const posById = new Map<string, { x: number; y: number; z: number }>();
    for (const n of layoutNodes) {
      if (n.x == null || n.y == null || n.z == null) continue;
      posById.set(n.id, { x: n.x, y: n.y, z: n.z });
    }
    return visibleClusters.map((c) => {
      const pts: { x: number; y: number; z: number }[] = [];
      c.nodeIds.forEach((id) => {
        // Reference equality with the deterministic anchor identifies the nodes
        // the force actually pulled into THIS lobe (single-assignment winner).
        if (clusterAnchorsByNodeId.get(id) !== c.centroid) return;
        const p = posById.get(id);
        if (p) pts.push(p);
      });
      if (pts.length === 0) return c; // no settled members → keep anchor/estimate
      let sx = 0,
        sy = 0,
        sz = 0;
      for (const p of pts) {
        sx += p.x;
        sy += p.y;
        sz += p.z;
      }
      const centroid = {
        x: sx / pts.length,
        y: sy / pts.length,
        z: sz / pts.length,
      };
      const dists = pts
        .map((p) => {
          const dx = p.x - centroid.x;
          const dy = p.y - centroid.y;
          const dz = p.z - centroid.z;
          return Math.sqrt(dx * dx + dy * dy + dz * dz);
        })
        .sort((a, b) => a - b);
      // 90th percentile, not max — a single outlier shouldn't balloon the hull.
      const p90 = dists[Math.floor(0.9 * (dists.length - 1))] ?? 0;
      const radius = Math.max(FLOOR, p90 + PAD);
      return { ...c, centroid, radius };
    });
    // layoutTick is intentionally a dependency though unread in the body: the sim
    // mutates layoutNodes in place (stable ref), so layoutTick is what signals a
    // position change and forces this memo to re-read the settled positions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleClusters, clusterAnchorsByNodeId, layoutNodes, layoutTick]);

  // Expose reheat function to parent
  useEffect(() => {
    if (onReheatReady) {
      onReheatReady(reheat);
    }
  }, [onReheatReady, reheat]);

  // Reset view function - centers the graph and resets rotation
  const resetView = useCallback(() => {
    if (groupRef.current) {
      groupRef.current.position.set(0, 0, 0);
      groupRef.current.rotation.set(0, 0, 0);
    }
    if (controlsRef.current) {
      controlsRef.current.reset();
    }
  }, []);

  useEffect(() => {
    if (onResetViewReady) {
      onResetViewReady(resetView);
    }
  }, [onResetViewReady, resetView]);

  // MiniMap: Send layout nodes when they change
  useEffect(() => {
    onLayoutNodesChange?.(layoutNodes);
  }, [layoutNodes, onLayoutNodesChange]);

  // MiniMap: Navigate to function
  const navigateTo = useCallback((x: number, y: number, z?: number) => {
    if (controlsRef.current) {
      // Smoothly animate the OrbitControls target
      const controls = controlsRef.current;
      const startTarget = controls.target.clone();
      const endTarget = new THREE.Vector3(x, y, z ?? 0);
      const startTime = performance.now();
      const duration = 400;

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

        controls.target.lerpVectors(startTarget, endTarget, eased);
        controls.update();

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    }
  }, []);

  useEffect(() => {
    onNavigateToReady?.(navigateTo);
  }, [navigateTo, onNavigateToReady]);

  // Cluster interaction: explicit hover (from label) overrides derived hover (from node membership)
  const [explicitHoveredClusterId, setExplicitHoveredClusterId] = useState<
    string | null
  >(null);

  // Clear explicit hover when labels are hidden or cluster mode changes to avoid stuck state
  const previousClusterModeRef = useRef(clusterConfig.mode);
  useEffect(() => {
    const modeChanged = previousClusterModeRef.current !== clusterConfig.mode;
    previousClusterModeRef.current = clusterConfig.mode;

    if (!clusterConfig.showLabels || modeChanged) {
      setExplicitHoveredClusterId(null);
      return;
    }

    // Also clear if the hovered cluster no longer exists in the current cluster list
    setExplicitHoveredClusterId(current => {
      if (!current) return null;
      return clusters.some(c => c.id === current) ? current : null;
    });
  }, [clusters, clusterConfig.mode, clusterConfig.showLabels]);

  const handleClusterHover = useCallback((cluster: Cluster | null) => {
    setExplicitHoveredClusterId(cluster?.id ?? null);
  }, []);

  const navigateToCluster = useCallback(
    (cx: number, cy: number, cz: number, radius: number) => {
      if (!controlsRef.current) return;
      const controls = controlsRef.current;
      const startTarget = controls.target.clone();
      const endTarget = new THREE.Vector3(cx, cy, cz);
      const startCamPos = camera.position.clone();

      // Calculate desired distance: cluster fills ~60% of viewport
      const fovRad =
        ((camera as THREE.PerspectiveCamera).fov / 2) * (Math.PI / 180);
      const desiredDistance = Math.max(
        20,
        Math.min(500, (radius / Math.tan(fovRad)) * 1.5),
      );

      // Preserve current viewing direction
      const viewDir = startCamPos.clone().sub(startTarget).normalize();
      const endCamPos = endTarget
        .clone()
        .add(viewDir.multiplyScalar(desiredDistance));

      const startTime = performance.now();
      const duration = 600;

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

        controls.target.lerpVectors(startTarget, endTarget, eased);
        camera.position.lerpVectors(startCamPos, endCamPos, eased);
        controls.update();

        if (progress < 1) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    },
    [camera],
  );

  // Navigate the camera to a node, resolved by id from the LIVE simulated
  // positions (layoutNodesRef) — the snapshot node objects App holds don't carry
  // the in-place x/y/z, so we must look up the current position here.
  //
  // Two modes, so we don't disrupt existing interactions:
  //  - frame=false (default): gentle re-target — pan the orbit center to the node
  //    and KEEP the current zoom (400ms). Used for direct graph clicks, keyboard
  //    nav, breadcrumb/inspector jumps — the pre-existing behavior.
  //  - frame=true: fly in AND frame — animate the orbit target and the camera
  //    distance (preserving view direction) so the node ends up centered and close
  //    (600ms). Used for clicking a search result, which should "travel to" a node
  //    that may be far off-screen. Distance floors closer than navigateToCluster.
  const navigateToNode = useCallback(
    (nodeId: string, frame = false) => {
      if (!controlsRef.current) return;
      const node = layoutNodesRef.current.find((n) => n.id === nodeId);
      if (!node) return;
      const controls = controlsRef.current;
      const startTarget = controls.target.clone();
      const startCamPos = camera.position.clone();

      // Plain fly: ease the orbit target to a FIXED endpoint over 400ms. Used for
      // breadcrumb / inspector / linear-nav jumps to nodes already settled in the
      // graph, where the target isn't moving — no need to track it.
      if (!frame) {
        const endTarget = new THREE.Vector3(
          node.x ?? 0,
          node.y ?? 0,
          node.z ?? 0,
        );
        const startTime = performance.now();
        const duration = 400;
        const animate = () => {
          const progress = Math.min(
            (performance.now() - startTime) / duration,
            1,
          );
          const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic
          controls.target.lerpVectors(startTarget, endTarget, eased);
          controls.update();
          if (progress < 1) requestAnimationFrame(animate);
        };
        requestAnimationFrame(animate);
        return;
      }

      // Frame-fly: travel to AND frame the node, then KEEP following it until the
      // sim settles. Clicking a search result can inject a fresh off-graph node;
      // the append-settle then pulls it inward for ~1–2s AFTER a one-shot 600ms
      // fly would end — freezing the camera on empty space with the cluster shoved
      // into a corner (worse the farther the node seeds from origin). So instead of
      // capturing the endpoint once, we re-read the node's LIVE position each frame,
      // recompute the framed endpoint against it, and keep ticking past the ease
      // until isSimulating goes false (≈3s hard cap as a backstop only).
      const fovRad =
        ((camera as THREE.PerspectiveCamera).fov / 2) * (Math.PI / 180);
      const r = node.radius && node.radius > 0 ? node.radius : 2;
      // Frame the node + a little margin; much closer floor than the cluster path.
      const desiredDistance = Math.max(
        8,
        Math.min(120, (r / Math.tan(fovRad)) * 8),
      );
      // Approach direction is captured ONCE so the camera doesn't swing around the
      // moving target; only the distance-to-node endpoint tracks the live position.
      const viewOffset = startCamPos
        .clone()
        .sub(startTarget)
        .normalize()
        .multiplyScalar(desiredDistance);
      const liveTarget = new THREE.Vector3();
      const liveCamPos = new THREE.Vector3();

      const startTime = performance.now();
      const duration = 600;
      const settleCap = 3000; // backstop only; isSimulating is the real terminator

      const animate = () => {
        const elapsed = performance.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3); // ease out cubic

        // Re-read the node each frame: the sim mutates positions, and on a
        // snapshot reset the node may vanish — bail cleanly if so.
        const live = layoutNodesRef.current.find((n) => n.id === nodeId);
        if (!live) return;
        liveTarget.set(live.x ?? 0, live.y ?? 0, live.z ?? 0);
        liveCamPos.copy(liveTarget).add(viewOffset);

        // Once the ease completes (eased === 1) these lerps land exactly on the
        // live endpoints, so the camera locks onto the node and follows its drift.
        controls.target.lerpVectors(startTarget, liveTarget, eased);
        camera.position.lerpVectors(startCamPos, liveCamPos, eased);
        controls.update();

        // Keep ticking while the ease is unfinished, OR while the sim is still
        // moving the node (under the cap). Stop once framed AND settled.
        if (progress < 1 || (simRef.current && elapsed < settleCap)) {
          requestAnimationFrame(animate);
        }
      };
      requestAnimationFrame(animate);
    },
    [camera],
  );

  useEffect(() => {
    onNavigateToNodeReady?.(navigateToNode);
  }, [navigateToNode, onNavigateToNodeReady]);

  const handleClusterClick = useCallback(
    (cluster: Cluster) => {
      navigateToCluster(
        cluster.centroid.x,
        cluster.centroid.y,
        cluster.centroid.z,
        cluster.radius,
      );
      onClusterSelect?.(cluster);
    },
    [navigateToCluster, onClusterSelect],
  );

  // Derive hovered cluster from currently-hovered node when label isn't directly hovered
  const derivedHoveredClusterId = useMemo(() => {
    if (!hoveredNode) return null;
    for (const cluster of clusters) {
      if (cluster.nodeIds.has(hoveredNode.id)) return cluster.id;
    }
    return null;
  }, [hoveredNode, clusters]);

  const hoveredClusterId = explicitHoveredClusterId ?? derivedHoveredClusterId;

  const [autoRotate, setAutoRotate] = useState(false);
  const groupRef = useRef<THREE.Group>(null);
  const controlsRef = useRef<OrbitControlsImpl>(null);

  // MiniMap: Track camera state and update periodically
  const lastCameraUpdateRef = useRef(0);
  const lastCameraPosRef = useRef({ x: 0, y: 0, z: 320 });
  useFrame(() => {
    if (!onCameraStateChange) return;

    const now = performance.now();
    // Only update every 100ms to avoid excessive rerenders
    if (now - lastCameraUpdateRef.current < 100) return;

    // Get camera position (accounting for OrbitControls target)
    const target = controlsRef.current?.target ?? new THREE.Vector3(0, 0, 0);
    const pos = { x: target.x, y: target.y, z: camera.position.z };

    // Check if position changed significantly
    const lastPos = lastCameraPosRef.current;
    const dist = Math.sqrt(
      Math.pow(pos.x - lastPos.x, 2) +
        Math.pow(pos.y - lastPos.y, 2) +
        Math.pow(pos.z - lastPos.z, 2),
    );

    if (dist > 0.5) {
      lastCameraPosRef.current = pos;
      lastCameraUpdateRef.current = now;

      // Calculate zoom from camera distance
      const zoom = 150 / Math.max(camera.position.z, 10);

      onCameraStateChange({
        x: pos.x,
        y: pos.y,
        z: pos.z,
        zoom,
      });
    }
  });

  // Hand controls: two-hand pinch world manipulation + single-hand lock/grab/pinch
  const {
    lock: handLock,
    deltas: grabDeltas,
    clearRequested,
    bimanualPinch,
    leftMetrics,
    rightMetrics,
  } = useHandLockAndGrab(gestureState, gestureControlEnabled);

  // Clear selection when user holds open palm for ~0.5 seconds
  const clearWasRequestedRef = useRef(false);
  useEffect(() => {
    if (clearRequested && !clearWasRequestedRef.current && selectedNode) {
      onNodeSelect(null);
    }
    clearWasRequestedRef.current = clearRequested;
  }, [clearRequested, selectedNode, onNodeSelect]);

  // Notify parent of bimanual grab state for visual feedback (border glow)
  useEffect(() => {
    onBimanualGrabChange?.(bimanualPinch);
  }, [bimanualPinch, onBimanualGrabChange]);

  // Create node lookup for edges
  const nodeById = useMemo(
    () => new Map(layoutNodes.map((n) => [n.id, n])),
    [layoutNodes],
  );

  // Filter nodes based on search (trimmed, so the graph spotlight, the sidebar
  // results list, and the count badge all resolve to the exact same match set).
  const searchLower = searchTerm.trim().toLowerCase();
  const matchingIds = useMemo(() => {
    if (!searchLower) return new Set<string>();
    return new Set(
      layoutNodes.filter((n) => matchesSearch(n, searchLower)).map((n) => n.id),
    );
  }, [layoutNodes, searchLower]);

  // Spotlight is active only in the "results view": a search is running, it has
  // matches, and NO node is selected. When a node is selected we hand the scene
  // over to selection-focus dimming instead (one clean switch, no double-dim).
  const spotlightActive = !selectedNode && matchingIds.size > 0;

  // Get connected node IDs when a node is selected
  const connectedIds = useMemo(() => {
    if (!selectedNode) return new Set<string>();
    const ids = new Set<string>([selectedNode.id]);
    edges.forEach((e) => {
      if (e.source === selectedNode.id) ids.add(e.target);
      if (e.target === selectedNode.id) ids.add(e.source);
    });
    return ids;
  }, [selectedNode, edges]);

  // Get selected node from layout (with current position)
  const selectedLayoutNode = useMemo(() => {
    if (!selectedNode) return null;
    return layoutNodes.find((n) => n.id === selectedNode.id) ?? null;
  }, [selectedNode, layoutNodes]);

  // Get hovered node from layout (for hand-tracking pre-select highlight)
  const hoveredLayoutNode = useMemo(() => {
    if (!hoveredNode) return null;
    return layoutNodes.find((n) => n.id === hoveredNode.id) ?? null;
  }, [hoveredNode, layoutNodes]);

  // Track pinch strength for visual feedback (updated in useFrame)
  const [pinchStrength, setPinchStrength] = useState(0);
  const pinchStrengthRef = useRef(0);

  // Stop auto-rotate on user interaction
  const handleInteractionStart = useCallback(() => {
    setAutoRotate(false);
  }, []);

  // Track world position at grab start for displacement-based movement
  const grabStartPosRef = useRef({ x: 0, y: 0, z: 0 });
  const grabPrevTargetRef = useRef(new THREE.Vector3());
  const grabVelocityRef = useRef(new THREE.Vector3());
  const wasGrabbingRef = useRef(false);
  const inertiaActiveRef = useRef(false);

  // Bimanual navigation: two-hand pinch to pan/zoom/rotate the cloud
  const wasBimanualRef = useRef(false);
  const bimanualAnchorRef = useRef<{
    distance: number;
    angle: number;
    center: { x: number; y: number };
    worldPos: { x: number; y: number; z: number };
    worldRotZ: number;
  } | null>(null);

  // Direct pinch selection ("pick the berry")
  // Position pinchPoint over a node on screen, pinch to select
  const PINCH_SELECT_RADIUS = 50; // pixels - fixed radius for selection
  const handHoverIdRef = useRef<string | null>(null);
  const pinchWasActiveRef = useRef(false); // for edge detection
  const lastClickMsRef = useRef(0);

  // Temp objects for grab calculations
  const tmpTarget = useMemo(() => new THREE.Vector3(), []);
  const tmpInstVel = useMemo(() => new THREE.Vector3(), []);

  // Hand controls (grab inertia + point/pinch selection)
  useFrame((_, dt) => {
    if (!gestureControlEnabled || !groupRef.current) return;
    if (!gestureState.isTracking) return;

    const group = groupRef.current;
    const isLocked = handLock.mode === "locked";
    const isGrabbing = isLocked && handLock.grabbed;

    // --- Bimanual pinch: two-point transform (pan/zoom/rotate) ---
    if (bimanualPinch && leftMetrics && rightMetrics) {
      const PAN_SPEED = 350; // world units per normalized screen unit
      const ZOOM_SPEED = 320; // world units per ln(distance ratio)
      const ROTATE_SPEED = 1.0; // radians per radian of pinch-line rotation

      const left = leftMetrics.pinchPoint;
      const right = rightMetrics.pinchPoint;

      const center = { x: (left.x + right.x) / 2, y: (left.y + right.y) / 2 };
      const dx = right.x - left.x;
      const dyUp = -(right.y - left.y); // flip Y so "up" is positive for angles
      const distance = Math.sqrt(dx * dx + dyUp * dyUp);

      const canonicalSegmentAngle = (angle: number) => {
        // Treat the segment as undirected: wrap to [-pi/2, pi/2) so swapping endpoints doesn't jump by pi.
        let a = angle;
        while (a >= Math.PI / 2) a -= Math.PI;
        while (a < -Math.PI / 2) a += Math.PI;
        return a;
      };

      const normalizeDeltaPi = (delta: number) => {
        // Normalize to [-pi/2, pi/2] to match canonical segment angle range.
        let d = delta;
        while (d > Math.PI / 2) d -= Math.PI;
        while (d < -Math.PI / 2) d += Math.PI;
        return d;
      };

      const angle = canonicalSegmentAngle(Math.atan2(dyUp, dx));

      if (!wasBimanualRef.current) {
        bimanualAnchorRef.current = {
          distance: Math.max(1e-4, distance),
          angle,
          center,
          worldPos: {
            x: group.position.x,
            y: group.position.y,
            z: group.position.z,
          },
          worldRotZ: group.rotation.z,
        };
      }

      const anchor = bimanualAnchorRef.current;
      if (anchor) {
        const safeDt = Math.max(1e-4, dt);
        const follow = 1 - Math.exp(-18 * safeDt);

        const panDx = center.x - anchor.center.x;
        const panDy = center.y - anchor.center.y;
        const rotationDelta = normalizeDeltaPi(angle - anchor.angle);

        // Standard pinch zoom uses a distance ratio. log() makes it symmetric for in/out.
        const distRatio =
          Math.max(1e-4, distance) / Math.max(1e-4, anchor.distance);
        const zoomDelta = Math.log(distRatio);

        const targetX = anchor.worldPos.x + panDx * PAN_SPEED;
        const targetY = anchor.worldPos.y - panDy * PAN_SPEED;
        const targetZ = anchor.worldPos.z + zoomDelta * ZOOM_SPEED;
        const targetRotZ = anchor.worldRotZ + rotationDelta * ROTATE_SPEED;

        group.position.x = THREE.MathUtils.lerp(
          group.position.x,
          targetX,
          follow,
        );
        group.position.y = THREE.MathUtils.lerp(
          group.position.y,
          targetY,
          follow,
        );
        group.position.z = THREE.MathUtils.lerp(
          group.position.z,
          targetZ,
          follow,
        );
        group.rotation.z = THREE.MathUtils.lerp(
          group.rotation.z,
          targetRotZ,
          follow,
        );
      }

      wasBimanualRef.current = true;
      wasGrabbingRef.current = false;
      return;
    } else {
      wasBimanualRef.current = false;
      bimanualAnchorRef.current = null;
    }

    // --- Grab: follow target with damping + inertial coast on release ---
    if (isGrabbing) {
      // On first frame of grab, capture current world position
      if (grabDeltas.grabStart || !wasGrabbingRef.current) {
        grabStartPosRef.current = {
          x: group.position.x,
          y: group.position.y,
          z: group.position.z,
        };
        grabPrevTargetRef.current.set(
          group.position.x,
          group.position.y,
          group.position.z,
        );
        grabVelocityRef.current.set(0, 0, 0);
        inertiaActiveRef.current = false;
      }

      // Target position relative to grab start
      const startPos = grabStartPosRef.current;
      tmpTarget.set(
        startPos.x + grabDeltas.panX,
        startPos.y + grabDeltas.panY,
        startPos.z + grabDeltas.panZ,
      );

      // Estimate target velocity (used for inertial release)
      const safeDt = Math.max(1e-4, dt);
      tmpInstVel
        .copy(tmpTarget)
        .sub(grabPrevTargetRef.current)
        .multiplyScalar(1 / safeDt);
      grabVelocityRef.current.lerp(tmpInstVel, 0.35);
      grabPrevTargetRef.current.copy(tmpTarget);

      // Follow target with a critically-damped feel (reduces jitter while still feeling 1:1)
      const follow = 1 - Math.exp(-28 * safeDt);
      group.position.lerp(tmpTarget, follow);
    } else {
      // Released: coast briefly with exponential decay (iOS-style momentum)
      if (wasGrabbingRef.current) inertiaActiveRef.current = true;

      if (inertiaActiveRef.current) {
        const safeDt = Math.max(1e-4, dt);
        group.position.x += grabVelocityRef.current.x * safeDt;
        group.position.y += grabVelocityRef.current.y * safeDt;
        group.position.z += grabVelocityRef.current.z * safeDt;

        const decay = Math.exp(-6.5 * safeDt);
        grabVelocityRef.current.multiplyScalar(decay);

        if (grabVelocityRef.current.lengthSq() < 1) {
          grabVelocityRef.current.set(0, 0, 0);
          inertiaActiveRef.current = false;
        }
      }
    }
    wasGrabbingRef.current = isGrabbing;

    // --- Direct pinch selection ("pick the berry") ---
    // Only active when locked and not grabbing
    const pinchActive = isLocked && !isGrabbing;

    // Update pinch strength for visual feedback
    const currentPinchStrength = isLocked ? handLock.metrics.pinch : 0;
    if (Math.abs(currentPinchStrength - pinchStrengthRef.current) > 0.02) {
      pinchStrengthRef.current = currentPinchStrength;
      setPinchStrength(currentPinchStrength);
    }

    if (!pinchActive) {
      // Clear hover when not in selection mode
      if (handHoverIdRef.current !== null) {
        onNodeHover(null);
        handHoverIdRef.current = null;
      }
      pinchWasActiveRef.current = false;
      // Reset pinch strength when not active
      if (pinchStrengthRef.current > 0.01) {
        pinchStrengthRef.current = 0;
        setPinchStrength(0);
      }
      return;
    }

    // Use the locked hand's pinch point when available, otherwise prefer right then left.
    const pinchPoint =
      handLock.mode === "locked"
        ? handLock.metrics.pinchPoint
        : (rightMetrics?.pinchPoint ?? leftMetrics?.pinchPoint ?? null);
    if (!pinchPoint) {
      if (handHoverIdRef.current !== null) {
        onNodeHover(null);
        handHoverIdRef.current = null;
      }
      return;
    }

    // Get canvas size for screen-space calculations
    const canvas = document.querySelector("canvas");
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();

    // Convert pinchPoint (0-1 normalized) to screen pixels
    const pinchScreenX = pinchPoint.x * rect.width;
    const pinchScreenY = pinchPoint.y * rect.height;

    // Find nearest node to pinchPoint in screen space
    let nearestNode: SimulationNode | null = null;
    let nearestDist = Infinity;

    const ap = animPositions.current;
    for (let ni = 0; ni < layoutNodes.length; ni++) {
      const n = layoutNodes[ni];
      const px = ap.length > ni * 3 ? ap[ni * 3] : (n.x ?? 0);
      const py = ap.length > ni * 3 + 1 ? ap[ni * 3 + 1] : (n.y ?? 0);
      const pz = ap.length > ni * 3 + 2 ? ap[ni * 3 + 2] : (n.z ?? 0);
      const worldPos = new THREE.Vector3(px, py, pz);
      group.localToWorld(worldPos);

      // Project to screen coordinates
      const projected = worldPos.project(camera);
      const screenX = ((projected.x + 1) / 2) * rect.width;
      const screenY = ((-projected.y + 1) / 2) * rect.height;

      // Calculate distance to pinch point
      const dx = screenX - pinchScreenX;
      const dy = screenY - pinchScreenY;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // Check if within selection radius and closer than current best
      if (dist < PINCH_SELECT_RADIUS && dist < nearestDist) {
        nearestDist = dist;
        nearestNode = n;
      }
    }

    // Update hover state based on nearest node
    if (nearestNode) {
      if (handHoverIdRef.current !== nearestNode.id) {
        onNodeHover(nearestNode);
        handHoverIdRef.current = nearestNode.id;
      }
    } else if (handHoverIdRef.current !== null) {
      onNodeHover(null);
      handHoverIdRef.current = null;
    }

    // Get pinch activation state (with hysteresis from useHandLockAndGrab)
    const pinchActivated =
      handLock.mode === "locked" && handLock.pinchActivated;

    // Pinch selection (edge triggered: select on rising edge of pinchActivated)
    if (pinchActivated && !pinchWasActiveRef.current && nearestNode) {
      const nowMs = performance.now();
      // Debounce to prevent rapid double-selects
      if (nowMs - lastClickMsRef.current > 250) {
        lastClickMsRef.current = nowMs;
        onNodeSelect(nearestNode);
      }
    }
    pinchWasActiveRef.current = pinchActivated;
  });

  return (
    <>
      {/* Ambient lighting */}
      <ambientLight intensity={0.6} />
      <pointLight position={[100, 100, 100]} intensity={0.6} />
      <pointLight
        position={[-100, -100, -100]}
        intensity={0.3}
        color="#8B5CF6"
      />

      {/* Camera controls */}
      <OrbitControls
        ref={controlsRef}
        makeDefault
        enableDamping
        dampingFactor={0.05}
        autoRotate={autoRotate && !isSimulating && !gestureControlEnabled}
        autoRotateSpeed={0.5}
        onStart={handleInteractionStart}
        minDistance={20}
        maxDistance={2500}
      />

      {/* Graph content */}
      <group ref={groupRef}>
        {/* Batched edges - single draw call for all edges */}
        {/* Cluster boundaries (rendered behind edges) */}
        <ClusterBoundaries
          clusters={displayClusters}
          visible={clusterConfig.showBoundaries}
          opacity={0.2}
          hoveredClusterId={hoveredClusterId}
        />
        <ClusterLabels
          clusters={displayClusters}
          visible={clusterConfig.mode !== "none" && clusterConfig.showLabels}
          hoveredClusterId={hoveredClusterId}
          onClusterHover={handleClusterHover}
          onClusterClick={handleClusterClick}
        />

        {/* Batched edges - single draw call for all edges */}
        <BatchedEdges
          edges={edges}
          nodeById={nodeById}
          animatedPositions={animPositions}
          nodeIdToIdx={nodeIdToIdx}
          selectedNode={selectedNode}
          relationshipVisibility={relationshipVisibility}
          linkThickness={displayConfig.linkThickness}
          linkOpacity={displayConfig.linkOpacity}
          focusStates={focusStates}
          pathEdgeKeys={pathEdgeKeys}
          timeTravelActive={timeTravelActive}
          timeTravelVisibleNodes={timeTravelVisibleNodes}
          tagFilteredNodeIds={tagFilteredNodeIds}
          hasTagFilter={hasTagFilter}
          searchTerm={searchTerm}
          searchMatchingIds={matchingIds}
        />

        {/* Ambient edge particles - flowing along edges */}
        <EdgeParticles
          edges={edges}
          nodes={layoutNodes}
          enabled={!performanceMode}
          particlesPerEdge={2}
          animatedPositions={animPositions}
          nodeIdToIdx={nodeIdToIdx}
        />

        {/* Instanced nodes - single draw call for all nodes */}
        <InstancedNodes
          nodes={layoutNodes}
          animatedPositions={animPositions}
          selectedNode={selectedNode}
          hoveredNode={hoveredNode}
          searchTerm={searchTerm}
          matchingIds={matchingIds}
          spotlightActive={spotlightActive}
          connectedIds={connectedIds}
          onNodeSelect={onNodeSelect}
          onNodeHover={onNodeHover}
          nodeSizeScale={displayConfig.nodeSizeScale}
          focusStates={focusStates}
          pathNodeIds={pathNodeIds}
          pathSourceId={pathSourceId}
          pathTargetId={pathTargetId}
          timeTravelActive={timeTravelActive}
          timeTravelVisibleNodes={timeTravelVisibleNodes}
          tagFilteredNodeIds={tagFilteredNodeIds}
          hasTagFilter={hasTagFilter}
        />

        {/* Selection highlight - glowing ring around selected node */}
        {selectedLayoutNode && (
          <SelectionHighlight
            node={selectedLayoutNode}
            innerRadius={
              selectedLayoutNode.radius * displayConfig.nodeSizeScale * 1.3
            }
            outerRadius={
              selectedLayoutNode.radius * displayConfig.nodeSizeScale * 1.8
            }
            animatedPositions={animPositions}
            nodeIdToIdx={nodeIdToIdx}
          />
        )}

        {/* Pinch pre-select highlight - tightening ring for "pick the berry" selection */}
        {gestureControlEnabled && (
          <PinchPreSelectHighlight
            node={hoveredLayoutNode}
            pinchStrength={pinchStrength}
          />
        )}

        {/* LOD Labels - only for selected/hovered/nearby nodes */}
        {displayConfig.showLabels && (
          <LODLabels
            nodes={layoutNodes}
            selectedNode={selectedNode}
            hoveredNode={hoveredNode}
            searchTerm={searchTerm}
            labelFadeDistance={displayConfig.labelFadeDistance}
            matchingIds={matchingIds}
            animatedPositions={animPositions}
            nodeIdToIdx={nodeIdToIdx}
          />
        )}
      </group>

      {/* Post-processing effects - conditional based on performance mode */}
      {!performanceMode && (
        <EffectComposer>
          <Bloom
            luminanceThreshold={0.3}
            luminanceSmoothing={0.9}
            intensity={1.0}
            radius={0.8}
          />
          <Vignette eskil={false} offset={0.1} darkness={0.8} />
        </EffectComposer>
      )}
    </>
  );
}

/**
 * Batched edge rendering using LineSegments
 * All edges rendered in a single draw call with relationship-based styling
 */
interface BatchedEdgesProps {
  edges: GraphEdge[];
  nodeById: Map<string, SimulationNode>;
  animatedPositions: React.MutableRefObject<Float32Array>;
  nodeIdToIdx: Map<string, number>;
  selectedNode: GraphNode | null;
  relationshipVisibility: RelationshipVisibility;
  linkThickness: number;
  linkOpacity: number;
  focusStates: Map<string, NodeFocusState>;
  pathEdgeKeys?: Set<string>;
  timeTravelActive?: boolean;
  timeTravelVisibleNodes?: Set<string>;
  tagFilteredNodeIds?: Set<string>;
  hasTagFilter?: boolean;
  searchTerm?: string;
  searchMatchingIds?: Set<string>;
}

function BatchedEdges({
  edges,
  nodeById,
  animatedPositions,
  nodeIdToIdx,
  selectedNode,
  relationshipVisibility,
  linkThickness,
  linkOpacity,
  focusStates,
  pathEdgeKeys,
  timeTravelActive = false,
  timeTravelVisibleNodes,
  tagFilteredNodeIds,
  hasTagFilter = false,
  searchTerm,
  searchMatchingIds,
}: BatchedEdgesProps) {
  const lineRef = useRef<THREE.LineSegments>(null);

  // Max possible edges (stable across selection changes)
  const maxEdges = edges.length;

  // Ensure buffers are sized before color writes in the useMemo below.
  const posBufferRef = useRef(new Float32Array(0));
  const colorBufferRef = useRef(new Float32Array(0));
  const neededEdgeBufferSize = maxEdges * 6;
  if (
    posBufferRef.current.length !== neededEdgeBufferSize ||
    colorBufferRef.current.length !== neededEdgeBufferSize
  ) {
    posBufferRef.current = new Float32Array(neededEdgeBufferSize);
    colorBufferRef.current = new Float32Array(neededEdgeBufferSize);
  }

  // Compute visible edges, their colors, and source/target node indices
  const { edgeIndices, visibleCount } = useMemo(() => {
    const edgeIndices: { srcIdx: number; tgtIdx: number }[] = [];
    const colorBuf = colorBufferRef.current;
    let visibleCount = 0;

    edges.forEach((edge) => {
      // Known types: respect the visibility toggle. Unknown types (future backend
      // relationship types not yet in the enum) are shown by default so they don't
      // silently vanish from the graph.
      if (edge.type in relationshipVisibility && !relationshipVisibility[edge.type as keyof typeof relationshipVisibility]) return;

      const sourceNode = nodeById.get(edge.source);
      const targetNode = nodeById.get(edge.target);
      if (!sourceNode || !targetNode) return;

      const srcIdx = nodeIdToIdx.get(edge.source);
      const tgtIdx = nodeIdToIdx.get(edge.target);
      if (srcIdx === undefined || tgtIdx === undefined) return;

      if (timeTravelActive && timeTravelVisibleNodes) {
        if (
          !timeTravelVisibleNodes.has(edge.source) ||
          !timeTravelVisibleNodes.has(edge.target)
        )
          return;
      }

      if (hasTagFilter && tagFilteredNodeIds) {
        if (
          !tagFilteredNodeIds.has(edge.source) &&
          !tagFilteredNodeIds.has(edge.target)
        )
          return;
      }

      const slotIdx = visibleCount;
      visibleCount++;
      edgeIndices.push({ srcIdx, tgtIdx });

      const edgeKey1 = `${edge.source}-${edge.target}`;
      const edgeKey2 = `${edge.target}-${edge.source}`;
      const isInPath =
        pathEdgeKeys?.has(edgeKey1) || pathEdgeKeys?.has(edgeKey2);
      const hasActivePath = pathEdgeKeys && pathEdgeKeys.size > 0;

      const isHighlighted =
        selectedNode &&
        (edge.source === selectedNode.id || edge.target === selectedNode.id);

      const isDimmed = hasActivePath && !isInPath;

      const style = getEdgeStyle(edge.type);

      const color = isInPath
        ? new THREE.Color("#00d4ff")
        : new THREE.Color(style.color);

      const sourceFocus = focusStates.get(edge.source)?.opacity ?? 1;
      const targetFocus = focusStates.get(edge.target)?.opacity ?? 1;
      const focusOpacity = Math.min(sourceFocus, targetFocus);

      const isSearchRelevant =
        searchTerm &&
        searchMatchingIds &&
        searchMatchingIds.has(edge.source) &&
        searchMatchingIds.has(edge.target);

      let alpha = style.opacity * linkOpacity * focusOpacity;
      if (isInPath) {
        alpha = 1.0;
      } else if (isDimmed) {
        alpha *= 0.25;
      } else if (isHighlighted) {
        alpha = 0.9;
      } else if (isSearchRelevant) {
        alpha = Math.min(1, alpha * 2.0);
      }

      const r = color.r * alpha;
      const g = color.g * alpha;
      const b = color.b * alpha;
      const off = slotIdx * 6;
      colorBuf[off] = r;
      colorBuf[off + 1] = g;
      colorBuf[off + 2] = b;
      colorBuf[off + 3] = r;
      colorBuf[off + 4] = g;
      colorBuf[off + 5] = b;
    });

    return { edgeIndices, visibleCount };
  }, [
    edges,
    nodeById,
    nodeIdToIdx,
    selectedNode,
    relationshipVisibility,
    linkOpacity,
    focusStates,
    pathEdgeKeys,
    timeTravelActive,
    timeTravelVisibleNodes,
    tagFilteredNodeIds,
    hasTagFilter,
    searchTerm,
    searchMatchingIds,
  ]);

  // Set up geometry once with max-sized buffers, use setDrawRange for visibility
  const initializedRef = useRef(false);
  useEffect(() => {
    if (!lineRef.current || maxEdges === 0) return;
    const geometry = lineRef.current.geometry;
    if (
      !initializedRef.current ||
      geometry.getAttribute("position")?.count !== maxEdges * 2
    ) {
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(posBufferRef.current, 3),
      );
      geometry.setAttribute(
        "color",
        new THREE.BufferAttribute(colorBufferRef.current, 3),
      );
      initializedRef.current = true;
    }
  }, [maxEdges]);

  // Update edge positions and colors from animated positions each frame
  useFrame(() => {
    if (!lineRef.current) return;
    const ap = animatedPositions.current;
    if (visibleCount === 0 || ap.length === 0) {
      lineRef.current.geometry.setDrawRange(0, 0);
      lineRef.current.geometry.computeBoundingSphere();
      return;
    }

    const posBuf = posBufferRef.current;
    for (let i = 0; i < edgeIndices.length; i++) {
      const { srcIdx, tgtIdx } = edgeIndices[i];
      const off = i * 6;
      if (srcIdx * 3 + 2 < ap.length) {
        posBuf[off] = ap[srcIdx * 3];
        posBuf[off + 1] = ap[srcIdx * 3 + 1];
        posBuf[off + 2] = ap[srcIdx * 3 + 2];
      } else {
        posBuf[off] = 0;
        posBuf[off + 1] = 0;
        posBuf[off + 2] = 0;
      }
      if (tgtIdx * 3 + 2 < ap.length) {
        posBuf[off + 3] = ap[tgtIdx * 3];
        posBuf[off + 4] = ap[tgtIdx * 3 + 1];
        posBuf[off + 5] = ap[tgtIdx * 3 + 2];
      } else {
        posBuf[off + 3] = 0;
        posBuf[off + 4] = 0;
        posBuf[off + 5] = 0;
      }
    }

    const geometry = lineRef.current.geometry;
    const posAttr = geometry.getAttribute("position") as THREE.BufferAttribute;
    const colorAttr = geometry.getAttribute("color") as THREE.BufferAttribute;
    if (posAttr) {
      posAttr.needsUpdate = true;
    }
    if (colorAttr) {
      colorAttr.needsUpdate = true;
    }
    geometry.setDrawRange(0, visibleCount * 2);
    geometry.computeBoundingSphere();
  });

  if (maxEdges === 0) return null;

  return (
    <lineSegments ref={lineRef}>
      <bufferGeometry />
      <lineBasicMaterial
        vertexColors
        transparent
        opacity={linkOpacity}
        linewidth={linkThickness}
      />
    </lineSegments>
  );
}

/**
 * Instanced node rendering
 * All nodes rendered in a single draw call using InstancedMesh
 */
interface InstancedNodesProps {
  nodes: SimulationNode[];
  animatedPositions: React.MutableRefObject<Float32Array>;
  selectedNode: GraphNode | null;
  hoveredNode: GraphNode | null;
  searchTerm: string;
  matchingIds: Set<string>;
  spotlightActive: boolean;
  connectedIds: Set<string>;
  onNodeSelect: (node: GraphNode | null) => void;
  onNodeHover: (node: GraphNode | null) => void;
  nodeSizeScale?: number;
  focusStates: Map<string, NodeFocusState>;
  pathNodeIds?: Set<string>;
  pathSourceId?: string | null;
  pathTargetId?: string | null;
  timeTravelActive?: boolean;
  timeTravelVisibleNodes?: Set<string>;
  tagFilteredNodeIds?: Set<string>;
  hasTagFilter?: boolean;
}

function InstancedNodes({
  nodes,
  animatedPositions,
  selectedNode,
  hoveredNode,
  searchTerm,
  matchingIds,
  spotlightActive,
  connectedIds,
  onNodeSelect,
  onNodeHover,
  nodeSizeScale = 1.0,
  focusStates,
  pathNodeIds,
  pathSourceId,
  pathTargetId,
  timeTravelActive = false,
  timeTravelVisibleNodes,
  tagFilteredNodeIds,
  hasTagFilter = false,
}: InstancedNodesProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const { camera, raycaster, pointer, gl } = useThree();

  // Node lookup for raycasting - must be defined before useEffect that uses it
  const nodeIndexMap = useMemo(() => {
    const map = new Map<number, SimulationNode>();
    nodes.forEach((node, index) => {
      map.set(index, node);
    });
    return map;
  }, [nodes]);

  // Track pointer for click detection (distinguish click vs drag)
  const pointerDownRef = useRef<{
    x: number;
    y: number;
    time: number;
    button: number;
  } | null>(null);

  // DOM-level click handling (bypasses R3F's event system which doesn't work with OrbitControls)
  useEffect(() => {
    const canvas = gl.domElement;

    const handlePointerDown = (e: PointerEvent) => {
      if (e.button !== 0) return;
      pointerDownRef.current = {
        x: e.clientX,
        y: e.clientY,
        time: Date.now(),
        button: e.button,
      };
    };

    const handlePointerUp = (e: PointerEvent) => {
      if (e.button !== 0) {
        pointerDownRef.current = null;
        return;
      }
      if (!meshRef.current || !pointerDownRef.current) return;

      const dx = e.clientX - pointerDownRef.current.x;
      const dy = e.clientY - pointerDownRef.current.y;
      const dt = Date.now() - pointerDownRef.current.time;
      const distance = Math.sqrt(dx * dx + dy * dy);

      // Consider it a click if moved less than 5px and less than 300ms
      const isClick = distance < 5 && dt < 300;

      if (isClick) {
        // Calculate NDC from event coordinates (R3F's pointer isn't updated for DOM events)
        const rect = canvas.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
        const y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

        // Force update the mesh's world matrix for accurate raycasting
        meshRef.current.updateMatrixWorld(true);

        const ndcVector = new THREE.Vector2(x, y);
        raycaster.setFromCamera(ndcVector, camera);
        const intersects = raycaster.intersectObject(meshRef.current);

        if (intersects.length > 0) {
          const instanceId = intersects[0].instanceId;
          if (instanceId !== undefined) {
            const node = nodeIndexMap.get(instanceId);
            if (node) {
              // Toggle selection
              onNodeSelect(selectedNode?.id === node.id ? null : node);
            }
          }
        }
      }

      pointerDownRef.current = null;
    };

    canvas.addEventListener("pointerdown", handlePointerDown);
    canvas.addEventListener("pointerup", handlePointerUp);

    return () => {
      canvas.removeEventListener("pointerdown", handlePointerDown);
      canvas.removeEventListener("pointerup", handlePointerUp);
    };
  }, [gl, camera, raycaster, nodeIndexMap, onNodeSelect, selectedNode]);

  // Refs to hold latest time travel state (needed for useFrame closure)
  const timeTravelActiveRef = useRef(timeTravelActive);
  const timeTravelVisibleNodesRef = useRef(timeTravelVisibleNodes);
  timeTravelActiveRef.current = timeTravelActive;
  timeTravelVisibleNodesRef.current = timeTravelVisibleNodes;

  // Refs for tag filtering state (needed for useFrame closure)
  const hasTagFilterRef = useRef(hasTagFilter);
  const tagFilteredNodeIdsRef = useRef(tagFilteredNodeIds);
  hasTagFilterRef.current = hasTagFilter;
  tagFilteredNodeIdsRef.current = tagFilteredNodeIds;

  // Shared geometry and material - created once
  const geometry = useMemo(
    () => new THREE.SphereGeometry(1, SPHERE_SEGMENTS, SPHERE_SEGMENTS),
    [],
  );
  const material = useMemo(() => {
    const mat = new THREE.MeshStandardMaterial({
      roughness: 0.35,
      metalness: 0.05,
      transparent: true,
      emissive: new THREE.Color(0xffffff),
      emissiveIntensity: 0.5,
    });
    mat.onBeforeCompile = (shader) => {
      shader.fragmentShader = shader.fragmentShader.replace(
        "vec3 totalEmissiveRadiance = emissive;",
        "vec3 totalEmissiveRadiance = emissive * vColor;",
      );
    };
    mat.customProgramCacheKey = () => "instanced-emissive";
    return mat;
  }, []);

  // Animation state - recreate when node count changes
  const nodeCount = nodes.length;
  const scalesRef = useRef<Float32Array>(new Float32Array(0));
  const targetScalesRef = useRef<Float32Array>(new Float32Array(0));
  // Deep dive: z-offset for selected node (pulls toward camera)
  const zOffsetsRef = useRef<Float32Array>(new Float32Array(0));
  const targetZOffsetsRef = useRef<Float32Array>(new Float32Array(0));

  // Resize animation arrays when node count changes
  useEffect(() => {
    if (scalesRef.current.length !== nodeCount) {
      scalesRef.current = new Float32Array(nodeCount);
      targetScalesRef.current = new Float32Array(nodeCount);
      zOffsetsRef.current = new Float32Array(nodeCount);
      targetZOffsetsRef.current = new Float32Array(nodeCount);
      // Initialize scales to 1 and z-offsets to 0
      for (let i = 0; i < nodeCount; i++) {
        scalesRef.current[i] = 1;
        targetScalesRef.current[i] = 1;
        zOffsetsRef.current[i] = 0;
        targetZOffsetsRef.current[i] = 0;
      }
    }
  }, [nodeCount]);

  // Seed the per-instance color buffer BEFORE the first render. The material's
  // onBeforeCompile injects `emissive * vColor`, but `vColor` only exists once an
  // instanceColor buffer is present (USE_INSTANCING_COLOR). On a cold load the
  // material can otherwise compile before the first per-frame setColorAt runs,
  // producing "vColor: undeclared identifier" — and the constant customProgramCacheKey
  // then locks that broken program in, leaving the graph blank. useLayoutEffect runs
  // before paint (and before the rAF render loop), so the buffer always exists at
  // first compile. The real colors are written every frame in useFrame.
  useLayoutEffect(() => {
    const mesh = meshRef.current;
    if (!mesh || nodeCount === 0) return;
    const seed = new THREE.Color(1, 1, 1);
    for (let i = 0; i < nodeCount; i++) mesh.setColorAt(i, seed);
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [nodeCount]);

  // Temp objects for matrix calculations (reused to avoid GC)
  const tempMatrix = useMemo(() => new THREE.Matrix4(), []);
  const tempColor = useMemo(() => new THREE.Color(), []);
  const tempPosition = useMemo(() => new THREE.Vector3(), []);
  const tempQuaternion = useMemo(() => new THREE.Quaternion(), []);
  const tempScale = useMemo(() => new THREE.Vector3(), []);
  // Reused spotlight colors (allocate once, never per-node/per-frame):
  // a neutral slate to desaturate dimmed non-matches, and the cold "accent"
  // near-white (--accent) to keep off-focus search matches faintly visible.
  const dimGrey = useMemo(() => new THREE.Color("#6b7280"), []);
  const accentColor = useMemo(() => new THREE.Color("#e8ecf4"), []);

  // Update instance matrices and colors each frame
  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const mesh = meshRef.current;

    nodes.forEach((node, i) => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isSearchMatch = !!searchTerm && matchingIds.has(node.id);
      // Detail view: a search match that isn't the selection or one of its
      // neighbors. Keep it faintly accent-lit so results aren't lost behind the
      // selection-focus dimming.
      const isOffFocusMatch =
        !!selectedNode && isSearchMatch && !connectedIds.has(node.id);

      // Pathfinding state
      const isPathSource = pathSourceId === node.id;
      const isPathTarget = pathTargetId === node.id;
      const isInPath = pathNodeIds?.has(node.id) ?? false;
      const hasActivePath = pathNodeIds && pathNodeIds.size > 0;

      // Time Travel visibility - hide nodes outside the time window (use refs for fresh values)
      const isVisibleInTimeTravel =
        !timeTravelActiveRef.current ||
        (timeTravelVisibleNodesRef.current?.has(node.id) ?? true);

      // Tag cloud filtering - use refs for fresh values
      const isMatchingTagFilter =
        !hasTagFilterRef.current ||
        (tagFilteredNodeIdsRef.current?.has(node.id) ?? true);

      // Search dimming only applies in the results view (spotlightActive). When a
      // node is selected, spotlightActive is false so selection-focus owns the
      // dimming — no double-dim. When there are zero matches, spotlightActive is
      // also false, so a non-matching search never dims the whole graph to black.
      const isDimmed = !!(
        (spotlightActive && !matchingIds.has(node.id)) ||
        (hasActivePath && !isInPath) ||
        (hasTagFilterRef.current && !isMatchingTagFilter)
      );

      const focusOpacity = focusStates.get(node.id)?.opacity ?? 1;

      // Target scale based on state - path nodes get a size boost
      // Time travel: nodes outside the time window scale to 0
      let targetScale: number;
      if (!isVisibleInTimeTravel) {
        targetScale = 0; // Hide node by scaling to 0
      } else {
        targetScale = isSelected ? 1.5 : isHovered ? 1.2 : 1;
        if (isPathSource || isPathTarget) {
          targetScale = Math.max(targetScale, 1.4);
        } else if (isInPath) {
          targetScale = Math.max(targetScale, 1.2);
        }
        // Spotlight: scale matched nodes up so they read as the focus of the view.
        if (spotlightActive && isSearchMatch) {
          targetScale = Math.max(targetScale, 1.3);
        }
      }
      targetScalesRef.current[i] = targetScale;

      // Smooth scale animation
      const currentScale = scalesRef.current[i] || 1;
      const newScale = THREE.MathUtils.lerp(
        currentScale,
        targetScale,
        delta * 10,
      );
      scalesRef.current[i] = newScale;

      // Deep dive z-offset: selected node pops toward camera, connected nodes follow slightly
      // This creates a "focus" effect where the selected node comes forward
      const DEEP_DIVE_DISTANCE = 25; // How far forward selected node moves
      const CONNECTED_DIVE_DISTANCE = 10; // How far connected nodes follow
      let targetZOffset = 0;
      if (isSelected) {
        targetZOffset = DEEP_DIVE_DISTANCE;
      } else if (selectedNode && connectedIds.has(node.id)) {
        targetZOffset = CONNECTED_DIVE_DISTANCE;
      }
      targetZOffsetsRef.current[i] = targetZOffset;

      // Smooth z-offset animation (slightly slower for dramatic effect)
      const currentZOffset = zOffsetsRef.current[i] || 0;
      const newZOffset = THREE.MathUtils.lerp(
        currentZOffset,
        targetZOffset,
        delta * 6,
      );
      zOffsetsRef.current[i] = newZOffset;

      // Apply pulsing for search matches and path nodes
      let finalScale = newScale;
      if (isSearchMatch) {
        const pulse = 1 + Math.sin(performance.now() * 0.004) * 0.15;
        finalScale *= pulse;
      }
      if (isInPath && !isPathSource && !isPathTarget) {
        // Subtle pulse for intermediate path nodes
        const pulse = 1 + Math.sin(performance.now() * 0.003) * 0.08;
        finalScale *= pulse;
      }

      // Node breathing - ambient pulse based on importance
      // Phase offset based on node ID to prevent synchronized breathing
      const nodePhase =
        (node.id.charCodeAt(0) + node.id.charCodeAt(node.id.length - 1)) * 0.1;
      const breathingSpeed = 0.6 + node.importance * 0.2; // Faster for important nodes
      const breathingAmplitude = 0.015 + node.importance * 0.025; // Bigger pulse for important nodes
      const breathingTime = performance.now() * 0.001 * breathingSpeed;
      const breathing =
        1 + Math.sin(breathingTime + nodePhase) * breathingAmplitude;
      finalScale *= breathing;

      // Keep off-focus search matches readable as markers (not specks) in detail view.
      if (isOffFocusMatch) {
        finalScale = Math.max(finalScale, newScale * 1.1);
      }

      // Read from animated positions if available, else fall back to node coords
      const ap = animatedPositions.current;
      const px = ap.length > i * 3 ? ap[i * 3] : (node.x ?? 0);
      const py = ap.length > i * 3 + 1 ? ap[i * 3 + 1] : (node.y ?? 0);
      const pz = ap.length > i * 3 + 2 ? ap[i * 3 + 2] : (node.z ?? 0);
      tempPosition.set(px, py, pz + newZOffset);
      tempScale.setScalar(node.radius * finalScale * nodeSizeScale);
      tempMatrix.compose(tempPosition, tempQuaternion, tempScale);
      mesh.setMatrixAt(i, tempMatrix);

      // Set color with special handling for path nodes
      if (isPathSource) {
        // Source node: bright green
        tempColor.set("#22c55e");
      } else if (isPathTarget) {
        // Target node: bright red/orange
        tempColor.set("#ef4444");
      } else if (isInPath) {
        // Intermediate path nodes: electric cyan
        tempColor.set("#00d4ff");
      } else {
        // Use vibrant frontend palette, falling back to API color
        tempColor.set(VIBRANT_TYPE_COLORS[node.type] || node.color);
      }

      if (isDimmed && !isInPath) {
        if (spotlightActive && !matchingIds.has(node.id)) {
          // Results view: push non-matches well back — desaturate toward neutral
          // slate, then darken hard so the matched nodes own the scene.
          tempColor.lerp(dimGrey, 0.5);
          tempColor.multiplyScalar(0.2);
        } else {
          // Path / tag-filter dimming keeps its softer treatment.
          tempColor.multiplyScalar(0.5);
        }
      } else if (
        isSelected ||
        isHovered ||
        isSearchMatch ||
        isInPath
      ) {
        // Brighten selected/hovered/path/match nodes. Spotlight matches get an
        // extra push so they cross the bloom threshold and visibly glow.
        let brightenFactor = isInPath ? 1.3 : 1.2;
        if (spotlightActive && isSearchMatch) brightenFactor = 1.6;
        tempColor.multiplyScalar(brightenFactor);
      } else {
        // Recent nodes glow brighter - subtle pulsing brightness
        const nodeTimestamp = node.timestamp
          ? new Date(node.timestamp).getTime()
          : 0;
        const daysSinceCreation =
          (Date.now() - nodeTimestamp) / (1000 * 60 * 60 * 24);
        if (daysSinceCreation < 7) {
          // Nodes within last 7 days get a subtle brightness boost
          const recentnessFactor = 1 - daysSinceCreation / 7; // 1 for brand new, 0 for 7 days old
          const glowPulse =
            1 +
            Math.sin(performance.now() * 0.002 + nodePhase) *
              0.1 *
              recentnessFactor;
          tempColor.multiplyScalar(1 + recentnessFactor * 0.15 * glowPulse);
        }
      }
      // Apply focus mode opacity (but don't dim path nodes)
      if (!isInPath) {
        tempColor.multiplyScalar(focusOpacity);
      }
      // Detail view: lift off-focus search matches back toward the accent so they
      // stay visible markers instead of sinking into the selection-focus dim.
      // Applied AFTER focusOpacity so the depth-dim can't swallow them.
      if (isOffFocusMatch) {
        tempColor.lerp(accentColor, 0.4);
      }
      mesh.setColorAt(i, tempColor);
    });

    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  });

  // Handle click/hover via raycasting
  const handlePointerMove = useCallback(
    (_event: ThreeEvent<PointerEvent>) => {
      if (!meshRef.current) return;

      raycaster.setFromCamera(pointer, camera);
      const intersects = raycaster.intersectObject(meshRef.current);

      if (intersects.length > 0) {
        const instanceId = intersects[0].instanceId;
        if (instanceId !== undefined) {
          const node = nodeIndexMap.get(instanceId);
          if (node) {
            onNodeHover(node);
            document.body.style.cursor = "pointer";
            return;
          }
        }
      }

      onNodeHover(null);
      document.body.style.cursor = "default";
    },
    [camera, pointer, raycaster, nodeIndexMap, onNodeHover],
  );

  // Don't render the mesh with zero instances. Doing so makes the material's
  // emissive*vColor shader compile WITHOUT an instanceColor buffer (no vColor) —
  // and the constant customProgramCacheKey would then cache that broken program
  // for the lifetime of the GL context, leaving the graph blank even after data
  // arrives. The mesh remounts (keyed on nodeCount) once nodes exist and the
  // useLayoutEffect above has seeded instanceColor, so the first compile is valid.
  if (nodeCount === 0) return null;

  return (
    <instancedMesh
      key={`nodes-${nodeCount}`}
      ref={meshRef}
      args={[geometry, material, nodeCount]}
      onPointerMove={handlePointerMove}
      frustumCulled={true}
    />
  );
}

/**
 * LOD Labels - Only render labels for nearby/selected/hovered nodes
 * Uses distance-based culling and limits max visible labels
 */
interface LODLabelsProps {
  nodes: SimulationNode[];
  selectedNode: GraphNode | null;
  hoveredNode: GraphNode | null;
  searchTerm: string;
  matchingIds: Set<string>;
  labelFadeDistance?: number;
  animatedPositions: React.MutableRefObject<Float32Array>;
  nodeIdToIdx: Map<string, number>;
}

function LODLabels({
  nodes,
  selectedNode,
  hoveredNode,
  searchTerm,
  matchingIds,
  labelFadeDistance = LABEL_DISTANCE_THRESHOLD,
  animatedPositions,
  nodeIdToIdx,
}: LODLabelsProps) {
  const { camera } = useThree();
  const [visibleNodes, setVisibleNodes] = useState<SimulationNode[]>([]);
  const prevVisibleIdsRef = useRef<string[]>([]);

  // Update visible labels based on camera distance (uses animated positions)
  useFrame(() => {
    const cameraPos = camera.position;
    const ap = animatedPositions.current;

    const priorityNodes: SimulationNode[] = [];
    const nearbyNodes: { node: SimulationNode; distance: number }[] = [];

    nodes.forEach((node, i) => {
      const isSelected = selectedNode?.id === node.id;
      const isHovered = hoveredNode?.id === node.id;
      const isSearchMatch = !!searchTerm && matchingIds.has(node.id);

      if (isSelected || isHovered) {
        priorityNodes.push(node);
        return;
      }

      const px = ap.length > i * 3 ? ap[i * 3] : (node.x ?? 0);
      const py = ap.length > i * 3 + 1 ? ap[i * 3 + 1] : (node.y ?? 0);
      const pz = ap.length > i * 3 + 2 ? ap[i * 3 + 2] : (node.z ?? 0);
      const dx = px - cameraPos.x;
      const dy = py - cameraPos.y;
      const dz = pz - cameraPos.z;
      const distance = Math.sqrt(dx * dx + dy * dy + dz * dz);

      if (distance < labelFadeDistance || isSearchMatch) {
        nearbyNodes.push({ node, distance });
      }
    });

    nearbyNodes.sort((a, b) => a.distance - b.distance);
    const nearbyToShow = nearbyNodes
      .slice(0, MAX_VISIBLE_LABELS - priorityNodes.length)
      .map((n) => n.node);
    const nextVisibleNodes = [...priorityNodes, ...nearbyToShow];
    const nextVisibleIds = nextVisibleNodes.map((node) => node.id);
    const prevVisibleIds = prevVisibleIdsRef.current;
    const hasChanged =
      nextVisibleIds.length !== prevVisibleIds.length ||
      nextVisibleIds.some((id, index) => id !== prevVisibleIds[index]);

    if (hasChanged) {
      prevVisibleIdsRef.current = nextVisibleIds;
      setVisibleNodes(nextVisibleNodes);
    }
  });

  return (
    <>
      {visibleNodes.map((node) => (
        <NodeLabel
          key={node.id}
          node={node}
          isSelected={selectedNode?.id === node.id}
          isHovered={hoveredNode?.id === node.id}
          animatedPositions={animatedPositions}
          nodeIdToIdx={nodeIdToIdx}
        />
      ))}
    </>
  );
}

interface NodeLabelProps {
  node: SimulationNode;
  isSelected: boolean;
  isHovered: boolean;
  animatedPositions: React.MutableRefObject<Float32Array>;
  nodeIdToIdx: Map<string, number>;
}

function NodeLabel({
  node,
  isSelected,
  isHovered,
  animatedPositions,
  nodeIdToIdx,
}: NodeLabelProps) {
  const groupRef = useRef<THREE.Group>(null);

  const label = useMemo(() => {
    const text = node.content.slice(0, 30);
    return text.length < node.content.length ? text + "..." : text;
  }, [node.content]);

  // Track animated position each frame
  useFrame(() => {
    if (!groupRef.current) return;
    const idx = nodeIdToIdx.get(node.id);
    if (idx === undefined) return;
    const ap = animatedPositions.current;
    const off = idx * 3;
    if (off + 2 < ap.length) {
      groupRef.current.position.set(
        ap[off],
        ap[off + 1] + node.radius * 3 + 3,
        ap[off + 2],
      );
    }
  });

  return (
    <group
      ref={groupRef}
      position={[node.x ?? 0, (node.y ?? 0) + node.radius * 3 + 3, node.z ?? 0]}
    >
      <Billboard>
        <Text
          fontSize={2.5}
          maxWidth={30}
          color="#f1f5f9"
          anchorX="center"
          anchorY="bottom"
          outlineWidth={0.1}
          outlineColor="#000000"
        >
          {label}
        </Text>
        {(isSelected || isHovered) && (
          <Text
            position={[0, -1.5, 0]}
            fontSize={1.5}
            color="#94a3b8"
            anchorX="center"
            anchorY="top"
          >
            {node.type}
          </Text>
        )}
      </Billboard>
    </group>
  );
}
