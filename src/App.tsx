import { useState, useCallback, useEffect, useRef, useMemo } from 'react'
import { Keyboard, Settings } from 'lucide-react'

import { Panel, PanelGroup, PanelResizeHandle, type ImperativePanelHandle } from 'react-resizable-panels'
import { useGraphSnapshot } from './hooks/useGraphData'
import { useExpandableGraph } from './hooks/useExpandableGraph'
import { useAuth } from './hooks/useAuth'
import { GraphCanvas } from './components/GraphCanvas'
import { Inspector } from './components/Inspector'
import { SearchResultsList } from './components/SearchResultsList'
import { SearchBar } from './components/SearchBar'
import { TokenPrompt } from './components/TokenPrompt'
import { StatsBar } from './components/StatsBar'
import { Breadcrumbs } from './components/Breadcrumbs'
import { GestureDebugOverlay } from './components/GestureDebugOverlay'
import { Hand2DOverlay } from './components/Hand2DOverlay'
import { HandControlOverlay } from './components/HandControlOverlay'
import { SettingsPanel } from './components/settings'
import { PathfindingOverlay } from './components/PathfindingOverlay'
import { TimelineBar } from './components/TimelineBar'
import { TagCloud } from './components/TagCloud'
import { KeyboardShortcutsHelp } from './components/KeyboardShortcutsHelp'
import { useHandLockAndGrab } from './hooks/useHandLockAndGrab'
import { useHandRecording, downloadRecording, listSavedRecordings, loadRecordingFromStorage } from './hooks/useHandRecording'
import { useHandPlayback } from './hooks/useHandPlayback'
import { useTagCloud } from './hooks/useTagCloud'
import { useFilterChips } from './hooks/useFilterChips'
import { useBreadcrumbs } from './hooks/useBreadcrumbs'
import { useKeyboardNavigation } from './hooks/useKeyboardNavigation'
import { usePathfinding } from './hooks/usePathfinding'
import { useTimeTravel } from './hooks/useTimeTravel'
import { useSoundEffects } from './hooks/useSoundEffects'
import type {
  GraphNode,
  RelationType,
  FilterState,
  ForceConfig,
  DisplayConfig,
  ClusterConfig,
  RelationshipVisibility,
} from './lib/types'
import {
  DEFAULT_FORCE_CONFIG,
  DEFAULT_DISPLAY_CONFIG,
  DEFAULT_CLUSTER_CONFIG,
  DEFAULT_RELATIONSHIP_VISIBILITY,
} from './lib/types'
import type { GestureState } from './hooks/useHandGestures'
import { matchesSearch } from './lib/searchMatch'

// Default gesture state for when not tracking
const DEFAULT_GESTURE_STATE: GestureState = {
  isTracking: false,
  handsDetected: 0,
  leftHand: null,
  rightHand: null,
  twoHandDistance: 0.5,
  twoHandRotation: 0,
  twoHandCenter: { x: 0.5, y: 0.5 },
  pointingHand: null,
  pointDirection: null,
  pinchStrength: 0,
  grabStrength: 0,
  pinchPoint: null,
  leftPinchRay: null,
  rightPinchRay: null,
  activePinchRay: null,
  zoomDelta: 0,
  rotateDelta: 0,
  panDelta: { x: 0, y: 0 },
}

// Hand icon SVG component
function HandIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M18 11V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v0" />
      <path d="M14 10V4a2 2 0 0 0-2-2a2 2 0 0 0-2 2v6" />
      <path d="M10 10.5V6a2 2 0 0 0-2-2a2 2 0 0 0-2 2v8" />
      <path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" />
    </svg>
  )
}

// Bug/Debug icon SVG component
function BugIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M8 2l1.88 1.88" />
      <path d="M14.12 3.88L16 2" />
      <path d="M9 7.13v-1a3.003 3.003 0 116 0v1" />
      <path d="M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 014-4h4a4 4 0 014 4v3c0 3.3-2.7 6-6 6" />
      <path d="M12 20v-9" />
      <path d="M6.53 9C4.6 8.8 3 7.1 3 5" />
      <path d="M6 13H2" />
      <path d="M3 21c0-2.1 1.7-3.9 3.8-4" />
      <path d="M20.97 5c0 2.1-1.6 3.8-3.5 4" />
      <path d="M22 13h-4" />
      <path d="M17.2 17c2.1.1 3.8 1.9 3.8 4" />
    </svg>
  )
}

// Bolt/Performance icon SVG component
function BoltIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  )
}

const CLUSTER_MODE_LABELS: Record<string, string> = {
  none: 'Clustering off',
  type: 'Clustering by type',
  tags: 'Clustering by tags',
  semantic: 'Clustering by semantic similarity',
}

const EMPTY_NODES: GraphNode[] = []
const EMPTY_EDGES: import('./lib/types').GraphEdge[] = []

export default function App() {
  const { setToken, isAuthenticated } = useAuth()
  const [selectedNode, setSelectedNode] = useState<GraphNode | null>(null)
  const [hoveredNode, setHoveredNode] = useState<GraphNode | null>(null)
  const [searchTerm, setSearchTerm] = useState('')
  const [gestureControlEnabled, setGestureControlEnabled] = useState(false)
  const [debugOverlayVisible, setDebugOverlayVisible] = useState(false)
  const [performanceMode, setPerformanceMode] = useState(false)
  const [settingsPanelOpen, setSettingsPanelOpen] = useState(false)
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false)
  const [statusMessage, setStatusMessage] = useState<string | null>(null)
  const statusTimeoutRef = useRef<number | null>(null)

  const canvasContainerRef = useRef<HTMLDivElement>(null)

  // Tag cloud state
  const [tagCloudVisible, setTagCloudVisible] = useState(false)
  const keyboardModifierLabel = useMemo(() => {
    return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'
  }, [])

  useEffect(() => {
    return () => {
      if (statusTimeoutRef.current !== null) {
        window.clearTimeout(statusTimeoutRef.current)
      }
    }
  }, [])

  const [gestureState, setGestureState] = useState<GestureState>(DEFAULT_GESTURE_STATE)

  // Test mode - check URL param for automated testing
  const [isTestMode] = useState(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('test') === 'true'
  })

  // Hand recording/playback for automated testing
  const recording = useHandRecording({ autoDownload: false })
  const playback = useHandPlayback({
    logEvents: true,
    exposeGlobal: true,
    onGestureChange: (state) => {
      // When playing back, use the playback gesture state
      if (playback.isPlaying) {
        setGestureState(state)
      }
    },
  })

  // Expose recording controls globally for automation
  useEffect(() => {
    if (isTestMode) {
      const api = {
        // Recording
        startRecording: recording.startRecording,
        stopRecording: () => {
          const rec = recording.stopRecording()
          if (rec) downloadRecording(rec)
          return rec
        },
        isRecording: () => recording.isRecording,
        // Playback
        loadRecording: playback.loadRecording,
        play: playback.play,
        pause: playback.pause,
        stop: playback.stop,
        seek: playback.seek,
        setSpeed: playback.setSpeed,
        // Utilities
        listRecordings: listSavedRecordings,
        loadFromStorage: loadRecordingFromStorage,
        getGestureState: () => gestureState,
      }
      ;(window as unknown as Record<string, unknown>).__handTest = api
    }
  }, [isTestMode, recording, playback, gestureState])

  // Tracking source - check URL param on mount, then allow UI toggle
  const [trackingSource, setTrackingSource] = useState<'mediapipe' | 'iphone'>(() => {
    const params = new URLSearchParams(window.location.search)
    return params.get('iphone') === 'true' ? 'iphone' : 'mediapipe'
  })

  const [trackingInfo, setTrackingInfo] = useState<{
    source: 'mediapipe' | 'iphone'
    iphoneUrl: string
    iphoneConnected: boolean
    hasLiDAR: boolean
    phoneConnected: boolean
    bridgeIps: string[]
    phonePort: number | null
  }>({
    source: trackingSource,
    iphoneUrl: 'ws://localhost:8766/ws',
    iphoneConnected: false,
    hasLiDAR: false,
    phoneConnected: false,
    bridgeIps: [],
    phonePort: null,
  })

  const handleSourceChange = useCallback((source: 'mediapipe' | 'iphone') => {
    setTrackingSource(source)
  }, [])

  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    types: [],
    importanceRange: [0.3, 1],
    maxNodes: 2000,
  })
  const [hasSetDefaultImportance, setHasSetDefaultImportance] = useState(false)

  // Force configuration state
  const [forceConfig, setForceConfig] = useState<ForceConfig>(DEFAULT_FORCE_CONFIG)

  // Display configuration state
  const [displayConfig, setDisplayConfig] = useState<DisplayConfig>(DEFAULT_DISPLAY_CONFIG)

  // Clustering configuration state
  const [clusterConfig, setClusterConfig] = useState<ClusterConfig>(DEFAULT_CLUSTER_CONFIG)

  // Relationship visibility state
  const [relationshipVisibility, setRelationshipVisibility] = useState<RelationshipVisibility>(
    DEFAULT_RELATIONSHIP_VISIBILITY
  )

  // Reheat callback - will be set by GraphCanvas
  const [reheatFn, setReheatFn] = useState<(() => void) | null>(null)

  // Reset view callback - will be set by GraphCanvas
  const [resetViewFn, setResetViewFn] = useState<(() => void) | null>(null)

  // Imperative camera-navigation handle, populated by GraphCanvas. Used by the
  // inspector "navigate" action, breadcrumb jumps, and the select-to-focus effect.
  const navigateForBookmarksRef = useRef<
    ((x: number, y: number, z?: number, radius?: number) => void) | null
  >(null)
  const inspectorPanelRef = useRef<ImperativePanelHandle>(null)
  const [isInspectorOpen, setIsInspectorOpen] = useState(false)

  // Open the sidebar for a selected node OR an active search; collapse otherwise.
  // This effect is the SINGLE navigator on selection — it flies + frames the node
  // (passing its radius). Every selection path funnels through here, so we don't
  // fire a competing camera animation elsewhere.
  useEffect(() => {
    if (selectedNode || searchTerm.trim()) {
      inspectorPanelRef.current?.expand()
    } else {
      inspectorPanelRef.current?.collapse()
    }
    if (selectedNode) {
      navigateForBookmarksRef.current?.(
        selectedNode.x ?? 0,
        selectedNode.y ?? 0,
        selectedNode.z ?? 0,
        selectedNode.radius,
      )
    }
  }, [selectedNode, searchTerm])

  const handleGestureStateChange = useCallback((state: GestureState) => {
    setGestureState(state)
    // Record frame if recording is active
    if (recording.isRecording) {
      recording.recordFrame(state, trackingInfo.hasLiDAR)
    }
  }, [recording.isRecording, recording.recordFrame, trackingInfo.hasLiDAR])

  const { lock: handLock } = useHandLockAndGrab(gestureState, gestureControlEnabled)

  const { data, isLoading, error, refetch } = useGraphSnapshot({
    limit: filters.maxNodes,
    minImportance: filters.importanceRange[0],
    types: filters.types.length > 0 ? filters.types : undefined,
    enabled: isAuthenticated,
  })

  // The live, growing graph: seeded/reset from the immutable snapshot, grown by
  // expanding a node's neighborhood. This is the source of truth for what renders.
  const graph = useExpandableGraph(data)

  // Stable data references. Once the snapshot has seeded the expandable graph,
  // read from it (so expansions are visible); fall back to the raw snapshot for
  // the one render between data arriving and the reset effect firing (identical
  // ids/order → no realloc, seamless handoff), and to EMPTY constants before load.
  const hasGraph = graph.nodes.length > 0
  const rawNodes = hasGraph ? graph.nodes : (data?.nodes ?? EMPTY_NODES)
  const edges = hasGraph ? graph.edges : (data?.edges ?? EMPTY_EDGES)

  // Apply archive threshold default on first successful load
  useEffect(() => {
    if (data?.meta?.archive_threshold != null && !hasSetDefaultImportance) {
      setFilters(prev => {
        const threshold = data.meta.archive_threshold!
        const upperBound = prev.importanceRange[1]
        const normalized = Number.isFinite(threshold)
          ? Math.min(1, Math.max(0, threshold))
          : 0
        const lowerBound = Math.min(normalized, upperBound)
        return {
          ...prev,
          importanceRange: [lowerBound, upperBound],
        }
      })
      setHasSetDefaultImportance(true)
    }
  }, [data?.meta?.archive_threshold, hasSetDefaultImportance])

  // Client-side max importance filtering (API only supports min)
  const nodes = useMemo(() => {
    const maxImportance = filters.importanceRange[1]
    if (maxImportance >= 1) return rawNodes
    return rawNodes.filter(n => n.importance <= maxImportance)
  }, [rawNodes, filters.importanceRange])

  // Build a set of visible node IDs for fast edge membership checks
  const visibleNodeIds = useMemo(() => new Set(nodes.map(n => n.id)), [nodes])

  // Filter edges to only include those where BOTH endpoints are in the visible set.
  // The API can return edges referencing nodes outside the current snapshot (e.g. when
  // sampling limits the node count, or when the importance filter trims endpoints).
  // Dangling edges cause nodes to appear orphaned (no visible connections) even though
  // they have relationships — fixing this makes connected nodes always show their edges.
  const filteredEdges = useMemo(() => {
    if (edges === EMPTY_EDGES || visibleNodeIds.size === 0) return EMPTY_EDGES
    const filtered = edges.filter(
      e => visibleNodeIds.has(e.source) && visibleNodeIds.has(e.target)
    )
    return filtered.length === edges.length ? edges : filtered
  }, [edges, visibleNodeIds])

  // Tag Cloud
  const tagCloud = useTagCloud({
    nodes,
    typeColors: data?.meta?.type_colors,
  })

  // Breadcrumbs (node selection history)
  const breadcrumbs = useBreadcrumbs()

  // Tag color map for filter chips (tag → color from dominant type)
  const tagColorMap = useMemo(() => {
    const map = new Map<string, string>()
    const typeColors = data?.meta?.type_colors
    if (!typeColors) return map
    for (const tagData of tagCloud.tags) {
      map.set(tagData.tag, typeColors[tagData.dominantType] ?? '#94A3B8')
    }
    return map
  }, [tagCloud.tags, data?.meta?.type_colors])

  // Filter chip callbacks (extracted to top level per Rules of Hooks)
  const { deselectTag, clearSelection } = tagCloud
  const handleClearSearch = useCallback(() => setSearchTerm(''), [])
  const handleClearAllFilters = useCallback(() => {
    clearSelection()
    setSearchTerm('')
  }, [clearSelection])

  // Filter chips (derived from search + tags)
  const filterChips = useFilterChips({
    searchTerm,
    selectedTags: tagCloud.selectedTags,
    tagColorMap,
    onDeselectTag: deselectTag,
    onClearSearch: handleClearSearch,
    onClearAll: handleClearAllFilters,
  })

  // Client-visible node count (intersection of tag filter + search filter)
  const clientVisibleNodeCount = useMemo(() => {
    if (!filterChips.hasActiveFilters) return nodes.length
    let filtered = nodes
    // Apply tag filter
    if (tagCloud.hasActiveFilter) {
      filtered = filtered.filter((n) => tagCloud.filteredNodeIds.has(n.id))
    }
    // Apply search filter
    if (searchTerm.trim()) {
      const lower = searchTerm.trim().toLowerCase()
      filtered = filtered.filter((n) => matchesSearch(n, lower))
    }
    return filtered.length
  }, [nodes, tagCloud.hasActiveFilter, tagCloud.filteredNodeIds, searchTerm, filterChips.hasActiveFilters])

  // Sound Effects
  const sound = useSoundEffects()

  // Pathfinding
  const pathfinding = usePathfinding({
    nodes: nodes as any,
    edges: filteredEdges,
  })

  // Time Travel
  const timeTravel = useTimeTravel({
    nodes,
    enabled: isAuthenticated,
  })

  // Play sound when time travel is activated
  const prevTimeTravelActive = useRef(timeTravel.isActive)
  useEffect(() => {
    if (timeTravel.isActive !== prevTimeTravelActive.current) {
      if (timeTravel.isActive) {
        sound.playTimeTravel()
      }
      prevTimeTravelActive.current = timeTravel.isActive
    }
  }, [timeTravel.isActive, sound.playTimeTravel])

  // Get source and target nodes for pathfinding overlay
  const pathSourceNode = useMemo(() => {
    if (!pathfinding.sourceId || nodes.length === 0) return null
    return nodes.find(n => n.id === pathfinding.sourceId) ?? null
  }, [pathfinding.sourceId, nodes])

  const pathTargetNode = useMemo(() => {
    if (!pathfinding.targetId || nodes.length === 0) return null
    return nodes.find(n => n.id === pathfinding.targetId) ?? null
  }, [pathfinding.targetId, nodes])

  const showStatus = useCallback((message: string) => {
    setStatusMessage(message)
    if (statusTimeoutRef.current !== null) {
      window.clearTimeout(statusTimeoutRef.current)
    }
    statusTimeoutRef.current = window.setTimeout(() => {
      setStatusMessage(null)
      statusTimeoutRef.current = null
    }, 1800)
  }, [])

  const { push: breadcrumbPush } = breadcrumbs
  const handleNodeSelect = useCallback((node: GraphNode | null) => {
    // If we're in path selection mode and a node is clicked, complete the path
    if (pathfinding.isSelectingTarget && node) {
      pathfinding.completePathSelection(node.id)
      sound.playPathFound()
      return
    }
    if (node) {
      sound.playSelect(node.importance ?? 0.5)
      breadcrumbPush(node)
    }
    setSelectedNode(node)
  }, [pathfinding.isSelectingTarget, pathfinding.completePathSelection, sound.playPathFound, sound.playSelect, breadcrumbPush])

  const handleInspectorNavigate = useCallback((node: GraphNode | null) => {
    if (!node) return
    // handleNodeSelect sets selectedNode; the select-to-focus effect then flies +
    // frames the node (with its radius). Path-selection is handled inside
    // handleNodeSelect (it returns early without selecting), so no camera move there.
    handleNodeSelect(node)
  }, [handleNodeSelect])

  const handleNodeHover = useCallback((node: GraphNode | null) => {
    if (node) {
      sound.playHover()
    }
    setHoveredNode(node)
  }, [sound.playHover])

  const handleSearch = useCallback((term: string) => {
    // Play search sound on typing (only if term changed and is not empty)
    if (term.length > 0) {
      sound.playSearch()
      // Starting/changing a search shows the results list — clear any open node so
      // the sidebar switches from single-node detail back to the results view.
      setSelectedNode(null)
    }
    setSearchTerm(term)
  }, [sound.playSearch])

  // Inspector tag click: add tag filter + close inspector + reheat
  const { selectTag } = tagCloud
  const handleInspectorTagClick = useCallback((tag: string) => {
    selectTag(tag)
    setSelectedNode(null) // auto-close inspector to show filtered graph
    reheatFn?.()
    showStatus(`Filter: ${tag}`)
  }, [selectTag, reheatFn, showStatus])

  // Inspector relationship type toggle
  const handleRelationshipTypeClick = useCallback((type: RelationType) => {
    setRelationshipVisibility((prev) => ({ ...prev, [type]: !prev[type] }))
  }, [])

  const handleFilterChange = useCallback((newFilters: Partial<FilterState>) => {
    setFilters(prev => ({ ...prev, ...newFilters }))
  }, [])

  const handleForceConfigChange = useCallback((config: Partial<ForceConfig>) => {
    setForceConfig(prev => ({ ...prev, ...config }))
  }, [])

  const handleDisplayConfigChange = useCallback((config: Partial<DisplayConfig>) => {
    setDisplayConfig(prev => ({ ...prev, ...config }))
  }, [])

  const prevClusterModeRef = useRef<ClusterConfig['mode']>(DEFAULT_CLUSTER_CONFIG.mode)

  const handleClusterConfigChange = useCallback((config: Partial<ClusterConfig>) => {
    setClusterConfig(prev => ({ ...prev, ...config }))
    if (config.mode && config.mode !== prevClusterModeRef.current) {
      prevClusterModeRef.current = config.mode
      showStatus(CLUSTER_MODE_LABELS[config.mode] || `Cluster mode: ${config.mode}`)
    }
  }, [showStatus])

  const handleRelationshipVisibilityChange = useCallback((visibility: Partial<RelationshipVisibility>) => {
    setRelationshipVisibility(prev => ({ ...prev, ...visibility }))
  }, [])

  const handleReheat = useCallback(() => {
    reheatFn?.()
  }, [reheatFn])

  const handleResetForces = useCallback(() => {
    setForceConfig(DEFAULT_FORCE_CONFIG)
  }, [])

  const handleToggleLabels = useCallback(() => {
    setDisplayConfig(prev => ({ ...prev, showLabels: !prev.showLabels }))
  }, [])

  // Keyboard navigation
  const handleStartPathfindingFromKeyboard = useCallback(() => {
    if (selectedNode) {
      pathfinding.startPathSelection(selectedNode.id)
    }
  }, [selectedNode, pathfinding.startPathSelection])

  const { shortcuts } = useKeyboardNavigation({
    nodes: nodes as any,
    selectedNode,
    onNodeSelect: handleNodeSelect,
    onReheat: handleReheat,
    onToggleSettings: () => setSettingsPanelOpen(prev => !prev),
    onToggleLabels: handleToggleLabels,
    onStartPathfinding: handleStartPathfindingFromKeyboard,
    onCancelPathfinding: pathfinding.cancelPathSelection,
    onShowHelp: () => setShortcutsHelpOpen(true),
    isPathSelecting: pathfinding.isSelectingTarget,
    enabled: !shortcutsHelpOpen,
  })

  // Toggle tag cloud with 'T' key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if typing in an input
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (e.key === 't' || e.key === 'T') {
        setTagCloudVisible(prev => !prev)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  // Shared breadcrumb navigation callback (used by keyboard + Breadcrumbs component)
  const nodesRef = useRef(nodes)
  nodesRef.current = nodes

  const breadcrumbNavigate = useCallback((node: GraphNode) => {
    // The select-to-focus effect flies + frames the node once selectedNode is set.
    setSelectedNode(node)
  }, [])

  const handleBreadcrumbBack = useCallback(() => {
    breadcrumbs.goBack(nodesRef.current, breadcrumbNavigate)
  }, [breadcrumbs.goBack, breadcrumbNavigate])

  const handleBreadcrumbForward = useCallback(() => {
    breadcrumbs.goForward(nodesRef.current, breadcrumbNavigate)
  }, [breadcrumbs.goForward, breadcrumbNavigate])

  const handleBreadcrumbJumpTo = useCallback((index: number) => {
    breadcrumbs.jumpTo(index, nodesRef.current, breadcrumbNavigate)
  }, [breadcrumbs.jumpTo, breadcrumbNavigate])

  // Breadcrumb keyboard shortcuts: Cmd+[ back, Cmd+] forward
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!(e.metaKey || e.ctrlKey)) return

      if (e.key === '[') {
        e.preventDefault()
        handleBreadcrumbBack()
      } else if (e.key === ']') {
        e.preventDefault()
        handleBreadcrumbForward()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleBreadcrumbBack, handleBreadcrumbForward])

  // Filter-triggered reheat: when tag filter activates/deactivates, reheat physics
  const prevHasTagFilter = useRef(tagCloud.hasActiveFilter)
  useEffect(() => {
    if (tagCloud.hasActiveFilter !== prevHasTagFilter.current) {
      prevHasTagFilter.current = tagCloud.hasActiveFilter
      reheatFn?.()
    }
  }, [tagCloud.hasActiveFilter, reheatFn])

  if (!isAuthenticated) {
    return <TokenPrompt onSubmit={setToken} />
  }

  return (
    <div className="h-screen w-screen text-ink flex flex-col overflow-hidden">
      {/* Atmosphere — fixed gradient-mesh + contour grid + grain behind the
          transparent WebGL canvas and translucent glass rails (zero GPU cost).
          NOTE: this root div deliberately carries NO bg-* — an opaque full-bleed
          background here paints at stacking step 3 (in-flow block bg) and would
          occlude the z-index:-1 atmosphere at step 2. The base color sits on
          <html> (index.html); the atmosphere supplies the rest. */}
      <div className="atmosphere" aria-hidden="true" />

      {/* Top Bar */}
      <header className="reveal h-14 flex-shrink-0 glass border-b border-hairline flex items-center px-4 gap-4 z-50 overflow-x-auto overflow-y-hidden">
        <div className="flex items-center gap-2.5 pr-1 select-none">
          <span className="text-accent text-lg leading-none drop-shadow-[0_0_8px_var(--accent-glow)]" aria-hidden>
            ✦
          </span>
          <h1 className="font-display text-[1.15rem] font-medium tracking-tight text-ink">
            AutoMem
          </h1>
        </div>

        <SearchBar
          value={searchTerm}
          onChange={handleSearch}
          className="flex-1 max-w-xl min-w-[220px]"
          shortcutsEnabled={!shortcutsHelpOpen}
          chips={filterChips.chips}
          onRemoveChip={filterChips.removeChip}
          onClearAll={filterChips.clearAll}
          matchingCount={clientVisibleNodeCount}
          totalCount={nodes.length}
        />

        <StatsBar
          stats={data?.stats}
          isLoading={isLoading}
          clientVisibleCount={clientVisibleNodeCount}
          hasClientFilter={filterChips.hasActiveFilters}
        />

        {/* Performance Mode Toggle */}
        <button
          onClick={() => setPerformanceMode(!performanceMode)}
          className={`
            inline-flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200
            ${performanceMode
              ? 'bg-surface-2 text-accent shadow-elev-focus'
              : 'bg-white/5 hover:bg-white/10 text-ink-3 hover:text-ink'
            }
          `}
          title={performanceMode ? 'Performance mode ON — click to enable effects' : 'Performance mode — disable bloom/vignette for faster rendering'}
          aria-label="Toggle performance mode"
          aria-pressed={performanceMode}
        >
          <BoltIcon className="w-5 h-5" />
        </button>

        {/* Gesture controls */}
        <button
          onClick={() => setGestureControlEnabled(!gestureControlEnabled)}
            className={`
              inline-flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200
              ${gestureControlEnabled
                ? 'bg-surface-2 text-accent shadow-elev-focus'
                : 'bg-white/5 hover:bg-white/10 text-ink-3 hover:text-ink'
              }
            `}
            title={gestureControlEnabled ? 'Hand gestures ON — click to disable' : 'Enable hand gestures (requires camera)'}
            aria-label="Toggle hand gestures"
            aria-pressed={gestureControlEnabled}
          >
            <HandIcon className="w-5 h-5" />
        </button>

        {/* Debug Overlay Toggle (only show when gestures are enabled) */}
        {gestureControlEnabled && (
          <button
            onClick={() => setDebugOverlayVisible(!debugOverlayVisible)}
            className={`
              inline-flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200
              ${debugOverlayVisible
                ? 'bg-surface-2 text-accent shadow-elev-focus'
                : 'bg-white/5 hover:bg-white/10 text-ink-3 hover:text-ink'
              }
            `}
            title={debugOverlayVisible ? 'Hide gesture debug overlay' : 'Show gesture debug overlay'}
            aria-label="Toggle gesture debug overlay"
            aria-pressed={debugOverlayVisible}
          >
            <BugIcon className="w-5 h-5" />
          </button>
        )}

        {/* Recording Indicator (when recording) */}
        {recording.isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-red-500/20 border border-red-500/50">
            <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
            <span className="text-red-400 text-sm font-medium">
              REC {Math.floor(recording.duration / 1000)}s ({recording.frameCount})
            </span>
          </div>
        )}

        {/* Playback Indicator (when playing) */}
        {playback.isPlaying && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-green-500/20 border border-green-500/50">
            <div className="w-2 h-2 rounded-full bg-green-500" />
            <span className="text-green-400 text-sm font-medium">
              PLAY {Math.floor(playback.currentTime / 1000)}s / {Math.floor(playback.duration / 1000)}s
            </span>
          </div>
        )}

        {/* Test Mode Indicator */}
        {isTestMode && !recording.isRecording && !playback.isPlaying && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-yellow-500/20 border border-yellow-500/50">
            <span className="text-yellow-400 text-sm font-medium">TEST MODE</span>
          </div>
        )}

        {/* Divider — separates interaction/dev toggles from utility actions */}
        <div className="w-px h-5 bg-hairline flex-shrink-0" aria-hidden="true" />

        <button
          onClick={() => setShortcutsHelpOpen(true)}
          className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-white/5 hover:bg-white/10 text-ink-3 hover:text-ink transition-all duration-200"
          title="Keyboard shortcuts (?)"
          aria-label="Open keyboard shortcuts help"
        >
          <Keyboard className="w-5 h-5" />
        </button>

        {/* Settings Panel Toggle */}
        <button
          onClick={() => setSettingsPanelOpen(!settingsPanelOpen)}
          className={`
            inline-flex items-center justify-center h-9 w-9 rounded-lg transition-all duration-200
            ${settingsPanelOpen
              ? 'bg-surface-2 text-accent shadow-elev-focus'
              : 'bg-white/5 hover:bg-white/10 text-ink-3 hover:text-ink'
            }
          `}
          title={settingsPanelOpen ? 'Hide settings' : 'Show graph settings'}
          aria-label="Toggle settings panel"
          aria-pressed={settingsPanelOpen}
        >
          <Settings className="w-5 h-5" />
        </button>
      </header>

      {/* Breadcrumbs (node selection history) */}
      <Breadcrumbs
        history={breadcrumbs.history}
        currentIndex={breadcrumbs.currentIndex}
        nodes={nodes}
        canGoBack={breadcrumbs.canGoBack}
        canGoForward={breadcrumbs.canGoForward}
        onGoBack={handleBreadcrumbBack}
        onGoForward={handleBreadcrumbForward}
        onJumpTo={handleBreadcrumbJumpTo}
      />

      {/* Main Content */}
      <div className="reveal flex-1 flex overflow-hidden" style={{ animationDelay: '90ms' }}>
        <PanelGroup direction="horizontal" className="flex-1">
          {/* Graph Canvas */}
          <Panel defaultSize={75} minSize={40}>
            <div ref={canvasContainerRef} className="h-full relative">
              {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                  <div className="flex flex-col items-center gap-3">
                    <div className="w-12 h-12 border-4 border-white/10 border-t-accent rounded-full animate-spin" />
                    <span className="text-ink-3">Loading memories...</span>
                  </div>
                </div>
              )}

              {error && (
                <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
                  <div className="glass p-6 rounded-xl max-w-md text-center">
                    <div className="text-danger text-lg mb-2">Connection Error</div>
                    <div className="text-ink-3 text-sm mb-4">{(error as Error).message}</div>
                    <button
                      onClick={() => refetch()}
                      className="px-4 py-2 bg-accent text-void hover:bg-white rounded-lg transition-colors"
                    >
                      Retry
                    </button>
                  </div>
                </div>
              )}

              <GraphCanvas
                nodes={nodes}
                edges={filteredEdges}
                selectedNode={selectedNode}
                hoveredNode={hoveredNode}
                searchTerm={searchTerm}
                onNodeSelect={handleNodeSelect}
                onNodeHover={handleNodeHover}
                gestureControlEnabled={gestureControlEnabled}
                trackingSource={trackingSource}
                onGestureStateChange={handleGestureStateChange}
                onTrackingInfoChange={setTrackingInfo}
                performanceMode={performanceMode}
                forceConfig={forceConfig}
                displayConfig={displayConfig}
                clusterConfig={clusterConfig}
                relationshipVisibility={relationshipVisibility}
                typeColors={data?.meta?.type_colors}
                expansionAnchors={graph.expansionAnchors}
                onReheatReady={setReheatFn}
                onResetViewReady={setResetViewFn}
                onNavigateForBookmarks={(fn) => { navigateForBookmarksRef.current = fn }}
                pathNodeIds={pathfinding.pathNodeIds}
                pathEdgeKeys={pathfinding.pathEdgeKeys}
                pathSourceId={pathfinding.sourceId}
                pathTargetId={pathfinding.targetId}
                isPathSelecting={pathfinding.isSelectingTarget}
                timeTravelActive={timeTravel.isActive}
                timeTravelVisibleNodes={timeTravel.visibleNodes}
                tagFilteredNodeIds={tagCloud.filteredNodeIds}
                hasTagFilter={tagCloud.hasActiveFilter}
              />

              {/* 2D Hand Overlay (on top of canvas, life-size) */}
              <Hand2DOverlay
                gestureState={gestureState}
                enabled={gestureControlEnabled}
                lock={handLock}
              />

              {/* Gesture Debug Overlay */}
              <GestureDebugOverlay
                gestureState={gestureState}
                visible={debugOverlayVisible && gestureControlEnabled}
              />

              {/* Hand Control Overlay (lock/grab metrics) */}
              <HandControlOverlay
                enabled={gestureControlEnabled}
                lock={handLock}
                source={trackingSource}
                onSourceChange={handleSourceChange}
                onResetView={resetViewFn ?? undefined}
                iphoneConnected={trackingInfo.iphoneConnected}
                hasLiDAR={trackingInfo.hasLiDAR}
                iphoneUrl={trackingInfo.iphoneUrl}
                phoneConnected={trackingInfo.phoneConnected}
                bridgeIps={trackingInfo.bridgeIps}
                phonePort={trackingInfo.phonePort}
              />

              {/* Pathfinding Overlay */}
              <PathfindingOverlay
                isSelectingTarget={pathfinding.isSelectingTarget}
                sourceNode={pathSourceNode}
                targetNode={pathTargetNode}
                currentPath={pathfinding.currentPath}
                pathCount={pathfinding.pathCount}
                activePath={pathfinding.activePath}
                onNextPath={pathfinding.nextPath}
                onPreviousPath={pathfinding.previousPath}
                onCancel={pathfinding.cancelPathSelection}
                onClear={pathfinding.clearPath}
                visible={pathfinding.isSelectingTarget || pathfinding.hasPath}
              />

              {/* Time Travel Timeline */}
              <TimelineBar
                isActive={timeTravel.isActive}
                isPlaying={timeTravel.isPlaying}
                currentTime={timeTravel.currentTime}
                minTime={timeTravel.minTime}
                maxTime={timeTravel.maxTime}
                progress={timeTravel.progress}
                playbackSpeed={timeTravel.playbackSpeed}
                visibleCount={timeTravel.visibleCount}
                totalCount={timeTravel.totalCount}
                onToggleActive={timeTravel.toggleActive}
                onTogglePlay={timeTravel.togglePlay}
                onSetProgress={timeTravel.setProgress}
                onStepForward={timeTravel.stepForward}
                onStepBackward={timeTravel.stepBackward}
                onCycleSpeed={timeTravel.cycleSpeed}
                onGoToStart={timeTravel.goToStart}
                onGoToEnd={timeTravel.goToEnd}
              />

            </div>
          </Panel>

          {/* Resize Handle */}
          <PanelResizeHandle className={`w-1 bg-white/5 hover:bg-white/20 transition-colors cursor-col-resize ${!isInspectorOpen ? 'opacity-0 pointer-events-none' : ''}`} />

          {/* Inspector Panel */}
          <Panel
            ref={inspectorPanelRef}
            collapsible
            collapsedSize={0}
            defaultSize={25}
            minSize={15}
            maxSize={40}
            onExpand={() => setIsInspectorOpen(true)}
            onCollapse={() => setIsInspectorOpen(false)}
          >
            {/* Sidebar view derived from (selectedNode, searchTerm):
                 selected node → detail; else active search → results list; else empty. */}
            {!selectedNode && searchTerm.trim() ? (
              <SearchResultsList
                nodes={nodes}
                searchTerm={searchTerm}
                onSelect={handleNodeSelect}
              />
            ) : (
              <Inspector
                key={selectedNode?.id ?? 'none'}
                node={selectedNode}
                onClose={() => setSelectedNode(null)}
                onNavigate={handleInspectorNavigate}
                onBackToResults={
                  selectedNode && searchTerm.trim()
                    ? () => setSelectedNode(null)
                    : undefined
                }
                onStartPathfinding={pathfinding.startPathSelection}
                isPathSelecting={pathfinding.isSelectingTarget}
                onTagClick={handleInspectorTagClick}
                onRelationshipTypeClick={handleRelationshipTypeClick}
                relationshipVisibility={relationshipVisibility}
                onExpand={graph.expand}
                existingNodeIds={visibleNodeIds}
              />
            )}
          </Panel>
        </PanelGroup>

        {/* Settings Panel (right-docked) */}
        <SettingsPanel
          isOpen={settingsPanelOpen}
          onClose={() => setSettingsPanelOpen(false)}
          filters={filters}
          onFiltersChange={handleFilterChange}
          typeColors={data?.meta?.type_colors}
          forceConfig={forceConfig}
          onForceConfigChange={handleForceConfigChange}
          onReheat={handleReheat}
          onResetForces={handleResetForces}
          displayConfig={displayConfig}
          onDisplayConfigChange={handleDisplayConfigChange}
          clusterConfig={clusterConfig}
          onClusterConfigChange={handleClusterConfigChange}
          relationshipVisibility={relationshipVisibility}
          onRelationshipVisibilityChange={handleRelationshipVisibilityChange}
          soundEnabled={sound.settings.enabled}
          onSoundEnabledChange={sound.setEnabled}
          soundVolume={sound.settings.masterVolume}
          onSoundVolumeChange={sound.setMasterVolume}
        />
      </div>

      {/* Tag Cloud (press 'T' to toggle) */}
      <TagCloud
        tags={tagCloud.tags}
        filteredTags={tagCloud.filteredTags}
        selectedTags={tagCloud.selectedTags}
        filterMode={tagCloud.filterMode}
        filteredCount={tagCloud.filteredNodeIds.size}
        totalCount={nodes.length}
        onToggleTag={tagCloud.toggleTag}
        onClearSelection={tagCloud.clearSelection}
        onToggleFilterMode={tagCloud.toggleFilterMode}
        onSearchChange={tagCloud.setSearchTerm}
        searchTerm={tagCloud.searchTerm}
        typeColors={data?.meta?.type_colors}
        visible={tagCloudVisible}
        onClose={() => setTagCloudVisible(false)}
      />

      <KeyboardShortcutsHelp
        open={shortcutsHelpOpen}
        onClose={() => setShortcutsHelpOpen(false)}
        shortcuts={shortcuts}
        modifierLabel={keyboardModifierLabel}
      />

      {statusMessage && (
        <div
          role="status"
          aria-live="polite"
          aria-atomic="true"
          className="fixed bottom-5 right-5 z-[95] rounded-lg border border-hairline bg-surface-1 px-3 py-2 text-sm text-ink shadow-xl"
        >
          {statusMessage}
        </div>
      )}
    </div>
  )
}
