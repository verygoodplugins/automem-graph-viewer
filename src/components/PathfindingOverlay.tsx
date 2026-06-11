/**
 * PathfindingOverlay - UI for path selection and path info display
 *
 * Shows:
 * - Instructions when selecting target
 * - Path info panel when path is found
 * - Controls for cycling between alternative paths
 */

import type { PathResult } from '../hooks/usePathfinding'
import type { SimulationNode } from '../lib/types'

interface PathfindingOverlayProps {
  isSelectingTarget: boolean
  sourceNode: SimulationNode | null
  targetNode: SimulationNode | null
  currentPath: PathResult | null
  pathCount: number
  activePath: number
  onNextPath: () => void
  onPreviousPath: () => void
  onCancel: () => void
  onClear: () => void
  visible?: boolean
}

export function PathfindingOverlay({
  isSelectingTarget,
  sourceNode,
  targetNode,
  currentPath,
  pathCount,
  activePath,
  onNextPath,
  onPreviousPath,
  onCancel,
  onClear,
  visible = true,
}: PathfindingOverlayProps) {
  if (!visible) return null

  // Show selection prompt when selecting target
  if (isSelectingTarget && sourceNode) {
    return (
      <div className="absolute top-20 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-surface-1 backdrop-blur-sm border border-white/20 rounded-lg px-4 py-3 shadow-elev-2">
          <div className="flex items-center gap-3">
            <div className="animate-pulse">
              <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
            <div>
              <div className="text-ink font-medium">Select destination node</div>
              <div className="text-ink-3 text-sm">
                Click another node to find path from "{truncate(sourceNode.content, 30)}"
              </div>
            </div>
            <button
              onClick={onCancel}
              className="ml-4 px-2 py-1 rounded text-sm text-ink-3 hover:text-ink hover:bg-white/10 transition-colors"
            >
              Cancel (Esc)
            </button>
          </div>
        </div>
      </div>
    )
  }

  // No path among LOADED memories. Scope honesty: the scene holds a bounded
  // overview (+expansions) of a much larger store, so Dijkstra failing here
  // usually means "no path loaded", not "no path exists". Say so instead of
  // silently vanishing (the previous behavior).
  if (!currentPath && sourceNode && targetNode) {
    return (
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-surface-1 backdrop-blur-sm border border-hairline rounded-lg shadow-elev-2 overflow-hidden max-w-md">
          <div className="px-4 py-3 flex items-start gap-3">
            <svg className="w-5 h-5 text-warn flex-shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01M5.07 19h13.86c1.54 0 2.5-1.67 1.73-3L13.73 4c-.77-1.33-2.69-1.33-3.46 0L3.34 16c-.77 1.33.19 3 1.73 3z" />
            </svg>
            <div className="flex-1">
              <div className="text-ink font-medium">No path among loaded memories</div>
              <div className="text-ink-3 text-sm mt-1">
                A path may exist through memories not yet in view. Expand each
                endpoint ("Expand into graph" in the inspector), then try again.
              </div>
            </div>
            <button
              onClick={onClear}
              className="p-1 rounded hover:bg-white/10 text-ink-3 hover:text-ink transition-colors flex-shrink-0"
              title="Dismiss"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    )
  }

  // Show path info when path is found
  if (currentPath && sourceNode && targetNode) {
    return (
      <div className="absolute bottom-20 left-1/2 -translate-x-1/2 z-50">
        <div className="bg-surface-1 backdrop-blur-sm border border-hairline rounded-lg shadow-elev-2 overflow-hidden min-w-[320px]">
          {/* Header */}
          <div className="px-4 py-3 bg-white/5 border-b border-hairline">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span className="text-ink font-medium">Path Found</span>
              </div>
              <button
                onClick={onClear}
                className="p-1 rounded hover:bg-white/10 text-ink-3 hover:text-ink transition-colors"
                title="Clear path"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {/* Path details */}
          <div className="px-4 py-3 space-y-2">
            {/* Source and Target */}
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-xs font-medium">FROM</span>
              <span className="text-ink-2 truncate max-w-[120px]">{truncate(sourceNode.content, 25)}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="px-2 py-0.5 bg-red-500/20 text-red-400 rounded text-xs font-medium">TO</span>
              <span className="text-ink-2 truncate max-w-[120px]">{truncate(targetNode.content, 25)}</span>
            </div>

            {/* Stats */}
            <div className="flex items-center gap-4 pt-2 border-t border-hairline">
              <div className="text-center">
                <div className="font-mono text-2xl font-bold text-ink">{currentPath.hopCount}</div>
                <div className="text-xs text-ink-3">Hops</div>
              </div>
              <div className="text-center">
                <div className="font-mono text-2xl font-bold text-ink">{(currentPath.totalStrength * 100).toFixed(0)}%</div>
                <div className="text-xs text-ink-3">Avg Strength</div>
              </div>
              <div className="text-center flex-1">
                <div className="text-sm text-ink-2">
                  {getUniqueTypes(currentPath).join(' → ')}
                </div>
                <div className="text-xs text-ink-3">Relationship types</div>
              </div>
            </div>
          </div>

          {/* Alternative paths navigation */}
          {pathCount > 1 && (
            <div className="px-4 py-2 bg-black/20 border-t border-hairline flex items-center justify-between">
              <button
                onClick={onPreviousPath}
                className="p-1 rounded hover:bg-white/10 text-ink-3 hover:text-ink transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                </svg>
              </button>
              <span className="text-sm font-mono text-ink-3">
                Path {activePath + 1} of {pathCount}
              </span>
              <button
                onClick={onNextPath}
                className="p-1 rounded hover:bg-white/10 text-ink-3 hover:text-ink transition-colors"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  return null
}

function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text
  return text.slice(0, maxLength) + '...'
}

function getUniqueTypes(path: PathResult): string[] {
  const types: string[] = []
  for (const step of path.path) {
    if (step.edgeType && !types.includes(step.edgeType)) {
      types.push(step.edgeType)
    }
  }
  return types.length > 0 ? types : ['—']
}
