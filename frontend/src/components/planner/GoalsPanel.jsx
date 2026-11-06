import { useState } from 'react'
import { Plus, Target, PlusCircle, MinusCircle, History, Pencil, Archive, ArchiveRestore, Trash2 } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import { ContributionForm, GoalForm, GoalHistory } from './GoalForms'
import { formatDate } from '../../utils/constants'
import { formatAmount } from '../../utils/planner'

const chip = 'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 transition-all'
const monthYear = (date) => new Date(date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' })

function GoalCard({ goal, onAction }) {
  const pct = Math.min(goal.progress ?? 0, 100)
  let plan = null
  if (goal.reached) plan = <span className="text-emerald-600 dark:text-emerald-400 font-semibold">Target reached</span>
  else if (goal.overdue) plan = <span className="text-amber-600 dark:text-amber-400 font-semibold">Target date passed · {formatAmount(goal.remainingAmount)} to go</span>
  else if (goal.requiredMonthly != null) plan = <span>{formatAmount(goal.requiredMonthly)}/month reaches it by {monthYear(goal.targetDate)}</span>

  return (
    <article className={`card p-4 ${goal.archived ? 'opacity-70' : ''}`} data-testid="goal-card" aria-label={goal.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-sm dark:text-white text-slate-800 truncate">{goal.name}</h4>
          <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
            {goal.targetDate ? `By ${formatDate(goal.targetDate)}` : 'No target date'}
            {goal.monthlyContribution != null ? ` · ${formatAmount(goal.monthlyContribution)} planned monthly` : ''}
          </p>
        </div>
        <p className="text-right flex-shrink-0">
          <span className="block font-black text-sm tabular-nums dark:text-white text-slate-800">{formatAmount(goal.savedAmount)}</span>
          <span className="block text-[11px] dark:text-gray-400 text-slate-500">of {formatAmount(goal.targetAmount)}</span>
        </p>
      </div>
      <div className="mt-3 h-2 rounded-full dark:bg-dark-border bg-slate-100 overflow-hidden" role="progressbar"
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label={`${goal.name}: ${goal.progress}% saved`}>
        <div className={`h-full rounded-full ${goal.reached ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between gap-3 text-[11px] mt-1.5 dark:text-gray-400 text-slate-500">
        <span>{goal.progress}% · {formatAmount(goal.remainingAmount)} left</span>
        <span>This month {Number(goal.thisMonthAmount) >= 0 ? '+' : ''}{formatAmount(goal.thisMonthAmount)}</span>
      </div>
      {plan && <p className="text-[11px] mt-1 dark:text-gray-300 text-slate-600">{plan}</p>}

      <div className="flex flex-wrap justify-end gap-1.5 mt-3 pt-3 border-t dark:border-dark-border border-light-border">
        {!goal.archived && (
          <>
            <button type="button" onClick={() => onAction('add', goal)} className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}><PlusCircle size={12} /> Add money</button>
            <button type="button" onClick={() => onAction('withdraw', goal)} disabled={Number(goal.savedAmount) <= 0}
              className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600 disabled:opacity-40`}><MinusCircle size={12} /> Withdraw</button>
          </>
        )}
        <button type="button" onClick={() => onAction('history', goal)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`History of ${goal.name}`}><History size={12} /> History</button>
        <button type="button" onClick={() => onAction('edit', goal)} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`} aria-label={`Edit ${goal.name}`}><Pencil size={12} /> Edit</button>
        <button type="button" onClick={() => onAction('archive', goal)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`${goal.archived ? 'Restore' : 'Archive'} ${goal.name}`}>
          {goal.archived ? <><ArchiveRestore size={12} /> Restore</> : <><Archive size={12} /> Archive</>}
        </button>
        <button type="button" onClick={() => onAction('delete', goal)} className={`${chip} bg-red-500/10 text-red-500`} aria-label={`Delete ${goal.name}`}><Trash2 size={12} /> Delete</button>
      </div>
    </article>
  )
}

export default function GoalsPanel() {
  const { goals, saveGoal, archiveGoal, deleteGoal } = usePlanner()
  const [editing, setEditing] = useState(null)
  const [contributing, setContributing] = useState(null)
  const [history, setHistory] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const active = goals.filter(g => !g.archived)
  const archived = goals.filter(g => g.archived)

  const onAction = (action, goal) => {
    if (action === 'add') setContributing({ goal, type: 'CONTRIBUTION' })
    else if (action === 'withdraw') setContributing({ goal, type: 'WITHDRAWAL' })
    else if (action === 'history') setHistory(goal)
    else if (action === 'edit') setEditing(goal)
    else if (action === 'archive') archiveGoal(goal.id, !goal.archived).catch(() => {})
    else if (action === 'delete') setDeleting(goal)
  }

  const totalSaved = active.reduce((s, g) => s + Math.round(Number(g.savedAmount) * 100), 0) / 100

  return (
    <div className="space-y-4">
      <div className="card p-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">Saved across goals</p>
          <p className="text-2xl font-black dark:text-white text-slate-800 mt-0.5" data-testid="goals-total">{formatAmount(totalSaved)}</p>
          <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">Set aside on paper; it stays in your accounts.</p>
        </div>
        <button type="button" onClick={() => setEditing({})} className="btn-primary flex items-center gap-1.5 text-xs whitespace-nowrap"><Plus size={14} /> New goal</button>
      </div>

      {goals.length === 0 ? (
        <EmptyState icon={Target} title="No savings goals yet"
          description="Create a goal for an emergency fund, a trip, a gift or anything you're saving towards, and track how close you are."
          actionLabel="Create a goal" onAction={() => setEditing({})} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {active.map(g => <GoalCard key={g.id} goal={g} onAction={onAction} />)}
        </div>
      )}

      {archived.length > 0 && (
        <details className="group">
          <summary className="text-xs font-bold dark:text-gray-400 text-slate-500 cursor-pointer select-none">Archived goals ({archived.length})</summary>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mt-3">
            {archived.map(g => <GoalCard key={g.id} goal={g} onAction={onAction} />)}
          </div>
        </details>
      )}

      {editing && <GoalForm goal={editing.id ? editing : null} onSave={(values) => saveGoal(editing.id, values)} onClose={() => setEditing(null)} />}
      {contributing && <ContributionForm goal={contributing.goal} type={contributing.type} onClose={() => setContributing(null)} />}
      {history && <GoalHistory goal={goals.find(g => g.id === history.id) || history} onClose={() => setHistory(null)} />}
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Delete this goal?"
        message={deleting ? `${deleting.name} and its history of additions and withdrawals are removed. No transactions or balances change. Budget lines linked to it are kept but unlinked. To keep the history, archive it instead.` : ''}
        confirmText="Delete"
        onConfirm={async () => { const g = deleting; setDeleting(null); await deleteGoal(g.id).catch(() => {}) }}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
