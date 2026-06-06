import type { GraphNode } from './types'

/**
 * Single source of truth for "does this node match the search term".
 *
 * Mirrors the predicates previously duplicated in App.tsx (clientVisibleNodeCount)
 * and GraphCanvas.tsx (matchingIds). Match against content, type, or any tag.
 *
 * `lowerTerm` must already be lower-cased and trimmed by the caller (callers
 * typically lower-case once per render and reuse it across many nodes).
 */
export function matchesSearch(node: GraphNode, lowerTerm: string): boolean {
  if (!lowerTerm) return false
  return (
    node.content.toLowerCase().includes(lowerTerm) ||
    node.type.toLowerCase().includes(lowerTerm) ||
    node.tags.some((t) => t.toLowerCase().includes(lowerTerm))
  )
}

/**
 * Relevance score for ranking search results in the sidebar list.
 * content match (3) > tag match (2) > type match (1); 0 means no match.
 */
export function searchRelevance(node: GraphNode, lowerTerm: string): number {
  if (!lowerTerm) return 0
  if (node.content.toLowerCase().includes(lowerTerm)) return 3
  if (node.tags.some((t) => t.toLowerCase().includes(lowerTerm))) return 2
  if (node.type.toLowerCase().includes(lowerTerm)) return 1
  return 0
}
