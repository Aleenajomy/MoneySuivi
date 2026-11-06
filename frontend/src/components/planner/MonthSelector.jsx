import { ChevronLeft, ChevronRight } from 'lucide-react'
import { inputToPeriod, periodLabel, periodToInput, shiftPeriod } from '../../utils/planner'

const stepButton = 'w-9 h-9 rounded-xl border dark:border-dark-border border-slate-200 dark:bg-dark-card bg-white dark:text-gray-300 text-slate-600 flex items-center justify-center hover:text-sky-500 hover:border-sky-500/30 transition-all active:scale-95 disabled:opacity-40'

export default function MonthSelector({ period, onChange, disabled = false }) {
  const handleInput = (e) => {
    const next = inputToPeriod(e.target.value)
    if (next) onChange(next)
  }

  return (
    <div className="flex items-center gap-2" role="group" aria-label="Choose month">
      <button type="button" className={stepButton} onClick={() => onChange(shiftPeriod(period, -1))} disabled={disabled} aria-label="Previous month">
        <ChevronLeft size={16} />
      </button>
      <label className="relative flex-1 min-w-0">
        <span className="sr-only">Month and year</span>
        <input
          type="month"
          className="input text-sm font-bold text-center cursor-pointer"
          value={periodToInput(period)}
          min="2000-01"
          max="2100-12"
          onChange={handleInput}
          disabled={disabled}
          aria-label={`Selected month: ${periodLabel(period)}`}
          data-testid="planner-month"
        />
      </label>
      <button type="button" className={stepButton} onClick={() => onChange(shiftPeriod(period, 1))} disabled={disabled} aria-label="Next month">
        <ChevronRight size={16} />
      </button>
    </div>
  )
}
