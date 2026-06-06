import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown } from 'lucide-react'
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
    <div className="page">
      <div className="flex items-center justify-between mb-5 pr-12">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">Net Worth</h1>
      </div>

      {/* Summary Card */}
      <div className="rounded-2xl p-5 mb-5 relative overflow-hidden shadow-lg"
        style={{ background: isPositive ? 'linear-gradient(135deg,#0f766e,#14b8a6)' : 'linear-gradient(135deg,#9f1239,#e11d48)' }}>
        <p className="text-white/70 text-xs font-semibold uppercase tracking-widest mb-1">Net Worth</p>
        <p className="text-3xl font-extrabold text-white mb-3">{formatCurrency(netWorth)}</p>
        <div className="flex gap-6">
          <div>
            <p className="text-white/60 text-[10px] uppercase tracking-wide">Assets</p>
            <p className="text-white font-bold text-sm">{formatCurrency(summary.totalAssets)}</p>
          </div>
          <div>
            <p className="text-white/60 text-[10px] uppercase tracking-wide">Liabilities</p>
            <p className="text-white font-bold text-sm">{formatCurrency(summary.totalLiabilities)}</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="card p-1.5 flex gap-1 mb-5">
        {['assets', 'liabilities'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-xl text-sm font-bold transition-all capitalize ${tab === t ? 'bg-sky-500 text-white' : 'dark:text-gray-500 text-gray-400'}`}>
            {t} ({t === 'assets' ? summary.assets.length : summary.liabilities.length})
          </button>
        ))}
      </div>

      {/* Add button */}
      <button onClick={() => openAdd(tab === 'assets' ? 'asset' : 'liability')}
        className="w-full py-3 rounded-xl border-2 border-dashed dark:border-dark-border border-light-border dark:text-gray-500 text-gray-400 text-sm font-semibold flex items-center justify-center gap-2 mb-4 hover:border-sky-500 hover:text-sky-500 transition-colors">
        <Plus size={16} /> Add {tab === 'assets' ? 'Asset' : 'Liability'}
      </button>

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
                <p className="text-xs dark:text-gray-500 text-gray-400">{item.type}</p>
              </div>
              <div className="flex items-center gap-1">
                <p className={`text-sm font-bold mr-1 ${tab === 'assets' ? 'text-secondary' : 'text-danger'}`}>{formatCurrency(item.value)}</p>
                <button onClick={() => openEdit(tab === 'assets' ? 'asset' : 'liability', item)}
                  className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-sky-500 transition-colors">
                  <Pencil size={13} />
                </button>
                <button onClick={() => { if (window.confirm('Delete?')) tab === 'assets' ? deleteAsset(item.id) : deleteLiability(item.id) }}
                  className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-danger transition-colors">
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
