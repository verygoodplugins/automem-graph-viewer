import type { GraphSnapshot, GraphNeighbors, GraphStats, GraphNode } from '../lib/types'
import { normalizeNode } from '../lib/normalizeNode'
import { resolveTypeColors } from '../lib/palette'

/**
 * Detect if running in embedded mode (served from /viewer/ on same origin).
 * In embedded mode, we use relative URLs and get token from URL hash.
 */
export function isEmbeddedMode(): boolean {
  return window.location.pathname.startsWith('/viewer')
}

/**
 * Get token from URL hash (e.g., /viewer/#token=xxx).
 * This keeps the token client-side only, never sent to server in URL.
 */
function getTokenFromHash(): string | null {
  const hash = window.location.hash
  if (!hash) return null
  const params = new URLSearchParams(hash.slice(1))
  return params.get('token')
}

function getApiBase(): string {
  // Allow override via URL param for local dev against remote backend
  const urlParams = new URLSearchParams(window.location.search)
  const serverOverride = urlParams.get('server')
  if (serverOverride) {
    return serverOverride
  }

  if (isEmbeddedMode()) {
    // In embedded mode, use relative URL (same origin)
    return ''
  }

  // Check localStorage for explicit server config
  const storedServer = localStorage.getItem('automem_server')
  if (storedServer) {
    return storedServer
  }

  // Default: use relative URLs so Vite proxy (dev) or same-origin (prod) handles routing
  return ''
}

function getTokenFromQuery(): string | null {
  const urlParams = new URLSearchParams(window.location.search)
  return urlParams.get('token')
}

function getToken(): string | null {
  // Priority: URL query param > URL hash > localStorage
  return getTokenFromQuery() || getTokenFromHash() || localStorage.getItem('automem_token')
}

function getAuthHeaders(): HeadersInit {
  const token = getToken()
  if (!token) {
    throw new Error('No API token configured')
  }
  return {
    'Content-Type': 'application/json',
    'X-API-Key': token,
  }
}

export function setServerConfig(serverUrl: string, token: string): void {
  localStorage.setItem('automem_server', serverUrl)
  localStorage.setItem('automem_token', token)
}

export function getServerConfig(): { serverUrl: string; token: string } | null {
  // Check URL params first (for local dev against remote backend)
  const urlParams = new URLSearchParams(window.location.search)
  const serverOverride = urlParams.get('server')
  const tokenOverride = urlParams.get('token')
  if (serverOverride && tokenOverride) {
    return { serverUrl: serverOverride, token: tokenOverride }
  }

  // In embedded mode, check for hash token
  if (isEmbeddedMode()) {
    const hashToken = getTokenFromHash()
    if (hashToken) {
      return { serverUrl: window.location.origin, token: hashToken }
    }
  }

  const serverUrl = localStorage.getItem('automem_server')
  const token = localStorage.getItem('automem_token')
  if (!serverUrl || !token) return null
  return { serverUrl, token }
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

/**
 * Classify an API error message as an auth rejection (bad/expired token).
 * Used to (a) skip pointless retries — a 401 won't fix itself — and (b) show
 * the "Access denied" card with a recovery path instead of the generic error.
 */
export function isAuthErrorMessage(message: string): boolean {
  return /\b(401|403)\b|unauthorized|forbidden|invalid\s+(api\s+)?(key|token)/i.test(message)
}

export interface ConnectionInfo {
  /** Resolved server origin the browser is actually talking to. */
  serverUrl: string
  /** The active token (whatever source won the priority chain), or null. */
  token: string | null
  /** Served from /viewer/ on the AutoMem API origin. */
  embedded: boolean
  /**
   * Token came from the URL (?token= or #token=) rather than localStorage —
   * i.e. a shared viewer link. Clearing stored credentials alone won't sign
   * such a session out; the URL has to be stripped too.
   */
  tokenFromUrl: boolean
}

/** What the session is connected to and how — for the Settings "Connection" section. */
export function getConnectionInfo(): ConnectionInfo {
  return {
    serverUrl: getApiBase() || window.location.origin,
    token: getToken(),
    embedded: isEmbeddedMode(),
    tokenFromUrl: !!(getTokenFromQuery() || getTokenFromHash()),
  }
}

async function handleResponse<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const text = await response.text()
    let message = `API error: ${response.status}`
    try {
      const json = JSON.parse(text)
      message = json.description || json.error || message
    } catch {
      message = text || message
    }
    throw new Error(message)
  }
  return response.json()
}

export interface SnapshotParams {
  limit?: number
  minImportance?: number
  types?: string[]
  since?: string
}

/**
 * Default snapshot row ceiling. Historically this mirrored the server's
 * `min(limit, 2000)` hard cap; that server cap was lifted in automem PR #141,
 * so 2,000 now stands for the *client-side* limit — the main-thread physics
 * wall (d3-force-3d + R3F on the UI thread). It also keeps the client from ever
 * emitting `limit=0` (which the server runs as Cypher `LIMIT 0` → zero rows —
 * the "Select All loads nothing" bug). Override via {@link getSnapshotCap}.
 */
export const MAX_SNAPSHOT = 2000

/**
 * Hidden escape hatch for testing larger graphs on powerful hardware now that
 * the server cap is gone (PR #141). Set `?cap=10000` in the URL (highest
 * priority) or `localStorage.automem_snapshot_cap = '10000'`. Anything missing,
 * non-numeric, or ≤ 0 falls back to {@link MAX_SNAPSHOT}. There is intentionally
 * no UI for this — past ~2k nodes the on-main-thread sim can stutter, so it's a
 * deliberate opt-in, not a default knob.
 */
export function getSnapshotCap(): number {
  try {
    const fromUrl = new URLSearchParams(window.location.search).get('cap')
    const fromStorage = window.localStorage.getItem('automem_snapshot_cap')
    const raw = fromUrl ?? fromStorage
    // Floor BEFORE the positivity check: a sub-unit cap like `0.5` would pass
    // `n > 0` yet floor to 0, seeding limit=0 (the empty-snapshot bug). Require
    // the floored value to be >= 1.
    const n = raw == null ? NaN : Math.floor(Number(raw))
    return Number.isFinite(n) && n >= 1 ? n : MAX_SNAPSHOT
  } catch {
    return MAX_SNAPSHOT
  }
}

export async function fetchGraphSnapshot(params: SnapshotParams = {}): Promise<GraphSnapshot> {
  const searchParams = new URLSearchParams()

  // Treat 0 / missing / NaN as "use the cap," never the floor. A falsy or
  // non-positive limit means "as much as allowed," not "nothing." The ceiling
  // is the hidden override when present, else MAX_SNAPSHOT.
  const cap = getSnapshotCap()
  const requested = params.limit && params.limit > 0 ? params.limit : cap
  searchParams.set('limit', String(Math.min(requested, cap)))
  if (params.minImportance != null) searchParams.set('min_importance', String(params.minImportance))
  if (params.types?.length) searchParams.set('types', params.types.join(','))
  if (params.since) searchParams.set('since', params.since)

  const url = `${getApiBase()}/graph/snapshot?${searchParams}`
  const response = await fetch(url, { headers: getAuthHeaders() })
  const snapshot = await handleResponse<GraphSnapshot>(response)

  // Canonicalize colors at the chokepoint: everything downstream (the expand
  // reducer's normalizeNode, tag chips, settings swatches, cluster detection)
  // reads `meta.type_colors`, so resolving here makes every surface agree.
  // Nodes are recolored too so even the brief pre-reset render (App's raw
  // snapshot fallback) shows canonical hues.
  const type_colors = resolveTypeColors(snapshot.meta?.type_colors)
  return {
    ...snapshot,
    nodes: snapshot.nodes.map((n) => ({
      ...n,
      color: type_colors[n.type] ?? n.color,
    })),
    meta: { ...snapshot.meta, type_colors },
  }
}

export interface NeighborsParams {
  depth?: number
  includeSemantic?: boolean
  semanticLimit?: number
}

export async function fetchGraphNeighbors(
  memoryId: string,
  params: NeighborsParams = {}
): Promise<GraphNeighbors> {
  const searchParams = new URLSearchParams()

  if (params.depth) searchParams.set('depth', String(params.depth))
  if (params.includeSemantic !== undefined) {
    searchParams.set('include_semantic', String(params.includeSemantic))
  }
  if (params.semanticLimit) searchParams.set('semantic_limit', String(params.semanticLimit))

  const url = `${getApiBase()}/graph/neighbors/${memoryId}?${searchParams}`
  const response = await fetch(url, { headers: getAuthHeaders() })
  return handleResponse<GraphNeighbors>(response)
}

export async function fetchGraphStats(): Promise<GraphStats> {
  const response = await fetch(`${getApiBase()}/graph/stats`, { headers: getAuthHeaders() })
  const stats = await handleResponse<GraphStats>(response)
  return {
    ...stats,
    meta: { ...stats.meta, type_colors: resolveTypeColors(stats.meta?.type_colors) },
  }
}

/**
 * The backend hard-caps /recall at RECALL_MAX_LIMIT (100). Mirror it so we never
 * request more than the server returns; `count >= MAX_RECALL` means "capped —
 * there may be more; refine the query" (rendered as "100+").
 */
export const MAX_RECALL = 100

/** One memory in a /recall response: id at top level, the record nested under `memory`. */
export interface RecallResult {
  id: string
  memory?: {
    content?: string
    type?: string
    importance?: number
    confidence?: number
    tags?: string[]
    timestamp?: string
    updated_at?: string
    metadata?: Record<string, unknown>
    last_accessed?: string
    relevance_score?: number
    tag_prefixes?: string[]
  }
}

export interface RecallResponse {
  /** Number of results returned (== results.length, capped at the requested limit). */
  count: number
  results: RecallResult[]
  query?: string
}

/**
 * Whole-store semantic search. Unlike the client-side filter over the loaded
 * snapshot, this reaches every memory in the store. Debounce the query upstream
 * (the SearchBar already debounces 300ms).
 */
export async function fetchRecall(query: string, limit: number = MAX_RECALL): Promise<RecallResponse> {
  const searchParams = new URLSearchParams()
  searchParams.set('query', query)
  searchParams.set('limit', String(Math.min(Math.max(1, limit), MAX_RECALL)))

  const url = `${getApiBase()}/recall?${searchParams}`
  const response = await fetch(url, { headers: getAuthHeaders() })
  return handleResponse<RecallResponse>(response)
}

/**
 * Map a /recall result into a GraphNode, run through the same `normalizeNode` the
 * expand reducer uses so list rows have a color and a later merge stays
 * consistent. `result.memory.type` is the generic "Memory" today, so the node
 * shows the fallback color until it's expanded into the graph and gets real edges.
 */
export function mapRecallResultToNode(
  result: RecallResult,
  typeColors: Record<string, string> = {},
): GraphNode {
  const m = result.memory ?? {}
  // color/radius/opacity intentionally absent — normalizeNode fills them (and
  // coerces a non-finite importance/confidence, and a non-union type, to safe
  // defaults). The object satisfies `RawNode` (only `id` required), so no cast.
  return normalizeNode(
    {
      id: result.id,
      content: m.content ?? '',
      type: m.type ?? 'Memory',
      importance: m.importance,
      confidence: m.confidence,
      tags: m.tags ?? [],
      timestamp: m.timestamp ?? '',
      updated_at: m.updated_at,
      metadata: m.metadata,
    },
    typeColors,
  )
}

export async function updateMemory(
  memoryId: string,
  updates: { importance?: number; tags?: string[]; content?: string }
): Promise<void> {
  const response = await fetch(`${getApiBase()}/memory/${memoryId}`, {
    method: 'PATCH',
    headers: getAuthHeaders(),
    body: JSON.stringify(updates),
  })
  await handleResponse(response)
}

export async function deleteMemory(memoryId: string): Promise<void> {
  const response = await fetch(`${getApiBase()}/memory/${memoryId}`, {
    method: 'DELETE',
    headers: getAuthHeaders(),
  })
  await handleResponse(response)
}

export async function checkHealth(serverUrl?: string): Promise<{ status: string }> {
  const base = serverUrl || getApiBase()
  const response = await fetch(`${base}/health`)
  return handleResponse(response)
}
