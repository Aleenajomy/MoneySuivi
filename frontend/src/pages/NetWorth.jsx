import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Plus, Pencil, Trash2, X, TrendingUp, TrendingDown, Coins, Landmark, Calendar, Wallet, Info, HandCoins } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'
import { useNetWorth } from '../context/NetWorthContext'
import { formatCurrency } from '../utils/constants'
import ConfirmDialog from '../components/ConfirmDialog'
import PageHeader from '../components/common/PageHeader'
import Modal from '../components/common/Modal'
import EmptyState from '../components/common/EmptyState'
import StatCard from '../components/common/StatCard'

const ASSET_TYPES = ['Savings', 'Fixed Deposit', 'Gold', 'Stocks', 'Mutual Funds', 'Property', 'Vehicle', 'Other']
const LIABILITY_TYPES = ['Home Loan', 'Education Loan', 'Personal Loan', 'Credit Card', 'Other']

const emptyAsset = { name: '', type: 'Savings', value: '', note: '' }
const emptyLiability = { name: '', type: 'Home Loan', value: '', note: '' }

export default function NetWorth() {
  const { summary, loading, fetchNetWorth, addAsset, updateAsset, deleteAsset, addLiability, updateLiability, deleteLiability } = useNetWorth()
  const [tab, setTab] = useState('assets')
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(null) // { id, kind }
  const navigate = useNavigate()

  useEffect(() => {
    fetchNetWorth()
  }, [fetchNetWorth])

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

  const ASSET_COLORS = {
    Savings: '#0EA5E9',
    'Fixed Deposit': '#22C55E',
    Gold: '#EAB308',
    Stocks: '#8B5CF6',
    'Mutual Funds': '#EC4899',
    Property: '#3B82F6',
    Vehicle: '#F97316',
    Other: '#94A3B8'
  }

  const LIABILITY_COLORS = {
    'Home Loan': '#EF4444',
    'Education Loan': '#F59E0B',
    'Personal Loan': '#EC4899',
    'Credit Card': '#8B5CF6',
    Other: '#94A3B8'
  }

  // Calculate allocation breakdown data
  const rawList = tab === 'assets' ? (summary.assets || []) : (summary.liabilities || [])
  const allocationColors = tab === 'assets' ? ASSET_COLORS : LIABILITY_COLORS

  const allocationData = rawList.reduce((acc, item) => {
    const type = item.type || 'Other'
    const val = Number(item.value || 0)
    const existing = acc.find(x => x.name === type)
    if (existing) {
      existing.value += val
    } else {
      acc.push({ name: type, value: val, color: allocationColors[type] || '#94A3B8' })
    }
    return acc
  }, [])

  const totalAllocated = allocationData.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="space-y-6 animate-fadeIn">
      {/* Header */}
      <PageHeader
        title="Net Worth"
        subtitle="Track your overall wealth, liquid balance, and liabilities"
      />

      {/* Summary Balance Card */}
      <div className="rounded-3xl p-6 relative overflow-hidden shadow-xl text-white"
        style={{ background: isPositive ? 'linear-gradient(135deg,#0f766e 0%,#14b8a6 100%)' : 'linear-gradient(135deg,#9f1239 0%,#e11d48 100%)' }}>
        <div className="absolute -top-6 -right-6 w-24 h-24 rounded-full bg-white/5 pointer-events-none" />
        <div className="absolute -bottom-8 -left-4 w-20 h-20 rounded-full bg-white/5 pointer-events-none" />
        <p className="text-white/75 text-[10px] font-bold uppercase tracking-widest mb-1">Final Net Worth</p>
        <p className="text-3xl sm:text-4xl font-black text-white mb-2 tracking-tight tabular-nums">{formatCurrency(netWorth)}</p>
        <p className="text-white/70 text-[10px] font-semibold mt-1">
          Formula: Assets ({formatCurrency(summary.totalAssets)}) + Liquid Balance ({formatCurrency(summary.cashBalance || 0)}) + Receivables ({formatCurrency(summary.ledgerReceivable || 0)}) − Liabilities ({formatCurrency(summary.totalLiabilities)})
        </p>
      </div>

      {/* 4-Column Responsive Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Assets"
          amount={summary.totalAssets}
          icon={TrendingUp}
          tone="secondary"
        />
        <StatCard
          label="Liquid Balance"
          amount={summary.cashBalance || 0}
          icon={Wallet}
          tone="info"
        />
        <StatCard
          label="Outstanding Loans"
          amount={summary.outstandingLoans || 0}
          icon={Landmark}
          tone="warning"
        />
        <StatCard
          label="Outstanding EMIs"
          amount={summary.outstandingEMIs || 0}
          icon={Calendar}
          tone="danger"
        />

        {/* Ledger Receivable Card */}
        {(summary.ledgerReceivable > 0 || summary.ledgerPayable > 0) && (
          <>
            <div className="card p-4 flex flex-col justify-between border dark:border-dark-border border-slate-200/80 bg-white dark:bg-dark-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Lent Out</span>
                <span className="w-7 h-7 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center">
                  <HandCoins size={14} />
                </span>
              </div>
              <p className="text-base md:text-lg font-black text-emerald-500 mt-3 tabular-nums">{formatCurrency(summary.ledgerReceivable || 0)}</p>
              <p className="text-[9px] dark:text-gray-600 text-gray-400 mt-1">Receivable asset</p>
            </div>

            <div className="card p-4 flex flex-col justify-between border dark:border-dark-border border-slate-200/80 bg-white dark:bg-dark-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
              <div className="flex justify-between items-start">
                <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Borrowed</span>
                <span className="w-7 h-7 rounded-xl bg-rose-500/10 text-rose-500 flex items-center justify-center">
                  <HandCoins size={14} />
                </span>
              </div>
              <p className="text-base md:text-lg font-black text-rose-500 mt-3 tabular-nums">{formatCurrency(summary.ledgerPayable || 0)}</p>
              <p className="text-[9px] dark:text-gray-600 text-gray-400 mt-1">Payable liability</p>
            </div>
          </>
        )}

        {/* Total Liabilities: Spans all 4 columns on desktop/tablet, 2 columns on mobile */}
        <div className="card p-4 flex flex-col justify-between border dark:border-dark-border border-slate-200/80 bg-white dark:bg-dark-card shadow-sm hover:shadow-md col-span-2 md:col-span-4 transition-all">
          <div className="flex justify-between items-start">
            <div>
              <span className="text-[10px] dark:text-gray-500 text-gray-400 uppercase font-bold tracking-wider">Total Liabilities</span>
              <p className="text-xs text-slate-500 dark:text-gray-400 mt-0.5">Sum of outstanding loans, EMIs and other debts</p>
            </div>
            <span className="w-7 h-7 rounded-xl bg-danger/10 text-danger flex items-center justify-center">
              <TrendingDown size={14} />
            </span>
          </div>
          <p className="text-lg md:text-xl font-black text-danger mt-3 tabular-nums">{formatCurrency(summary.totalLiabilities)}</p>
        </div>
      </div>

      {/* Tabs */}
      <div className="segmented-control p-1 gap-1">
        {['assets', 'liabilities'].map(t => (
          <button key={t} onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all capitalize ${tab === t ? 'bg-sky-500 text-white shadow-sm' : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white'}`}>
            {t} ({t === 'assets' ? summary.assets.length : summary.liabilities.length})
          </button>
        ))}
      </div>

      {/* Main Workspace Split: Left content and lists, Right Allocation Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Left Side: Forms and Lists */}
        <div className="lg:col-span-2 space-y-4">
          
          {/* Add Asset trigger */}
          {tab === 'assets' && (
            <button onClick={() => openAdd('asset')}
              className="w-full py-3.5 rounded-xl border-2 border-dashed dark:border-dark-border border-light-border dark:text-gray-400 text-gray-500 text-sm font-bold flex items-center justify-center gap-2 hover:border-sky-500 hover:text-sky-500 hover:bg-sky-500/5 transition-all">
              <Plus size={16} /> Add New Asset
            </button>
          )}

          {/* Info card for liabilities */}
          {tab === 'liabilities' && (
            <div className="card p-4 border border-dashed dark:border-sky-500/30 border-sky-500/20 bg-sky-500/5 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-4 animate-slideDown">
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
                className="gradient-blue py-2 px-4 text-xs font-bold text-white rounded-xl shadow-md active:scale-95 transition-transform flex items-center justify-center gap-1 flex-shrink-0"
              >
                Manage Loans
              </button>
            </div>
          )}

          {/* Form Modal */}
          {form && (
            <Modal
              title={`${form.mode === 'add' ? 'Add' : 'Edit'} ${form.kind === 'asset' ? 'Asset' : 'Liability'}`}
              subtitle={form.kind === 'asset' ? 'Record personal asset, savings, or investment' : 'Record personal liability or outstanding balance'}
              onClose={() => setForm(null)}
              maxWidth="max-w-md"
            >
              <form onSubmit={handleSubmit} className="space-y-4 pt-1">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="label">Name</label>
                    <input className="input text-xs" placeholder="e.g. ICICI Savings" value={form.data.name} onChange={set('name')} required />
                  </div>
                  <div>
                    <label className="label">Type</label>
                    <select className="input text-xs cursor-pointer" value={form.data.type} onChange={set('type')}>
                      {(form.kind === 'asset' ? ASSET_TYPES : LIABILITY_TYPES).map(t => <option key={t}>{t}</option>)}
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label">Value (₹)</label>
                  <input className="input text-xs" type="number" min="0" placeholder="e.g. 50000" value={form.data.value} onChange={set('value')} required />
                </div>
                <div>
                  <label className="label">Note <span className="normal-case text-gray-400">(optional)</span></label>
                  <textarea className="input text-xs resize-none" rows={2} placeholder="Optional details..." value={form.data.note || ''} onChange={set('note')} />
                </div>
                <div className="flex gap-2 pt-2">
                  <button type="button" onClick={() => setForm(null)} className="btn-secondary py-2.5 text-xs font-semibold">
                    Cancel
                  </button>
                  <button type="submit" disabled={saving} className="btn-primary py-2.5 text-xs font-bold flex items-center justify-center">
                    {saving ? 'Saving...' : 'Save Changes'}
                  </button>
                </div>
              </form>
            </Modal>
          )}

          {/* List */}
          {loading ? (
            <div className="space-y-2">{Array(3).fill(0).map((_, i) => <div key={i} className="h-16 rounded-xl dark:bg-dark-card bg-light-card animate-pulse" />)}</div>
          ) : (tab === 'assets' ? summary.assets : summary.liabilities).length === 0 ? (
            <EmptyState
              icon={Coins}
              title={`No ${tab} added yet`}
              description="Start by setting your initial balances and tracking your wealth."
              actionLabel={`Add ${tab === 'assets' ? 'Asset' : 'Liability'}`}
              onAction={() => openAdd(tab === 'assets' ? 'asset' : 'liability')}
            />
          ) : (
            <div className="card overflow-hidden border dark:border-dark-border border-light-border">
              {(tab === 'assets' ? summary.assets : summary.liabilities).map(item => (
                <div key={item.id} className="flex items-center gap-3 py-3.5 px-4 border-b dark:border-dark-border border-light-border last:border-0 hover:bg-slate-50/50 dark:hover:bg-dark-border/20 transition-colors">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${tab === 'assets' ? 'bg-secondary/10 text-secondary' : 'bg-danger/10 text-danger'}`}>
                    {tab === 'assets' ? <TrendingUp size={16} /> : <TrendingDown size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold dark:text-white text-slate-800 truncate">{item.name}</p>
                    <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">
                      {item.type} {item.isAuto ? '· Auto-Synced' : ''}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <p className={`text-xs font-black ${tab === 'assets' ? 'text-secondary' : 'text-danger'}`}>{formatCurrency(item.value)}</p>
                    {!item.isAuto ? (
                      <div className="flex items-center">
                        <button onClick={() => openEdit(tab === 'assets' ? 'asset' : 'liability', item)}
                          className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                          title="Edit">
                          <Pencil size={13} />
                        </button>
                        <button onClick={() => setConfirmDelete({ id: item.id, kind: tab === 'assets' ? 'asset' : 'liability' })}
                          className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-danger transition-colors"
                          title="Delete">
                          <Trash2 size={13} />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => navigate('/emis')}
                        title="Manage Loan"
                        className="text-[9px] text-sky-500 font-bold px-2 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all flex items-center gap-1 active:scale-95"
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

        {/* Right Side: Allocation Chart */}
        <div className="lg:col-span-1 space-y-6">
          <div className="card p-5 border dark:border-dark-border border-light-border">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
              {tab === 'assets' ? 'Asset Allocation' : 'Liabilities Breakdown'}
            </p>
            {allocationData.length === 0 ? (
              <div className="text-center py-12">
                <Coins size={36} className="mx-auto text-gray-400 opacity-45 mb-2" />
                <p className="text-xs dark:text-gray-400 text-gray-500">No data to display allocation.</p>
              </div>
            ) : (
              <div className="space-y-6">
                <div className="relative w-full h-[160px] flex items-center justify-center">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={allocationData}
                        cx="50%"
                        cy="50%"
                        innerRadius={48}
                        outerRadius={70}
                        dataKey="value"
                        paddingAngle={3}
                      >
                        {allocationData.map((entry, idx) => (
                          <Cell key={idx} fill={entry.color} stroke="transparent" />
                        ))}
                      </Pie>
                      <Tooltip formatter={(value) => formatCurrency(value)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <p className="text-[9px] dark:text-gray-500 text-gray-400">Total</p>
                    <p className="text-xs font-bold dark:text-white text-slate-800">{formatCurrency(totalAllocated)}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  {allocationData.map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                        <span className="dark:text-gray-300 text-slate-700 font-medium">{item.name}</span>
                      </div>
                      <span className="font-bold dark:text-white text-slate-800">
                        {Math.round((item.value / totalAllocated) * 100)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
      <ConfirmDialog
        open={!!confirmDelete}
        variant="delete"
        title={`Delete ${confirmDelete?.kind === 'asset' ? 'Asset' : 'Liability'}?`}
        message="This entry will be permanently removed from your net worth."
        confirmText="Delete"
        onConfirm={() => {
          if (confirmDelete.kind === 'asset') deleteAsset(confirmDelete.id)
          else deleteLiability(confirmDelete.id)
          setConfirmDelete(null)
        }}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  )
}
