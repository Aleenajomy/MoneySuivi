import { useCallback, useEffect, useState } from 'react'
import { Trash2 } from 'lucide-react'
import Modal from '../common/Modal'
import ConfirmDialog from '../ConfirmDialog'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { formatDate } from '../../utils/constants'
import { amountError, formatAmount, todayInput } from '../../utils/planner'

const dateInput = (value) => (value ? String(value).slice(0, 10) : '')

export function GoalForm({ goal, onSave, onClose }) {
  const [form, setForm] = useState({
    name: goal?.name || '',
    targetAmount: goal ? String(goal.targetAmount) : '',
    initialAmount: goal ? String(goal.initialAmount) : '',
    monthlyContribution: goal?.monthlyContribution != null ? String(goal.monthlyContribution) : '',
    targetDate: dateInput(goal?.targetDate),
    note: goal?.note || '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Give the goal a name'
    const target = amountError(form.targetAmount, { allowZero: false, label: 'Target amount' })
    if (target) next.targetAmount = target
    if (form.initialAmount.trim()) {
      const initial = amountError(form.initialAmount, { label: 'Already saved' })
      if (initial) next.initialAmount = initial
    }
    if (form.monthlyContribution.trim()) {
      const monthly = amountError(form.monthlyContribution, { label: 'Monthly contribution' })
      if (monthly) next.monthlyContribution = monthly
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await onSave({
        name: form.name.trim(),
        targetAmount: form.targetAmount.trim(),
        initialAmount: form.initialAmount.trim() || '0',
        monthlyContribution: form.monthlyContribution.trim() || null,
        targetDate: form.targetDate || null,
        note: form.note.trim() || null,
      })
      onClose()
    } catch {
      // Message already shown; keep the form open.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={goal ? 'Edit goal' : 'New savings goal'} subtitle="Money you set aside stays in your accounts" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Goal name" error={errors.name}>
          {(a) => <input {...a} className="input" maxLength={50} placeholder="e.g. Emergency Fund" value={form.name} onChange={e => set('name', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Target (₹)" error={errors.targetAmount}>
            {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.targetAmount} onChange={e => set('targetAmount', e.target.value)} />}
          </Field>
          <Field label="Already saved (₹)" error={errors.initialAmount}>
            {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={form.initialAmount} onChange={e => set('initialAmount', e.target.value)} />}
          </Field>
          <Field label="Each month (₹)" error={errors.monthlyContribution} hint="Optional">
            {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={form.monthlyContribution} onChange={e => set('monthlyContribution', e.target.value)} />}
          </Field>
          <Field label="Target date" hint="Optional">
            {(a) => <input {...a} className="input cursor-pointer" type="date" min="2000-01-01" max="2100-12-31" value={form.targetDate} onChange={e => set('targetDate', e.target.value)} />}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(a) => <input {...a} className="input" maxLength={500} value={form.note} onChange={e => set('note', e.target.value)} />}
        </Field>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function ContributionForm({ goal, type, onClose }) {
  const { addContribution } = usePlanner()
  const withdrawing = type === 'WITHDRAWAL'
  const [form, setForm] = useState({ amount: '', date: todayInput(), note: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    const amount = amountError(form.amount, { allowZero: false })
    if (amount) next.amount = amount
    else if (withdrawing && Number(form.amount) > Number(goal.savedAmount)) next.amount = `You can withdraw at most ${formatAmount(goal.savedAmount)}`
    if (!form.date) next.date = 'Choose a date'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await addContribution(goal.id, { type, amount: form.amount.trim(), date: form.date, note: form.note.trim() || null })
      onClose()
    } catch {
      // Message already shown.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={withdrawing ? `Withdraw from ${goal.name}` : `Add to ${goal.name}`} subtitle={`Saved so far ${formatAmount(goal.savedAmount)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Amount (₹)" error={errors.amount}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />}
        </Field>
        <Field label="Date" error={errors.date}>
          {(a) => <input {...a} className="input cursor-pointer" type="date" min="2000-01-01" max={todayInput()} value={form.date} onChange={e => set('date', e.target.value)} />}
        </Field>
        <Field label="Note (optional)">
          {(a) => <input {...a} className="input" maxLength={300} value={form.note} onChange={e => set('note', e.target.value)} />}
        </Field>
        <p className="text-[11px] dark:text-gray-500 text-slate-400">
          This only sets money aside on paper. No transaction is added and your account balances don't change.
        </p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : withdrawing ? 'Withdraw' : 'Add money'}</button>
        </div>
      </form>
    </Modal>
  )
}

export function GoalHistory({ goal, onClose }) {
  const { getContributions, deleteContribution } = usePlanner()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(() => getContributions(goal.id).then(setRows).catch(() => setFailed(true)), [getContributions, goal.id])
  useEffect(() => { load() }, [load])

  const remove = async () => {
    const { id } = removing
    setRemoving(null)
    try {
      await deleteContribution(id)
      await load()
    } catch { /* message shown */ }
  }

  return (
    <Modal title={`${goal.name}: history`} subtitle={`Saved ${formatAmount(goal.savedAmount)} of ${formatAmount(goal.targetAmount)}`} onClose={onClose}>
      {failed ? <p role="alert" className="text-xs text-red-500">Could not load the history.</p>
        : rows === null ? <p className="text-xs dark:text-gray-400 text-slate-500">Loading…</p>
          : rows.length === 0 ? <p className="text-xs dark:text-gray-400 text-slate-500">Nothing added or withdrawn yet.</p>
            : (
              <ul className="divide-y dark:divide-dark-border divide-light-border" data-testid="goal-history">
                {rows.map(r => (
                  <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold dark:text-white text-slate-800">{r.type === 'WITHDRAWAL' ? 'Withdrawn' : 'Added'}</p>
                      <p className="text-[11px] dark:text-gray-400 text-slate-500 truncate">{formatDate(r.date)}{r.note ? ` · ${r.note}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className={`font-bold tabular-nums ${r.type === 'WITHDRAWAL' ? 'text-danger' : 'text-secondary'}`}>
                        {r.type === 'WITHDRAWAL' ? '-' : '+'}{formatAmount(r.amount)}
                      </span>
                      <button type="button" onClick={() => setRemoving(r)} aria-label={`Remove ${r.type === 'WITHDRAWAL' ? 'withdrawal' : 'deposit'} of ${formatAmount(r.amount)}`}
                        className="w-7 h-7 rounded-lg bg-red-500/10 text-red-500 flex items-center justify-center active:scale-95">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
      <ConfirmDialog
        open={Boolean(removing)}
        title={removing?.type === 'WITHDRAWAL' ? 'Remove this withdrawal?' : 'Remove this deposit?'}
        message={removing ? `The ${formatAmount(removing.amount)} entry is removed from ${goal.name}. No transactions or balances change.` : ''}
        confirmText="Remove"
        onConfirm={remove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  )
}
