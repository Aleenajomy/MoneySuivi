import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Receipt, CreditCard, CalendarClock, ExternalLink } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import Modal from '../common/Modal'
import Field from './Field'
import { formatDate } from '../../utils/constants'
import { amountError, formatAmount, periodLabel, todayInput } from '../../utils/planner'

const STATUS = {
  RECORDED: { label: 'Recorded', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  PAID: { label: 'Paid', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
  PARTIAL: { label: 'Part paid', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  SCHEDULED: { label: 'Scheduled', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  UPCOMING: { label: 'Upcoming', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  DUE_TODAY: { label: 'Due today', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  DUE: { label: 'Being added', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  OVERDUE: { label: 'Overdue', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  NOT_FOUND: { label: 'Not in History', className: 'bg-red-500/10 text-red-600 dark:text-red-400' },
  NO_DATE: { label: 'No due date', className: 'bg-slate-500/10 dark:text-gray-300 text-slate-600' },
}

const Status = ({ value }) => {
  const s = STATUS[value] || STATUS.NO_DATE
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md whitespace-nowrap ${s.className}`}>{s.label}</span>
}

const BILL_HINT = {
  RECORDED: 'Added to History',
  SCHEDULED: 'Added to History automatically on the day',
  DUE: 'Due; being added to History',
  NOT_FOUND: 'Should have been added, but no matching transaction is in History now (deleted or edited?)',
}

function FlexiblePayment({ emi, onClose }) {
  const { payEmi } = usePlanner()
  const [amount, setAmount] = useState(emi.expectedAmount ? String(emi.expectedAmount) : '')
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const submit = async (e) => {
    e.preventDefault()
    const message = amountError(amount, { allowZero: false })
    setError(message)
    if (message) return
    setSaving(true)
    try {
      await payEmi(emi.id, { amount: amount.trim(), paidAt: todayInput() })
      onClose()
    } catch { /* message shown */ } finally {
      setSaving(false)
    }
  }
  return (
    <Modal title={`Pay ${emi.title}`} subtitle="Recorded in Loans & EMIs, dated today" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Amount paid (₹)" error={error}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} />}
        </Field>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : 'Record payment'}</button>
        </div>
      </form>
    </Modal>
  )
}

export default function BillsPanel() {
  const navigate = useNavigate()
  const { bills, period, payEmi } = usePlanner()
  const [confirmFixed, setConfirmFixed] = useState(null)
  const [flexible, setFlexible] = useState(null)

  if (!bills) return null
  const { summary, upcoming } = bills
  const nothing = bills.bills.length === 0 && bills.emis.length === 0

  const pay = (emi) => (emi.type === 'FIXED' ? setConfirmFixed(emi) : setFlexible(emi))
  // The server marks the one row a payment would settle (the next unpaid fixed installment, or a
  // flexible EMI in the current month), so a payment never lands on a different installment.
  const canPay = (emi) => emi.payable

  return (
    <div className="space-y-5">
      <div className="card p-4 space-y-2" data-testid="bills-summary">
        <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">Bills &amp; EMIs in {periodLabel(period)}</p>
        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-[11px] dark:text-gray-400 text-slate-500">Expected</p><p className="font-black dark:text-white text-slate-800">{formatAmount(summary.expected)}</p></div>
          <div><p className="text-[11px] dark:text-gray-400 text-slate-500">Paid</p><p className="font-black text-secondary">{formatAmount(summary.settled)}</p></div>
          <div><p className="text-[11px] dark:text-gray-400 text-slate-500">Still to pay</p><p className="font-black dark:text-white text-slate-800">{formatAmount(summary.pending)}</p></div>
        </div>
        {summary.overdueCount > 0 && <p className="text-xs font-semibold text-red-500" role="status">{summary.overdueCount} overdue</p>}
      </div>

      {upcoming.length > 0 && (
        <section aria-labelledby="upcoming-title" className="space-y-2">
          <h3 id="upcoming-title" className="text-sm font-bold dark:text-white text-slate-800 flex items-center gap-1.5"><CalendarClock size={15} className="text-sky-500" /> Next 30 days</h3>
          <ul className="card divide-y dark:divide-dark-border divide-light-border" data-testid="upcoming-list">
            {upcoming.map(u => (
              <li key={u.id} className="p-3 flex items-center justify-between gap-3 text-sm">
                <div className="min-w-0 flex items-center gap-2">
                  {u.source === 'EMI' ? <CreditCard size={14} className="text-violet-500 flex-shrink-0" aria-label="EMI" /> : <Receipt size={14} className="text-orange-500 flex-shrink-0" aria-label="Bill" />}
                  <span className="min-w-0">
                    <span className="block font-semibold dark:text-white text-slate-800 truncate">{u.title}</span>
                    <span className="block text-[11px] dark:text-gray-400 text-slate-500">{formatDate(u.dueDate)}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {u.amount != null && <span className="font-bold tabular-nums dark:text-white text-slate-800">{formatAmount(u.amount)}</span>}
                  <Status value={u.status} />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {nothing ? (
        <EmptyState icon={Receipt} title={`No bills or EMIs in ${periodLabel(period)}`}
          description="Bills come from your recurring payments and EMIs from Loans & EMIs. Add a recurring expense (rent, internet, subscriptions) and it shows up here."
          actionLabel="Add a recurring payment" onAction={() => navigate('/add')} />
      ) : (
        <>
          <section aria-labelledby="recurring-title" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="recurring-title" className="text-sm font-bold dark:text-white text-slate-800">Recurring bills</h3>
              <button type="button" onClick={() => navigate('/recurring')} className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">Manage <ExternalLink size={11} /></button>
            </div>
            {bills.bills.length === 0 ? <p className="text-xs dark:text-gray-500 text-slate-400">No recurring bills fall in this month.</p> : (
              <ul className="space-y-2">
                {bills.bills.map(b => (
                  <li key={b.id} className="card p-3.5" data-testid="bill-item" aria-label={b.title}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{b.title}</p>
                        <p className="text-[11px] dark:text-gray-400 text-slate-500">{formatDate(b.dueDate)} · {b.category}{b.paymentMethod ? ` · ${b.paymentMethod}` : ''} · {b.recurringType === 'weekly' ? 'Weekly' : 'Monthly'}</p>
                      </div>
                      <p className="font-bold text-sm tabular-nums dark:text-white text-slate-800 flex-shrink-0">{formatAmount(b.amount)}</p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <span className="text-[11px] dark:text-gray-400 text-slate-500">{BILL_HINT[b.status]}</span>
                      <Status value={b.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section aria-labelledby="emi-title" className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <h3 id="emi-title" className="text-sm font-bold dark:text-white text-slate-800">EMIs</h3>
              <button type="button" onClick={() => navigate('/emis')} className="text-xs font-semibold text-sky-600 dark:text-sky-400 flex items-center gap-1">Loans &amp; EMIs <ExternalLink size={11} /></button>
            </div>
            {bills.emis.length === 0 ? <p className="text-xs dark:text-gray-500 text-slate-400">No EMI falls due in this month.</p> : (
              <ul className="space-y-2">
                {bills.emis.map(e => (
                  <li key={e.id} className="card p-3.5" data-testid="emi-item" aria-label={e.title}>
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{e.title}</p>
                        <p className="text-[11px] dark:text-gray-400 text-slate-500">
                          {e.dueDate ? `Due ${formatDate(e.dueDate)}` : 'No due date'}
                          {e.remainingInstallments != null ? ` · ${e.remainingInstallments} left` : ''}
                        </p>
                      </div>
                      <p className="text-right flex-shrink-0">
                        <span className="block font-bold text-sm tabular-nums dark:text-white text-slate-800">{e.expectedAmount != null ? formatAmount(e.expectedAmount) : '—'}</span>
                        {Number(e.paidThisMonth) > 0 && <span className="block text-[11px] text-secondary">Paid {formatAmount(e.paidThisMonth)}</span>}
                      </p>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2">
                      <Status value={e.status} />
                      {canPay(e) && (
                        <button type="button" onClick={() => pay(e)} className="text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 active:scale-95">
                          {e.type === 'FIXED' ? 'Pay installment' : 'Record payment'}
                        </button>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <p className="text-[11px] dark:text-gray-500 text-slate-400">
        Nothing here is a separate copy: bills are your recurring payments and EMIs are your Loans &amp; EMIs. EMI payments count as spending in your plan.
      </p>

      <ConfirmDialog
        open={Boolean(confirmFixed)}
        title="Record this installment?"
        message={confirmFixed ? `Records a ${formatAmount(confirmFixed.expectedAmount)} payment for ${confirmFixed.title} in Loans & EMIs, dated today.` : ''}
        confirmText="Record installment"
        variant="warning"
        onConfirm={async () => { const e = confirmFixed; setConfirmFixed(null); await payEmi(e.id, { paidAt: todayInput() }).catch(() => {}) }}
        onCancel={() => setConfirmFixed(null)}
      />
      {flexible && <FlexiblePayment emi={flexible} onClose={() => setFlexible(null)} />}
    </div>
  )
}
