import { useEffect, useState } from 'react'
import { AlertTriangle, Link2, Wallet, PlusCircle } from 'lucide-react'
import Modal from '../common/Modal'
import Field from './Field'
import { usePlanner } from '../../context/PlannerContext'
import { PAYMENT_METHODS, formatDate } from '../../utils/constants'
import { amountError, defaultReceivedDate, formatAmount, periodLabel, receivedDateRange, shiftPeriod } from '../../utils/planner'

const OPTIONS = [
  { value: 'link', icon: Link2, title: 'Link existing income', detail: 'It is already in History. Nothing new is added.' },
  { value: 'alreadyInBalance', icon: Wallet, title: 'Already in my balance', detail: 'Count it as received. No transaction is added.' },
  { value: 'create', icon: PlusCircle, title: 'Record new', detail: 'Adds one income transaction to History and your balance.' },
]

/**
 * Marks income as received. The user always picks how it is counted; nothing is preselected,
 * and "Record new" has no default account, so a salary already in History or already reflected
 * in the balance is never added a second time by accident.
 */
export default function ReceiveSalaryForm({ salary, period, onClose }) {
  const { receiveSalary, getLinkCandidates } = usePlanner()
  const [candidates, setCandidates] = useState(null)
  const [mode, setMode] = useState(null)
  const [linkId, setLinkId] = useState('')
  const [form, setForm] = useState({
    receivedAmount: String(salary.expectedAmount || ''),
    receivedAt: defaultReceivedDate(period, salary.payDay),
    paymentMethod: '',
  })
  const [errors, setErrors] = useState({})
  const [duplicates, setDuplicates] = useState(null)
  const [saving, setSaving] = useState(false)
  const range = receivedDateRange(period)
  const monthStarted = Boolean(range.max)
  const windowLabel = `${periodLabel(period)} or ${periodLabel(shiftPeriod(period, 1))}`

  useEffect(() => {
    let cancelled = false
    getLinkCandidates(salary.id)
      .then(list => !cancelled && setCandidates(list))
      .catch(() => !cancelled && setCandidates([]))
    return () => { cancelled = true }
  }, [salary.id, getLinkCandidates])

  const set = (key, value) => {
    setForm(prev => ({ ...prev, [key]: value }))
    setDuplicates(null)
  }
  const choose = (value) => {
    setMode(value)
    setErrors({})
    setDuplicates(null)
  }

  const submit = async (e, { confirmDuplicate = false } = {}) => {
    e?.preventDefault()
    const next = {}
    if (!mode) next.mode = 'Choose how this income should be counted'
    else if (mode === 'link') {
      if (!linkId) next.link = 'Choose the transaction to link'
    } else {
      const amount = amountError(form.receivedAmount, { allowZero: false, label: 'Received amount' })
      if (amount) next.receivedAmount = amount
      if (!form.receivedAt) next.receivedAt = 'Choose the date it arrived'
      else if (form.receivedAt < range.min || form.receivedAt > range.max) next.receivedAt = `Choose a date in ${windowLabel}, up to today`
      if (mode === 'create' && !form.paymentMethod) next.paymentMethod = 'Choose the account the money arrived in'
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      const values = mode === 'link'
        ? { mode, expenseId: linkId }
        : { mode, receivedAmount: form.receivedAmount.trim(), receivedAt: form.receivedAt, ...(mode === 'create' && { paymentMethod: form.paymentMethod, confirmDuplicate }) }
      await receiveSalary(salary.id, values)
      onClose()
    } catch (err) {
      if (err.code === 'POSSIBLE_DUPLICATE') setDuplicates(err.data?.candidates || [])
    } finally {
      setSaving(false)
    }
  }

  const linkInstead = (id) => {
    setMode('link')
    setLinkId(id)
    setDuplicates(null)
    setCandidates(list => (list?.some(c => c.id === id) ? list : [...(list || []), ...(duplicates || []).filter(d => d.id === id)]))
  }

  const hasCandidates = candidates && candidates.length > 0
  const needsDate = mode === 'alreadyInBalance' || mode === 'create'
  const submitLabel = { link: 'Link transaction', alreadyInBalance: 'Mark received', create: `Record ${formatAmount(form.receivedAmount || 0)}` }[mode] || 'Choose an option'

  return (
    <Modal title={`Mark ${salary.label} as received`} subtitle={`${periodLabel(period)} · expected ${formatAmount(salary.expectedAmount)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <fieldset>
          <legend className="label">How should this be counted?</legend>
          <div className="space-y-2" role="radiogroup" aria-label="How should this be counted?">
            {OPTIONS.map(({ value, icon: Icon, title, detail }) => {
              const count = value === 'link' && candidates ? ` (${candidates.length})` : ''
              const unavailable = value === 'link' && candidates !== null && candidates.length === 0
              return (
                <label key={value} className={`card p-3 flex items-start gap-3 ${unavailable ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'} ${mode === value ? 'ring-2 ring-sky-500' : ''}`}>
                  <input type="radio" name="receive-mode" className="mt-1 accent-sky-500" disabled={unavailable} checked={mode === value} onChange={() => choose(value)} aria-describedby={`mode-${value}`} />
                  <Icon size={16} className="mt-0.5 text-sky-500 flex-shrink-0" aria-hidden="true" />
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold dark:text-white text-slate-800">{title}{count}</span>
                    <span id={`mode-${value}`} className="block text-[11px] dark:text-gray-400 text-slate-500">{unavailable ? `No unlinked income in History for ${windowLabel}.` : detail}</span>
                  </span>
                </label>
              )
            })}
          </div>
          {errors.mode && <p role="alert" className="text-[11px] text-red-500 mt-1">{errors.mode}</p>}
          {mode !== 'link' && hasCandidates && (
            <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2" data-testid="history-hint">
              {candidates.length} unlinked income {candidates.length === 1 ? 'transaction is' : 'transactions are'} in History for {windowLabel}. If one is this salary, link it instead.
            </p>
          )}
        </fieldset>

        {mode === 'link' && (
          candidates === null ? (
            <p className="text-xs dark:text-gray-400 text-slate-500">Checking History for this income…</p>
          ) : !hasCandidates ? (
            <p className="text-xs dark:text-gray-300 text-slate-600" role="status">No unlinked income in History for {windowLabel}. Choose another option.</p>
          ) : (
            <fieldset>
              <legend className="label">Income in History, closest amount first</legend>
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
              <p className="text-[11px] dark:text-gray-500 text-slate-400 mt-2">Linking uses that transaction's amount and date. Your balance does not change.</p>
            </fieldset>
          )
        )}

        {needsDate && !monthStarted && (
          <p className="text-xs dark:text-gray-300 text-slate-600" role="status">
            {periodLabel(period)} hasn't started yet. Income for it can be marked received from the 1st of the month.
          </p>
        )}

        {needsDate && monthStarted && (
          <>
            <Field label="Amount received (₹)" error={errors.receivedAmount}>
              {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.receivedAmount} onChange={e => set('receivedAmount', e.target.value)} />}
            </Field>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Field label="Received on" error={errors.receivedAt} hint={`Any day in ${windowLabel}`}>
                {(a) => <input {...a} className="input cursor-pointer" type="date" min={range.min} max={range.max} value={form.receivedAt} onChange={e => set('receivedAt', e.target.value)} />}
              </Field>
              {mode === 'create' && (
                <Field label="Received in" error={errors.paymentMethod}>
                  {(a) => (
                    <select {...a} className="input cursor-pointer" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                      <option value="" disabled>Choose account</option>
                      {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                    </select>
                  )}
                </Field>
              )}
            </div>
            <p className="text-[11px] dark:text-gray-500 text-slate-400" data-testid="receive-effect">
              {mode === 'create'
                ? `Adds ${formatAmount(form.receivedAmount || 0)} to ${form.paymentMethod || 'the account you choose'}${form.receivedAt ? ` on ${formatDate(form.receivedAt)}` : ''}. It stays ${periodLabel(period)} income in the planner.`
                : 'Counts as received in the planner only. No transaction is added and your balance does not change.'}
            </p>
          </>
        )}

        {duplicates && (
          <div className="card p-3 border border-amber-500/40 space-y-2" role="alert" data-testid="possible-duplicate">
            <p className="flex items-start gap-2 text-xs font-semibold text-amber-600 dark:text-amber-400">
              <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
              This salary may already be in History. Recording it again would add it to your balance twice.
            </p>
            {duplicates.map(d => (
              <div key={d.id} className="flex items-center justify-between gap-2 text-xs dark:text-gray-300 text-slate-600">
                <span className="min-w-0 truncate">{d.title} · {formatDate(d.expenseDate)} · {formatAmount(d.amount)}</span>
                <button type="button" onClick={() => linkInstead(d.id)} className="text-sky-600 dark:text-sky-400 font-semibold flex-shrink-0">Link this</button>
              </div>
            ))}
            <button type="button" disabled={saving} onClick={() => submit(null, { confirmDuplicate: true })} className="text-[11px] font-semibold text-red-500 underline underline-offset-2">
              It is a different payment; record it anyway
            </button>
          </div>
        )}

        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !mode || (mode === 'link' && !hasCandidates) || (needsDate && !monthStarted) || Boolean(duplicates)} className="btn-primary flex-1">
            {saving ? 'Saving…' : submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  )
}
