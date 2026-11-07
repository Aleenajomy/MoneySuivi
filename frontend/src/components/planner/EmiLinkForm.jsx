import { useEffect, useState } from 'react'
import Modal from '../common/Modal'
import { usePlanner } from '../../context/PlannerContext'
import { formatDate } from '../../utils/constants'
import { formatAmount } from '../../utils/planner'

/**
 * The user confirms which History expense is the same money as an EMI-tracker payment. Nothing is
 * matched automatically; the server re-checks the amount and date before storing the link.
 */
export default function EmiLinkForm({ payment, onClose }) {
  const { getEmiCandidates, linkEmiPayment } = usePlanner()
  const [candidates, setCandidates] = useState(null)
  const [selected, setSelected] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    let cancelled = false
    getEmiCandidates(payment.id)
      .then(list => !cancelled && setCandidates(list))
      .catch(() => !cancelled && setCandidates([]))
    return () => { cancelled = true }
  }, [payment.id, getEmiCandidates])

  const linkable = (candidates || []).filter(c => c.sameAmount)
  const submit = async (e) => {
    e.preventDefault()
    if (!selected) return
    setSaving(true)
    try {
      await linkEmiPayment(payment.id, selected)
      onClose()
    } catch { /* shown by the context */ } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={`Is ${payment.title} already in History?`} subtitle={`EMI payment of ${formatAmount(payment.amount)} on ${formatDate(payment.paidAt)}`} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        {candidates === null ? (
          <p className="text-xs dark:text-gray-400 text-slate-500">Looking for matching expenses…</p>
        ) : linkable.length === 0 ? (
          <p className="text-xs dark:text-gray-300 text-slate-600" role="status">
            No unlinked expense of {formatAmount(payment.amount)} within a month of this payment. Nothing needs linking.
          </p>
        ) : (
          <fieldset>
            <legend className="label">Pick the expense that is this EMI payment</legend>
            <div className="space-y-2">
              {linkable.map(c => (
                <label key={c.id} className={`card p-3 flex items-center gap-3 cursor-pointer ${selected === c.id ? 'ring-2 ring-sky-500' : ''}`}>
                  <input type="radio" name="emi-link" className="accent-sky-500" checked={selected === c.id} onChange={() => setSelected(c.id)} />
                  <span className="flex-1 min-w-0">
                    <span className="block text-sm font-semibold dark:text-white text-slate-800 truncate">{c.title}</span>
                    <span className="block text-[11px] dark:text-gray-400 text-slate-500">
                      {formatDate(c.date)} · {c.category}{c.paymentMethod ? ` · ${c.paymentMethod}` : ''} · {c.daysApart === 0 ? 'same day' : `${c.daysApart} day${c.daysApart === 1 ? '' : 's'} apart`}
                    </span>
                  </span>
                  <span className="text-sm font-bold tabular-nums dark:text-white text-slate-800">{formatAmount(c.amount)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
        <p className="text-[11px] dark:text-gray-500 text-slate-400">
          Linking tells the planner these are one payment, so it is counted once. No transaction, EMI or balance is changed, and you can unlink at any time.
          Only link an expense you know is this EMI.
        </p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving || !selected} className="btn-primary flex-1">{saving ? 'Saving…' : 'Link as same payment'}</button>
        </div>
      </form>
    </Modal>
  )
}
