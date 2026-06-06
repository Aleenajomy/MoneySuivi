import { useEffect, useState } from 'react'
import { CheckCircle, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useEMI } from '../context/EMIContext'
import { formatCurrency, formatShortDate } from '../utils/constants'

const todayStr = new Date().toISOString().split('T')[0]
const empty = { title: '', totalAmount: '', emiAmount: '', totalInstallments: '', startDate: todayStr, paidInstallments: '0', note: '' }

// Always compute next due from startDate + paidInstallments + 1 month
const getNextDue = (startDate, paidInstallments) => {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + paidInstallments + 1)
  return d
}

export default function EMITracker() {
  const { emis, loading, fetchEMIs, addEMI, updateEMI, payInstallment, deleteEMI } = useEMI()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchEMIs() }, [fetchEMIs])

  const set = k => e => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const openEdit = (emi) => {
    setEditId(emi.id)
    setForm({
      title: emi.title,
      totalAmount: String(emi.totalAmount),
      emiAmount: String(emi.emiAmount),
      totalInstallments: String(emi.totalInstallments),
      paidInstallments: String(emi.paidInstallments),
      startDate: emi.startDate.slice(0, 10),
      note: emi.note || '',
    })
    setShowForm(true)
    window.scrollTo({ top: 0, behavior: 'smooth' })
  }

  const closeForm = () => {
    setShowForm(false)
    setEditId(null)
    setForm(empty)
    setSaving(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      if (editId) await updateEMI(editId, form)
      else await addEMI(form)
      closeForm()
    } catch {}
    finally { setSaving(false) }
  }

  const active = emis.filter(e => e.active)
  const completed = emis.filter(e => !e.active)

  return (
    <div className="page">
      <div className="card p-3 mb-4 flex gap-2.5 items-start bg-sky-500/5 border border-sky-500/20">
        <span className="text-sky-500 mt-0.5">💡</span>
        <div>
          <p className="text-xs font-semibold text-sky-500 mb-0.5">When to use EMI Tracker?</p>
          <p className="text-[11px] dark:text-gray-400 text-gray-500">Use for <span className="font-semibold">loan repayments</span> with a fixed tenure (phone, bike, home loan). Mark each installment paid manually.</p>
          <p className="text-[11px] dark:text-gray-500 text-gray-400 mt-1">For auto-repeating bills (rent, Netflix), use <span className="font-semibold">Recurring</span> in Add Transaction.</p>
        </div>
      </div>

      <div className="flex items-center justify-between mb-5 pr-12">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">EMI Tracker</h1>
        <button
          onClick={() => showForm ? closeForm() : setShowForm(true)}
          className="w-9 h-9 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
          {showForm ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 mb-5 space-y-3 animate-slideDown">
          <p className="text-sm font-bold dark:text-white text-slate-800">{editId ? 'Edit EMI' : 'New EMI'}</p>
          <input className="input" placeholder="Title (e.g. Laptop EMI)" value={form.title} onChange={set('title')} required />
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total Amount</label>
              <input className="input" type="number" min="1" placeholder="₹" value={form.totalAmount} onChange={set('totalAmount')} required />
            </div>
            <div>
              <label className="label">EMI / Month</label>
              <input className="input" type="number" min="1" placeholder="₹" value={form.emiAmount} onChange={set('emiAmount')} required />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label">Total Months</label>
              <input className="input" type="number" min="1" placeholder="12" value={form.totalInstallments} onChange={set('totalInstallments')} required />
            </div>
            <div>
              <label className="label">Start Date</label>
              <input className="input" type="date" value={form.startDate} onChange={set('startDate')} required />
            </div>
          </div>
          <div>
            <label className="label">Already Paid (months)</label>
            <input className="input" type="number" min="0" placeholder="0"
              value={form.paidInstallments} onChange={set('paidInstallments')}
              max={form.totalInstallments || 999} />
            <p className="text-[11px] dark:text-gray-500 text-gray-400 mt-1">How many EMIs have you already paid before adding this?</p>
          </div>
          <textarea className="input resize-none" rows={2} placeholder="Note (optional)" value={form.note} onChange={set('note')} />
          <button type="submit" disabled={saving} className="btn-primary w-full">
            {saving ? 'Saving...' : editId ? 'Update EMI' : 'Add EMI'}
          </button>
          {editId && (
            <button type="button" onClick={closeForm} className="w-full text-center text-sm dark:text-gray-400 text-gray-500">
              Cancel
            </button>
          )}
        </form>
      )}

      {loading ? (
        <div className="space-y-3">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-28 rounded-2xl dark:bg-dark-card bg-light-card animate-pulse" />)}
        </div>
      ) : (
        <>
          {active.length === 0 && completed.length === 0 && (
            <div className="text-center py-16">
              <p className="dark:text-gray-400 text-gray-500 font-medium">No EMIs added yet</p>
              <p className="dark:text-gray-600 text-gray-400 text-sm mt-1">Tap + to add your first EMI</p>
            </div>
          )}

          {active.length > 0 && (
            <>
              <p className="text-xs font-semibold dark:text-gray-500 text-gray-400 uppercase tracking-widest mb-3">Active ({active.length})</p>
              <div className="space-y-3 mb-5">
                {active.map(emi => <EMICard key={emi.id} emi={emi} onPay={payInstallment} onDelete={deleteEMI} onEdit={openEdit} />)}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <p className="text-xs font-semibold dark:text-gray-500 text-gray-400 uppercase tracking-widest mb-3">Completed ({completed.length})</p>
              <div className="space-y-3">
                {completed.map(emi => <EMICard key={emi.id} emi={emi} onPay={payInstallment} onDelete={deleteEMI} onEdit={openEdit} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function EMICard({ emi, onPay, onDelete, onEdit }) {
  const paid = emi.paidInstallments
  const total = emi.totalInstallments
  const remaining = total - paid
  const pct = Math.round((paid / total) * 100)

  const amountPaid = paid * emi.emiAmount
  const amountRemaining = remaining * emi.emiAmount

  const nextDue = getNextDue(emi.startDate, paid)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = emi.active && nextDue < today

  return (
    <div className={`card p-4 ${isOverdue ? 'border border-red-500/30' : ''}`}>
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold dark:text-white text-slate-800 text-sm">{emi.title}</p>
          <p className="text-xs mt-0.5">
            <span className="dark:text-gray-500 text-gray-400">{paid}/{total} paid</span>
            {emi.active && (
              isOverdue
                ? <span className="text-red-400 font-semibold"> · Overdue: {formatShortDate(nextDue)}</span>
                : <span className="dark:text-gray-500 text-gray-400"> · Next: {formatShortDate(nextDue)}</span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-1">
          {emi.active && (
            <button onClick={() => onPay(emi.id)}
              className="w-8 h-8 rounded-xl bg-secondary/10 text-secondary flex items-center justify-center hover:bg-secondary/20 transition-colors"
              title="Mark installment paid">
              <CheckCircle size={15} />
            </button>
          )}
          <button onClick={() => onEdit(emi)}
            className="w-8 h-8 rounded-xl hover:bg-sky-500/10 text-gray-400 hover:text-sky-500 flex items-center justify-center transition-colors">
            <Pencil size={15} />
          </button>
          <button onClick={() => { if (window.confirm('Delete this EMI?')) onDelete(emi.id) }}
            className="w-8 h-8 rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-400 flex items-center justify-center transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden mb-2">
        <div className="h-full rounded-full transition-all bg-sky-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Amount summary */}
      <div className="flex justify-between text-[11px]">
        <span className="dark:text-gray-500 text-gray-400">
          Paid: <span className="text-secondary font-semibold">{formatCurrency(amountPaid)}</span>
        </span>
        <span className="dark:text-gray-500 text-gray-400">
          {pct}%
        </span>
        {emi.active
          ? <span className="dark:text-gray-500 text-gray-400">Left: <span className="text-sky-500 font-semibold">{formatCurrency(amountRemaining)}</span></span>
          : <span className="text-secondary font-semibold">✓ Complete</span>
        }
      </div>
    </div>
  )
}
