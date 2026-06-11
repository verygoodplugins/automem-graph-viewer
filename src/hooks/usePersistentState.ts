import { useCallback, useState, type Dispatch, type SetStateAction } from 'react'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * useState with localStorage write-through, for settings that should survive a
 * reload (force/display/cluster configs, relationship visibility, tag filter
 * mode).
 *
 * For object-shaped values, hydration merges the stored value OVER the defaults
 * (`{...defaults, ...stored}`), so a config field added in a later release gets
 * its default instead of `undefined` poisoning downstream math. Scalars hydrate
 * as-is. Storage failures (private browsing, quota, corrupt JSON) degrade
 * silently to plain in-memory state.
 *
 * This is the same pattern lib/sounds.ts already uses for audio settings —
 * extracted so the rest of the tuned workspace survives a reload too.
 */
export function usePersistentState<T>(
  key: string,
  defaults: T,
): [T, Dispatch<SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      if (raw != null) {
        const parsed = JSON.parse(raw) as T
        if (isPlainObject(defaults) && isPlainObject(parsed)) {
          return { ...defaults, ...parsed }
        }
        return parsed
      }
    } catch {
      // Corrupt JSON or unavailable storage — fall back to defaults.
    }
    return defaults
  })

  const setAndPersist: Dispatch<SetStateAction<T>> = useCallback(
    (action) => {
      setValue((prev) => {
        const next =
          typeof action === 'function'
            ? (action as (prev: T) => T)(prev)
            : action
        try {
          localStorage.setItem(key, JSON.stringify(next))
        } catch {
          // Persistence is best-effort.
        }
        return next
      })
    },
    [key],
  )

  return [value, setAndPersist]
}
