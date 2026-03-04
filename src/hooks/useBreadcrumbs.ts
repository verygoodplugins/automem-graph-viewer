/**
 * useBreadcrumbs - Node selection history with back/forward navigation
 *
 * Standard browser-back behavior: push() truncates forward history,
 * deduplicates consecutive same-node pushes. Max 20 entries.
 *
 * Navigation methods (goBack/goForward/jumpTo) use a callback to deliver
 * the resolved node, avoiding stale closure issues with React 18 batching.
 */

import { useState, useCallback, useRef } from 'react'
import type { GraphNode } from '@/lib/types'

export interface BreadcrumbEntry {
  nodeId: string
}

const MAX_ENTRIES = 20

export interface UseBreadcrumbsReturn {
  history: BreadcrumbEntry[]
  currentIndex: number
  push: (node: GraphNode) => void
  goBack: (nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => void
  goForward: (nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => void
  jumpTo: (index: number, nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => void
  canGoBack: boolean
  canGoForward: boolean
  clear: () => void
}

interface BreadcrumbState {
  history: BreadcrumbEntry[]
  currentIndex: number
}

function resolveNode(nodeId: string, nodes: GraphNode[]): GraphNode | null {
  return nodes.find((n) => n.id === nodeId) ?? null
}

export function useBreadcrumbs(): UseBreadcrumbsReturn {
  const [state, setState] = useState<BreadcrumbState>({
    history: [],
    currentIndex: -1,
  })

  // Use ref to read latest state synchronously for canGoBack/canGoForward
  const stateRef = useRef(state)
  stateRef.current = state

  const push = useCallback((node: GraphNode) => {
    setState((prev) => {
      // Truncate forward history
      const truncated = prev.history.slice(0, prev.currentIndex + 1)

      // Deduplicate consecutive same-node
      const last = truncated[truncated.length - 1]
      if (last?.nodeId === node.id) {
        return prev
      }

      let next = [...truncated, { nodeId: node.id }]

      // Cap at MAX_ENTRIES
      if (next.length > MAX_ENTRIES) {
        next = next.slice(next.length - MAX_ENTRIES)
      }

      return { history: next, currentIndex: next.length - 1 }
    })
  }, [])

  const goBack = useCallback((nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => {
    const prev = stateRef.current
    if (prev.currentIndex <= 0) return
    const newIndex = prev.currentIndex - 1
    setState({ ...prev, currentIndex: newIndex })
    const node = resolveNode(prev.history[newIndex].nodeId, nodes)
    if (node) onNavigate(node)
  }, [])

  const goForward = useCallback((nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => {
    const prev = stateRef.current
    if (prev.currentIndex >= prev.history.length - 1) return
    const newIndex = prev.currentIndex + 1
    setState({ ...prev, currentIndex: newIndex })
    const node = resolveNode(prev.history[newIndex].nodeId, nodes)
    if (node) onNavigate(node)
  }, [])

  const jumpTo = useCallback((index: number, nodes: GraphNode[], onNavigate: (node: GraphNode) => void) => {
    const prev = stateRef.current
    if (index < 0 || index >= prev.history.length) return
    setState({ ...prev, currentIndex: index })
    const node = resolveNode(prev.history[index].nodeId, nodes)
    if (node) onNavigate(node)
  }, [])

  const clear = useCallback(() => {
    setState({ history: [], currentIndex: -1 })
  }, [])

  return {
    history: state.history,
    currentIndex: state.currentIndex,
    push,
    goBack,
    goForward,
    jumpTo,
    canGoBack: state.currentIndex > 0,
    canGoForward: state.currentIndex < state.history.length - 1,
    clear,
  }
}
