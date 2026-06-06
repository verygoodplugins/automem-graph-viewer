import * as Slider from '@radix-ui/react-slider'

interface RangeSliderControlProps {
  label: string
  value: [number, number]
  min: number
  max: number
  step?: number
  onChange: (value: [number, number]) => void
  formatValue?: (value: number) => string
}

export function RangeSliderControl({
  label,
  value,
  min,
  max,
  step = 0.05,
  onChange,
  formatValue = (v) => v.toFixed(2),
}: RangeSliderControlProps) {
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs text-ink-3">{label}</label>
        <span className="text-xs text-ink-3 font-mono">
          {formatValue(value[0])} – {formatValue(value[1])}
        </span>
      </div>
      <Slider.Root
        className="relative flex items-center w-full h-5 select-none touch-none"
        value={value}
        min={min}
        max={max}
        step={step}
        onValueChange={(v) => onChange(v as [number, number])}
      >
        <Slider.Track className="relative h-1.5 w-full grow rounded-full bg-white/10">
          <Slider.Range className="absolute h-full rounded-full bg-white/40" />
        </Slider.Track>
        <Slider.Thumb
          className="block w-4 h-4 rounded-full bg-accent cursor-pointer transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Minimum importance"
        />
        <Slider.Thumb
          className="block w-4 h-4 rounded-full bg-accent cursor-pointer transition-transform hover:scale-110 focus:outline-none focus:ring-2 focus:ring-accent"
          aria-label="Maximum importance"
        />
      </Slider.Root>
    </div>
  )
}
