import { useEffect, useMemo, useState } from 'react'
import { Search, ArrowRight, Loader2, Plus, Tag } from 'lucide-react'
import type { GraphNode } from '@/lib/types'
import { searchRelevance } from '@/lib/searchMatch'
import { buildSnippet, findMatchedTag, relativeDate } from '@/lib/searchSnippet'

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

/**
 * Triage sort. "Relevance" preserves the incoming order (backend semantic rank,
 * then local matches); the other two re-rank client-side over the rows we have.
 */
type SortMode = 'relevance' | 'recent' | 'important'

const SORT_MODES: { value: SortMode; label: string }[] = [
  { value: 'relevance', label: 'Relevance' },
  { value: 'recent', label: 'Recent' },
  { value: 'important', label: 'Important' },
]

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
  const [sortMode, setSortMode] = useState<SortMode>('relevance')
  const [typeFilter, setTypeFilter] = useState<Set<string>>(new Set())

  // A type pill is a refinement of THIS query. Carrying it into the next query
  // would silently filter results the user never asked to narrow — clear it
  // when the term changes. (Sort is a stable viewing preference; it stays.)
  useEffect(() => {
    // Keep identity when already empty — no churn on every keystroke.
    setTypeFilter((prev) => (prev.size > 0 ? new Set<string>() : prev))
  }, [searchTerm])

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

  // Type pills are derived from the FULL result set (not the filtered rows), so
  // a pill never disappears while it's the active filter.
  const typeCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const node of display) {
      counts.set(node.type, (counts.get(node.type) ?? 0) + 1)
    }
    return [...counts.entries()].sort((a, b) => b[1] - a[1])
  }, [display])

  const visible = useMemo(() => {
    let rows = typeFilter.size > 0 ? display.filter((n) => typeFilter.has(n.type)) : display
    if (sortMode === 'recent') {
      // Missing/invalid timestamps sink to the bottom instead of poisoning the sort.
      rows = [...rows].sort((a, b) => {
        const ta = a.timestamp ? new Date(a.timestamp).getTime() : NaN
        const tb = b.timestamp ? new Date(b.timestamp).getTime() : NaN
        if (isNaN(ta) && isNaN(tb)) return 0
        if (isNaN(ta)) return 1
        if (isNaN(tb)) return -1
        return tb - ta
      })
    } else if (sortMode === 'important') {
      rows = [...rows].sort((a, b) => b.importance - a.importance)
    }
    return rows
  }, [display, typeFilter, sortMode])

  const toggleType = (type: string) => {
    setTypeFilter((prev) => {
      const next = new Set(prev)
      if (next.has(type)) next.delete(type)
      else next.add(type)
      return next
    })
  }

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
      <div className="flex-shrink-0 p-4 pb-3 border-b border-white/5">
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

        {/* Sort strip */}
        <div className="flex items-center gap-1 mt-2.5">
          {SORT_MODES.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => setSortMode(value)}
              className={`px-2 py-0.5 rounded text-[11px] transition-colors ${
                sortMode === value
                  ? 'bg-accent text-void font-medium'
                  : 'bg-white/5 text-ink-3 hover:bg-white/10'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {/* Type pills — client-side filter over the rows we have */}
        {typeCounts.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 mt-1.5">
            {typeCounts.map(([type, n]) => {
              const active = typeFilter.has(type)
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => toggleType(type)}
                  className={`px-1.5 py-0.5 rounded text-[10px] transition-colors ${
                    active
                      ? 'bg-white/15 text-ink ring-1 ring-white/30'
                      : 'bg-white/5 text-ink-3 hover:bg-white/10'
                  }`}
                  title={active ? `Showing only ${type} — click to clear` : `Show only ${type}`}
                >
                  {type} <span className="text-ink-4">{n}</span>
                </button>
              )
            })}
            {typeFilter.size > 0 && (
              <button
                type="button"
                onClick={() => setTypeFilter(new Set())}
                className="px-1.5 py-0.5 text-[10px] text-ink-3 hover:text-ink-2"
              >
                Clear
              </button>
            )}
          </div>
        )}
      </div>

      {/* Capped guidance — a refinement nudge instead of silence at the 100 cap */}
      {capped && (
        <div className="flex-shrink-0 px-4 py-2 bg-warn/10 border-b border-white/5 text-[11px] text-ink-3 leading-snug">
          Showing the top {count?.toLocaleString()} from your store. Add a word or
          pick a type above to narrow it down.
        </div>
      )}

      {/* Results */}
      <div className="flex-1 overflow-y-auto p-3 space-y-2">
        {visible.map((node) => {
          const inGraph = inGraphIds.has(node.id)
          const rowLoading = loadingId === node.id
          const snippet = buildSnippet(node.content, lower)
          // Non-content hit: point at the tag that matched (semantic-only hits
          // show neither — the row's type/recency still carry the signal).
          const matchedTag = snippet.matchedContent ? null : findMatchedTag(node.tags, lower)
          const rel = relativeDate(node.timestamp)
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
                  {rel && (
                    <span
                      className="text-xs text-ink-4"
                      title={node.timestamp ? new Date(node.timestamp).toLocaleString() : undefined}
                    >
                      {rel}
                    </span>
                  )}
                  {/* Thin importance bar — same encoding as node size in the scene */}
                  <span
                    className="h-[3px] w-10 rounded-full bg-white/10 overflow-hidden flex-shrink-0"
                    title={`Importance ${node.importance.toFixed(2)}`}
                  >
                    <span
                      className="block h-full rounded-full"
                      style={{
                        width: `${Math.round(Math.min(1, Math.max(0, node.importance)) * 100)}%`,
                        backgroundColor: node.color,
                        opacity: 0.85,
                      }}
                    />
                  </span>
                  {!inGraph && (
                    <span className="text-[10px] text-ink-4 inline-flex items-center gap-0.5 ml-auto">
                      <Plus className="w-3 h-3" />
                      load
                    </span>
                  )}
                </div>
                <div className="text-sm text-ink-2 line-clamp-2">
                  {snippet.parts.map((part, i) =>
                    part.highlight ? (
                      <mark
                        key={i}
                        className="bg-accent/25 text-ink rounded-[2px] px-px"
                      >
                        {part.text}
                      </mark>
                    ) : (
                      <span key={i}>{part.text}</span>
                    )
                  )}
                </div>
                {matchedTag && (
                  <div className="mt-1">
                    <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] text-ink-2 bg-accent/15">
                      <Tag className="w-2.5 h-2.5" />
                      matched: {matchedTag}
                    </span>
                  </div>
                )}
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
        {visible.length === 0 && (
          <div className="p-4 text-center text-xs text-ink-3">
            {typeFilter.size > 0
              ? `No ${[...typeFilter].join(' / ')} results — clear the type filter above.`
              : 'No results.'}
          </div>
        )}
      </div>
    </div>
  )
}
