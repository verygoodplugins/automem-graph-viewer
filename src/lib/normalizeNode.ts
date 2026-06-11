import type { GraphNode, MemoryType } from '@/lib/types'

/**
 * Pure (non-React) node normalization. Lives here — not in useExpandableGraph —
 * so the API client can reuse it without pulling React hook code into the API
 * layer (keeps the api ↔ hooks boundary clean and the module reusable).
 *
 * Both the expand reducer and the /recall result mapper run nodes through the
 * SAME normalization path, so list rows and merged graph nodes share one source
 * of truth for shape: a NaN importance/confidence, an undefined radius, or a
 * type outside the union can't poison forceCollide, the seed math, or the
 * time-travel scan.
 */

const FALLBACK_COLOR = '#94A3B8'

const MEMORY_TYPES: readonly MemoryType[] = [
  'Decision',
  'Pattern',
  'Preference',
  'Style',
  'Habit',
  'Insight',
  'Context',
  'Memory',
]

function finiteOr(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback
}

/**
 * Coerce any string (e.g. the generic `"Memory"` label /recall returns, or an
 * unknown future type) to a known `MemoryType`, falling back to `'Memory'`. Keeps
 * out-of-union values from slipping through into the typed graph.
 */
export function coerceMemoryType(value: unknown): MemoryType {
  return typeof value === 'string' && (MEMORY_TYPES as readonly string[]).includes(value)
    ? (value as MemoryType)
    : 'Memory'
}

/**
 * Permissive input shape for `normalizeNode`: only `id` is required; every other
 * field is optional and `type` is widened to `string` so a raw /recall result (or
 * a neighbor projection) can be normalized without an unsafe cast. A full
 * `GraphNode` is assignable to this, so existing call sites pass through unchanged.
 */
export interface RawNode {
  id: string
  content?: string
  type?: string
  importance?: number
  confidence?: number
  tags?: string[]
  timestamp?: string
  updated_at?: string
  metadata?: Record<string, unknown>
  color?: string
  radius?: number
  opacity?: number
  x?: number
  y?: number
  z?: number
  vx?: number
  vy?: number
  vz?: number
}

/**
 * Coerce any merged node into the exact shape a snapshot node has, with safe
 * defaults for every field the simulation, inspector, or time-travel touch.
 * Idempotent on already-complete snapshot nodes.
 */
export function normalizeNode(node: RawNode, typeColors: Record<string, string>): GraphNode {
  const importance = finiteOr(node.importance, 0.5)
  const confidence = finiteOr(node.confidence, 0.8)
  const type = coerceMemoryType(node.type)
  return {
    ...node,
    content: node.content ?? '',
    type,
    importance,
    confidence,
    tags: node.tags ?? [],
    // Neighbors omit timestamp; '' → new Date('') is NaN, which useTimeTravel
    // already guards (isNaN check), so the node simply hides during active
    // time-travel until the backend backfills a real timestamp.
    timestamp: node.timestamp ?? '',
    // Type-keyed color WINS over a server-provided node color: `typeColors` is
    // the resolved canonical palette (client palette merged over server colors,
    // see lib/palette.ts), so every surface renders the same hue per type. The
    // raw node color is only a fallback for a type the palette doesn't know.
    color: typeColors[type] ?? node.color ?? FALLBACK_COLOR,
    // Backend formulas, used only when a field is missing/non-finite.
    radius: finiteOr(node.radius, 0.5 + importance * 1.5),
    opacity: finiteOr(node.opacity, 0.4 + confidence * 0.6),
  }
}
