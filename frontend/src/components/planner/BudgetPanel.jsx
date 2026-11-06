import { useState } from 'react'
import { Plus, CopyPlus, LayoutList } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import { useTheme } from '../../context/ThemeContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import AllocationCard from './AllocationCard'
import AllocationForm from './AllocationForm'
import { GROUPS, GROUP_META, formatAmount } from '../../utils/planner'

export default function BudgetPanel({ onShowSpending }) {
  const { month, saveAllocation, deleteAllocation, copyRecurring } = usePlanner()
  const { dark } = useTheme()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const { plan, summary } = month
  const allocations = plan.allocations
  const names = allocations.map(a => a.name)

  const confirmDelete = async () => {
    const target = deleting
    setDeleting(null)
    await deleteAllocation(target.id).catch(() => {})
  }

  const toggleRecurring = (allocation, recurring) => saveAllocation(allocation.id, { recurring }).catch(() => {})

  return (
    <div className="space-y-5">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3" data-testid="allocation-summary">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">
            {summary.overAllocated ? 'Over-allocated by' : 'Left to allocate'}
          </p>
          <p className={`text-2xl font-black mt-0.5 ${summary.overAllocated ? 'text-red-500' : 'dark:text-white text-slate-800'}`}>
            {formatAmount(Math.abs(summary.unallocated))}
          </p>
          <p className="text-xs dark:text-gray-400 text-slate-500 mt-0.5">
            {formatAmount(summary.plan.totalAllocated)} planned of {formatAmount(summary.income.expected)} expected
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" onClick={() => copyRecurring().catch(() => {})} className="btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap">
            <CopyPlus size={14} /> Copy repeating lines
          </button>
          <button type="button" onClick={() => setEditing({ group: 'FIXED' })} className="btn-primary flex items-center gap-1.5 text-xs whitespace-nowrap">
            <Plus size={14} /> Add line
          </button>
        </div>
      </div>

      {allocations.length === 0 && (
        <EmptyState icon={LayoutList} title="No allocations yet"
          description="Split your salary into rent, food, travel, savings and investments. Lines marked Repeat carry into next month."
          actionLabel="Add first allocation" onAction={() => setEditing({ group: 'FIXED' })} />
      )}

      {allocations.length > 0 && GROUPS.map(group => {
        const items = allocations.filter(a => a.group === group)
        const meta = GROUP_META[group]
        return (
          <section key={group} aria-labelledby={`group-${group}`} data-testid={`group-${group}`}>
            <div className="flex items-center justify-between gap-3 mb-2">
              <div className="flex items-center gap-2 min-w-0">
                <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: dark ? meta.dark : meta.light }} aria-hidden="true" />
                <h3 id={`group-${group}`} className="text-sm font-bold dark:text-white text-slate-800">{meta.label}</h3>
                <span className="text-xs tabular-nums dark:text-gray-400 text-slate-500">{formatAmount(summary.plan.byGroup[group])}</span>
              </div>
              <button type="button" onClick={() => setEditing({ group })} aria-label={`Add to ${meta.label}`}
                className="w-8 h-8 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 flex items-center justify-center active:scale-95">
                <Plus size={15} />
              </button>
            </div>
            {items.length === 0 ? (
              <p className="text-xs dark:text-gray-500 text-slate-400 card px-3.5 py-3 border-dashed">{meta.hint}.</p>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                {items.map(a => (
                  <AllocationCard key={a.id} allocation={a} onEdit={setEditing} onDelete={setDeleting} onToggleRecurring={toggleRecurring} onShowSpending={onShowSpending} />
                ))}
              </div>
            )}
          </section>
        )
      })}

      {summary.unplanned.length > 0 && (
        <section className="card p-4" aria-labelledby="unplanned-title">
          <div className="flex items-center justify-between gap-2">
            <h3 id="unplanned-title" className="text-sm font-bold dark:text-white text-slate-800">Spending outside the plan</h3>
            <button type="button" onClick={() => onShowSpending('UNPLANNED')} className="text-xs font-semibold text-sky-600 dark:text-sky-400">Review</button>
          </div>
          <p className="text-xs dark:text-gray-400 text-slate-500 mb-2">Spending this month that no line matched by name or category.</p>
          <ul className="text-xs space-y-1">
            {summary.unplanned.map(u => (
              <li key={u.category} className="flex justify-between dark:text-gray-300 text-slate-600">
                <span>{u.category}</span><span className="tabular-nums font-semibold">{formatAmount(u.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {editing && (
        <AllocationForm
          allocation={editing.id ? editing : null}
          group={editing.group}
          existingNames={names}
          onSave={(values) => saveAllocation(editing.id, values)}
          onClose={() => setEditing(null)}
        />
      )}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this allocation?"
        message={deleting ? `${deleting.name} (${formatAmount(deleting.plannedAmount)}) is removed from this month only. Other months and your transactions are not changed; spending you moved to this line goes back to automatic matching.` : ''}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
