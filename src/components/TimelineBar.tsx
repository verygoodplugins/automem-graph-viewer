/**
 * TimelineBar - Time travel UI component
 *
 * Shows a timeline scrubber at the bottom of the screen with:
 * - Draggable playhead
 * - Playback controls (play/pause, speed)
 * - Date display
 * - Memory count
 */

import { useRef, useCallback, useState, useEffect } from 'react'

interface TimelineBarProps {
  isActive: boolean
  isPlaying: boolean
  currentTime: number
  minTime: number
  maxTime: number
  progress: number
  playbackSpeed: number
  visibleCount: number
  totalCount: number
  onToggleActive: () => void
  onTogglePlay: () => void
  onSetProgress: (progress: number) => void
  onStepForward: () => void
  onStepBackward: () => void
  onCycleSpeed: () => void
  onGoToStart: () => void
  onGoToEnd: () => void
  visible?: boolean
}

export function TimelineBar({
  isActive,
  isPlaying,
  currentTime,
  minTime,
  maxTime,
  progress,
  playbackSpeed,
  visibleCount,
  totalCount,
  onToggleActive,
  onTogglePlay,
  onSetProgress,
  onStepForward,
  onStepBackward,
  onCycleSpeed,
  onGoToStart,
  onGoToEnd,
  visible = true,
}: TimelineBarProps) {
  const trackRef = useRef<HTMLDivElement>(null)
  const [isDragging, setIsDragging] = useState(false)

  // Format date for display
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp)
    return date.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    })
  }

  // Handle drag on timeline
  const handlePointerDown = useCallback(
    (e: React.PointerEvent) => {
      if (!isActive) return

      const track = trackRef.current
      if (!track) return

      setIsDragging(true)
      e.currentTarget.setPointerCapture(e.pointerId)

      const rect = track.getBoundingClientRect()
      const x = e.clientX - rect.left
      const newProgress = Math.max(0, Math.min(1, x / rect.width))
      onSetProgress(newProgress)
    },
    [isActive, onSetProgress]
  )

  const handlePointerMove = useCallback(
    (e: React.PointerEvent) => {
      if (!isDragging || !isActive) return

      const track = trackRef.current
      if (!track) return

      const rect = track.getBoundingClientRect()
      const x = e.clientX - rect.left
      const newProgress = Math.max(0, Math.min(1, x / rect.width))
      onSetProgress(newProgress)
    },
    [isDragging, isActive, onSetProgress]
  )

  const handlePointerUp = useCallback(() => {
    setIsDragging(false)
  }, [])

  // Keyboard shortcuts when active
  useEffect(() => {
    if (!isActive) return

    const handleKeyDown = (e: KeyboardEvent) => {
      // Ignore if focus is in an input
      if (
        e.target instanceof HTMLInputElement ||
        e.target instanceof HTMLTextAreaElement
      ) {
        return
      }

      switch (e.key) {
        case ' ':
          e.preventDefault()
          onTogglePlay()
          break
        case 'ArrowLeft':
          if (e.shiftKey) {
            onGoToStart()
          } else {
            onStepBackward()
          }
          break
        case 'ArrowRight':
          if (e.shiftKey) {
            onGoToEnd()
          } else {
            onStepForward()
          }
          break
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [isActive, onTogglePlay, onStepForward, onStepBackward, onGoToStart, onGoToEnd])

  if (!visible) return null

  // Collapsed state when not active
  if (!isActive) {
    return (
      <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-40">
        <button
          onClick={onToggleActive}
          className="flex items-center gap-2 px-4 py-2 bg-surface-1 backdrop-blur-sm border border-hairline rounded-full shadow-elev-1 hover:bg-surface-2 transition-colors"
        >
          <svg className="w-5 h-5 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <span className="text-sm text-ink-2">Time Travel</span>
        </button>
      </div>
    )
  }

  return (
    <div className="absolute bottom-0 left-0 right-0 z-40 p-4 pb-6 pointer-events-none">
      <div className="max-w-4xl mx-auto pointer-events-auto">
        {/* Main timeline bar */}
        <div className="bg-surface-1 backdrop-blur-sm border border-hairline rounded-lg shadow-elev-2 overflow-hidden">
          {/* Date and count display */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-hairline">
            <div className="flex items-center gap-3">
              <button
                onClick={onToggleActive}
                className="p-1.5 rounded-lg hover:bg-white/5 text-ink-3 hover:text-ink transition-colors"
                title="Exit time travel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-accent" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span className="text-xs text-ink-3 uppercase tracking-wider">Time Travel</span>
              </div>
            </div>

            {/* Current date - large and prominent */}
            <div className="flex items-center gap-4">
              <span className="font-display text-2xl font-semibold text-ink tracking-tight">
                {formatDate(currentTime)}
              </span>
            </div>

            {/* Memory count */}
            <div className="flex items-center gap-2">
              <span className="font-mono text-lg font-semibold text-ink">{visibleCount}</span>
              <span className="text-sm text-ink-3">/ {totalCount} memories</span>
            </div>
          </div>

          {/* Timeline track */}
          <div className="px-4 py-3">
            <div
              ref={trackRef}
              className="relative h-3 bg-white/10 rounded-full cursor-pointer"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
            >
              {/* Progress fill */}
              <div
                className="absolute inset-y-0 left-0 bg-accent rounded-full"
                style={{ width: `${progress * 100}%` }}
              />

              {/* Playhead */}
              <div
                className={`absolute top-1/2 -translate-y-1/2 w-5 h-5 bg-white rounded-full shadow-lg border border-void/40 transition-transform ${
                  isDragging ? 'scale-125' : 'hover:scale-110'
                }`}
                style={{ left: `calc(${progress * 100}% - 10px)` }}
              />

              {/* Start/End labels */}
              <div className="absolute -bottom-5 left-0 text-xs font-mono text-ink-4">
                {formatDate(minTime)}
              </div>
              <div className="absolute -bottom-5 right-0 text-xs font-mono text-ink-4">
                {formatDate(maxTime)}
              </div>
            </div>
          </div>

          {/* Playback controls */}
          <div className="flex items-center justify-center gap-2 px-4 py-2 pt-4 border-t border-hairline">
            {/* Go to start */}
            <button
              onClick={onGoToStart}
              className="p-2 rounded-lg hover:bg-white/5 text-ink-3 hover:text-ink transition-colors"
              title="Go to start (Shift+Left)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Step backward */}
            <button
              onClick={onStepBackward}
              className="p-2 rounded-lg hover:bg-white/5 text-ink-3 hover:text-ink transition-colors"
              title="Step backward (Left arrow)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Play/Pause */}
            <button
              onClick={onTogglePlay}
              className={`p-3 rounded-full transition-all ${
                isPlaying
                  ? 'bg-accent text-void shadow-elev-focus'
                  : 'bg-surface-2 hover:bg-surface-3 text-ink'
              }`}
              title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
            >
              {isPlaying ? (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              ) : (
                <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              )}
            </button>

            {/* Step forward */}
            <button
              onClick={onStepForward}
              className="p-2 rounded-lg hover:bg-white/5 text-ink-3 hover:text-ink transition-colors"
              title="Step forward (Right arrow)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Go to end */}
            <button
              onClick={onGoToEnd}
              className="p-2 rounded-lg hover:bg-white/5 text-ink-3 hover:text-ink transition-colors"
              title="Go to end (Shift+Right)"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
              </svg>
            </button>

            {/* Speed control */}
            <div className="ml-4 border-l border-hairline pl-4">
              <button
                onClick={onCycleSpeed}
                className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-sm font-mono font-medium text-ink transition-colors"
                title="Cycle playback speed"
              >
                {playbackSpeed}x
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
