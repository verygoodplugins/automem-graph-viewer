import { useMemo } from 'react'
import { Search, ArrowRight, Loader2, Plus } from 'lucide-react'
import type { GraphNode } from '@/lib/types'
import { searchRelevance } from '@/lib/searchMatch'

interface SearchResultsListProps {
  /** The currently-rendered node set (App's importance-filtered nodes, the loaded scene). */
  nodes: GraphNode[]
  /** Whole-store search results from /recall, already relevance-ranked by the backend. */
  results: GraphNode[]
  /** Total matches the server reports (== results.length). */
  count?: number
  /** True when the server result set hit the cap — there may be more; refine. */
  capped?: boolean
  /** Recall request in flight. */
  isLoading?: boolean
  /** Recall request failed — we degrade to local substring matches. */
  isError?: boolean
  /** Id of the row currently being fetched + injected (shows a spinner, disables click). */
  loadingId?: string | null
  /** Ids already present in the loaded scene (off-graph rows get a "load" affordance). */
  inGraphIds: Set<string>
  searchTerm: string
  /** Select a result → parent flies to it (in-graph) or fetches + injects it (off-graph). */
  onSelect: (node: GraphNode) => void
}

function shortDate(timestamp: string): string {
  const date = new Date(timestamp)
  if (isNaN(date.getTime())) return ''
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  })
}

export function SearchResultsList({
  nodes,
  results,
  count,
  capped,
  isLoading,
  isError,
  loadingId,
  inGraphIds,
  searchTerm,
  onSelect,
}: SearchResultsListProps) {
  const lower = searchTerm.trim().toLowerCase()

  // Display list = server (semantic, whole-store) results in backend order, then
  // any LOCAL substring matches the server didn't return, deduped by id. We do NOT
  // re-filter the server results by substring — they're semantic matches and may
  // not contain the literal term.
  const display = useMemo(() => {
    const serverIds = new Set(results.map((r) => r.id))
    if (!lower) return results
    const localOnly = nodes
      .filter((n) => !serverIds.has(n.id))
      .map((node) => ({ node, score: searchRelevance(node, lower) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.node.importance - a.node.importance)
      .map((r) => r.node)
    return [...results, ...localOnly]
  }, [results, nodes, lower])

  // Headline count: trust the server's whole-store count, but never show a number
  // smaller than the rows actually rendered — local substring matches can append
  // beyond the server count, and a header that reads lower than the list is
  // self-contradictory. "+" (capped) semantics are preserved by the caller.
  const headlineCount = Math.max(count ?? 0, display.length)

  if (display.length === 0) {
    if (isLoading) {
      return (
        <div className="h-full glass flex flex-col items-center justify-center p-6 text-center">
          <Loader2 className="w-8 h-8 text-ink-3 animate-spin mb-4" />
          <p className="text-sm text-ink-3">Searching all memories…</p>
        </div>
      )
    }
    return (
      <div className="h-full glass flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-ink-4" />
        </div>
        <h3 className="font-display text-lg font-medium text-ink-2 mb-2">No matches</h3>
        <p className="text-sm text-ink-3">
          {isError
            ? `Search is unavailable — nothing loaded matches “${searchTerm}”`
            : `Nothing in your memories matches “${searchTerm}”`}
        </p>
      </div>
    )
  }

  return (
    <div className="h-full glass flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          {isLoading ? (
            <Loader2 className="w-4 h-4 text-ink-3 flex-shrink-0 animate-spin" />
          ) : (
            <Search className="w-4 h-4 text-ink-3 flex-shrink-0" />
          )}
          <span className="text-sm font-medium text-ink-2">Search results</span>
          <span className="text-xs text-ink-3 ml-auto font-mono">
            {headlineCount.toLocaleString()}
            {capped ? '+' : ''}
          </span>
        </div>
        <div className="text-xs text-ink-3 truncate mt-1">
          {isError ? 'Showing loaded matches only' : 'Across all your memories'} · “{searchTerm}”
        </div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {display.map((node) => {
          const inGraph = inGraphIds.has(node.id)
          const rowLoading = loadingId === node.id
          return (
            <button
              key={node.id}
              onClick={() => onSelect(node)}
              disabled={rowLoading}
              className="w-full flex items-start gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group disabled:opacity-60 disabled:cursor-wait"
            >
              <div
                className="w-2 h-2 rounded-full mt-1.5 flex-shrink-0"
                style={{ backgroundColor: node.color }}
              />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs text-ink-3">{node.type}</span>
                  {node.timestamp && (
                    <span className="text-xs text-ink-4">{shortDate(node.timestamp)}</span>
                  )}
                  {!inGraph && (
                    <span className="text-[10px] text-ink-4 inline-flex items-center gap-0.5 ml-auto">
                      <Plus className="w-3 h-3" />
                      load
                    </span>
                  )}
                </div>
                <div className="text-sm text-ink-2 line-clamp-2">
                  {node.content.slice(0, 80)}
                  {node.content.length > 80 && '…'}
                </div>
                {node.tags.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {node.tags.slice(0, 3).map((tag) => (
                      <span
                        key={tag}
                        className="px-1.5 py-0.5 rounded text-[10px] text-ink-3 bg-white/5"
                      >
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
              </div>
              {rowLoading ? (
                <Loader2 className="w-4 h-4 text-ink-3 flex-shrink-0 mt-1 animate-spin" />
              ) : (
                <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-ink-3 flex-shrink-0 mt-1" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
