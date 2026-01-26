import { useRegion, type Language } from '../contexts/region-context'
import { cn } from '../lib/utils'

const options: Array<{ label: string; value: Language; short: string; flag: string }> = [
  { label: 'English', value: 'english', short: 'EN', flag: '🇺🇸' },
  { label: 'Japanese', value: 'japanese', short: 'JP', flag: '🇯🇵' }
]

export function RegionToggle(): JSX.Element {
  const { language, setLanguage } = useRegion()

  return (
    <div className="flex items-center rounded-full border-2 border-slate-900 bg-white p-1 text-xs font-semibold uppercase tracking-wide shadow-[3px_3px_0px_#0f172a]">
      {options.map((option) => {
        const isActive = option.value === language
        return (
          <button
            key={option.value}
            type="button"
            onClick={() => setLanguage(option.value)}
            className={cn(
              'flex items-center gap-1 rounded-full px-3 py-1 transition',
              isActive
                ? 'bg-slate-900 text-white'
                : 'text-slate-700 hover:bg-slate-100 hover:text-slate-900'
            )}
            aria-pressed={isActive}
          >
            <span aria-hidden="true">{option.flag}</span>
            <span className="hidden sm:inline">{option.label}</span>
            <span className="sm:hidden">{option.short}</span>
          </button>
        )
      })}
    </div>
  )
}
