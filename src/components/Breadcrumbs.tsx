/**
 * Breadcrumbs - Horizontal trail of visited nodes below the header
 *
 * Shows colored dots + truncated content. Click to jump back.
 * Only visible when history has entries. Resolves display data
 * from live nodes array to avoid stale cached content/colors.
 */

import { useRef, useEffect, useMemo } from 'react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import type { BreadcrumbEntry } from '@/hooks/useBreadcrumbs'
import type { GraphNode } from '@/lib/types'

interface BreadcrumbsProps {
  history: BreadcrumbEntry[]
  currentIndex: number
  nodes: GraphNode[]
  canGoBack: boolean
  canGoForward: boolean
  onGoBack: () => void
  onGoForward: () => void
  onJumpTo: (index: number) => void
}

interface ResolvedEntry {
  nodeId: string
  content: string
  color: string
  exists: boolean
}

export function Breadcrumbs({
  history,
  currentIndex,
  nodes,
  canGoBack,
  canGoForward,
  onGoBack,
  onGoForward,
  onJumpTo,
}: BreadcrumbsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  // Resolve display data from live nodes
  const nodeMap = useMemo(() => {
    const map = new Map<string, GraphNode>()
    for (const n of nodes) {
      map.set(n.id, n)
    }
    return map
  }, [nodes])

  const resolved: ResolvedEntry[] = useMemo(() => {
    return history.map((entry) => {
      const node = nodeMap.get(entry.nodeId)
      if (!node) {
        return { nodeId: entry.nodeId, content: '(deleted)', color: '#64748b', exists: false }
      }
      const clean = node.content.replace(/\n/g, ' ')
      const truncated = clean.length > 30 ? clean.slice(0, 30) + '...' : clean
      return { nodeId: entry.nodeId, content: truncated, color: node.color, exists: true }
    })
  }, [history, nodeMap])

  // Auto-scroll to current entry
  useEffect(() => {
    if (!scrollRef.current) return
    const current = scrollRef.current.children[currentIndex] as HTMLElement | undefined
    current?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
  }, [currentIndex])

  if (history.length === 0) return null

  return (
    <div className="h-7 flex-shrink-0 bg-black/20 border-b border-white/5 flex items-center px-2 gap-1 z-40">
      {/* Back/Forward buttons */}
      <button
        type="button"
        onClick={onGoBack}
        disabled={!canGoBack}
        className="p-0.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Go back"
        title="Go back (Cmd+[)"
      >
        <ChevronLeft className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={onGoForward}
        disabled={!canGoForward}
        className="p-0.5 rounded text-slate-500 hover:text-slate-300 disabled:opacity-30 disabled:cursor-default transition-colors"
        aria-label="Go forward"
        title="Go forward (Cmd+])"
      >
        <ChevronRight className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-3.5 bg-white/10 mx-0.5" />

      {/* Breadcrumb trail */}
      <div
        ref={scrollRef}
        className="flex-1 flex items-center gap-0.5 overflow-x-auto scrollbar-hide"
      >
        {resolved.map((entry, i) => {
          const isCurrent = i === currentIndex

          return (
            <button
              type="button"
              key={`${entry.nodeId}-${i}`}
              onClick={() => onJumpTo(i)}
              disabled={!entry.exists}
              className={`
                inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[11px] whitespace-nowrap transition-all flex-shrink-0
                ${isCurrent
                  ? 'bg-white/10 ring-1 ring-white/20 text-slate-200'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/5'
                }
                ${!entry.exists ? 'opacity-40 cursor-default' : ''}
              `}
              title={entry.content}
            >
              <span
                className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                style={{ backgroundColor: entry.color }}
              />
              {entry.content}
            </button>
          )
        })}
      </div>
    </div>
  )
}
