import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Edit2, Plus, Save, Trash2, X, Utensils, Bus, ShoppingBag, Receipt, Tv, Banknote, HeartPulse, Briefcase, TrendingUp, Gift, CircleDot } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { CATEGORY_COLORS, EXPENSE_CATEGORIES, formatCurrency } from '../utils/constants'

const ICONS = {
  Food: Utensils, Travel: Bus, Shopping: ShoppingBag, Bills: Receipt,
  Entertainment: Tv, Salary: Banknote, Healthcare: HeartPulse,
  Freelance: Briefcase, Investment: TrendingUp, Gift, Other: CircleDot,
}

const barColor = (pct) => {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 90) return 'bg-orange-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

export default function Budgets() {
  const { budgets, loading, fetchBudgets, saveBudget, updateBudget, deleteBudget } = useBudget()
  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState('')
  const [form, setForm] = useState({ category: EXPENSE_CATEGORIES[0], monthlyLimit: '' })
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets])

  const usedCategories = budgets.map(b => b.category)
  const availableCategories = EXPENSE_CATEGORIES.filter(c => !usedCategories.includes(c))

  const resetForm = () => {
    setShowForm(false)
    setEditingId('')
    setForm({ category: availableCategories[0] || EXPENSE_CATEGORIES[0], monthlyLimit: '' })
  }

  const handleSave = async (e) => {
    e.preventDefault()
    if (!form.category) return toast.error('Select a category')
    if (!form.monthlyLimit || Number(form.monthlyLimit) <= 0) return toast.error('Enter a valid limit')
    setSaving(true)
    try {
      if (editingId) await updateBudget(editingId, Number(form.monthlyLimit))
      else await saveBudget(form.category, Number(form.monthlyLimit))
      resetForm()
    } catch (err) {
      toast.error(err.message || 'Failed to save budget')
    } finally {
      setSaving(false)
    }
  }

  const startEdit = (budget) => {
    setEditingId(budget.id)
    setForm({ category: budget.category, monthlyLimit: budget.monthlyLimit })
    setShowForm(true)
  }

  const startCreate = () => {
    setEditingId('')
    setForm({ category: availableCategories[0], monthlyLimit: '' })
    setShowForm(true)
  }

return (
    <div className="page space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between animate-fadeIn pr-12">
        <div>
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Category Budgets</h1>
          <p className="text-xs dark:text-gray-400 text-gray-500 mt-0.5">Control your spending by category limits</p>
        </div>
        {availableCategories.length > 0 && (
          <button type="button" onClick={startCreate} className="w-10 h-10 rounded-xl gradient-blue flex items-center justify-center active:scale-95 shadow-md shadow-sky-500/20">
            <Plus size={20} className="text-white" />
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-5 animate-slideDown border dark:border-dark-border border-light-border">
          <div className="flex items-center justify-between mb-4">
            <p className="text-sm font-black dark:text-white text-slate-800">{editingId ? 'Edit Budget' : 'Set Budget'}</p>
            <button type="button" onClick={resetForm} className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-dark-border">
              <X size={16} className="dark:text-gray-400 text-gray-500" />
            </button>
          </div>
          <form onSubmit={handleSave} className="space-y-4">
            <div>
              <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Category</label>
              <select
                className="input text-xs"
                value={form.category}
                disabled={Boolean(editingId)}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
              >
                {(editingId ? [form.category] : availableCategories).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="text-[10px] font-bold dark:text-gray-500 text-gray-400 uppercase tracking-wide">Monthly Limit (₹)</label>
              <input
                type="number"
                className="input text-xs"
                placeholder="e.g. 3000"
                min="1"
                value={form.monthlyLimit}
                onChange={e => setForm(prev => ({ ...prev, monthlyLimit: e.target.value }))}
                required
              />
            </div>
            <button type="submit" disabled={saving} className="gradient-blue w-full py-2.5 text-xs font-bold text-white rounded-xl shadow-md active:scale-95 transition-all flex items-center justify-center gap-1.5">
              {saving
                ? <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                : <Save size={14} />}
              <span>{saving ? 'Saving...' : 'Save Budget'}</span>
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16 card p-5 flex flex-col items-center justify-center animate-scaleIn">
          <p className="dark:text-gray-400 text-gray-500 font-bold text-sm">No budgets set yet</p>
          <p className="dark:text-gray-600 text-gray-400 text-xs mt-1">Tap the plus icon to set category limits</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map(b => {
            const pct = Math.min(b.percentage, 100)
            const color = barColor(b.percentage)
            const isExceeded = b.percentage >= 100
            
            return (
              <div key={b.id} className="card p-5 flex flex-col justify-between border dark:border-dark-border border-light-border bg-white dark:bg-dark-card shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all">
                <div>
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex items-center gap-2.5">
                      <span className="w-9 h-9 rounded-xl bg-sky-500/10 flex items-center justify-center flex-shrink-0" style={{ color: CATEGORY_COLORS[b.category] || '#0066FF' }}>
                        {(() => { const I = ICONS[b.category] || CircleDot; return <I size={18} /> })()}
                      </span>
                      <div>
                        <p className="font-bold text-xs dark:text-white text-slate-800">{b.category}</p>
                        <p className="text-[10px] dark:text-gray-500 text-gray-400 mt-0.5">Category budget</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(b)}
                        className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-sky-500 dark:hover:text-sky-400 transition-colors"
                        title="Edit Limit"
                      >
                        <Edit2 size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => { if (window.confirm('Delete budget?')) deleteBudget(b.id) }}
                        className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-500 text-gray-400 hover:text-danger transition-colors"
                        title="Delete Budget"
                      >
                        <Trash2 size={13} />
                      </button>
                    </div>
                  </div>

                  <div className="mb-4">
                    <div className="flex items-baseline justify-between mb-2">
                      <span className="text-sm font-black dark:text-white text-slate-800">
                        {formatCurrency(b.spent)} <span className="text-gray-400 font-semibold text-[10px]">/ {formatCurrency(b.monthlyLimit)}</span>
                      </span>
                      <span className={`text-[10px] font-black px-2 py-0.5 rounded-full ${isExceeded ? 'bg-red-500/10 text-red-500'
                          : b.percentage >= 70 ? 'bg-yellow-400/10 text-yellow-500'
                            : 'bg-emerald-500/10 text-emerald-500'
                        }`}>
                        {b.percentage}%
                      </span>
                    </div>
                    <div className="h-2 dark:bg-dark-border bg-slate-100 rounded-full overflow-hidden">
                      <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                </div>

                <div className="flex justify-between items-center mt-2 pt-2 border-t dark:border-dark-border border-light-border text-[10px]">
                  <span className={`font-bold ${isExceeded ? 'text-red-500' : 'dark:text-gray-500 text-gray-500'}`}>
                    {isExceeded ? 'Limit Exceeded' : `${formatCurrency(b.remaining)} left`}
                  </span>
                  <span className="dark:text-gray-500 text-gray-400 font-semibold">
                    Limit: {formatCurrency(b.monthlyLimit)}
                  </span>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
