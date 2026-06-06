import { useMemo } from 'react'
import { Search, ArrowRight } from 'lucide-react'
import type { GraphNode } from '@/lib/types'
import { searchRelevance } from '@/lib/searchMatch'

interface SearchResultsListProps {
  /** The currently-rendered node set (App's importance-filtered nodes, ≤ maxNodes). */
  nodes: GraphNode[]
  searchTerm: string
  /** Select a result → parent selects the node + flies the camera to frame it. */
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

export function SearchResultsList({ nodes, searchTerm, onSelect }: SearchResultsListProps) {
  const lower = searchTerm.trim().toLowerCase()

  // Filter on search only (not the tag filter) so this list is identical to the
  // graph's matchingIds spotlight. Rank: relevance (content > tag > type) then importance.
  const results = useMemo(() => {
    if (!lower) return []
    return nodes
      .map((node) => ({ node, score: searchRelevance(node, lower) }))
      .filter((r) => r.score > 0)
      .sort((a, b) => b.score - a.score || b.node.importance - a.node.importance)
  }, [nodes, lower])

  if (results.length === 0) {
    return (
      <div className="h-full glass flex flex-col items-center justify-center p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center mb-4">
          <Search className="w-8 h-8 text-ink-4" />
        </div>
        <h3 className="font-display text-lg font-medium text-ink-2 mb-2">No matches</h3>
        <p className="text-sm text-ink-3">
          Nothing in view matches “{searchTerm}”
        </p>
      </div>
    )
  }

  return (
    <div className="h-full glass flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b border-white/5">
        <div className="flex items-center gap-2">
          <Search className="w-4 h-4 text-ink-3 flex-shrink-0" />
          <span className="text-sm font-medium text-ink-2">Search results</span>
          <span className="text-xs text-ink-3 ml-auto font-mono">
            {results.length.toLocaleString()}
          </span>
        </div>
        <div className="text-xs text-ink-3 truncate mt-1">“{searchTerm}”</div>
      </div>

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {results.map(({ node }) => (
          <button
            key={node.id}
            onClick={() => onSelect(node)}
            className="w-full flex items-start gap-2 p-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-left group"
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
            <ArrowRight className="w-4 h-4 text-ink-4 group-hover:text-ink-3 flex-shrink-0 mt-1" />
          </button>
        ))}
      </div>
    </div>
  )
}
