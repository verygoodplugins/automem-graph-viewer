import { useQuery } from '@tanstack/react-query'
import {
  fetchGraphSnapshot,
  fetchGraphNeighbors,
  fetchGraphStats,
  fetchRecall,
  mapRecallResultToNode,
  MAX_RECALL,
  type SnapshotParams,
  type NeighborsParams,
} from '../api/client'
import type { GraphNode } from '../lib/types'

export function useGraphSnapshot(params: SnapshotParams & { enabled?: boolean } = {}) {
  const { enabled = true, ...queryParams } = params

  return useQuery({
    queryKey: ['graph', 'snapshot', queryParams],
    queryFn: () => fetchGraphSnapshot(queryParams),
    enabled,
  })
}

export function useGraphNeighbors(memoryId: string | null, params: NeighborsParams = {}) {
  return useQuery({
    queryKey: ['graph', 'neighbors', memoryId, params],
    queryFn: () => fetchGraphNeighbors(memoryId!, params),
    enabled: !!memoryId,
  })
}

export function useGraphStats(enabled = true) {
  return useQuery({
    queryKey: ['graph', 'stats'],
    queryFn: fetchGraphStats,
    enabled,
  })
}

export interface RecallData {
  /** Search results across the whole store, mapped to GraphNodes (relevance order). */
  results: GraphNode[]
  /** Number returned (== results.length). */
  count: number
  /** True when the result set hit the server cap — there may be more; refine. */
  capped: boolean
}

/**
 * Whole-store search via /recall. Keyed only on the (debounced) term, so the
 * result set is cached per query. `typeColors` is applied in `select` (cheap,
 * cosmetic) rather than the key, so changing the palette recolors cached results
 * without a refetch. Disabled until the term is non-empty.
 */
export function useRecall(term: string, typeColors?: Record<string, string>) {
  const trimmed = term.trim()
  return useQuery({
    queryKey: ['recall', trimmed],
    queryFn: () => fetchRecall(trimmed, MAX_RECALL),
    enabled: !!trimmed,
    select: (data): RecallData => ({
      results: data.results.map((r) => mapRecallResultToNode(r, typeColors ?? {})),
      count: data.count,
      capped: data.results.length >= MAX_RECALL,
    }),
  })
}
