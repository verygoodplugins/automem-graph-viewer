import type { HandLockState } from '../hooks/useHandLockAndGrab'

interface HandControlOverlayProps {
  enabled: boolean
  lock: HandLockState
  source: 'mediapipe' | 'iphone'
  onSourceChange?: (source: 'mediapipe' | 'iphone') => void
  onResetView?: () => void
  iphoneConnected?: boolean
  hasLiDAR?: boolean
  iphoneUrl?: string
  phoneConnected?: boolean
  bridgeIps?: string[]
  phonePort?: number | null
}

export function HandControlOverlay({
  enabled,
  lock,
  source,
  onSourceChange,
  onResetView,
  iphoneConnected = false,
  hasLiDAR = false,
  iphoneUrl,
  phoneConnected = false,
  bridgeIps = [],
  phonePort = null,
}: HandControlOverlayProps) {
  if (!enabled) return null

  const badge =
    lock.mode === 'locked'
      ? lock.grabbed
        ? { text: 'GRABBED', color: 'bg-emerald-500/20 text-emerald-200 border-emerald-400/30' }
        : { text: 'LOCKED', color: 'bg-cyan-500/20 text-cyan-200 border-cyan-400/30' }
      : lock.mode === 'candidate'
        ? { text: `ACQUIRING (${lock.frames})`, color: 'bg-yellow-500/20 text-yellow-200 border-yellow-400/30' }
        : { text: 'IDLE', color: 'bg-white/10 text-ink-2 border-white/15' }

  const m = lock.mode === 'idle' ? lock.metrics : lock.metrics

  return (
    <div className="absolute left-4 bottom-4 z-50 pointer-events-auto">
      <div className="glass border border-white/10 rounded-xl px-4 py-3 text-xs text-ink-2 space-y-2 w-[280px]">
        <div className="flex items-center justify-between">
          <span className="text-ink-3">Hand Control</span>
          <div className="flex items-center gap-2">
            {onResetView && (
              <button
                onClick={onResetView}
                className="px-2 py-1 rounded-md text-[10px] bg-white/5 text-ink-2 hover:bg-white/10 hover:text-ink transition-all border border-hairline"
                title="Reset view to center"
              >
                Reset View
              </button>
            )}
            <span className={`px-2 py-1 rounded-md border ${badge.color}`}>{badge.text}</span>
          </div>
        </div>

        {/* Source Toggle */}
        <div className="flex items-center justify-between">
          <span className="text-ink-3">Source</span>
          <div className="flex items-center gap-1 bg-black/20 rounded-lg p-0.5">
            <button
              onClick={() => onSourceChange?.('mediapipe')}
              className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                source === 'mediapipe'
                  ? 'bg-accent text-void'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              Webcam
            </button>
            <button
              onClick={() => onSourceChange?.('iphone')}
              className={`px-2 py-1 rounded-md text-[10px] transition-all ${
                source === 'iphone'
                  ? 'bg-accent text-void'
                  : 'text-ink-3 hover:text-ink-2'
              }`}
            >
              iPhone
            </button>
          </div>
        </div>

        {source === 'iphone' && (
          <>
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Browser → Bridge</span>
              <span className={iphoneConnected ? 'text-ok' : 'text-danger'}>
                {iphoneConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-3">Phone → Bridge</span>
              <span className={phoneConnected ? 'text-ok' : 'text-danger'}>
                {phoneConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-ink-3">LiDAR</span>
              <span className={hasLiDAR ? 'text-ok' : 'text-ink-3'}>
                {hasLiDAR ? '✓ depth frames' : '✗ no depth'}
              </span>
            </div>
            {iphoneUrl && (
              <div className="text-[10px] text-ink-3 truncate">
                ws: <span className="text-ink-2">{iphoneUrl}</span>
              </div>
            )}
            {!phoneConnected && bridgeIps.length > 0 && phonePort && (
              <div className="text-[10px] text-ink-3">
                iPhone app URL:{' '}
                <span className="text-ink-2">
                  ws://{bridgeIps[0]}:{phonePort}
                </span>
              </div>
            )}
          </>
        )}

        {m && (
          <div className="grid grid-cols-2 gap-x-3 gap-y-1">
            <div className="flex justify-between">
              <span className="text-ink-3">spread</span>
              <span>{m.spread.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">palm</span>
              <span>{m.palmFacing.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">point</span>
              <span>{m.point.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">pinch</span>
              <span>{m.pinch.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">grab</span>
              <span>{m.grab.toFixed(2)}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-ink-3">depth</span>
              <span>{m.depth.toFixed(3)}</span>
            </div>
          </div>
        )}

        <div className="pt-1 text-[11px] text-ink-3 leading-snug">
          <div>
            <span className="text-ink-2">Acquire:</span> raise open palm + spread fingers
          </div>
          <div>
            <span className="text-ink-2">Navigate:</span> pinch with both hands to pan/zoom/rotate the world
          </div>
          <div>
            <span className="text-ink-2">Select:</span> point (index out) + pinch thumb/index to click
          </div>
        </div>
      </div>
    </div>
  )
}

export default HandControlOverlay
