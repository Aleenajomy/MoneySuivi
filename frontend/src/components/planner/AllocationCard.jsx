import { Pencil, Trash2, Repeat } from 'lucide-react'
import { formatAmount } from '../../utils/planner'

const meterColor = (pct) => {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 80) return 'bg-amber-500'
  return 'bg-emerald-500'
}

export default function AllocationCard({ allocation, onEdit, onDelete, onToggleRecurring }) {
  const tracked = allocation.actualAmount !== null
  const pct = allocation.utilization ?? 0
  const over = tracked && allocation.remainingAmount < 0

  return (
    <article className="card p-3.5" data-testid="allocation-card" aria-label={allocation.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-sm dark:text-white text-slate-800 truncate">{allocation.name}</h4>
          {allocation.matchCategories.length > 0 && (
            <p className="text-[11px] dark:text-gray-500 text-slate-400 truncate mt-0.5">
              Tracks {allocation.matchCategories.map(c => (c === 'EMI' ? 'EMI payments' : c)).join(', ')}
            </p>
          )}
        </div>
        <p className="font-black text-sm tabular-nums dark:text-white text-slate-800 flex-shrink-0">{formatAmount(allocation.plannedAmount)}</p>
      </div>

      {tracked && allocation.plannedAmount > 0 && (
        <div className="mt-2.5">
          <div className="h-1.5 rounded-full dark:bg-dark-border bg-slate-100 overflow-hidden" role="meter"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(pct, 100)}
            aria-label={`${allocation.name}: ${pct}% used`}>
            <div className={`h-full rounded-full ${meterColor(pct)}`} style={{ width: `${Math.min(pct, 100)}%` }} />
          </div>
          <p className="flex justify-between text-[11px] mt-1 dark:text-gray-400 text-slate-500">
            <span>Spent {formatAmount(allocation.actualAmount)}</span>
            <span className={over ? 'text-red-500 font-semibold' : ''}>
              {over ? `${formatAmount(-allocation.remainingAmount)} over` : `${formatAmount(allocation.remainingAmount)} left`}
            </span>
          </p>
        </div>
      )}

      <div className="flex items-center justify-between gap-2 mt-3 pt-2.5 border-t dark:border-dark-border border-light-border">
        <label className="flex items-center gap-1.5 text-[11px] font-semibold dark:text-gray-300 text-slate-600 cursor-pointer">
          <input type="checkbox" role="switch" className="w-4 h-4 accent-sky-500" checked={allocation.recurring}
            onChange={e => onToggleRecurring(allocation, e.target.checked)}
            aria-label={`Repeat ${allocation.name} next month`} />
          <Repeat size={12} aria-hidden="true" /> Repeat
        </label>
        <div className="flex items-center gap-1.5">
          <button type="button" onClick={() => onEdit(allocation)} aria-label={`Edit ${allocation.name}`}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 active:scale-95 transition-all">
            <Pencil size={12} /> Edit
          </button>
          <button type="button" onClick={() => onDelete(allocation)} aria-label={`Delete ${allocation.name}`}
            className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 active:scale-95 transition-all">
            <Trash2 size={12} /> Delete
          </button>
        </div>
      </div>
    </article>
  )
}
