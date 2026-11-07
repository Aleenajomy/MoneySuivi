import { useEffect, useState } from 'react'
import { PiggyBank } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import Field from './Field'
import { formatAmount } from '../../utils/planner'

function Suggestion({ label, amount, basis, remaining, testId }) {
  return (
    <div className="card p-4" data-testid={testId}>
      <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">{label}</p>
      <p className="text-2xl font-black mt-0.5 dark:text-white text-slate-800 tabular-nums">{formatAmount(amount)}</p>
      <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
        {Number(remaining) > 0 ? `of ${formatAmount(remaining)} ${basis}` : `Nothing ${basis}, so nothing to suggest`}
      </p>
    </div>
  )
}

// A suggestion only: it is arithmetic over the month's figures and has no button that moves money.
export default function SavingsPanel({ position }) {
  const { saveSavingsPercent } = usePlanner()
  const [percent, setPercent] = useState(String(position.savingsPercent))
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  useEffect(() => { setPercent(String(position.savingsPercent)) }, [position.savingsPercent])

  const submit = async (e) => {
    e.preventDefault()
    const text = percent.trim()
    if (!/^\d{1,3}$/.test(text) || Number(text) > 100) {
      setError('Use a whole number from 0 to 100')
      return
    }
    setError('')
    if (Number(text) === position.savingsPercent) return
    setSaving(true)
    try {
      await saveSavingsPercent(Number(text))
    } catch { /* shown by the context */ } finally {
      setSaving(false)
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <Suggestion testId="suggested-savings" label="Suggested savings" amount={position.suggestedSavings} remaining={position.plannedRemaining} basis="planned remaining" />
        <Suggestion testId="actual-savings" label="Actual savings potential" amount={position.actualSavingsPotential} remaining={position.actualRemaining} basis="actually remaining" />
      </div>
      <form onSubmit={submit} className="flex items-end gap-2" noValidate>
        <div className="w-48">
          <Field label="Savings %" error={error}>
            {(a) => <input {...a} className="input" type="number" inputMode="numeric" min="0" max="100" step="1" value={percent} onChange={e => setPercent(e.target.value)} />}
          </Field>
        </div>
        <button type="submit" disabled={saving} className="btn-secondary text-xs mb-0.5">{saving ? 'Saving…' : 'Update'}</button>
      </form>
      <p className="flex items-start gap-2 text-[11px] dark:text-gray-400 text-slate-500" data-testid="savings-note">
        <PiggyBank size={14} className="flex-shrink-0 mt-0.5 text-secondary" aria-hidden="true" />
        A calculation only. It never creates a transaction, moves money between accounts, or changes your balances or net worth.
        To set money aside, move it yourself with a transfer in Add Transaction.
      </p>
    </div>
  )
}
