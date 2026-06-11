import type { MemoryType } from './types'

/**
 * The canonical node/type palette — the single source of truth for what color a
 * memory type is, on every surface (3D scene, minimap, tag cloud, inspector,
 * settings, filter chips).
 *
 * History: four divergent type→color maps coexisted (GraphCanvas's
 * VIBRANT_TYPE_COLORS, MiniMap's TYPE_COLORS, TagCloud's DEFAULT_TYPE_COLORS,
 * tailwind.config.js) plus the server's `meta.type_colors` — the same memory
 * type rendered as a different hue per surface. This module canonicalizes on
 * the scene palette (tuned for the dark void background + bloom pass) and
 * {@link resolveTypeColors} makes it win over whatever the server sends, so
 * color stops lying.
 */
export const TYPE_COLORS: Record<MemoryType, string> = {
  Decision: '#f59e0b', // amber
  Pattern: '#10b981', // emerald
  Insight: '#8b5cf6', // violet
  Preference: '#ec4899', // pink
  Context: '#3b82f6', // blue
  Style: '#06b6d4', // cyan
  Habit: '#f97316', // orange
  Memory: '#6366f1', // indigo
}

/** Fallback for a type outside the known union (shouldn't survive coercion). */
export const FALLBACK_NODE_COLOR = '#94A3B8'

/**
 * Merge the server's `meta.type_colors` with the canonical client palette.
 * The client palette wins for the eight known types (it's tuned for this
 * renderer); unknown future types the server may add pass through untouched.
 * Applied once at the API chokepoint (fetchGraphSnapshot / fetchGraphStats),
 * so everything downstream that reads `meta.type_colors` agrees.
 */
export function resolveTypeColors(
  serverColors?: Record<string, string>,
): Record<string, string> {
  return { ...serverColors, ...TYPE_COLORS }
}

// --- Named interaction hues (formerly scattered hardcoded literals) ---

/** Pathfinding trace: source endpoint ("FROM"). */
export const TRACE_START = '#22c55e'
/** Pathfinding trace: target endpoint ("TO"). */
export const TRACE_END = '#ef4444'
/** Pathfinding trace: intermediate nodes and path edges. */
export const TRACE_PATH = '#00d4ff'
/** Hand-tracking pinch pre-select ring. */
export const PRE_SELECT = '#fbbf24'
