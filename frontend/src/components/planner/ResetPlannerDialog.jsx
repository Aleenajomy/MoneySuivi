import { useState } from 'react'
import { ShieldCheck } from 'lucide-react'
import Modal from '../common/Modal'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { periodLabel } from '../../utils/planner'

const KEPT = 'Transactions in History, account balances, EMIs and EMI payments, Lend/Borrow and Net Worth'

export default function ResetPlannerDialog({ onClose }) {
  const { period, resetPlanner } = usePlanner()
  const [scope, setScope] = useState(null)
  const [typed, setTyped] = useState('')
  const [saving, setSaving] = useState(false)
  const month = periodLabel(period)
  const options = [
    {
      value: 'month',
      title: `Reset ${month} only`,
      detail: 'Expense lines go back to the defaults (Rent ₹2,500, EMI, Mess / Food, Travel, Other Personal), savings goes back to 20%, salary goes back to Pending, and EMI links for this month are removed. Other months are not changed.',
    },
    {
      value: 'all',
      title: 'Reset the whole planner',
      detail: 'Deletes every month\'s plan, every salary record and every income source, and removes all EMI links. You start again from the defaults.',
    },
  ]
  const ready = scope === 'month' || (scope === 'all' && typed.trim() === 'RESET')

  const submit = async (e) => {
    e.preventDefault()
    if (!ready) return
    setSaving(true)
    try {
      await resetPlanner(scope)
      onClose()
    } catch { /* shown by the context */ } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title="Reset planner" subtitle="Clears planner data only" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="label">What should be reset?</legend>
          <div className="space-y-2">
            {options.map(o => (
              <label key={o.value} className={`card p-3 flex items-start gap-3 cursor-pointer ${scope === o.value ? 'ring-2 ring-red-500' : ''}`}>
                <input type="radio" name="reset-scope" className="mt-1 accent-red-500" checked={scope === o.value} onChange={() => { setScope(o.value); setTyped('') }} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold dark:text-white text-slate-800">{o.title}</span>
                  <span className="block text-[11px] dark:text-gray-400 text-slate-500">{o.detail}</span>
                </span>
              </label>
            ))}
          </div>
        </fieldset>

        {scope === 'all' && (
          <Field label="Type RESET to confirm">
            {(a) => <input {...a} className="input" autoComplete="off" value={typed} onChange={e => setTyped(e.target.value)} />}
          </Field>
        )}

        <p className="flex items-start gap-2 text-[11px] text-emerald-600 dark:text-emerald-400" data-testid="reset-kept">
          <ShieldCheck size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          <span>Always kept: {KEPT}. Salary and expenses you already recorded stay in History.</span>
        </p>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={!ready || saving} className="flex-1 rounded-xl px-4 py-2.5 text-sm font-bold text-white bg-red-500 disabled:opacity-50 active:scale-95 transition-all">
            {saving ? 'Resetting…' : scope === 'all' ? 'Reset whole planner' : scope === 'month' ? `Reset ${month}` : 'Choose an option'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
