/**
 * RelationshipBadge - Color-coded edge type badge with strength/direction indicators
 *
 * Uses EDGE_STYLES for colors and categories. Shows direction arrow,
 * strength bar, and is clickable to toggle relationship visibility.
 */

import type { RelationType } from '@/lib/types'
import { EDGE_STYLES, type EdgeStyle } from '@/lib/edgeStyles'

export type Direction = 'outgoing' | 'incoming' | 'bidirectional'

interface RelationshipBadgeProps {
  type: RelationType
  direction: Direction
  strength: number // 0-1
  onClick?: (type: RelationType) => void
  isVisible?: boolean
}

const DIRECTION_ARROWS: Record<Direction, string> = {
  outgoing: '→',
  incoming: '←',
  bidirectional: '↔',
}

export function RelationshipBadge({
  type,
  direction,
  strength,
  onClick,
  isVisible = true,
}: RelationshipBadgeProps) {
  const style: EdgeStyle = EDGE_STYLES[type] ?? EDGE_STYLES.RELATES_TO

  const content = (
    <>
      {/* Color dot */}
      <span
        className="w-2 h-2 rounded-full flex-shrink-0"
        style={{ backgroundColor: style.color }}
      />

      {/* Direction arrow */}
      <span className="text-slate-500 text-[10px]">
        {DIRECTION_ARROWS[direction]}
      </span>

      {/* Label */}
      <span className={isVisible ? 'text-slate-300' : 'text-slate-500 line-through'}>
        {style.label}
      </span>

      {/* Strength bar */}
      <span className="relative w-6 h-1.5 bg-white/10 rounded-full overflow-hidden flex-shrink-0">
        <span
          className="absolute inset-y-0 left-0 rounded-full"
          style={{
            width: `${strength * 100}%`,
            backgroundColor: style.color,
          }}
        />
      </span>
    </>
  )

  const sharedClassName = `
    inline-flex items-center gap-1.5 px-2 py-1 rounded text-xs transition-all
    ${isVisible ? 'opacity-100' : 'opacity-40'}
  `

  if (onClick) {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation() // Don't trigger parent neighbor button
          onClick(type)
        }}
        className={`${sharedClassName} cursor-pointer hover:bg-white/10`}
        title={`${style.label} (${(strength * 100).toFixed(0)}% strength) — click to toggle`}
      >
        {content}
      </button>
    )
  }

  return (
    <span
      className={`${sharedClassName} cursor-default`}
      title={`${style.label} (${(strength * 100).toFixed(0)}% strength)`}
    >
      {content}
    </span>
  )
}
