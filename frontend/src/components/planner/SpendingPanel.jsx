import { useMemo, useState } from 'react'
import { ReceiptText } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import EmptyState from '../common/EmptyState'
import { formatDate } from '../../utils/constants'
import { formatAmount } from '../../utils/planner'

const MATCH_BADGE = {
  ASSIGNED: { label: 'Moved by you', className: 'bg-violet-500/10 text-violet-600 dark:text-violet-400' },
  NAME: { label: 'Auto · name', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  CATEGORY: { label: 'Auto · category', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  UNPLANNED: { label: 'Unplanned', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
}

const AUTO = ''

function SpendingRow({ item, lines, lineName, onAssign, busy }) {
  const badge = MATCH_BADGE[item.matchedBy]
  const value = item.matchedBy === 'ASSIGNED' ? item.allocationId : AUTO
  const autoLabel = item.matchedBy === 'ASSIGNED' ? 'Automatic' : `Automatic (${item.allocationId ? lineName(item.allocationId) : 'unplanned'})`

  return (
    <li className="card p-3.5" data-testid="spending-item" aria-label={item.title}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{item.title}</p>
          <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
            {formatDate(item.date)} · {item.source === 'EMI' ? 'EMI payment' : item.category}
            {item.paymentMethod ? ` · ${item.paymentMethod}` : ''}
          </p>
        </div>
        <p className="font-bold text-sm tabular-nums text-danger flex-shrink-0">-{formatAmount(item.amount)}</p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 mt-2.5 pt-2.5 border-t dark:border-dark-border border-light-border">
        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${item.source === 'EMI' ? 'bg-slate-500/10 dark:text-gray-300 text-slate-600' : badge.className}`}>
          {item.source === 'EMI' ? 'From EMI tracker' : badge.label}
        </span>
        {item.reassignable && lines.length > 0 ? (
          <label className="flex items-center gap-1.5 text-[11px] dark:text-gray-400 text-slate-500 min-w-0">
            <span className="flex-shrink-0">Counts toward</span>
            <select
              className="input !py-1 !px-2 text-xs w-auto max-w-[11rem] cursor-pointer"
              value={value}
              disabled={busy}
              onChange={e => onAssign(item, e.target.value || null)}
              aria-label={`Budget line for ${item.title}`}
            >
              <option value={AUTO}>{autoLabel}</option>
              {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
        ) : (
          <span className="text-[11px] dark:text-gray-400 text-slate-500 truncate">
            {item.allocationId ? lineName(item.allocationId) : 'Not in the plan'}
          </span>
        )}
      </div>
    </li>
  )
}

export default function SpendingPanel({ focusLine, onFocusLine }) {
  const { month, assignTransaction } = usePlanner()
  const [busyId, setBusyId] = useState(null)
  const allocations = month.plan?.allocations || []
  // Only fixed and variable lines take spending; savings and investments are tracked separately.
  const lines = allocations.filter(a => a.group === 'FIXED' || a.group === 'VARIABLE')
  const lineName = (id) => allocations.find(a => a.id === id)?.name || 'a deleted line'

  const filter = focusLine || 'ALL'
  const items = useMemo(() => month.spending.filter((s) => {
    if (filter === 'ALL') return true
    if (filter === 'UNPLANNED') return !s.allocationId
    return s.allocationId === filter
  }), [month.spending, filter])

  const total = items.reduce((sum, s) => sum + Math.round(s.amount * 100), 0) / 100

  const assign = async (item, allocationId) => {
    setBusyId(item.id)
    try {
      await assignTransaction(item.id, allocationId)
    } catch {
      // The context showed the reason; the list still reflects the server state.
    } finally {
      setBusyId(null)
    }
  }

  if (month.spending.length === 0) {
    return (
      <EmptyState icon={ReceiptText} title="No spending recorded this month"
        description="Expenses you add in History, and EMI payments, appear here and are matched to your budget lines automatically." />
    )
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3">
        <p className="text-xs dark:text-gray-400 text-slate-500">
          Spending comes from your History and EMI payments; nothing is added here. Each item counts toward one line:
          the line named in its title, else the first line tracking its category. If that's wrong, choose another line.
          The transaction itself isn't changed.
        </p>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-xs dark:text-gray-300 text-slate-600">
            <span>Show</span>
            <select className="input !py-1.5 text-xs w-auto cursor-pointer" value={filter} onChange={e => onFocusLine(e.target.value === 'ALL' ? null : e.target.value)} aria-label="Filter spending by line">
              <option value="ALL">All spending</option>
              <option value="UNPLANNED">Unplanned only</option>
              {lines.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
            </select>
          </label>
          <p className="text-xs dark:text-gray-400 text-slate-500" data-testid="spending-total">
            {items.length} item{items.length === 1 ? '' : 's'} · <span className="font-bold dark:text-white text-slate-800 tabular-nums">{formatAmount(total)}</span>
          </p>
        </div>
      </div>

      {!month.plan && (
        <p className="text-xs dark:text-gray-400 text-slate-500">This month has no plan, so all spending is unplanned. Start a plan to match it to lines.</p>
      )}

      {items.length === 0 ? (
        <p className="text-xs dark:text-gray-500 text-slate-400 text-center py-6">Nothing here for this filter.</p>
      ) : (
        <ul className="space-y-2.5">
          {items.map(item => (
            <SpendingRow key={item.id} item={item} lines={lines} lineName={lineName} onAssign={assign} busy={busyId === item.id} />
          ))}
        </ul>
      )}
    </div>
  )
}
