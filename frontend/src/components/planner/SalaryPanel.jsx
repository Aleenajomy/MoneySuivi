import { useState } from 'react'
import { Plus, Pencil, Trash2, CheckCircle2, Undo2, PauseCircle, PlayCircle, Wallet, History } from 'lucide-react'
import { usePlanner } from '../../context/PlannerContext'
import ConfirmDialog from '../ConfirmDialog'
import EmptyState from '../common/EmptyState'
import Modal from '../common/Modal'
import Field from './Field'
import IncomeSourceForm from './IncomeSourceForm'
import ReceiveSalaryForm from './ReceiveSalaryForm'
import { formatDate } from '../../utils/constants'
import { amountError, formatAmount, incomeKindLabel, periodLabel } from '../../utils/planner'

const STATUS = {
  PENDING: { label: 'Pending', className: 'bg-amber-500/10 text-amber-600 dark:text-amber-400' },
  PARTIAL: { label: 'Partly received', className: 'bg-sky-500/10 text-sky-600 dark:text-sky-400' },
  RECEIVED: { label: 'Received', className: 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400' },
}

const chip = 'flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg active:scale-95 transition-all'

function ExpectedAmountForm({ salary, onSave, onClose }) {
  const [value, setValue] = useState(String(salary.expectedAmount))
  const [error, setError] = useState('')
  const submit = async (e) => {
    e.preventDefault()
    const message = amountError(value, { label: 'Expected amount' })
    setError(message)
    if (message) return
    try {
      await onSave({ expectedAmount: value.trim() })
      onClose()
    } catch { /* message shown by the context */ }
  }
  return (
    <Modal title={`Expected ${salary.label}`} subtitle="Changes this month only" onClose={onClose}>
      <form onSubmit={submit} className="space-y-4" noValidate>
        <Field label="Expected amount (₹)" error={error}>
          {(a) => <input {...a} className="input" type="number" inputMode="decimal" min="0" step="0.01" value={value} onChange={e => setValue(e.target.value)} />}
        </Field>
        <div className="flex gap-3">
          <button type="button" onClick={onClose} className="btn-secondary flex-1">Cancel</button>
          <button type="submit" className="btn-primary flex-1">Save</button>
        </div>
      </form>
    </Modal>
  )
}

function SalaryHistory() {
  const { getSalaryHistory } = usePlanner()
  const [history, setHistory] = useState(null)
  const [loading, setLoading] = useState(false)
  const [failed, setFailed] = useState(false)

  const load = async () => {
    setLoading(true)
    setFailed(false)
    try {
      setHistory(await getSalaryHistory(6))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }

  return (
    <section className="space-y-2" aria-labelledby="salary-history-title">
      <div className="flex items-center justify-between">
        <h3 id="salary-history-title" className="text-sm font-bold dark:text-white text-slate-800">Income history</h3>
        <button type="button" onClick={load} disabled={loading} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`}>
          <History size={13} /> {loading ? 'Loading…' : history ? 'Refresh' : 'Show last 6 months'}
        </button>
      </div>
      {failed && <p role="alert" className="text-xs text-red-500">Could not load history. Try again.</p>}
      {history && history.length === 0 && <p className="text-xs dark:text-gray-500 text-slate-400">No income recorded in the last 6 months.</p>}
      {history && history.length > 0 && (
        <div className="card overflow-hidden">
          <table className="w-full text-xs" data-testid="salary-history">
            <thead className="dark:text-gray-500 text-slate-400 text-left">
              <tr><th scope="col" className="p-3 font-semibold">Month</th><th scope="col" className="p-3 font-semibold text-right">Expected</th><th scope="col" className="p-3 font-semibold text-right">Received</th></tr>
            </thead>
            <tbody className="dark:text-gray-300 text-slate-600">
              {history.map(h => (
                <tr key={`${h.year}-${h.month}`} className="border-t dark:border-dark-border border-light-border">
                  <th scope="row" className="p-3 font-medium text-left">{periodLabel(h)}</th>
                  <td className="p-3 text-right tabular-nums">{formatAmount(h.expectedAmount)}</td>
                  <td className="p-3 text-right tabular-nums font-semibold">{formatAmount(h.receivedAmount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

export default function SalaryPanel() {
  const {
    period, month, incomeSources, saveIncomeSource, setSourceActive, deleteIncomeSource,
    addOneOffIncome, updateSalary, undoSalary, deleteSalary,
  } = usePlanner()
  const [sourceForm, setSourceForm] = useState(null)
  const [oneOff, setOneOff] = useState(false)
  const [receiving, setReceiving] = useState(null)
  const [editingExpected, setEditingExpected] = useState(null)
  const [undoing, setUndoing] = useState(null)
  const [alsoDelete, setAlsoDelete] = useState(false)
  const [removingSalary, setRemovingSalary] = useState(null)
  const [removingSource, setRemovingSource] = useState(null)

  const confirmUndo = async () => {
    const target = undoing
    setUndoing(null)
    await undoSalary(target.id, alsoDelete).catch(() => {})
    setAlsoDelete(false)
  }

  return (
    <div className="space-y-6">
      <section className="space-y-2.5" aria-labelledby="month-income-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="month-income-title" className="text-sm font-bold dark:text-white text-slate-800">Earned in {periodLabel(period)}</h3>
          <button type="button" onClick={() => setOneOff(true)} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`}>
            <Plus size={13} /> One-off income
          </button>
        </div>

        {month.salaries.length === 0 ? (
          <EmptyState icon={Wallet} title="No income expected this month"
            description={incomeSources.length ? 'Your sources were added after this month, or are paused. Add a one-off income for this month instead.' : 'Add your salary and any allowances, bonuses or other income you expect each month.'}
            actionLabel={incomeSources.length ? 'Add one-off income' : 'Add salary'}
            onAction={() => (incomeSources.length ? setOneOff(true) : setSourceForm({}))} />
        ) : month.salaries.map(s => {
          const status = STATUS[s.status]
          return (
            <article key={s.id} className="card p-4" data-testid="salary-record" aria-label={s.label}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{s.label}</p>
                  <p className="text-[11px] dark:text-gray-400 text-slate-500 mt-0.5">
                    {incomeKindLabel(s.kind)}{s.payDay ? ` · pay day ${s.payDay}` : ''}
                    {s.receivedAt ? ` · received ${formatDate(s.receivedAt)}` : ''}
                    {s.receivedVia === 'ALREADY_IN_BALANCE' ? ' · already in balance, no transaction' : s.transaction ? ` · ${s.transaction.paymentMethod}` : ''}
                  </p>
                </div>
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md flex-shrink-0 ${status.className}`}>{status.label}</span>
              </div>
              <div className="flex items-end justify-between gap-3 mt-2">
                <div className="text-xs dark:text-gray-400 text-slate-500">
                  Expected <span className="font-bold dark:text-gray-200 text-slate-700 tabular-nums">{formatAmount(s.expectedAmount)}</span>
                  {s.status !== 'PENDING' && <> · Received <span className="font-bold text-secondary tabular-nums">{formatAmount(s.receivedAmount)}</span></>}
                </div>
              </div>
              <div className="flex flex-wrap items-center justify-end gap-1.5 mt-3 pt-3 border-t dark:border-dark-border border-light-border">
                {s.status === 'PENDING' ? (
                  <>
                    <button type="button" onClick={() => setEditingExpected(s)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`} aria-label={`Edit expected amount for ${s.label}`}>
                      <Pencil size={12} /> Expected
                    </button>
                    <button type="button" onClick={() => setRemovingSalary(s)} className={`${chip} bg-red-500/10 text-red-500`} aria-label={`Remove ${s.label} from this month`}>
                      <Trash2 size={12} /> Remove
                    </button>
                    <button type="button" onClick={() => setReceiving(s)} className={`${chip} bg-emerald-500/10 text-emerald-600 dark:text-emerald-400`}>
                      <CheckCircle2 size={12} /> Mark received
                    </button>
                  </>
                ) : (
                  <button type="button" onClick={() => setUndoing(s)} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`}>
                    <Undo2 size={12} /> Undo received
                  </button>
                )}
              </div>
            </article>
          )
        })}
      </section>

      <section className="space-y-2.5" aria-labelledby="sources-title">
        <div className="flex items-center justify-between gap-3">
          <h3 id="sources-title" className="text-sm font-bold dark:text-white text-slate-800">Income sources</h3>
          <button type="button" onClick={() => setSourceForm({})} className={`${chip} gradient-blue text-white`}>
            <Plus size={13} /> Add source
          </button>
        </div>
        {incomeSources.length === 0 ? (
          <p className="text-xs dark:text-gray-500 text-slate-400">No sources yet. A source is income you expect every month, such as your salary or an allowance.</p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {incomeSources.map(src => (
              <article key={src.id} className={`card p-3.5 ${src.active ? '' : 'opacity-70'}`} data-testid="income-source" aria-label={src.name}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{src.name}</p>
                    <p className="text-[11px] dark:text-gray-400 text-slate-500">
                      {incomeKindLabel(src.kind)}{src.payDay ? ` · day ${src.payDay}` : ''}{src.active ? '' : ' · paused'}
                    </p>
                  </div>
                  <p className="font-black text-sm tabular-nums dark:text-white text-slate-800">{formatAmount(src.expectedAmount)}</p>
                </div>
                <div className="flex justify-end gap-1.5 mt-3">
                  <button type="button" onClick={() => setSourceActive(src.id, !src.active).catch(() => {})} className={`${chip} bg-slate-500/10 dark:text-gray-300 text-slate-600`}>
                    {src.active ? <><PauseCircle size={12} /> Pause</> : <><PlayCircle size={12} /> Resume</>}
                  </button>
                  <button type="button" onClick={() => setSourceForm(src)} className={`${chip} bg-sky-500/10 text-sky-600 dark:text-sky-400`} aria-label={`Edit ${src.name}`}>
                    <Pencil size={12} /> Edit
                  </button>
                  <button type="button" onClick={() => setRemovingSource(src)} className={`${chip} bg-red-500/10 text-red-500`} aria-label={`Delete ${src.name}`}>
                    <Trash2 size={12} /> Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      <SalaryHistory />

      {sourceForm && (
        <IncomeSourceForm source={sourceForm.id ? sourceForm : null} onSave={(values) => saveIncomeSource(sourceForm.id, values)} onClose={() => setSourceForm(null)} />
      )}
      {oneOff && <IncomeSourceForm oneOff onSave={addOneOffIncome} onClose={() => setOneOff(false)} />}
      {receiving && <ReceiveSalaryForm salary={receiving} period={period} onClose={() => setReceiving(null)} />}
      {editingExpected && (
        <ExpectedAmountForm salary={editingExpected} onSave={(values) => updateSalary(editingExpected.id, values)} onClose={() => setEditingExpected(null)} />
      )}

      <ConfirmDialog
        open={Boolean(undoing)}
        title="Mark as not received?"
        message={undoing ? `${undoing.label} goes back to pending.${undoing.expenseId ? '' : ' No transaction is involved, so your balance does not change.'}` : ''}
        confirmText="Undo"
        variant="warning"
        onConfirm={confirmUndo}
        onCancel={() => { setUndoing(null); setAlsoDelete(false) }}
      >
        {undoing?.expenseId && (
          <label className="flex items-start gap-2 mt-4 text-xs dark:text-gray-300 text-slate-600 cursor-pointer">
            <input type="checkbox" className="mt-0.5 accent-red-500" checked={alsoDelete} onChange={e => setAlsoDelete(e.target.checked)} />
            <span>Also delete the {formatAmount(undoing.receivedAmount)} income transaction from History. This lowers your balance by that amount. Leave this off if the money really arrived and you only linked the wrong record.</span>
          </label>
        )}
      </ConfirmDialog>
      <ConfirmDialog
        open={Boolean(removingSalary)}
        title="Remove from this month?"
        message={removingSalary ? `${removingSalary.label} will no longer be expected in ${periodLabel(period)}. The income source and other months stay as they are.` : ''}
        confirmText="Remove"
        onConfirm={async () => { const t = removingSalary; setRemovingSalary(null); await deleteSalary(t.id).catch(() => {}) }}
        onCancel={() => setRemovingSalary(null)}
      />
      <ConfirmDialog
        open={Boolean(removingSource)}
        title="Delete this income source?"
        message={removingSource ? `${removingSource.name} stops being expected from this month. Income you already received stays in your history and transactions.` : ''}
        confirmText="Delete"
        onConfirm={async () => { const t = removingSource; setRemovingSource(null); await deleteIncomeSource(t.id).catch(() => {}) }}
        onCancel={() => setRemovingSource(null)}
      />
    </div>
  )
}
