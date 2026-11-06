import { useCallback, useEffect, useState } from 'react'
import { Plus, TrendingUp, ArrowDownCircle, ArrowUpCircle, History, Pencil, PauseCircle, PlayCircle, Trash2, Info } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import Modal from '../common/Modal'
import Field from './Field'
import { PAYMENT_METHODS, formatDate } from '../../utils/constants'
import { INVESTMENT_CATEGORIES, amountError, formatAmount, investmentCategoryLabel, periodLabel, todayInput } from '../../utils/planner'

const chip = 'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 transition-all'

function InvestmentForm({ investment, onSave, onClose }) {
  const [form, setForm] = useState({
    name: investment?.name || '',
    category: investment?.category || 'MUTUAL_FUND',
    monthlyPlannedAmount: investment ? String(investment.monthlyPlannedAmount) : '',
    note: investment?.note || '',
  })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    if (!form.name.trim()) next.name = 'Give it a name'
    if (form.monthlyPlannedAmount.trim()) {
      const amount = amountError(form.monthlyPlannedAmount, { label: 'Planned amount' })
      if (amount) next.monthlyPlannedAmount = amount
    }
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await onSave({ name: form.name.trim(), category: form.category, monthlyPlannedAmount: form.monthlyPlannedAmount.trim() || '0', note: form.note.trim() || null })
      onClose()
    } catch {
      // Message already shown.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={investment ? 'Edit investment' : 'New investment'} subtitle="For planning and tracking what you invest" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Name" error={errors.name}>
          {(a) => <input {...a} className="input" maxLength={50} placeholder="e.g. Nifty 50 Index Fund" value={form.name} onChange={e => set('name', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type">
            {(a) => (
              <select {...a} className="input cursor-pointer" value={form.category} onChange={e => set('category', e.target.value)}>
                {INVESTMENT_CATEGORIES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
              </select>
            )}
          </Field>
          <Field label="Planned monthly (₹)" error={errors.monthlyPlannedAmount}>
            {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" placeholder="0" value={form.monthlyPlannedAmount} onChange={e => set('monthlyPlannedAmount', e.target.value)} />}
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

function InvestmentTxForm({ investment, type, onClose }) {
  const { addInvestmentTx } = usePlanner()
  const redeeming = type === 'REDEEM'
  const [form, setForm] = useState({ amount: '', date: todayInput(), paymentMethod: redeeming ? 'Net Banking' : 'UPI', note: '' })
  const [errors, setErrors] = useState({})
  const [saving, setSaving] = useState(false)
  const set = (key, value) => setForm(prev => ({ ...prev, [key]: value }))

  const submit = async (e) => {
    e.preventDefault()
    const next = {}
    const amount = amountError(form.amount, { allowZero: false })
    if (amount) next.amount = amount
    if (!form.date) next.date = 'Choose a date'
    setErrors(next)
    if (Object.keys(next).length) return
    setSaving(true)
    try {
      await addInvestmentTx(investment.id, { type, amount: form.amount.trim(), date: form.date, paymentMethod: form.paymentMethod, note: form.note.trim() || null })
      onClose()
    } catch {
      // Message already shown.
    } finally {
      setSaving(false)
    }
  }

  return (
    <Modal title={redeeming ? `Redeem from ${investment.name}` : `Invest in ${investment.name}`} subtitle={investmentCategoryLabel(investment.category)} onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Amount (₹)" error={errors.amount}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0.01" step="0.01" value={form.amount} onChange={e => set('amount', e.target.value)} />}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Date" error={errors.date}>
            {(a) => <input {...a} className="input cursor-pointer" type="date" min="2000-01-01" max={todayInput()} value={form.date} onChange={e => set('date', e.target.value)} />}
          </Field>
          <Field label={redeeming ? 'Received in' : 'Paid from'}>
            {(a) => (
              <select {...a} className="input cursor-pointer" value={form.paymentMethod} onChange={e => set('paymentMethod', e.target.value)}>
                {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
              </select>
            )}
          </Field>
        </div>
        <Field label="Note (optional)">
          {(a) => <input {...a} className="input" maxLength={300} value={form.note} onChange={e => set('note', e.target.value)} />}
        </Field>
        <p className="text-[11px] dark:text-gray-500 text-slate-400">
          Adds one Investment {redeeming ? 'income' : 'transaction'} to History and {redeeming ? 'adds to' : 'takes from'} that account&apos;s balance.
          It counts as investment, not as {redeeming ? 'income' : 'spending'}, in your plan.
        </p>
        <div className="flex gap-3 pt-1">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" disabled={saving} className="btn-primary flex-1">{saving ? 'Saving…' : redeeming ? 'Record redemption' : 'Record investment'}</button>
        </div>
      </form>
    </Modal>
  )
}

function InvestmentHistory({ investment, onClose }) {
  const { getInvestmentTxs, deleteInvestmentTx } = usePlanner()
  const [rows, setRows] = useState(null)
  const [failed, setFailed] = useState(false)
  const [removing, setRemoving] = useState(null)

  const load = useCallback(() => getInvestmentTxs(investment.id).then(setRows).catch(() => setFailed(true)), [getInvestmentTxs, investment.id])
  useEffect(() => { load() }, [load])

  const confirmRemove = async () => {
    const row = removing
    setRemoving(null)
    try {
      await deleteInvestmentTx(row.id)
      await load()
    } catch { /* message shown */ }
  }

  return (
    <Modal title={`${investment.name}: history`} subtitle={`Invested in total ${formatAmount(investment.investedTotal)}`} onClose={onClose}>
      {failed ? <p role="alert" className="text-xs text-red-500">Could not load the history.</p>
        : rows === null ? <p className="text-xs dark:text-gray-400 text-slate-500">Loading…</p>
          : rows.length === 0 ? <p className="text-xs dark:text-gray-400 text-slate-500">No transactions yet.</p>
            : (
              <ul className="divide-y dark:divide-dark-border divide-light-border" data-testid="investment-history">
                {rows.map(r => (
                  <li key={r.id} className="py-2.5 flex items-center justify-between gap-3 text-sm">
                    <div className="min-w-0">
                      <p className="font-semibold dark:text-white text-slate-800">{r.type === 'REDEEM' ? 'Redeemed' : 'Invested'}</p>
                      <p className="text-[11px] dark:text-gray-400 text-slate-500 truncate">{formatDate(r.date)}{r.paymentMethod ? ` · ${r.paymentMethod}` : ''}{r.note ? ` · ${r.note}` : ''}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold tabular-nums dark:text-white text-slate-800">{r.type === 'REDEEM' ? '-' : '+'}{formatAmount(r.amount)}</span>
                      <button type="button" onClick={() => setRemoving(r)} aria-label={`Delete ${r.type === 'REDEEM' ? 'redemption' : 'investment'} of ${formatAmount(r.amount)}`}
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
        title="Delete this transaction?"
        message="It is removed from History and your account balance, as well as from this investment."
        confirmText="Delete"
        onConfirm={confirmRemove}
        onCancel={() => setRemoving(null)}
      />
    </Modal>
  )
}

function InvestmentCard({ investment, onAction }) {
  const pct = investment.thisMonthProgress
  return (
    <article className={`card p-4 ${investment.active ? '' : 'opacity-70'}`} data-testid="investment-card" aria-label={investment.name}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="font-bold text-sm dark:text-white text-slate-800 truncate">{investment.name}</h4>
          <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
            {investmentCategoryLabel(investment.category)} · {formatAmount(investment.monthlyPlannedAmount)} planned monthly{investment.active ? '' : ' · paused'}
          </p>
        </div>
        <p className="text-right flex-shrink-0">
          <span className="block font-black text-sm tabular-nums dark:text-white text-slate-800">{formatAmount(investment.investedTotal)}</span>
          <span className="block text-[11px] dark:text-gray-400 text-slate-500">{Number(investment.investedTotal) < 0 ? 'net taken out' : 'net invested'}</span>
        </p>
      </div>
      {investment.active && Number(investment.monthlyPlannedAmount) > 0 && (
        <>
          <div className="mt-3 h-1.5 rounded-full dark:bg-dark-border bg-slate-100 overflow-hidden" role="meter"
            aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.max(0, Math.min(pct ?? 0, 100))} aria-label={`${investment.name}: ${pct ?? 0}% of this month's plan`}>
            <div className="h-full rounded-full bg-sky-500" style={{ width: `${Math.max(0, Math.min(pct ?? 0, 100))}%` }} />
          </div>
          <p className="text-[11px] mt-1 dark:text-gray-400 text-slate-500">
            This month {formatAmount(investment.thisMonthAmount)} of {formatAmount(investment.monthlyPlannedAmount)}
          </p>
        </>
      )}
      <div className="flex flex-wrap justify-end gap-1.5 mt-3 pt-3 border-t dark:border-dark-border border-light-border">
        {investment.active && (
          <button type="button" onClick={() => onAction('buy', investment)} className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}><ArrowUpCircle size={12} /> Invest</button>
        )}
        <button type="button" onClick={() => onAction('redeem', investment)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`}><ArrowDownCircle size={12} /> Redeem</button>
        <button type="button" onClick={() => onAction('history', investment)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`History of ${investment.name}`}><History size={12} /> History</button>
        <button type="button" onClick={() => onAction('edit', investment)} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`} aria-label={`Edit ${investment.name}`}><Pencil size={12} /> Edit</button>
        <button type="button" onClick={() => onAction('toggle', investment)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`${investment.active ? 'Pause' : 'Resume'} ${investment.name}`}>
          {investment.active ? <><PauseCircle size={12} /> Pause</> : <><PlayCircle size={12} /> Resume</>}
        </button>
        <button type="button" onClick={() => onAction('delete', investment)} className={`${chip} bg-red-500/10 text-red-500`} aria-label={`Delete ${investment.name}`}><Trash2 size={12} /> Delete</button>
      </div>
    </article>
  )
}

export default function InvestmentsPanel() {
  const { investments, saveInvestment, setInvestmentActive, deleteInvestment, period } = usePlanner()
  const { plans, summary } = investments
  const [editing, setEditing] = useState(null)
  const [recording, setRecording] = useState(null)
  const [history, setHistory] = useState(null)
  const [deleting, setDeleting] = useState(null)

  const onAction = (action, investment) => {
    if (action === 'buy') setRecording({ investment, type: 'BUY' })
    else if (action === 'redeem') setRecording({ investment, type: 'REDEEM' })
    else if (action === 'history') setHistory(investment)
    else if (action === 'edit') setEditing(investment)
    else if (action === 'toggle') setInvestmentActive(investment.id, !investment.active).catch(() => {})
    else if (action === 'delete') setDeleting(investment)
  }

  const removeWith = async (deleteTransactions) => {
    const target = deleting
    setDeleting(null)
    await deleteInvestment(target.id, deleteTransactions).catch(() => {})
  }

  return (
    <div className="space-y-4">
      <div className="card p-4 space-y-3" data-testid="investments-summary">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">Invested in {periodLabel(period)}</p>
            <p className="text-2xl font-black dark:text-white text-slate-800 mt-0.5">{formatAmount(summary?.investedThisMonth ?? 0)}</p>
            <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
              of {formatAmount(summary?.plannedThisMonth ?? 0)} planned · {formatAmount(summary?.totalInvested ?? 0)} net invested overall
            </p>
          </div>
          <button type="button" onClick={() => setEditing({})} className="btn-primary flex items-center gap-1.5 text-xs whitespace-nowrap"><Plus size={14} /> New investment</button>
        </div>
        {summary && Number(summary.unlinkedThisMonth) !== 0 && (
          <p className="text-[11px] dark:text-gray-400 text-slate-500">
            Plus {formatAmount(summary.unlinkedThisMonth)} recorded in History under Investment without an investment here, for {formatAmount(summary.totalThisMonth)} in {periodLabel(period)}.
          </p>
        )}
        <p className="flex items-start gap-1.5 text-[11px] dark:text-gray-500 text-slate-400">
          <Info size={12} className="flex-shrink-0 mt-0.5" aria-hidden="true" />
          For planning and tracking only. Amounts are what you put in or took out; MoneySuivi doesn&apos;t buy or sell anything and doesn&apos;t estimate returns.
        </p>
      </div>

      {plans.length === 0 ? (
        <EmptyState icon={TrendingUp} title="No investments yet"
          description="Add what you invest in, such as gold, a mutual fund or stocks, with how much you plan to put in each month."
          actionLabel="Add an investment" onAction={() => setEditing({})} />
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {plans.map(p => <InvestmentCard key={p.id} investment={p} onAction={onAction} />)}
        </div>
      )}

      {editing && <InvestmentForm investment={editing.id ? editing : null} onSave={(values) => saveInvestment(editing.id, values)} onClose={() => setEditing(null)} />}
      {recording && <InvestmentTxForm investment={recording.investment} type={recording.type} onClose={() => setRecording(null)} />}
      {history && <InvestmentHistory investment={plans.find(p => p.id === history.id) || history} onClose={() => setHistory(null)} />}

      <ConfirmDialog
        open={Boolean(deleting) && deleting.transactionCount === 0}
        title="Delete this investment?"
        message={deleting ? `${deleting.name} is removed. It has no transactions, so History and balances don't change.` : ''}
        confirmText="Delete"
        onConfirm={() => removeWith(false)}
        onCancel={() => setDeleting(null)}
      />
      <ConfirmDialog
        open={Boolean(deleting) && deleting.transactionCount > 0}
        title="Delete with its transactions?"
        message={deleting ? `${deleting.name} has ${deleting.transactionCount} transaction${deleting.transactionCount === 1 ? '' : 's'}. Deleting removes them from History and your balances too. To keep them, pause it instead.` : ''}
        confirmText="Delete all"
        variant="critical"
        onConfirm={() => removeWith(true)}
        onCancel={() => setDeleting(null)}
      />
    </div>
  )
}
