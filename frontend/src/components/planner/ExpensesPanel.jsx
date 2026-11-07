import { useState } from 'react'
import { AlertTriangle, CheckCircle2, LayoutList, ListPlus, Pencil, Plus, Receipt, Trash2, Unlink } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import AllocationForm from './AllocationForm'
import EmiLinkForm from './EmiLinkForm'
import RecordExpenseForm from './RecordExpenseForm'
import { formatDate } from '../../utils/constants'
import { GROUPS, GROUP_META, formatAmount, isEmiLine } from '../../utils/planner'

const chip = 'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 transition-all'

function LineRow({ line, onEdit, onDelete, onRecord }) {
  const over = Number(line.remainingAmount) < 0
  const emi = isEmiLine(line)
  return (
    <article className="card p-3.5" data-testid="expense-line" aria-label={line.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-sm dark:text-white text-slate-800 truncate">{line.name}</h4>
          <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
            Spent {formatAmount(line.actualAmount)} · {line.transactionCount} item{line.transactionCount === 1 ? '' : 's'}
            {' · '}
            <span className={over ? 'text-red-500 font-semibold' : ''}>
              {over ? `${formatAmount(-line.remainingAmount)} over` : `${formatAmount(line.remainingAmount)} left`}
            </span>
          </p>
        </div>
        <p className="font-black text-sm tabular-nums dark:text-white text-slate-800 flex-shrink-0">{formatAmount(line.plannedAmount)}</p>
      </div>
      <div className="flex flex-wrap items-center justify-end gap-1.5 mt-2.5 pt-2.5 border-t dark:border-dark-border border-light-border">
        <button type="button" onClick={() => onEdit(line)} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`} aria-label={`Edit ${line.name}`}>
          <Pencil size={12} /> Edit
        </button>
        <button type="button" onClick={() => onDelete(line)} className={`${chip} bg-red-500/10 text-red-500`} aria-label={`Delete ${line.name}`}>
          <Trash2 size={12} /> Delete
        </button>
        {!emi && (
          <button type="button" onClick={() => onRecord(line)} className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`} aria-label={`Record a payment for ${line.name}`}>
            <Receipt size={12} /> Record
          </button>
        )}
      </div>
    </article>
  )
}

function EmiPayments({ emi, onLink, onUnlink }) {
  if (!emi || emi.payments.length === 0) return null
  return (
    <section className="card p-4 space-y-2.5" aria-labelledby="emi-payments-title" data-testid="emi-payments">
      <div>
        <h4 id="emi-payments-title" className="text-sm font-bold dark:text-white text-slate-800">EMI payments this month</h4>
        <p className="text-[11px] dark:text-gray-400 text-slate-500">
          From Loans &amp; EMIs. If you also added a payment as an expense in History, link the two so it is counted once.
        </p>
      </div>
      {emi.possibleDoubleCounts > 0 && (
        <p className="flex items-start gap-2 text-[11px] font-semibold text-amber-600 dark:text-amber-400" role="status">
          <AlertTriangle size={13} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          {emi.possibleDoubleCounts} payment{emi.possibleDoubleCounts === 1 ? ' may be' : 's may be'} counted twice. Review below; totals change only if you link.
        </p>
      )}
      <ul className="space-y-2">
        {emi.payments.map(p => (
          <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 text-xs" data-testid="emi-payment">
            <span className="min-w-0">
              <span className="block font-semibold dark:text-gray-200 text-slate-700">{p.title} · {formatAmount(p.amount)}</span>
              <span className="block text-[11px] dark:text-gray-400 text-slate-500">
                Paid {formatDate(p.paidAt)}
                {p.linkedTransaction ? ` · same as "${p.linkedTransaction.title}" in History` : p.possibleDuplicates.length ? ` · looks like "${p.possibleDuplicates[0].title}" in History` : ''}
              </span>
            </span>
            {p.linkedTransaction ? (
              <span className="flex items-center gap-1.5">
                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold"><CheckCircle2 size={12} /> Counted once</span>
                <button type="button" onClick={() => onUnlink(p)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`Unlink ${p.title} payment`}>
                  <Unlink size={12} /> Unlink
                </button>
              </span>
            ) : (
              <button type="button" onClick={() => onLink(p)} className={`${chip} ${p.possibleDuplicates.length ? 'bg-amber-500/10 text-amber-600 dark:text-amber-400' : 'bg-sky-500/10 text-sky-600 dark:text-sky-400'}`}>
                Already in History?
              </button>
            )}
          </li>
        ))}
      </ul>
    </section>
  )
}

export default function ExpensesPanel() {
  const { period, month, saveAllocation, deleteAllocation, addDefaultLines, linkEmiPayment } = usePlanner()
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [recording, setRecording] = useState(null)
  const [linking, setLinking] = useState(null)
  const { plan, summary, emi } = month
  const lines = plan.allocations.filter(a => GROUPS.includes(a.group))
  // Savings and investment lines from the earlier planner are kept untouched, just not shown.
  const hidden = plan.allocations.length - lines.length

  const confirmDelete = async () => {
    const target = deleting
    setDeleting(null)
    await deleteAllocation(target.id).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs dark:text-gray-400 text-slate-500">
          {formatAmount(summary.plan.plannedExpenses)} planned · {formatAmount(month.position.actualExpenses)} spent
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={() => addDefaultLines().catch(() => {})} className="btn-secondary flex items-center gap-1.5 text-xs whitespace-nowrap">
            <ListPlus size={14} /> Add default expenses
          </button>
          <button type="button" onClick={() => setEditing({ group: 'FIXED' })} className="btn-primary flex items-center gap-1.5 text-xs whitespace-nowrap">
            <Plus size={14} /> Add expense
          </button>
        </div>
      </div>

      {lines.length === 0 && (
        <EmptyState icon={LayoutList} title="No expenses planned yet"
          description="Add the defaults (Rent ₹2,500, EMI, Mess / Food, Travel and Other Personal) or your own lines."
          actionLabel="Add default expenses" onAction={() => addDefaultLines().catch(() => {})} />
      )}

      {GROUPS.map((group) => {
        const items = lines.filter(a => a.group === group)
        if (!items.length) return null
        return (
          <section key={group} aria-labelledby={`group-${group}`} data-testid={`group-${group}`}>
            <h4 id={`group-${group}`} className="text-xs font-bold uppercase tracking-wider dark:text-gray-400 text-slate-500 mb-2">
              {GROUP_META[group].label} · <span className="tabular-nums">{formatAmount(summary.plan.byGroup[group])}</span>
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {items.map(line => <LineRow key={line.id} line={line} onEdit={setEditing} onDelete={setDeleting} onRecord={setRecording} />)}
            </div>
          </section>
        )
      })}

      <EmiPayments emi={emi} onLink={setLinking} onUnlink={p => linkEmiPayment(p.id, null).catch(() => {})} />

      {summary.unplanned.length > 0 && (
        <section className="card p-4" aria-labelledby="unplanned-title" data-testid="unplanned">
          <h4 id="unplanned-title" className="text-sm font-bold dark:text-white text-slate-800">Other spending this month</h4>
          <p className="text-xs dark:text-gray-400 text-slate-500 mb-2">Recorded in History but not matched to a line above. It still counts in actual expenses.</p>
          <ul className="text-xs space-y-1">
            {summary.unplanned.map(u => (
              <li key={u.category} className="flex justify-between dark:text-gray-300 text-slate-600">
                <span>{u.category}</span><span className="tabular-nums font-semibold">{formatAmount(u.amount)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {hidden > 0 && (
        <p className="text-[11px] dark:text-gray-500 text-slate-400">
          {hidden} savings or investment line{hidden === 1 ? '' : 's'} from the earlier planner {hidden === 1 ? 'is' : 'are'} kept but not shown here, and {hidden === 1 ? 'is' : 'are'} not counted as expenses.
        </p>
      )}

      {editing && (
        <AllocationForm
          allocation={editing.id ? editing : null}
          group={editing.group}
          existingNames={plan.allocations.map(a => a.name)}
          onSave={(values) => saveAllocation(editing.id, values)}
          onClose={() => setEditing(null)}
        />
      )}
      {recording && <RecordExpenseForm line={recording} period={period} onClose={() => setRecording(null)} />}
      {linking && <EmiLinkForm payment={linking} onClose={() => setLinking(null)} />}

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this planned expense?"
        message={deleting ? `${deleting.name} (${formatAmount(deleting.plannedAmount)} planned) is removed from this month's plan only. No transaction is deleted and your balances do not change.` : ''}
        confirmText="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
