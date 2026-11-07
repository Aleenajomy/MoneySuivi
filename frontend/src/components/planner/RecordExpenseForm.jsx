import { useState } from 'react'
import Modal from '../common/Modal'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { PAYMENT_METHODS, formatDate } from '../../utils/constants'
import { amountError, formatAmount, monthDateRange, periodLabel } from '../../utils/planner'

/**
 * Records one real payment for a planned line. The account has no default, and the effect on the
 * balance is spelled out before saving; a repeated tap returns the same transaction.
 */
export default function RecordExpenseForm({ line, period, onClose }) {
  const { recordExpense } = usePlanner()
  const range = monthDateRange(period)
  const left = Number(line.remainingAmount)
  const [form, setForm] = useState({
    amount: left > 0 ? String(left) : '',
    date: range.max || '',
    paymentMethod: '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    const amount = amountError(form.amount, { allowZero: false })
    if (amount) next.amount = amount
    if (!form.date) next.date = 'Choose the date you paid'
    else if (form.date < range.min || form.date > range.max) next.date = `Choose a date in ${periodLabel(period)}, up to today`
    if (!form.paymentMethod) next.paymentMethod = 'Choose the account you paid from'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await recordExpense(line.id, { amount: form.amount.trim(), date: form.date, paymentMethod: form.paymentMethod })
      onClose()
    } catch { /* shown by the context */ } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Record ${line.name}`} subtitle={`Planned ${formatAmount(line.plannedAmount)} · spent ${formatAmount(line.actualAmount)}`} onClose={onClose}>
      {!range.max ? (
        <p className="text-xs dark:text-gray-300 text-slate-600" role="status">{periodLabel(period)} hasn't started yet, so nothing can be recorded for it.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4" noValidate>
          <Field label="Amount paid (₹)" error={errors.amount}>
            {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />}
          </Field>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Field label="Paid on" error={errors.date}>
              {(a) => <input {...a} className="input cursor-pointer" type="date" min={range.min} max={range.max} value={form.date} onChange={e => set('date', e.target.value)} />}
            </Field>
            <Field label="Paid from" error={errors.paymentMethod}>
              {(a) => (
                <select {...a} className="input cursor-pointer" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                  <option value="" disabled>Choose account</option>
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              )}
            </Field>
          </div>
          <p className="text-[11px] dark:text-gray-500 text-slate-400" data-testid="record-effect">
            Adds one {formatAmount(form.amount || 0)} expense to History{form.paymentMethod ? `, taken from ${form.paymentMethod}` : ''}{form.date ? ` on ${formatDate(form.date)}` : ''}.
            Only record money you have actually paid; if it is already in History, it is counted here automatically.
          </p>
          <div className="flex gap-3 pt-1">
            <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
            <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Record expense'}</button>
          </div>
        </form>
      )}
    </Modal>
  )
}
