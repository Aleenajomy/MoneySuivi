import { useEffect, useState } from 'react'
import { CheckCircle, Plus, Trash2, X } from 'lucide-react'
import { useEMI } from '../context/EMIContext'
import { formatCurrency, formatShortDate } from '../utils/constants'

const today = new Date().toISOString().split('T')[0]
const empty = { title: '', totalAmount: '', emiAmount: '', totalInstallments: '', startDate: today, note: '' }

export default function EMITracker() {
  const { emis, loading, fetchEMIs, addEMI, payInstallment, deleteEMI } = useEMI()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState(empty)
  const [saving, setSaving] = useState(false)

  useEffect(() => { fetchEMIs() }, [fetchEMIs])

  const set = k => e => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try { await addEMI(form); setForm(empty); setShowForm(false) }
    finally { setSaving(false) }
  }

  const active = emis.filter(e => e.active)
  const completed = emis.filter(e => !e.active)

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-5 pr-12">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">EMI Tracker</h1>
        <button onClick={() => setShowForm(p => !p)}
          className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
          {showForm ? <X size={16} /> : <Plus size={16} />}
        </button>
      </div>

      {showForm && (
        <form onSubmit={handleSubmit} className="card p-4 mb-5 space-y-3 animate-slideDown">
          <p className="text-sm font-bold dark:text-white text-slate-800">New EMI</p>
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
          <textarea className="input resize-none" rows={2} placeholder="Note (optional)" value={form.note} onChange={set('note')} />
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Add EMI'}</button>
        </form>
      )}

      {loading ? (
        <div className="space-y-3">{Array(3).fill(0).map((_, i) => <div key={i} className="h-24 rounded-2xl dark:bg-dark-card bg-light-card animate-pulse" />)}</div>
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
                {active.map(emi => <EMICard key={emi.id} emi={emi} onPay={payInstallment} onDelete={deleteEMI} />)}
              </div>
            </>
          )}

          {completed.length > 0 && (
            <>
              <p className="text-xs font-semibold dark:text-gray-500 text-gray-400 uppercase tracking-widest mb-3">Completed ({completed.length})</p>
              <div className="space-y-3">
                {completed.map(emi => <EMICard key={emi.id} emi={emi} onPay={payInstallment} onDelete={deleteEMI} />)}
              </div>
            </>
          )}
        </>
      )}
    </div>
  )
}

function EMICard({ emi, onPay, onDelete }) {
  const remaining = emi.totalInstallments - emi.paidInstallments
  const pct = Math.round((emi.paidInstallments / emi.totalInstallments) * 100)

  return (
    <div className="card p-4">
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="font-semibold dark:text-white text-slate-800 text-sm">{emi.title}</p>
          <p className="text-xs dark:text-gray-500 text-gray-400 mt-0.5">
            {emi.paidInstallments}/{emi.totalInstallments} paid
            {emi.active && ` · Next: ${formatShortDate(emi.nextDueDate)}`}
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
          <button onClick={() => { if (window.confirm('Delete EMI?')) onDelete(emi.id) }}
            className="w-8 h-8 rounded-xl hover:bg-danger/10 text-gray-400 hover:text-danger flex items-center justify-center transition-colors">
            <Trash2 size={15} />
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between mb-2">
        <span className="text-xs dark:text-gray-400 text-gray-500">{formatCurrency(emi.emiAmount)}/mo</span>
        <span className="text-xs font-bold dark:text-white text-slate-800">{formatCurrency(emi.totalAmount)}</span>
      </div>

      <div className="h-1.5 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden">
        <div className="h-full rounded-full transition-all bg-primary" style={{ width: `${pct}%` }} />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[10px] dark:text-gray-600 text-gray-400">{pct}% paid</span>
        {emi.active
          ? <span className="text-[10px] text-primary font-semibold">{remaining} remaining</span>
          : <span className="text-[10px] text-secondary font-semibold">✓ Complete</span>}
      </div>
    </div>
  )
}
