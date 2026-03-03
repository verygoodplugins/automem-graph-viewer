import { useState, useEffect, useCallback, useRef, useMemo } from 'react'
import { Search, X } from 'lucide-react'

interface SearchBarProps {
  value: string
  onChange: (value: string) => void
  className?: string
  shortcutsEnabled?: boolean
}

export function SearchBar({ value, onChange, className = '', shortcutsEnabled = true }: SearchBarProps) {
  const [localValue, setLocalValue] = useState(value)
  const inputRef = useRef<HTMLInputElement>(null)
  const modifierLabel = useMemo(() => {
    return navigator.platform.toLowerCase().includes('mac') ? 'Cmd' : 'Ctrl'
  }, [])

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
    <div className={`relative ${className}`}>
      <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
        <Search className="w-4 h-4 text-slate-500" />
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
        placeholder="Search memories, tags, or types..."
        className="w-full pl-9 pr-9 py-2 bg-black/30 border border-white/10 rounded-lg focus:border-blue-500/50 focus:ring-1 focus:ring-blue-500/50 outline-none transition-colors text-sm text-slate-100 placeholder-slate-500"
      />
      {localValue && (
        <button
          onClick={handleClear}
          aria-label="Clear search"
          className="absolute inset-y-0 right-0 px-3 flex items-center text-slate-500 hover:text-slate-300"
        >
          <X className="w-4 h-4" />
        </button>
      )}
      {!localValue && (
        <kbd className="absolute inset-y-0 right-0 hidden items-center pr-3 text-[10px] text-slate-500 sm:flex">
          {modifierLabel} K
        </kbd>
      )}
    </div>
  )
}
