import { useState } from 'react'
import Modal from '../common/Modal'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { ALLOCATION_PRESETS, GROUPS, GROUP_META, MATCHABLE_CATEGORIES, amountError } from '../../utils/planner'

const toForm = (allocation, group) => ({
  group: allocation?.group || group || 'FIXED',
  name: allocation?.name || '',
  plannedAmount: allocation ? String(allocation.plannedAmount) : '',
  matchCategories: allocation?.matchCategories || [],
  recurring: allocation ? allocation.recurring : true,
  savingsGoalId: allocation?.savingsGoalId || '',
  investmentPlanId: allocation?.investmentPlanId || '',
})

export default function AllocationForm({ allocation, group, existingNames, onSave, onClose }) {
  const [form, setForm] = useState(() => toForm(allocation, group))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const presets = ALLOCATION_PRESETS[form.group] || []
  const tracksSpending = form.group === 'FIXED' || form.group === 'VARIABLE'
  const { goals, investments } = usePlanner()
  // A line can track an archived goal or paused investment it was already linked to.
  const goalOptions = goals.filter(g => !g.archived || g.id === allocation?.savingsGoalId)
  const investmentOptions = investments.plans.filter(p => p.active || p.id === allocation?.investmentPlanId)

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const pickPreset = (preset) => setForm(prev => ({ ...prev, name: preset.name, matchCategories: preset.matchCategories }))

  const toggleCategory = (category) => set('matchCategories', form.matchCategories.includes(category)
    ? form.matchCategories.filter(c => c !== category)
    : [...form.matchCategories, category])

  const validate = () => {
    const next = {}
    const name = form.name.trim()
    if (!name) next.name = 'Give this line a name'
    else if (name.length > 50) next.name = 'Keep the name under 50 characters'
    else if (existingNames.some(n => n.toLowerCase() === name.toLowerCase() && n !== allocation?.name)) next.name = 'This month already has a line with that name'
    const amount = amountError(form.plannedAmount, { label: 'Planned amount' })
    if (amount) next.plannedAmount = amount
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      await onSave({
        group: form.group,
        name: form.name.trim(),
        plannedAmount: form.plannedAmount.trim(),
        matchCategories: tracksSpending ? form.matchCategories : [],
        recurring: form.recurring,
        // Only the link that fits the group is sent; the server drops a link the group no longer allows.
        ...(form.group === 'SAVINGS' && { savingsGoalId: form.savingsGoalId || null }),
        ...(form.group === 'INVESTMENT' && { investmentPlanId: form.investmentPlanId || null }),
      })
      onClose()
    } catch {
      // The context already showed the server's message; keep the form open to fix it.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={allocation ? 'Edit allocation' : 'Add allocation'} subtitle="Changes apply to this month only" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Group">
          {(a) => (
            <select {...a} className="input cursor-pointer" value={form.group} onChange={e => set('group', e.target.value)}>
              {GROUPS.map(g => <option key={g} value={g}>{GROUP_META[g].label}</option>)}
            </select>
          )}
        </Field>

        {!allocation && presets.length > 0 && (
          <div>
            <p className="label">Quick pick</p>
            <div className="flex flex-wrap gap-1.5">
              {presets.filter(p => !existingNames.includes(p.name)).map(p => (
                <button key={p.name} type="button" onClick={() => pickPreset(p)}
                  className={`text-xs px-2.5 py-1 rounded-lg border transition-all active:scale-95 ${form.name === p.name ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'dark:border-dark-border border-slate-200 dark:text-gray-300 text-slate-600'}`}>
                  {p.name}
                </button>
              ))}
            </div>
          </div>
        )}

        <Field label="Name" error={errors.name}>
          {(a) => <input {...a} className="input" maxLength={50} placeholder="e.g. Rent" value={form.name} onChange={e => set('name', e.target.value)} />}
        </Field>

        <Field label="Planned amount (₹)" error={errors.plannedAmount}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 3500" value={form.plannedAmount} onChange={e => set('plannedAmount', e.target.value)} />}
        </Field>

        {tracksSpending && (
          <fieldset>
            <legend className="label">Count spending from</legend>
            <p className="text-[11px] dark:text-gray-500 text-slate-400 -mt-1 mb-2">Transactions in these categories are compared with this plan. If two lines pick the same category, the first line gets it.</p>
            <div className="flex flex-wrap gap-1.5">
              {MATCHABLE_CATEGORIES.map(c => {
                const on = form.matchCategories.includes(c)
                return (
                  <label key={c} className={`text-xs px-2.5 py-1 rounded-lg border cursor-pointer select-none transition-all ${on ? 'border-sky-500 bg-sky-500/10 text-sky-600 dark:text-sky-400' : 'dark:border-dark-border border-slate-200 dark:text-gray-300 text-slate-600'}`}>
                    <input type="checkbox" className="sr-only" checked={on} onChange={() => toggleCategory(c)} />
                    {c === 'EMI' ? 'EMI payments' : c}
                  </label>
                )
              })}
            </div>
          </fieldset>
        )}

        {form.group === 'SAVINGS' && (
          <Field label="Track a savings goal" hint={goalOptions.length ? 'Money added to the goal this month counts toward this line' : 'Create a goal in the Goals tab to track it here'}>
            {(a) => (
              <select {...a} className="input cursor-pointer" value={form.savingsGoalId} onChange={e => set('savingsGoalId', e.target.value)}>
                <option value="">Not linked</option>
                {goalOptions.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              </select>
            )}
          </Field>
        )}
        {form.group === 'INVESTMENT' && (
          <Field label="Track an investment" hint={investmentOptions.length ? 'Amounts invested in it this month count toward this line' : 'Add an investment in the Invest tab to track it here'}>
            {(a) => (
              <select {...a} className="input cursor-pointer" value={form.investmentPlanId} onChange={e => set('investmentPlanId', e.target.value)}>
                <option value="">Not linked</option>
                {investmentOptions.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </Field>
        )}

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span>
            <span className="block text-sm font-semibold dark:text-gray-200 text-slate-700">Repeat next month</span>
            <span className="block text-[11px] dark:text-gray-500 text-slate-400">Copied into new months when you open them</span>
          </span>
          <input type="checkbox" role="switch" className="w-5 h-5 accent-sky-500" checked={form.recurring} onChange={e => set('recurring', e.target.checked)} />
        </label>

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
