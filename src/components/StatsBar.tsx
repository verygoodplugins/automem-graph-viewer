import { Database, GitBranch } from 'lucide-react'

interface StatsBarProps {
  stats?: {
    total_nodes: number
    total_edges: number
    returned_nodes: number
    returned_edges: number
    sampled: boolean
    sample_ratio: number
  }
  isLoading: boolean
  /**
   * LIVE in-view counts (snapshot + expansions, after client filters). The
   * snapshot's returned_nodes/returned_edges go stale the moment an expansion
   * merges nodes in — "in view" must count what's actually rendered.
   */
  inViewNodeCount?: number
  inViewEdgeCount?: number
  clientVisibleCount?: number
  hasClientFilter?: boolean
}

/**
 * Scope language ("in view" vs "in store") is deliberate and used app-wide:
 * "in view" = memories loaded into the 3D scene (bounded overview + expansions);
 * "in store" = everything on the server. The two never get conflated into one
 * bare number — that's how "2 of 2,000" used to read as exhaustive.
 */
export function StatsBar({
  stats,
  isLoading,
  inViewNodeCount,
  inViewEdgeCount,
  clientVisibleCount,
  hasClientFilter,
}: StatsBarProps) {
  if (isLoading || !stats) {
    return (
      <div className="flex items-center gap-4 text-sm text-ink-3">
        <div className="flex items-center gap-1.5">
          <Database className="w-4 h-4" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Client filter active: "42 of 500 in view"
  const showFilteredCount = hasClientFilter && clientVisibleCount != null
  const nodesInView = inViewNodeCount ?? stats.returned_nodes
  const edgesInView = inViewEdgeCount ?? stats.returned_edges
  const hasMoreInStore = stats.total_nodes > nodesInView

  return (
    <div className="flex items-center gap-4 text-sm">
      <div
        className="flex items-center gap-1.5 text-ink-3"
        title={
          'In view: memories loaded into the 3D scene. In store: everything on the server. ' +
          'Click a node or a search result to pull more into view.'
        }
      >
        <Database className="w-4 h-4 text-ink-3" />
        <span className="font-mono">
          {showFilteredCount ? (
            <>
              <span className="text-accent">
                {clientVisibleCount.toLocaleString()}
              </span>
              <span className="text-ink-3">
                {' '}of {nodesInView.toLocaleString()} in view
              </span>
            </>
          ) : (
            <>
              <span className="text-ink-2">{nodesInView.toLocaleString()}</span>
              <span className="text-ink-3"> in view</span>
            </>
          )}
          {hasMoreInStore && (
            <span className="text-ink-3">
              {' '}· {stats.total_nodes.toLocaleString()} in store
            </span>
          )}
        </span>
      </div>
      <div
        className="flex items-center gap-1.5 text-ink-3"
        title="Relationships loaded into the scene (and total in store)"
      >
        <GitBranch className="w-4 h-4 text-ink-3" />
        <span className="font-mono">
          <span className="text-ink-2">{edgesInView.toLocaleString()}</span>
          {stats.total_edges > edgesInView && (
            <span className="text-ink-3">
              {' '}/ {stats.total_edges.toLocaleString()}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
