/**
 * useFilterChips - Derives filter chip array from search term + selected tags
 *
 * Pure derivation hook: no internal state. Reads from searchTerm and
 * tagCloud selectedTags, produces a typed FilterChip[] array with
 * removeChip/clearAll dispatch functions.
 */

import { useMemo, useCallback } from 'react'

export interface FilterChip {
  id: string
  label: string
  color: string
  kind: 'tag' | 'search'
}

export interface UseFilterChipsOptions {
  searchTerm: string
  selectedTags: Set<string>
  tagColorMap: Map<string, string> // tag → color (from dominant type)
  onDeselectTag: (tag: string) => void
  onClearSearch: () => void
  onClearAll: () => void
}

export interface UseFilterChipsReturn {
  chips: FilterChip[]
  removeChip: (id: string) => void
  clearAll: () => void
  hasActiveFilters: boolean
}

export function useFilterChips({
  searchTerm,
  selectedTags,
  tagColorMap,
  onDeselectTag,
  onClearSearch,
  onClearAll,
}: UseFilterChipsOptions): UseFilterChipsReturn {
  const chips = useMemo(() => {
    const result: FilterChip[] = []

    // Tag chips
    for (const tag of selectedTags) {
      result.push({
        id: `tag-${tag}`,
        label: tag,
        color: tagColorMap.get(tag) ?? '#94A3B8',
        kind: 'tag',
      })
    }

    // Search chip (only when there's an active search term)
    if (searchTerm.trim()) {
      result.push({
        id: 'search',
        label: `"${searchTerm.trim()}"`,
        color: '#3B82F6',
        kind: 'search',
      })
    }

    return result
  }, [searchTerm, selectedTags, tagColorMap])

  const removeChip = useCallback(
    (id: string) => {
      if (id === 'search') {
        onClearSearch()
      } else if (id.startsWith('tag-')) {
        const tag = id.slice(4)
        onDeselectTag(tag)
      }
    },
    [onClearSearch, onDeselectTag]
  )

  return {
    chips,
    removeChip,
    clearAll: onClearAll,
    hasActiveFilters: chips.length > 0,
  }
}
