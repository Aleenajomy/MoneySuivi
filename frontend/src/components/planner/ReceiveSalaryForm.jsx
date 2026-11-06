import { useEffect, useState } from 'react'
import Modal from '../common/Modal'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { PAYMENT_METHODS, formatDate } from '../../utils/constants'
import { amountError, defaultReceivedDate, formatAmount, periodLabel, receivedDateRange } from '../../utils/planner'

/**
 * Records income as received. If a matching income transaction is already in History the user
 * links it instead of creating a second one, which is why matches are offered first.
 */
export default function ReceiveSalaryForm({ salary, period, onClose }) {
  const { receiveSalary, getLinkCandidates } = usePlanner()
  const [candidates, setCandidates] = useState(null)
  const [mode, setMode] = useState('create')
  const [linkId, setLinkId] = useState('')
  const [form, setForm] = useState({
    receivedAmount: String(salary.expectedAmount || ''),
    receivedAt: defaultReceivedDate(period, salary.payDay),
    paymentMethod: 'Net Banking',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const range = receivedDateRange(period)
  const monthStarted = Boolean(range.max)

  useEffect(() => {
    let cancelled = false
    getLinkCandidates(salary.id)
      .then((list) => {
        if (cancelled) return
        setCandidates(list)
        const match = list.find(c => c.matchesExpected)
        if (match) { setMode('link'); setLinkId(match.id) }
      })
      .catch(() => !cancelled && setCandidates([]))
    return () => { cancelled = true }
  }, [salary.id, getLinkCandidates])

  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (mode === 'link') {
      if (!linkId) next.link = 'Choose the transaction to link'
    } else {
      const amount = amountError(form.receivedAmount, { allowZero: false, label: 'Received amount' })
      if (amount) next.receivedAmount = amount
      if (!form.receivedAt) next.receivedAt = 'Choose the date it arrived'
      else if (form.receivedAt < range.min || form.receivedAt > range.max) next.receivedAt = `Choose a date in ${periodLabel(period)}, up to today`
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await receiveSalary(salary.id, mode === 'link'
        ? { mode: 'link', expenseId: linkId }
        : { mode: 'create', receivedAmount: form.receivedAmount.trim(), receivedAt: form.receivedAt, paymentMethod: form.paymentMethod })
      onClose()
    } catch {
      // Message already shown (e.g. it was already recorded from another device).
    } finally {
      setSaving(false)
    }
  }

  const hasCandidates = candidates && candidates.length > 0
  const tab = (value, label) => (
    <button type="button" role="tab" aria-selected={mode === value} onClick={() => setMode(value)}
      className={`flex-1 py-2 rounded-lg text-xs font-bold transition-all ${mode === value ? 'bg-white dark:bg-dark-card shadow-sm dark:text-white text-slate-800' : 'dark:text-gray-400 text-slate-500'}`}>
      {label}
    </button>
  )

  return (
    <Modal title={`Mark ${salary.label} as received`} subtitle={`Expected ${formatAmount(salary.expectedAmount)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {candidates === null ? (
          <p className="text-xs dark:text-gray-400 text-slate-500">Checking History for this income…</p>
        ) : hasCandidates && (
          <div role="tablist" aria-label="How to record it" className="flex gap-1 p-1 rounded-xl dark:bg-dark-bg bg-slate-100">
            {tab('link', 'Already in History')}
            {tab('create', 'Record new')}
          </div>
        )}

        {mode === 'link' && hasCandidates ? (
          <fieldset>
            <legend className="label">Income transactions not linked yet</legend>
            <div className="space-y-2">
              {candidates.map(c => (
                <label key={c.id} className={`card p-3 flex items-center gap-3 cursor-pointer ${linkId === c.id ? 'ring-2 ring-sky-500' : ''}`}>
                  <input type="radio" name="link" className="accent-sky-500" checked={linkId === c.id} onChange={() => setLinkId(c.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold dark:text-white text-slate-800 truncate">{c.title}</span>
                    <span className="block text-[11px] dark:text-gray-400 text-slate-500">{formatDate(c.expenseDate)} · {c.category}{c.matchesExpected ? ' · matches expected' : ''}</span>
                  </span>
                  <span className="text-sm font-bold tabular-nums text-secondary">{formatAmount(c.amount)}</span>
                </label>
              ))}
            </div>
            {errors.link && <p role="alert" className="text-[11px] text-red-500 mt-1">{errors.link}</p>}
            <p className="text-[11px] dark:text-gray-500 text-slate-400 mt-2">Only income dated in {periodLabel(period)} is listed. Linking uses that transaction's amount and date; no new transaction is added.</p>
          </fieldset>
        ) : !monthStarted ? (
          <p className="text-xs dark:text-gray-300 text-slate-600" role="status">
            {periodLabel(period)} hasn't started yet. Income for it can be recorded from the 1st of the month.
          </p>
        ) : (
          <>
            <Field label="Amount received (₹)" error={errors.receivedAmount}>
              {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.receivedAmount} onChange={e => set('receivedAmount', e.target.value)} />}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Received on" error={errors.receivedAt}>
                {(a) => <input {...a} className="input cursor-pointer" type="date" min={range.min} max={range.max} value={form.receivedAt} onChange={e => set('receivedAt', e.target.value)} />}
              </Field>
              <Field label="Received in">
                {(a) => (
                  <select {...a} className="input cursor-pointer" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                    {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                  </select>
                )}
              </Field>
            </div>
            <p className="text-[11px] dark:text-gray-500 text-slate-400">This adds one income transaction to History and your balances.</p>
          </>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || candidates === null || (mode === 'create' && !monthStarted)} className="btn-primary flex-1">
            {saving ? 'Saving…' : mode === 'link' ? 'Link transaction' : 'Mark received'}
          </button>
        </div>
      </form>
    </Modal>
  )
}
