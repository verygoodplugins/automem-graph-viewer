import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, X } from 'lucide-react'
import type { FilterChip } from '@/hooks/useFilterChips'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  className?: string
  shortcutsEnabled?: boolean
  chips?: FilterChip[]
  onRemoveChip?: (id: string) => void
  onClearAll?: () => void
  matchingCount?: number
  totalCount?: number
  /** A text search is active — show the whole-store match count, not matching/total. */
  searchActive?: boolean
  /** Whole-store match count from /recall (rendered as "N matches", "+" when capped). */
  searchResultCount?: number
  searchResultCapped?: boolean
  /** Recall request in flight. */
  searchLoading?: boolean
}

export function SearchBar({
  value,
  onChange,
  className = '',
  shortcutsEnabled = true,
  chips = [],
  onRemoveChip,
  onClearAll,
  matchingCount,
  totalCount,
  searchActive = false,
  searchResultCount,
  searchResultCapped = false,
  searchLoading = false,
}: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const chipStripRef = useRef<HTMLDivElement>(null)
  const modifierLabel = useMemo(() => {
    return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'
  }, [])

  const hasChips = chips.length > 0
  // During a text search the meaningful number is the whole-store match count
  // (from /recall), not "matching-local / loaded" — that would read as exhaustive.
  // The matching/total badge is reserved for tag-only filtering (purely client-side).
  const showSearchCount = searchActive && (searchResultCount != null || searchLoading)
  const showCount =
    !searchActive && matchingCount != null && totalCount != null && hasChips

  // Debounce the onChange callback
  useEffect(() => {
    if (localValue === '') {
      onChange('')
      return
    }

    const timer = setTimeout(() => {
      onChange(localValue)
    }, 300)

    return () => clearTimeout(timer)
  }, [localValue, onChange])

  // Sync external value changes
  useEffect(() => {
    setLocalValue(value)
  }, [value])

  // Auto-scroll chip strip to end when chips change
  useEffect(() => {
    if (chipStripRef.current) {
      chipStripRef.current.scrollLeft = chipStripRef.current.scrollWidth
    }
  }, [chips.length])

  const handleClear = useCallback(() => {
    setLocalValue('')
    inputRef.current?.focus()
  }, [])

  // Global keyboard shortcuts: Cmd/Ctrl+K and /
  useEffect(() => {
    if (!shortcutsEnabled) return

    const handleGlobalKeyDown = (event: KeyboardEvent) => {
      const target = event.target
      const isTypingContext =
        target instanceof HTMLInputElement ||
        target instanceof HTMLTextAreaElement ||
        (target instanceof HTMLElement && target.isContentEditable)

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        if (!isTypingContext) {
          event.preventDefault()
          inputRef.current?.focus()
          inputRef.current?.select()
        }
        return
      }

      if (!isTypingContext && event.key === '/') {
        event.preventDefault()
        inputRef.current?.focus()
      }
    }

    window.addEventListener('keydown', handleGlobalKeyDown)
    return () => window.removeEventListener('keydown', handleGlobalKeyDown)
  }, [shortcutsEnabled])

  return (
    <div className={`relative flex items-center gap-2 ${className}`}>
      <div className="relative flex-1 flex items-center">
        {/* Chip strip */}
        {hasChips && (
          <div
            ref={chipStripRef}
            className="flex items-center gap-1 pl-3 pr-1 overflow-x-auto max-w-[280px] flex-shrink-0 scrollbar-hide"
          >
            {chips.map((chip) => (
              <span
                key={chip.id}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium whitespace-nowrap bg-white/10 text-ink-2 transition-colors hover:bg-white/15 group"
              >
                <span
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: chip.color }}
                />
                {chip.label}
                {onRemoveChip && (
                  <button
                    onClick={() => onRemoveChip(chip.id)}
                    className="ml-0.5 text-ink-3 hover:text-ink-2 transition-colors"
                    aria-label={`Remove filter: ${chip.label}`}
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </span>
            ))}
            {hasChips && onClearAll && chips.length > 1 && (
              <button
                onClick={onClearAll}
                className="text-[10px] text-ink-3 hover:text-ink-2 px-1 whitespace-nowrap transition-colors"
                aria-label="Clear all filters"
              >
                Clear all
              </button>
            )}
          </div>
        )}

        {/* Search input */}
        <div className="relative flex-1 min-w-[140px]">
          <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="w-4 h-4 text-ink-3" />
          </div>
          <input
            type="text"
            ref={inputRef}
            value={localValue}
            onChange={(e) => setLocalValue(e.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Escape' && localValue) {
                event.preventDefault()
                handleClear()
              }
            }}
            placeholder={hasChips ? 'Search...' : 'Search all memories, tags, or types...'}
            className="w-full pl-9 pr-9 py-2 bg-black/30 border border-white/10 rounded-lg focus:border-accent focus:ring-1 focus:ring-accent outline-none transition-colors text-sm text-ink placeholder-ink-3"
          />
          {localValue && (
            <button
              onClick={handleClear}
              aria-label="Clear search"
              className="absolute inset-y-0 right-0 px-3 flex items-center text-ink-3 hover:text-ink-2"
            >
              <X className="w-4 h-4" />
            </button>
          )}
          {!localValue && !hasChips && (
            <kbd className="absolute inset-y-0 right-0 hidden items-center pr-3 text-[10px] text-ink-3 sm:flex">
              {modifierLabel} K
            </kbd>
          )}
        </div>
      </div>

      {/* Whole-store search match count (takes precedence during a text search) */}
      {showSearchCount && (
        <span
          className="font-mono text-xs text-ink-3 whitespace-nowrap flex-shrink-0"
          title={
            'Search covers your entire memory store. The graph only highlights matches ' +
            'already in view — click a result to bring it in.' +
            (searchResultCapped ? ' Capped at 100: add a word or tag to narrow it down.' : '')
          }
        >
          {searchResultCount == null ? (
            '…'
          ) : (
            <>
              <span className="text-accent">
                {searchResultCount.toLocaleString()}
                {searchResultCapped ? '+' : ''}
              </span>
              {' in store'}
            </>
          )}
        </span>
      )}

      {/* Filter count badge (tag-only filtering) */}
      {showCount && (
        <span className="font-mono text-xs text-ink-3 whitespace-nowrap flex-shrink-0">
          <span className="text-ink-2">{matchingCount.toLocaleString()}</span>
          {' / '}
          {totalCount.toLocaleString()}
        </span>
      )}
    </div>
  )
}
