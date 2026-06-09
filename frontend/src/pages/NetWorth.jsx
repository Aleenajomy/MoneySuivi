import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, Coins, Landmark, Calendar, Wallet, Info } from 'lucide-react'
import { useNetWorth } from '../context/NetWorthContext'
import { formatCurrency } from '../utils/constants'

const ASSET_TYPES = ['Savings', 'Fixed Deposit', 'Gold', 'Stocks', 'Mutual Funds', 'Property', 'Vehicle', 'Other']
const LIABILITY_TYPES = ['Home Loan', 'Education Loan', 'Personal Loan', 'Credit Card', 'Other']

const emptyAsset = { name: '', type: 'Savings', value: '', note: '' }
const emptyLiability = { name: '', type: 'Home Loan', value: '', note: '' }

export default function NetWorth() {
  const { summary, loading, fetchNetWorth, addAsset, updateAsset, deleteAsset, addLiability, updateLiability, deleteLiability } = useNetWorth()
  const [tab, setTab] = useState('assets')
  const [form, setForm] = useState(null)  // null = closed, {mode, data, kind}
  const [saving, setSaving] = useState(false)
  const navigate = useNavigate()

  useEffect(() => { fetchNetWorth() }, [fetchNetWorth])

  const set = k => e => setForm(prev => ({ ...prev, data: { ...prev.data, [k]: e.target.value } }))

  const openAdd = (kind) => setForm({ mode: 'add', kind, data: kind === 'asset' ? { ...emptyAsset } : { ...emptyLiability } })
  const openEdit = (kind, item) => setForm({ mode: 'edit', kind, data: { ...item } })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    try {
      const { mode, kind, data } = form
      if (kind === 'asset') mode === 'add' ? await addAsset(data) : await updateAsset(data.id, data)
      else mode === 'add' ? await addLiability(data) : await updateLiability(data.id, data)
      setForm(null)
    } finally { setSaving(false) }
  }

  const netWorth = summary.netWorth ?? 0
  const isPositive = netWorth >= 0

  return (
    <div className="page pb-24 animate-fadeIn">
      <div className="flex items-center justify-between mb-5 pr-12">
        <div>
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Net Worth</h1>
          <p className="text-xs dark:text-gray-400 text-gray-500 mt-0.5">Track your overall wealth and balance sheet</p>
        </div>
      </div>

      {/* Summary Card */}
      <div className="rounded-3xl p-6 mb-5 relative overflow-hidden shadow-xl text-white"
        style={{ background: isPositive ? 'linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)' : 'linear-gradient(135deg,#9f1239 0%,#e11d48 100%)' }}>
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full bg-white/5" />
        <p className="text-white/70 text-xs font-bold uppercase tracking-widest mb-1">Final Net Worth</p>
        <p className="text-4xl font-black text-white mb-2 tracking-tight">{formatCurrency(netWorth)}</p>
        <p className="text-white/60 text-[10px] font-semibold mt-1">
          Formula: Assets ({formatCurrency(summary.totalAssets)}) + Cash ({formatCurrency(summary.cashBalance || 0)}) - Liabilities ({formatCurrency(summary.totalLiabilities)})
        </p>
      </div>

      {/* Premium Breakdown Grid */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {/* Assets card */}
        <div className="card p-3.5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Assets</span>
            <span className="w-6 h-6 rounded-lg bg-secondary/10 text-secondary flex items-center justify-center">
              <TrendingUp size={12} />
            </span>
          </div>
          <p className="text-base font-extrabold dark:text-white text-slate-800 mt-2">{formatCurrency(summary.totalAssets)}</p>
        </div>

        {/* Cash Balance card */}
        <div className="card p-3.5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Cash Balance</span>
            <span className="w-6 h-6 rounded-lg bg-sky-500/10 text-sky-500 flex items-center justify-center">
              <Wallet size={12} />
            </span>
          </div>
          <p className="text-base font-extrabold dark:text-white text-slate-800 mt-2">{formatCurrency(summary.cashBalance || 0)}</p>
        </div>

        {/* Outstanding Loans card */}
        <div className="card p-3.5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Outstanding Loans</span>
            <span className="w-6 h-6 rounded-lg bg-amber-500/10 text-amber-500 flex items-center justify-center">
              <Landmark size={12} />
            </span>
          </div>
          <p className="text-base font-extrabold text-amber-500 dark:text-amber-400 mt-2">{formatCurrency(summary.outstandingLoans || 0)}</p>
        </div>

        {/* Outstanding EMIs card */}
        <div className="card p-3.5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Outstanding EMIs</span>
            <span className="w-6 h-6 rounded-lg bg-red-400/10 text-red-400 flex items-center justify-center">
              <Calendar size={12} />
            </span>
          </div>
          <p className="text-base font-extrabold text-red-400 mt-2">{formatCurrency(summary.outstandingEMIs || 0)}</p>
        </div>

        {/* Total Liabilities card */}
        <div className="card p-3.5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm col-span-2 hover:shadow-md transition-shadow">
          <div className="flex justify-between items-start">
            <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Total Liabilities</span>
            <span className="w-6 h-6 rounded-lg bg-danger/10 text-danger flex items-center justify-center">
              <TrendingDown size={12} />
            </span>
          </div>
          <p className="text-base font-extrabold text-danger mt-2">{formatCurrency(summary.totalLiabilities)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1.5 flex gap-1 mb-5">
        {['assets', 'liabilities'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all capitalize ${tab === t ? 'bg-sky-500 text-white shadow-sm' : 'dark:text-gray-500 text-gray-400'}`}>
            {t} ({t === 'assets' ? summary.assets.length : summary.liabilities.length})
          </button>
        ))}
      </div>

      {/* Add asset button */}
      {tab === 'assets' && (
        <button onClick={() => openAdd('asset')}
          className="w-full py-3 rounded-xl border-2 border-dashed dark:border-dark-border border-light-border dark:text-gray-500 text-gray-400 text-sm font-semibold flex items-center justify-center gap-2 mb-4 hover:border-sky-500 hover:text-sky-500 transition-colors">
          <Plus size={16} /> Add Asset
        </button>
      )}

      {/* Info card for liabilities */}
      {tab === 'liabilities' && (
        <div className="card p-4 mb-4 border border-dashed dark:border-sky-500/30 border-sky-500/20 bg-sky-500/5 rounded-2xl flex flex-col gap-3.5 animate-slideDown">
          <div className="flex items-start gap-3">
            <span className="w-9 h-9 rounded-xl bg-sky-500/15 text-sky-500 flex items-center justify-center flex-shrink-0 mt-0.5 animate-pulse">
              <Info size={18} />
            </span>
            <div className="flex-1 min-w-0">
              <p className="text-xs font-bold dark:text-white text-slate-800">Auto-Sync Enabled</p>
              <p className="text-[10px] dark:text-gray-400 text-gray-500 mt-1 leading-relaxed">
                Your liabilities are automatically populated from active Loans & EMIs.
              </p>
            </div>
          </div>
          <button 
            type="button" 
            onClick={() => navigate('/emis')}
            className="btn-primary py-2 text-xs rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1"
          >
            Manage Loans
          </button>
        </div>
      )}

      {/* Form */}
      {form && (
        <form onSubmit={handleSubmit} className="card p-4 mb-4 space-y-3 animate-slideDown">
          <div className="flex items-center justify-between">
            <p className="text-sm font-bold dark:text-white text-slate-800">
              {form.mode === 'add' ? 'Add' : 'Edit'} {form.kind === 'asset' ? 'Asset' : 'Liability'}
            </p>
            <button type="button" onClick={() => setForm(null)}><X size={16} className="dark:text-gray-400 text-gray-500" /></button>
          </div>
          <input className="input" placeholder="Name" value={form.data.name} onChange={set('name')} required />
          <select className="input" value={form.data.type} onChange={set('type')}>
            {(form.kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES).map(t => <option key={t}>{t}</option>)}
          </select>
          <input className="input" type="number" min="0" placeholder="Value (₹)" value={form.data.value} onChange={set('value')} required />
          <textarea className="input resize-none" rows={2} placeholder="Note (optional)" value={form.data.note || ''} onChange={set('note')} />
          <button type="submit" disabled={saving} className="btn-primary w-full">{saving ? 'Saving...' : 'Save'}</button>
        </form>
      )}

      {/* List */}
      {loading ? (
        <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl dark:bg-dark-card bg-light-card animate-pulse" />)}</div>
      ) : (
        <div className="card overflow-hidden">
          {(tab === 'assets' ? summary.assets : summary.liabilities).length === 0 ? (
            <p className="text-center py-10 text-sm dark:text-gray-500 text-gray-400">No {tab} added yet</p>
          ) : (tab === 'assets' ? summary.assets : summary.liabilities).map(item => (
            <div key={item.id} className="flex items-center gap-3 py-3 px-4 border-b dark:border-dark-border border-light-border last:border-0">
              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tab === 'assets' ? 'bg-secondary/10' : 'bg-danger/10'}`}>
                {tab === 'assets' ? <TrendingUp size={16} className="text-secondary" /> : <TrendingDown size={16} className="text-danger" />}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold dark:text-white text-slate-800 truncate">{item.name}</p>
                <p className="text-xs dark:text-gray-500 text-gray-400">
                  {item.type} {item.isAuto ? '· Auto-Synced' : ''}
                </p>
              </div>
              <div className="flex items-center gap-1">
                <p className={`text-sm font-bold mr-1 ${tab === 'assets' ? 'text-secondary' : 'text-danger'}`}>{formatCurrency(item.value)}</p>
                {!item.isAuto ? (
                  <>
                    <button onClick={() => openEdit(tab === 'assets' ? 'asset' : 'liability', item)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-sky-500 transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { if (window.confirm('Delete?')) tab === 'assets' ? deleteAsset(item.id) : deleteLiability(item.id) }}
                      className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-danger transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </>
                ) : (
                  <button 
                    onClick={() => navigate('/emis')}
                    title="Manage Loan"
                    className="text-[10px] text-sky-500 font-bold px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all flex items-center gap-1 border border-sky-500/10 active:scale-95"
                  >
                    View Loan
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
