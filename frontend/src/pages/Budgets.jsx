import { useEffect, useState } from 'react'
import toast from 'react-hot-toast'
import { Edit2, Plus, Save, Trash2, X } from 'lucide-react'
import { useBudget } from '../context/BudgetContext'
import { CATEGORY_ICONS, EXPENSE_CATEGORIES, formatCurrency } from '../utils/constants'

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
    if (!form.monthlyLimit || Number(form.monthlyLimit) <= 0) return toast.error('Enter a valid limit')
    if (editingId) await updateBudget(editingId, Number(form.monthlyLimit))
    else await saveBudget(form.category, Number(form.monthlyLimit))
    resetForm()
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
    <div className="page">
      <div className="flex items-center justify-between mb-6 pr-12">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">Category Budgets</h1>
        {availableCategories.length > 0 && (
          <button type="button" onClick={startCreate} className="w-9 h-9 rounded-xl gradient-blue flex items-center justify-center active:scale-90">
            <Plus size={18} className="text-white" />
          </button>
        )}
      </div>

      {showForm && (
        <div className="card p-4 mb-5 animate-slideDown">
          <div className="flex items-center justify-between mb-3">
            <p className="text-sm font-semibold dark:text-gray-300 text-slate-700">{editingId ? 'Edit Budget' : 'Set Budget'}</p>
            <button type="button" onClick={resetForm}><X size={16} className="dark:text-gray-400 text-gray-500" /></button>
          </div>
          <form onSubmit={handleSave} className="space-y-3">
            <div>
              <label className="label">Category</label>
              <select
                className="input"
                value={form.category}
                disabled={Boolean(editingId)}
                onChange={e => setForm(prev => ({ ...prev, category: e.target.value }))}
              >
                {(editingId ? [form.category] : availableCategories).map(c => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">Monthly Limit</label>
              <input
                type="number"
                className="input"
                placeholder="e.g. 3000"
                min="1"
                value={form.monthlyLimit}
                onChange={e => setForm(prev => ({ ...prev, monthlyLimit: e.target.value }))}
                required
              />
            </div>
            <button type="submit" className="btn-primary flex items-center justify-center gap-2">
              <Save size={15} />
              Save Budget
            </button>
          </form>
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-16">
          <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-16 animate-scaleIn">
          <p className="dark:text-gray-400 text-gray-500 font-medium">No budgets set yet</p>
          <p className="dark:text-gray-600 text-gray-400 text-sm mt-1">Tap plus to set a category budget</p>
        </div>
      ) : (
        <div className="space-y-3">
          {budgets.map(b => {
            const pct = Math.min(b.percentage, 100)
            const color = barColor(b.percentage)
            return (
              <div key={b.id} className="card p-4 animate-fadeIn">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="w-9 h-9 rounded-xl bg-primary/10 text-primary flex items-center justify-center text-xs font-bold">
                      {CATEGORY_ICONS[b.category] || 'OT'}
                    </span>
                    <div>
                      <p className="font-semibold text-sm dark:text-white text-slate-800">{b.category}</p>
                      <p className="text-xs dark:text-gray-500 text-gray-400">
                        {formatCurrency(b.spent)} / {formatCurrency(b.monthlyLimit)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                      b.percentage >= 100 ? 'bg-red-500/10 text-red-500'
                        : b.percentage >= 70 ? 'bg-yellow-400/10 text-yellow-500'
                          : 'bg-emerald-500/10 text-emerald-500'
                    }`}>
                      {b.percentage}%
                    </span>
                    <button
                      type="button"
                      onClick={() => startEdit(b)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-primary hover:bg-primary/10 transition-colors"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteBudget(b.id)}
                      className="w-7 h-7 rounded-lg flex items-center justify-center dark:text-gray-600 text-gray-400 hover:text-danger hover:bg-danger/10 transition-colors"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>

                <div className="h-2 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden">
                  <div className={`h-full rounded-full transition-all duration-500 ${color}`} style={{ width: `${pct}%` }} />
                </div>

                <div className="flex justify-between mt-1.5">
                  <span className="text-[10px] dark:text-gray-600 text-gray-400">
                    {b.percentage >= 100 ? 'Exceeded' : `${formatCurrency(b.remaining)} remaining`}
                  </span>
                  <span className="text-[10px] dark:text-gray-600 text-gray-400">
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
