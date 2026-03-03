import { useEffect } from 'react'
import { Keyboard, X } from 'lucide-react'

interface ShortcutItem {
  key: string
  description: string
}

interface KeyboardShortcutsHelpProps {
  open: boolean
  onClose: () => void
  shortcuts: ShortcutItem[]
  modifierLabel: string
}

export function KeyboardShortcutsHelp({
  open,
  onClose,
  shortcuts,
  modifierLabel,
}: KeyboardShortcutsHelpProps) {
  useEffect(() => {
    if (!open) return

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="keyboard-shortcuts-title"
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) {
          onClose()
        }
      }}
    >
      <div className="w-full max-w-2xl overflow-hidden rounded-xl border border-white/10 bg-[#10121a] shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
          <div className="flex items-center gap-2 text-slate-200">
            <Keyboard className="h-4 w-4 text-blue-400" />
            <h2 id="keyboard-shortcuts-title" className="text-sm font-semibold">Keyboard Shortcuts</h2>
          </div>
          <button
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-white/10 hover:text-white"
            aria-label="Close keyboard shortcuts"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="max-h-[70vh] overflow-y-auto p-4">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shortcuts.map((shortcut) => (
              <div
                key={shortcut.key}
                className="flex items-center justify-between rounded-lg border border-white/5 bg-white/[0.03] px-3 py-2"
              >
                <span className="text-sm text-slate-300">{shortcut.description}</span>
                <kbd className="rounded border border-white/15 bg-black/30 px-2 py-0.5 font-mono text-xs text-slate-200">
                  {shortcut.key.replace(/Cmd/g, modifierLabel)}
                </kbd>
              </div>
            ))}
          </div>

          <div className="mt-4 rounded-lg border border-white/5 bg-white/[0.02] p-3 text-xs text-slate-400">
            Additional controls: hold <kbd className="font-mono text-slate-300">Shift</kbd> and drag to lasso,
            press <kbd className="font-mono text-slate-300">T</kbd> for tag cloud.
          </div>
        </div>
      </div>
    </div>
  )
}
