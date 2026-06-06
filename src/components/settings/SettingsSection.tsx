import { useState, ReactNode } from 'react'
import { ChevronDown } from 'lucide-react'

interface SettingsSectionProps {
  title: string
  defaultOpen?: boolean
  children: ReactNode
}

export function SettingsSection({ title, defaultOpen = true, children }: SettingsSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen)

  return (
    <div className="border-b border-white/5 last:border-b-0">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-white/5 transition-colors"
      >
        <span className="font-display text-sm font-medium text-ink-2">{title}</span>
        <ChevronDown
          className={`w-4 h-4 text-ink-3 transition-transform duration-200 ${
            isOpen ? 'rotate-0' : '-rotate-90'
          }`}
        />
      </button>
      {isOpen && (
        <div className="px-4 pb-4 space-y-3">
          {children}
        </div>
      )}
    </div>
  )
}
