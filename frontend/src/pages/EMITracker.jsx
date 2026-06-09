import { useEffect, useState } from 'react'
import { CheckCircle, ChevronDown, ChevronUp, Pencil, Plus, Trash2, X, Calendar, Landmark, Percent, Wallet, Info, Coins } from 'lucide-react'
import { useEMI } from '../context/EMIContext'
import { formatCurrency, formatShortDate, getLoanDetails } from '../utils/constants'
import { FaTag } from "react-icons/fa";

const todayStr = new Date().toISOString().split('T')[0]
const empty = { title: '', totalAmount: '', emiAmount: '', totalInstallments: '', startDate: todayStr, paidInstallments: '0', note: '', type: 'FIXED', nextDueDate: '', paidAmount: '0', interestRate: '' }

const getNextDue = (startDate, paidInstallments) => {
  const d = new Date(startDate)
  d.setMonth(d.getMonth() + Number(paidInstallments) + 1)
  return d
}

export default function EMITracker() {
  const { emis, loading, fetchEMIs, addEMI, updateEMI, payInstallment, deleteEMI, deletePayment } = useEMI()

  // Dashboard navigation states
  const [activeTab, setActiveTab] = useState('active')
  const [showModal, setShowModal] = useState(false)
  const [form, setForm] = useState(empty)
  const [editId, setEditId] = useState(null)
  const [saving, setSaving] = useState(false)
  const [trackInterest, setTrackInterest] = useState(false)

  useEffect(() => { fetchEMIs() }, [fetchEMIs])

  const set = k => e => setForm(prev => ({ ...prev, [k]: e.target.value }))

  const setType = val => () => setForm(prev => ({ ...prev, type: val }))

  const openAdd = () => {
    setEditId(null)
    setForm(empty)
    setTrackInterest(false)
    setShowModal(true)
  }

  const openEdit = (emi) => {
    setEditId(emi.id)
    setForm({
      title: emi.title,
      totalAmount: String(emi.totalAmount),
      emiAmount: String(emi.emiAmount || ''),
      totalInstallments: String(emi.totalInstallments || ''),
      paidInstallments: String(emi.paidInstallments || '0'),
      startDate: emi.startDate.slice(0, 10),
      note: emi.note || '',
      type: emi.type || 'FIXED',
      nextDueDate: emi.nextDueDate ? emi.nextDueDate.slice(0, 10) : '',
      paidAmount: String(emi.paidAmount || '0'),
      interestRate: emi.interestRate ? String(emi.interestRate) : ''
    })
    setTrackInterest(!!emi.interestRate)
    setShowModal(true)
  }

  const closeModal = () => {
    setShowModal(false)
    setEditId(null)
    setForm(empty)
    setTrackInterest(false)
    setSaving(false)
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const payload = {
        title: form.title,
        totalAmount: Number(form.totalAmount),
        startDate: form.startDate,
        note: form.note,
        type: form.type,
        interestRate: trackInterest && form.interestRate ? Number(form.interestRate) : null,
      }
      if (form.type === 'FLEXIBLE') {
        payload.paidAmount = Number(form.paidAmount) || 0
        payload.nextDueDate = form.nextDueDate || null
      } else {
        payload.emiAmount = Number(form.emiAmount)
        payload.totalInstallments = Number(form.totalInstallments)
        payload.paidInstallments = Number(form.paidInstallments) || 0
      }
      if (editId) await updateEMI(editId, payload)
      else await addEMI(payload)
      closeModal()
    } catch { }
    finally { setSaving(false) }
  }

  const activeLoans = emis.filter(e => e.active)
  const completedLoans = emis.filter(e => !e.active)
  const displayedLoans = activeTab === 'active' ? activeLoans : completedLoans

  // Calculate live aggregate summary of ACTIVE loans
  const totalBorrowed = activeLoans.reduce((sum, e) => sum + e.totalAmount, 0)
  const activeDetails = activeLoans.map(e => getLoanDetails(e))
  const totalPaid = activeDetails.reduce((sum, d) => sum + d.amountPaid, 0)
  const totalOutstanding = activeDetails.reduce((sum, d) => sum + d.remainingBalance, 0)
  const totalPayableAll = activeDetails.reduce((sum, d) => sum + d.totalPayableAmount, 0)
  const overallProgress = totalPayableAll > 0 ? Math.round((totalPaid / totalPayableAll) * 100) : 0

  // Earliest active next due date
  const nextDueDate = activeLoans
    .map(e => e.type === 'FIXED' ? getNextDue(e.startDate, e.paidInstallments) : (e.nextDueDate ? new Date(e.nextDueDate) : null))
    .filter(Boolean)
    .sort((a, b) => a - b)[0]

  // Live preview calculations for the Add/Edit form
  const previewAmount = Number(form.totalAmount) || 0
  const previewEmi = Number(form.emiAmount) || 0
  const previewTenure = Number(form.totalInstallments) || 0
  
  const previewDetails = getLoanDetails({
    type: form.type,
    totalAmount: previewAmount,
    interestRate: trackInterest ? form.interestRate : null,
    emiAmount: previewEmi,
    totalInstallments: previewTenure,
    paidInstallments: Number(form.paidInstallments) || 0,
    paidAmount: Number(form.paidAmount) || 0,
    startDate: form.startDate,
    payments: []
  })

  const previewPaid = previewDetails.amountPaid
  const previewRemaining = previewDetails.remainingBalance
  const previewPct = previewDetails.hasInterest
    ? (previewDetails.totalPayableAmount > 0 ? Math.min(100, Math.round((previewPaid / previewDetails.totalPayableAmount) * 100)) : 0)
    : (previewAmount > 0 ? Math.min(100, Math.round((previewPaid / previewAmount) * 100)) : 0)
  const previewNextDue = form.type === 'FIXED'
    ? getNextDue(form.startDate, Number(form.paidInstallments) || 0)
    : form.nextDueDate ? new Date(form.nextDueDate) : null

  return (
    <div className="page pb-24">
      {/* Header section */}
      <div className="flex items-center justify-between mb-5 pr-12">
        <div>
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Loans & EMIs</h1>
          <p className="text-xs dark:text-gray-400 text-gray-500 mt-0.5">Manage your debts and flexible repayments</p>
        </div>
        <button
          onClick={openAdd}
          className="w-10 h-10 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition-colors active:scale-95 shadow-md shadow-sky-500/20">
          <Plus size={20} />
        </button>
      </div>

      {/* Live Aggregate Summary Card */}
      {activeLoans.length > 0 && (
        <div className="relative overflow-hidden rounded-3xl p-5 mb-6 shadow-xl text-white tracking-tight"
          style={{ background: 'linear-gradient(135deg, #06B6D4 0%, #0EA5E9 50%, #38BDF8 100%)' }}>
          <div className="absolute -top-10 -right-10 w-36 h-36 rounded-full bg-white/5" />
          <div className="absolute -bottom-12 -left-6 w-28 h-28 rounded-full bg-white/5" />

          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] uppercase font-bold text-cyan-100 tracking-wider">Total Outstanding Debt</p>
              <h2 className="text-3xl font-black mt-1">{formatCurrency(totalOutstanding)}</h2>
            </div>
            <Coins className="w-7 h-7 text-cyan-100" />
          </div>

          <div className="h-2 bg-white/20 rounded-full overflow-hidden mb-4">
            <div className="h-full bg-white rounded-full transition-all duration-500" style={{ width: `${overallProgress}%` }} />
          </div>

          <div className="grid grid-cols-3 gap-2.5 pt-2 border-t border-white/10 text-xs">
            <div>
              <p className="text-cyan-100 text-[10px]">Total Borrowed</p>
              <p className="font-extrabold mt-0.5">{formatCurrency(totalBorrowed)}</p>
            </div>
            <div>
              <p className="text-cyan-1 00 text-[10px]">Paid Back</p>
              <p className="font-extrabold mt-0.5">{formatCurrency(totalPaid)}</p>
            </div>
            <div>
              <p className="text-cyan-100 text-[10px]">Next Due</p>
              <p className="font-extrabold mt-0.5">{nextDueDate ? formatShortDate(nextDueDate) : 'N/A'}</p>
            </div>
          </div>
        </div>
      )}

      {/* Tabs segment */}
      <div className="grid grid-cols-2 p-1 bg-slate-100 dark:bg-dark-card rounded-2xl mb-5 border dark:border-dark-border border-light-border">
        <button
          onClick={() => setActiveTab('active')}
          className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'active' ? 'bg-white dark:bg-dark-bg text-sky-500 shadow-sm' : 'dark:text-gray-400 text-gray-500'}`}>
          Active ({activeLoans.length})
        </button>
        <button
          onClick={() => setActiveTab('completed')}
          className={`py-2 text-xs font-bold rounded-xl transition-all ${activeTab === 'completed' ? 'bg-white dark:bg-dark-bg text-sky-500 shadow-sm' : 'dark:text-gray-400 text-gray-500'}`}>
          Completed ({completedLoans.length})
        </button>
      </div>

      {/* Dynamic Loans List */}
      {loading ? (
        <div className="space-y-4">
          {Array(3).fill(0).map((_, i) => <div key={i} className="h-32 rounded-3xl dark:bg-dark-card bg-light-card animate-pulse" />)}
        </div>
      ) : (
        <>
          {displayedLoans.length === 0 ? (
            <div className="text-center py-16 card p-5 flex flex-col items-center justify-center">
              <span className="text-4xl mb-3"><FaTag /></span>
              <p className="dark:text-gray-400 text-slate-600 font-bold text-sm">No {activeTab} loans found</p>
              <p className="dark:text-gray-600 text-gray-400 text-xs mt-1">
                {activeTab === 'active' ? 'Add a loan to track repayments and progress.' : 'Completed loans will be listed here.'}
              </p>
              {activeTab === 'active' && (
                <button onClick={openAdd} className="btn-primary mt-4 px-4 py-2 text-xs">Add First Loan</button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {displayedLoans.map(emi => (
                <EMICard key={emi.id} emi={emi} onPay={payInstallment} onDelete={deleteEMI} onEdit={openEdit} onDeletePayment={deletePayment} />
              ))}
            </div>
          )}
        </>
      )}

      {/* Popup modal for Add/Edit Loan */}
      {showModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm px-4 flex items-center justify-center" onClick={closeModal}>
          <div className="card p-5 w-full max-w-sm max-h-[90vh] overflow-y-auto shadow-2xl animate-scaleIn scrollbar-none" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-black dark:text-white text-slate-800">{editId ? 'Edit Loan' : 'New Loan'}</h2>
              <button onClick={closeModal} className="w-7 h-7 rounded-lg dark:hover:bg-dark-border hover:bg-slate-100 flex items-center justify-center text-gray-500 dark:text-gray-400">
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <input className="input" placeholder="Title (e.g. Gold Loan, Car Loan)" value={form.title} onChange={set('title')} required />

              {/* Selectable Cards for Repayment Type */}
              <div className="space-y-1.5">
                <label className="text-[10px] font-bold uppercase dark:text-gray-400 text-gray-500 tracking-wider">Repayment Mode</label>
                <div className="grid grid-cols-2 gap-2.5">
                  <button
                    type="button"
                    onClick={setType('FIXED')}
                    className={`p-3 rounded-2xl border text-left flex flex-col transition-all active:scale-[0.98] ${form.type === 'FIXED' ? 'border-sky-500 bg-sky-500/5 ring-1 ring-sky-500' : 'border-light-border dark:border-dark-border bg-slate-50 dark:bg-dark-card opacity-70'}`}>
                    <Calendar size={16} className={form.type === 'FIXED' ? 'text-sky-500' : 'dark:text-gray-400 text-gray-500'} />
                    <span className="font-bold text-[11px] mt-2 block dark:text-white text-slate-800">Fixed EMI</span>
                    <span className="text-[9px] dark:text-gray-500 text-gray-400 mt-0.5 leading-tight">Fixed monthly payment</span>
                  </button>
                  <button
                    type="button"
                    onClick={setType('FLEXIBLE')}
                    className={`p-3 rounded-2xl border text-left flex flex-col transition-all active:scale-[0.98] ${form.type === 'FLEXIBLE' ? 'border-sky-500 bg-sky-500/5 ring-1 ring-sky-500' : 'border-light-border dark:border-dark-border bg-slate-50 dark:bg-dark-card opacity-70'}`}>
                    <Landmark size={16} className={form.type === 'FLEXIBLE' ? 'text-sky-500' : 'dark:text-gray-400 text-gray-500'} />
                    <span className="font-bold text-[11px] mt-2 block dark:text-white text-slate-800">Flexible</span>
                    <span className="text-[9px] dark:text-gray-500 text-gray-400 mt-0.5 leading-tight">Pay any amount, any time</span>
                  </button>
                </div>
              </div>
              {/* Interest Tracking Toggle Checkbox */}
              <div className="flex items-center gap-2 py-1">
                <input
                  type="checkbox"
                  id="trackInterest"
                  checked={trackInterest}
                  onChange={e => {
                    setTrackInterest(e.target.checked)
                    if (!e.target.checked) {
                      setForm(prev => ({ ...prev, interestRate: '' }))
                    }
                  }}
                  className="w-4 h-4 rounded text-sky-500 border-light-border dark:border-dark-border focus:ring-sky-500 cursor-pointer"
                />
                <label htmlFor="trackInterest" className="text-xs font-semibold dark:text-gray-300 text-slate-700 cursor-pointer select-none">
                  Enable Interest Tracking
                </label>
              </div>

              {/* Common main inputs */}
              {trackInterest ? (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="label">Total Loan Amount</label>
                    <input className="input" type="number" min="1" placeholder="₹" value={form.totalAmount} onChange={set('totalAmount')} required />
                  </div>
                  <div>
                    <label className="label">Interest Rate (% p.a.)</label>
                    <input className="input" type="number" step="0.01" min="0.01" max="100" placeholder="%" value={form.interestRate} onChange={set('interestRate')} required />
                  </div>
                </div>
              ) : (
                <div>
                  <label className="label">Total Loan Amount</label>
                  <input className="input" type="number" min="1" placeholder="₹" value={form.totalAmount} onChange={set('totalAmount')} required />
                </div>
              )}

              {/* Type-specific inputs */}
              {form.type === 'FIXED' ? (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">EMI / Month</label>
                      <input className="input" type="number" min="1" placeholder="₹" value={form.emiAmount} onChange={set('emiAmount')} required />
                    </div>
                    <div>
                      <label className="label">Total Months</label>
                      <input className="input" type="number" min="1" placeholder="12" value={form.totalInstallments} onChange={set('totalInstallments')} required />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Start Date</label>
                      <input className="input" type="date" value={form.startDate} onChange={set('startDate')} required />
                    </div>
                    <div>
                      <label className="label">Already Paid (months)</label>
                      <input className="input" type="number" min="0" placeholder="0"
                        value={form.paidInstallments} onChange={set('paidInstallments')}
                        max={form.totalInstallments || 999} />
                    </div>
                  </div>
                  <p className="text-[10px] dark:text-gray-500 text-gray-400">EMIs paid prior to tracking</p>
                </>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="label">Start Date</label>
                      <input className="input" type="date" value={form.startDate} onChange={set('startDate')} required />
                    </div>
                    <div>
                      <label className="label">Next Due Date (optional)</label>
                      <input className="input" type="date" value={form.nextDueDate} onChange={set('nextDueDate')} />
                    </div>
                  </div>
                  <div>
                    <label className="label">Already Paid (amount)</label>
                    <input className="input" type="number" min="0" placeholder="₹0"
                      value={form.paidAmount} onChange={set('paidAmount')}
                      max={form.totalAmount || 999999} />
                    <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-1">Amount paid back prior to tracking</p>
                  </div>
                </>
              )}

              <textarea className="input resize-none" rows={2} placeholder="Note (optional)" value={form.note} onChange={set('note')} />

              {/* Live Preview Summary Card */}
              {form.totalAmount && (
                <div className="p-3.5 rounded-2xl dark:bg-dark-bg bg-slate-50 border dark:border-dark-border border-slate-100 flex flex-col space-y-2">
                  <div className="flex items-center gap-1 text-[10px] font-bold text-sky-500 uppercase tracking-wider">
                    <Info size={11} /> Live preview
                  </div>
                  
                  <div className="flex justify-between items-baseline text-xs mt-1">
                    <span className="dark:text-gray-400 text-gray-500">Remaining Balance:</span>
                    <span className="font-extrabold dark:text-white text-slate-800">{formatCurrency(previewRemaining)}</span>
                  </div>

                  <div className="flex justify-between text-[11px]">
                    <span className="dark:text-gray-400 text-gray-500">
                      {trackInterest ? 'Total Paid:' : 'Paid:'}
                    </span>
                    <span className="font-semibold text-secondary">
                      {formatCurrency(previewPaid)} ({previewPct}%)
                    </span>
                  </div>

                  {trackInterest && previewDetails.hasInterest && (
                    <div className="pt-1.5 border-t border-dashed dark:border-dark-border border-slate-200 text-[11px] space-y-1">
                      <div className="flex justify-between">
                        <span className="dark:text-gray-400 text-gray-500">Principal Amount:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(previewAmount)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-500 text-gray-400">Accrued Interest:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(previewDetails.accruedInterest)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-500 text-gray-400">Total Payable:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(previewDetails.totalPayableAmount)}</span>
                      </div>
                      <div className="flex justify-between pt-1 border-t dark:border-dark-border border-slate-100">
                        <span className="dark:text-gray-500 text-gray-400">Principal Paid:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(previewDetails.principalPaid)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-500 text-gray-400">Interest Paid:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(previewDetails.interestPaid)}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="dark:text-gray-400 text-gray-500">Interest Rate:</span>
                        <span className="font-semibold dark:text-gray-300 text-slate-700">{form.interestRate}% p.a.</span>
                      </div>
                    </div>
                  )}

                  {previewNextDue && (
                    <div className="text-[10px] dark:text-gray-500 text-gray-400 pt-1">
                      Calculated next due: <span className="font-bold dark:text-gray-300 text-slate-700">{formatShortDate(previewNextDue)}</span>
                    </div>
                  )}
                </div>
              )}

              <button type="submit" disabled={saving} className="btn-primary w-full py-2.5 mt-2 text-sm font-bold shadow-md shadow-sky-500/10">
                {saving ? 'Saving...' : editId ? 'Update Loan' : 'Add Loan'}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}

function EMICard({ emi, onPay, onDelete, onEdit, onDeletePayment }) {
  const details = getLoanDetails(emi)
  const isFixed = emi.type !== 'FLEXIBLE'
  const paid = emi.paidInstallments
  const total = emi.totalInstallments

  const amountPaid = details.amountPaid
  const amountRemaining = details.remainingBalance
  const pct = details.hasInterest
    ? (details.totalPayableAmount > 0 ? Math.min(100, Math.round((amountPaid / details.totalPayableAmount) * 100)) : 0)
    : (emi.totalAmount > 0 ? Math.min(100, Math.round((amountPaid / emi.totalAmount) * 100)) : 0)

  const nextDue = isFixed
    ? getNextDue(emi.startDate, paid)
    : emi.nextDueDate ? new Date(emi.nextDueDate) : null

  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const isOverdue = emi.active && nextDue && nextDue < today

  const [showHistory, setShowHistory] = useState(false)
  const [payMode, setPayMode] = useState(false)
  const [payAmount, setPayAmount] = useState('')
  const [payNote, setPayNote] = useState('')
  const [payDate, setPayDate] = useState(todayStr)
  const [savingPayment, setSavingPayment] = useState(false)

  const handlePaySubmit = async (e) => {
    e.preventDefault()
    setSavingPayment(true)
    try {
      await onPay(emi.id, { amount: Number(payAmount), note: payNote, paidAt: payDate })
      setPayMode(false)
      setPayAmount('')
      setPayNote('')
    } catch { }
    finally { setSavingPayment(false) }
  }

  const handleQuickPayFixed = async () => {
    if (window.confirm(`Record repayment of ${formatCurrency(emi.emiAmount)}?`)) {
      try {
        await onPay(emi.id)
      } catch { }
    }
  }

  return (
    <div className={`card p-4 relative overflow-hidden transition-all duration-300 ${isOverdue ? 'border border-red-500/30 dark:bg-red-500/2 bg-red-500/1' : ''}`}>
      <div className="flex items-start justify-between mb-3.5">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h3 className="font-bold dark:text-white text-slate-800 text-sm tracking-tight">{emi.title}</h3>
            <span className={`text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md ${isFixed ? 'text-sky-500 bg-sky-500/10' : 'text-cyan-500 bg-cyan-500/10'}`}>
              {isFixed ? 'Fixed EMI' : 'Flexible'}
            </span>
            {emi.interestRate && (
              <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded-md text-emerald-500 bg-emerald-500/10 dark:text-emerald-400">
                {emi.interestRate}% p.a.
              </span>
            )}
          </div>
          <p className="text-[11px] dark:text-gray-400 text-gray-500 mt-1 flex items-center gap-1.5 flex-wrap">
            {isFixed ? (
              <span>{paid}/{total} paid</span>
            ) : (
              <span>Flexible payments</span>
            )}
            {emi.active && nextDue && (
              <>
                <span className="opacity-40">•</span>
                {isOverdue ? (
                  <span className="text-red-400 font-extrabold flex items-center gap-0.5">Overdue: {formatShortDate(nextDue)}</span>
                ) : (
                  <span>Next: {formatShortDate(nextDue)}</span>
                )}
              </>
            )}
          </p>
        </div>

        {/* Action icons */}
        <div className="flex items-center gap-1">
          <button onClick={() => onEdit(emi)}
            className="w-8 h-8 rounded-xl hover:bg-sky-500/10 text-gray-400 hover:text-sky-500 flex items-center justify-center transition-colors">
            <Pencil size={14} />
          </button>
          <button onClick={() => { if (window.confirm('Delete this loan?')) onDelete(emi.id) }}
            className="w-8 h-8 rounded-xl hover:bg-red-500/10 text-gray-400 hover:text-red-500 flex items-center justify-center transition-colors">
            <Trash2 size={14} />
          </button>
        </div>
      </div>

      {/* Big outstanding remaining balance view */}
      <div className="mb-4">
        <p className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Remaining Balance</p>
        <div className="flex items-baseline gap-2 mt-0.5">
          <span className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">{formatCurrency(amountRemaining)}</span>
          {isFixed && emi.active && (
            <span className="text-[11px] dark:text-gray-400 text-gray-500">({formatCurrency(emi.emiAmount)}/mo)</span>
          )}
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-2 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden mb-3">
        <div className="h-full rounded-full transition-all duration-300 bg-sky-500" style={{ width: `${pct}%` }} />
      </div>

      {/* Mini grid of numbers */}
      <div className="grid grid-cols-3 gap-2.5 text-[11px] border-b dark:border-dark-border border-light-border pb-3.5 mb-3.5">
        <div>
          <span className="dark:text-gray-500 text-gray-400 block font-medium">{details.hasInterest ? 'Principal' : 'Borrowed'}</span>
          <span className="font-extrabold dark:text-gray-300 text-slate-700">{formatCurrency(emi.totalAmount)}</span>
        </div>
        <div>
          <span className="dark:text-gray-500 text-gray-400 block font-medium">Paid Back</span>
          <span className="font-extrabold text-secondary">{formatCurrency(amountPaid)}</span>
        </div>
        <div>
          <span className="dark:text-gray-500 text-gray-400 block font-medium">Repaid %</span>
          <span className="font-extrabold dark:text-gray-300 text-slate-700">{pct}%</span>
        </div>
      </div>

      {/* Interest Tracking Breakdown (Only shown if interest rate is present) */}
      {details.hasInterest && (
        <div className="mb-3.5 p-3.5 rounded-2xl dark:bg-dark-bg bg-slate-50 border dark:border-dark-border border-slate-100 space-y-1.5 text-[11px]">
          <div className="flex justify-between">
            <span className="dark:text-gray-500 text-gray-400">Total Payable:</span>
            <span className="font-bold dark:text-gray-300 text-slate-700">{formatCurrency(details.totalPayableAmount)}</span>
          </div>
          <div className="flex justify-between">
            <span className="dark:text-gray-500 text-gray-400">Accrued Interest:</span>
            <span className="font-bold text-amber-500 dark:text-amber-400">+{formatCurrency(details.accruedInterest)}</span>
          </div>
          <div className="flex justify-between pt-1 border-t dark:border-dark-border border-slate-100">
            <span className="dark:text-gray-500 text-gray-400">Principal Paid:</span>
            <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(details.principalPaid)}</span>
          </div>
          <div className="flex justify-between">
            <span className="dark:text-gray-500 text-gray-400">Interest Paid:</span>
            <span className="font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(details.interestPaid)}</span>
          </div>
        </div>
      )}

      {/* Repayments quick action panel */}
      {emi.active && (
        <div className="mb-3">
          {isFixed ? (
            <button
              onClick={handleQuickPayFixed}
              className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-sky-500/10 text-sky-500 font-bold hover:bg-sky-500/20 active:scale-[0.98] transition-all text-xs">
              <CheckCircle size={14} /> Pay Installment ({formatCurrency(emi.emiAmount)})
            </button>
          ) : (
            !payMode && (
              <button
                onClick={() => setPayMode(true)}
                className="w-full flex items-center justify-center gap-1.5 py-2 px-4 rounded-xl bg-cyan-500/10 text-cyan-5  00 font-bold hover:bg-cyan-500/20 active:scale-[0.98] transition-all text-xs">
                <Wallet size={14} /> Record Repayment
              </button>
            )
          )}
        </div>
      )}

      {/* Inline Flexible Repayment drawer form */}
      {payMode && (
        <form onSubmit={handlePaySubmit} className="mb-4 p-3 rounded-2xl dark:bg-dark-bg bg-slate-50 border dark:border-dark-border border-slate-100 space-y-3 animate-fadeIn">
          <p className="text-xs font-bold dark:text-white text-slate-800">Record Repayment</p>
          <div className="grid grid-cols-2 gap-2.5">
            <div>
              <label className="text-[9px] dark:text-gray-500 text-gray-400 block mb-0.5">Amount (₹)</label>
              <input className="input py-1 text-xs" type="number" min="1" value={payAmount} onChange={e => setPayAmount(e.target.value)} placeholder={Math.round(amountRemaining)} required />
            </div>
            <div>
              <label className="text-[9px] dark:text-gray-500 text-gray-400 block mb-0.5">Date</label>
              <input className="input py-1 text-xs" type="date" value={payDate} onChange={e => setPayDate(e.target.value)} required />
            </div>
          </div>
          <div>
            <label className="text-[9px] dark:text-gray-500 text-gray-400 block mb-0.5">Note</label>
            <input className="input py-1 text-xs" type="text" value={payNote} onChange={e => setPayNote(e.target.value)} placeholder="e.g. Part payment, Chit funds" />
          </div>
          <div className="flex gap-2 pt-1">
            <button type="submit" disabled={savingPayment} className="btn-primary py-1.5 text-xs flex-1">
              {savingPayment ? 'Saving...' : 'Save'}
            </button>
            <button type="button" onClick={() => { setPayMode(false); setPayAmount(''); setPayNote('') }} className="btn-secondary py-1.5 text-xs flex-1">
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Collapsible Payment History list */}
      {emi.payments && emi.payments.length > 0 && (
        <div className="mt-2.5">
          <button
            type="button"
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center gap-1 text-[10px] dark:text-gray-400 text-gray-500 font-semibold hover:text-sky-500 transition-colors">
            {showHistory ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {showHistory ? 'Hide Repayment Logs' : `Show Repayment Logs (${emi.payments.length})`}
          </button>

          {showHistory && (
            <div className="mt-2.5 pt-2 border-t dark:border-dark-border border-light-border space-y-1.5 max-h-36 overflow-y-auto pr-1 animate-fadeIn scrollbar-none">
              {emi.payments.map(payment => (
                <div key={payment.id} className="flex items-center justify-between text-[11px] dark:bg-dark-bg bg-slate-50 p-2 rounded-xl border dark:border-dark-border border-slate-100">
                  <div>
                    <div className="flex items-center gap-1.5">
                      <span className="font-extrabold text-secondary">{formatCurrency(payment.amount)}</span>
                      <span className="dark:text-gray-500 text-gray-400 text-[10px]">{formatShortDate(payment.paidAt)}</span>
                    </div>
                    {payment.note && <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">{payment.note}</p>}
                  </div>
                  <button type="button" onClick={() => { if (window.confirm('Delete this repayment record?')) onDeletePayment(payment.id) }}
                    className="text-gray-400 hover:text-red-500 p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                    title="Delete payment log">
                    <Trash2 size={11} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}
