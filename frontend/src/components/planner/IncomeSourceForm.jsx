import { useState } from 'react'
import Modal from '../common/Modal'
import Field from './Field'
import { INCOME_KINDS, amountError } from '../../utils/planner'

const toForm = (source) => ({
  name: source?.name || '',
  kind: source?.kind || 'SALARY',
  expectedAmount: source ? String(source.expectedAmount) : '',
  payDay: source?.payDay ? String(source.payDay) : '',
})

// Also used for a one-off income in a single month (`oneOff`): no pay day, saved for that month only.
export default function IncomeSourceForm({ source, oneOff = false, onSave, onClose }) {
  const [form, setForm] = useState(() => toForm(source))
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const validate = () => {
    const next = {}
    const name = form.name.trim()
    if (!name) next.name = 'Name is required'
    else if (name.length > 50) next.name = 'Keep the name under 50 characters'
    const amount = amountError(form.expectedAmount, { label: 'Expected amount' })
    if (amount) next.expectedAmount = amount
    if (form.payDay && !(/^\d+$/.test(form.payDay) && Number(form.payDay) >= 1 && Number(form.payDay) <= 31)) {
      next.payDay = 'Pay day must be between 1 and 31'
    }
    setErrors(next)
    return Object.keys(next).length === 0
  }

  const submit = async (e) => {
    e.preventDefault()
    if (!validate()) return
    setSaving(true)
    try {
      const values = oneOff
        ? { label: form.name.trim(), kind: form.kind, expectedAmount: form.expectedAmount.trim() }
        : { name: form.name.trim(), kind: form.kind, expectedAmount: form.expectedAmount.trim(), payDay: form.payDay ? Number(form.payDay) : null }
      await onSave(values)
      onClose()
    } catch {
      // Message already shown; keep the form open.
    } finally {
      setSaving(false)
    }
  }

  const title = oneOff ? 'Add one-off income' : source ? 'Edit income source' : 'Add income source'
  const subtitle = oneOff ? 'Expected this month only' : 'Expected every month until you pause it'

  return (
    <Modal title={title} subtitle={subtitle} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Type">
          {(a) => (
            <select {...a} className="input cursor-pointer" value={form.kind} onChange={e => set('kind', e.target.value)}>
              {INCOME_KINDS.map(k => <option key={k.value} value={k.value}>{k.label}</option>)}
            </select>
          )}
        </Field>
        <Field label="Name" error={errors.name}>
          {(a) => <input {...a} className="input" maxLength={50} placeholder="e.g. Salary from Acme" value={form.name} onChange={e => set('name', e.target.value)} />}
        </Field>
        <Field label={oneOff ? 'Expected amount (₹)' : 'Expected monthly amount (₹)'} error={errors.expectedAmount}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="e.g. 15000" value={form.expectedAmount} onChange={e => set('expectedAmount', e.target.value)} />}
        </Field>
        {!oneOff && (
          <Field label="Pay day (optional)" error={errors.payDay} hint="Day of the month it usually arrives; the 31st means the last day">
            {(a) => <input {...a} className="input" type="number" inputMode="numeric" min="1" max="31" step="1" placeholder="e.g. 1" value={form.payDay} onChange={e => set('payDay', e.target.value)} />}
          </Field>
        )}
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Save'}</button>
        </div>
      </form>
    </Modal>
  )
}
