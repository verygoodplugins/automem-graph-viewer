/**
 * Search-result presentation helpers: windowed snippets with match highlights,
 * matched-tag detection for non-content hits, and compact relative dates.
 *
 * Pure (non-React) so list rows and any future preview surface share one
 * source of truth for "what part of this memory matched".
 */

export interface SnippetPart {
  text: string
  highlight: boolean
}

export interface Snippet {
  parts: SnippetPart[]
  /** True when the literal term occurs in the content (vs a semantic-only hit). */
  matchedContent: boolean
}

/** Total characters of content shown per row (window around the first match). */
const SNIPPET_WINDOW = 110

/**
 * Build a snippet windowed around the FIRST occurrence of `lowerTerm` in
 * `content`, with every occurrence inside the window marked for highlighting.
 * Falls back to the leading characters when the term doesn't occur literally
 * (semantic match) — the caller can then point at a matched tag instead.
 */
export function buildSnippet(content: string, lowerTerm: string): Snippet {
  const trimmed = content.trim()
  if (!lowerTerm) {
    return { parts: [clip(trimmed, 0, SNIPPET_WINDOW, false)], matchedContent: false }
  }

  const lowerContent = trimmed.toLowerCase()
  const first = lowerContent.indexOf(lowerTerm)
  if (first === -1) {
    return { parts: [clip(trimmed, 0, SNIPPET_WINDOW, false)], matchedContent: false }
  }

  // Center the window on the first match; clamp to the content bounds.
  const half = Math.floor((SNIPPET_WINDOW - lowerTerm.length) / 2)
  let start = Math.max(0, first - half)
  const end = Math.min(trimmed.length, start + SNIPPET_WINDOW)
  start = Math.max(0, end - SNIPPET_WINDOW)

  // Snap the leading edge to a word boundary so rows don't open mid-word.
  if (start > 0) {
    const space = trimmed.indexOf(' ', start)
    if (space !== -1 && space < first) start = space + 1
  }

  const parts: SnippetPart[] = []
  if (start > 0) parts.push({ text: '…', highlight: false })

  let cursor = start
  while (cursor < end) {
    const hit = lowerContent.indexOf(lowerTerm, cursor)
    if (hit === -1 || hit >= end) {
      parts.push({ text: trimmed.slice(cursor, end), highlight: false })
      break
    }
    if (hit > cursor) parts.push({ text: trimmed.slice(cursor, hit), highlight: false })
    parts.push({ text: trimmed.slice(hit, hit + lowerTerm.length), highlight: true })
    cursor = hit + lowerTerm.length
  }

  if (end < trimmed.length) parts.push({ text: '…', highlight: false })
  return { parts, matchedContent: true }
}

function clip(text: string, start: number, length: number, highlight: boolean): SnippetPart {
  const slice = text.slice(start, start + length)
  return { text: slice + (text.length > start + length ? '…' : ''), highlight }
}

/** First tag containing the term, for the "matched: tag" chip on non-content hits. */
export function findMatchedTag(tags: string[], lowerTerm: string): string | null {
  if (!lowerTerm) return null
  return tags.find((t) => t.toLowerCase().includes(lowerTerm)) ?? null
}

/**
 * Compact relative date for result rows: "just now", "5m", "3h", "4d", "2mo",
 * "1y". Empty string for missing/invalid timestamps (neighbor projections may
 * omit them).
 */
export function relativeDate(timestamp: string): string {
  if (!timestamp) return ''
  const then = new Date(timestamp).getTime()
  if (isNaN(then)) return ''
  const seconds = Math.max(0, (Date.now() - then) / 1000)
  if (seconds < 60) return 'just now'
  const minutes = seconds / 60
  if (minutes < 60) return `${Math.floor(minutes)}m`
  const hours = minutes / 60
  if (hours < 24) return `${Math.floor(hours)}h`
  const days = hours / 24
  if (days < 60) return `${Math.floor(days)}d`
  const months = days / 30.44
  if (months < 12) return `${Math.floor(months)}mo`
  return `${Math.floor(days / 365.25)}y`
}
