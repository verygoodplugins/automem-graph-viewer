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
  clientVisibleCount?: number
  hasClientFilter?: boolean
}

export function StatsBar({ stats, isLoading, clientVisibleCount, hasClientFilter }: StatsBarProps) {
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

  // Client filter active: "Showing 42 of 500 memories"
  const showFilteredCount = hasClientFilter && clientVisibleCount != null

  return (
    <div className="flex items-center gap-4 text-sm">
      <div className="flex items-center gap-1.5 text-ink-3">
        <Database className="w-4 h-4 text-ink-3" />
        <span className="font-mono">
          {showFilteredCount ? (
            <>
              <span className="text-accent">
                {clientVisibleCount.toLocaleString()}
              </span>
              <span className="text-ink-3">
                {' '}of {stats.returned_nodes.toLocaleString()}
              </span>
            </>
          ) : (
            <>
              <span className="text-ink-2">{stats.returned_nodes.toLocaleString()}</span>
              {stats.sampled && (
                <span className="text-ink-3">
                  {' '}/ {stats.total_nodes.toLocaleString()}
                </span>
              )}
            </>
          )}
        </span>
      </div>
      <div className="flex items-center gap-1.5 text-ink-3">
        <GitBranch className="w-4 h-4 text-ink-3" />
        <span className="font-mono">
          <span className="text-ink-2">{stats.returned_edges.toLocaleString()}</span>
          {stats.sampled && (
            <span className="text-ink-3">
              {' '}/ {stats.total_edges.toLocaleString()}
            </span>
          )}
        </span>
      </div>
    </div>
  )
}
