import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Repeat, Utensils, Bus, ShoppingBag, Receipt, Tv, Banknote, HeartPulse, Briefcase, TrendingUp, Gift, CircleDot } from 'lucide-react'
import toast from 'react-hot-toast'
import { useExpense } from '../context/ExpenseContext'
import { useBudget } from '../context/BudgetContext'
import api from '../services/api'
import {
  CATEGORIES,
  CATEGORY_COLORS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
  ACCOUNT_TYPES,
  formatCurrency,
} from '../utils/constants'

const today = new Date().toISOString().split('T')[0]

const accountTypeForPayment = (paymentMethod) => {
  if (paymentMethod === 'UPI' || paymentMethod === 'Debit Card' || paymentMethod === 'Net Banking') return 'Bank'
  if (paymentMethod === 'Credit Card') return 'Credit Card'
  return 'Cash'
}

const defaultForm = {
  title: '',
  amount: '',
  category: CATEGORIES[0],
  type: 'expense',
  accountType: ACCOUNT_TYPES[0],
  paymentMethod: PAYMENT_METHODS[0],
  note: '',
  expenseDate: today,
  recurring: false,
  recurringType: 'monthly',
}

export default function AddExpense() {
  const { id } = useParams()
  const [searchParams] = useSearchParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { addExpense, updateExpense } = useExpense()
  const { budgets, fetchBudgets } = useBudget()
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)
  const [customizeTitle, setCustomizeTitle] = useState(false)

  useEffect(() => {
    fetchBudgets()
  }, [fetchBudgets])

  useEffect(() => {
    if (!isEditing) return
    api.get(`/expenses/${id}`).then(res => {
      const e = res.data.expense
      const isInc = e.type === 'income'
      setForm({
        title: e.title,
        amount: e.amount,
        category: e.category,
        type: isInc ? 'income' : 'expense',
        accountType: e.accountType || e.paymentMethod || ACCOUNT_TYPES[0],
        paymentMethod: e.paymentMethod,
        note: e.note || '',
        expenseDate: e.expenseDate.split('T')[0],
        recurring: Boolean(e.recurring),
        recurringType: e.recurringType || 'monthly',
      })
      if (isInc && (e.title !== e.category || e.category === 'Other')) {
        setCustomizeTitle(true)
      }
    }).catch(() => toast.error('Failed to load transaction'))
  }, [id, isEditing])

  useEffect(() => {
    if (isEditing) return
    const type = searchParams.get('type')
    if (type === 'income' || type === 'expense') {
      handleTypeChange(type)
    }
  }, [isEditing, searchParams])

  const ICONS = {
    Food: Utensils, Travel: Bus, Shopping: ShoppingBag, Bills: Receipt,
    Entertainment: Tv, Salary: Banknote, Healthcare: HeartPulse,
    Freelance: Briefcase, Investment: TrendingUp, Gift, Other: CircleDot,
  }

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const setChecked = key => e => setForm(prev => ({ ...prev, [key]: e.target.checked }))
  const activeCategories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
  const selectedBudget = form.type === 'expense' ? budgets.find(b => b.category === form.category) : null

  const handleCategorySelect = (cat) => {
    setForm(prev => {
      const updated = { ...prev, category: cat }
      if (prev.type === 'income' && !customizeTitle && cat !== 'Other') {
        updated.title = cat
      }
      return updated
    })
  }

  const handleCustomizeTitleToggle = (val) => {
    setCustomizeTitle(val)
    if (val && !form.title.trim()) {
      setForm(prev => ({ ...prev, title: prev.category }))
    }
  }

  const handleTypeChange = (type) => {
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    const newCategory = cats[0]
    setForm(prev => ({
      ...prev,
      type,
      category: newCategory,
      title: type === 'income' && !customizeTitle && newCategory !== 'Other' ? newCategory : prev.title,
      accountType: type === 'expense' ? accountTypeForPayment(prev.paymentMethod) : prev.accountType,
      recurring: type === 'expense' ? prev.recurring : false,
    }))
    if (type === 'expense') {
      setCustomizeTitle(false)
    }
  }

  const handlePaymentChange = (e) => {
    const paymentMethod = e.target.value
    setForm(prev => ({
      ...prev,
      paymentMethod,
      accountType: accountTypeForPayment(paymentMethod),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    let finalTitle = form.title.trim()
    if (form.type === 'income') {
      if (!customizeTitle && form.category !== 'Other') {
        finalTitle = form.category
      } else {
        if (!finalTitle) return toast.error('Title is required')
      }
    } else {
      if (!finalTitle) return toast.error('Title is required')
    }

    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount')

    setLoading(true)
    try {
      const isExpense = form.type === 'expense'
      const data = {
        ...form,
        title: finalTitle,
        amount: Number(form.amount),
        paymentMethod: form.paymentMethod,
        accountType: accountTypeForPayment(form.paymentMethod),
        recurring: isExpense && form.recurring,
        recurringType: isExpense && form.recurring ? form.recurringType : undefined,
      }
      if (isEditing) await updateExpense(id, data)
      else await addExpense(data)
      await fetchBudgets()
      navigate(-1)
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
        
        {/* Header */}
        <div className="animate-fadeIn">
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">
            {isEditing ? 'Edit Transaction' : 'New Transaction'}
          </h1>
          <p className="text-xs dark:text-gray-500 text-gray-400 mt-0.5">
            {isEditing ? 'Modify transaction logs' : 'Record a new expense or income'}
          </p>
        </div>

        {/* Form Panel */}
        <div className="card p-6 sm:p-8 animate-scaleIn">
          <form onSubmit={handleSubmit} className="space-y-6">
            
            {/* Income vs Expense sliding pills */}
            <div className="card p-1 flex gap-1 bg-slate-100 dark:bg-dark-bg/60 border-none rounded-2xl">
              {['expense', 'income'].map(type => (
                <button
                  key={type}
                  type="button"
                  onClick={() => handleTypeChange(type)}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                    form.type === type
                      ? type === 'expense'
                        ? 'bg-red-500 text-white shadow-md'
                        : 'bg-emerald-500 text-white shadow-md'
                      : 'dark:text-gray-500 text-gray-400 hover:text-slate-700 hover:dark:text-white'
                  }`}
                >
                  {type === 'expense' ? 'Expense' : 'Income'}
                </button>
              ))}
            </div>

            {/* Amount Card Container */}
            <div className="card p-5 bg-slate-50 dark:bg-dark-bg/25 border-light-border dark:border-dark-border text-center flex flex-col items-center justify-center relative transition-all focus-within:border-sky-500/40">
              <label className="label text-center block mb-2 text-gray-450 dark:text-gray-550 uppercase tracking-widest font-bold">Transaction Amount</label>
              <div className="flex items-center justify-center gap-1.5 w-full max-w-[280px]">
                <span className="text-3xl font-extrabold text-primary flex-shrink-0">₹</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  className="text-4xl font-black dark:text-white text-slate-800 bg-transparent outline-none text-center w-full dark:placeholder-gray-700 placeholder-gray-300"
                  placeholder="0.00"
                  value={form.amount}
                  onChange={set('amount')}
                />
              </div>
            </div>

            {/* Title Input */}
            {form.type === 'income' ? (
              <div className="space-y-3">
                {form.category !== 'Other' && (
                  <label className="flex items-center gap-2 cursor-pointer w-fit">
                    <input
                      type="checkbox"
                      className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                      checked={customizeTitle}
                      onChange={(e) => handleCustomizeTitleToggle(e.target.checked)}
                    />
                    <span className="text-xs font-semibold dark:text-gray-400 text-gray-500 uppercase tracking-wide">
                      Customize Title
                    </span>
                  </label>
                )}

                {(customizeTitle || form.category === 'Other') ? (
                  <div className="animate-slideDown">
                    <label className="label">Title</label>
                    <input
                      className="input"
                      placeholder="e.g. Freelance project, Gift from friend"
                      value={form.title}
                      onChange={set('title')}
                      required
                    />
                  </div>
                ) : (
                  <div className="text-xs text-gray-500 dark:text-gray-450 bg-slate-50 dark:bg-dark-bg/25 px-4 py-3.5 rounded-xl border dark:border-dark-border border-light-border flex items-center justify-between transition-all animate-fadeIn">
                    <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Derived Title</span>
                    <span className="font-bold dark:text-white text-slate-800">{form.category}</span>
                  </div>
                )}
              </div>
            ) : (
              <div>
                <label className="label">Title</label>
                <input
                  className="input"
                  placeholder="e.g. Lunch, Rent, Grocery"
                  value={form.title}
                  onChange={set('title')}
                  required
                />
              </div>
            )}

            {/* Category Selector Grid */}
            <div>
              <label className="label mb-3">Category</label>
              <div className={`grid ${form.type === 'income' ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-4 sm:grid-cols-7'} gap-3 bg-slate-50 dark:bg-dark-bg/25 p-4 rounded-2xl border dark:border-dark-border border-light-border`}>
                {activeCategories.map(cat => {
                  const isSelected = form.category === cat
                  const color = CATEGORY_COLORS[cat] || '#0066FF'
                  const Icon = ICONS[cat] || CircleDot
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className="flex flex-col items-center justify-center py-1.5 focus:outline-none"
                    >
                      <div
                        className={`w-12 h-12 rounded-full flex items-center justify-center mb-1.5 transition-all border ${
                          isSelected
                            ? 'scale-105 border-transparent shadow-md'
                            : 'dark:border-dark-border border-light-border dark:bg-dark-card bg-light-card dark:text-gray-400 text-gray-500 hover:scale-105'
                        }`}
                        style={{
                          backgroundColor: isSelected ? `${color}20` : undefined,
                          borderColor: isSelected ? color : undefined,
                          color: isSelected ? color : undefined,
                          boxShadow: isSelected ? `0 0 12px ${color}30` : undefined
                        }}
                      >
                        <Icon size={20} />
                      </div>
                      <span className={`text-[10px] font-bold tracking-tight truncate max-w-[65px] ${
                        isSelected ? 'dark:text-white text-slate-800 font-extrabold' : 'dark:text-gray-500 text-gray-400'
                      }`}>
                        {cat}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Category Budget Balance Indicator */}
            {selectedBudget && (
              <div className="card p-4 bg-slate-50/50 dark:bg-dark-bg/20 border-light-border dark:border-dark-border animate-fadeIn">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[10px] font-extrabold dark:text-gray-500 text-gray-400 uppercase tracking-widest">Category Balance</p>
                  <p className="text-[11px] font-bold dark:text-gray-300 text-slate-700">{selectedBudget.percentage}% used</p>
                </div>
                <div className="h-2 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden mb-2">
                  <div 
                    className={`h-full rounded-full transition-all duration-500 ${
                      selectedBudget.percentage >= 90 ? 'bg-red-500' : selectedBudget.percentage >= 70 ? 'bg-orange-500' : 'bg-emerald-500'
                    }`} 
                    style={{ width: `${Math.min(selectedBudget.percentage, 100)}%` }} 
                  />
                </div>
                <div className="flex items-center justify-between text-[11px]">
                  <span className="dark:text-gray-500 text-gray-500 font-semibold">
                    {formatCurrency(selectedBudget.spent)} spent
                  </span>
                  <span className="font-bold dark:text-white text-slate-850">
                    {formatCurrency(selectedBudget.remaining)} left
                  </span>
                </div>
              </div>
            )}

            {/* Payment Method and Date Selection */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="label">{form.type === 'income' ? 'Received In' : 'Paid Using'}</label>
                <select
                  className="input cursor-pointer"
                  value={form.paymentMethod}
                  onChange={form.type === 'income' ? set('paymentMethod') : handlePaymentChange}
                >
                  {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <label className="label">Date</label>
                <input
                  type="date"
                  className="input cursor-pointer"
                  max={today}
                  value={form.expenseDate}
                  onChange={set('expenseDate')}
                />
              </div>
            </div>

            {/* Recurring Options */}
            {form.type === 'expense' && (
              <div className="card p-4 bg-slate-50/50 dark:bg-dark-bg/20 border-light-border dark:border-dark-border space-y-4">
                <label className="flex items-center justify-between gap-3 cursor-pointer">
                  <span className="flex items-center gap-2.5">
                    <span className="w-8 h-8 rounded-xl bg-sky-500/10 flex items-center justify-center text-sky-500 flex-shrink-0">
                      <Repeat size={16} />
                    </span>
                    <span>
                      <span className="block text-xs font-bold dark:text-white text-slate-800 uppercase tracking-wide">Recurring Transaction</span>
                      <span className="block text-[10px] dark:text-gray-550 text-gray-500 mt-0.5">Auto-create future charges (rent, subscriptions)</span>
                    </span>
                  </span>
                  <input
                    type="checkbox"
                    className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                    checked={form.recurring}
                    onChange={setChecked('recurring')}
                  />
                </label>

                {form.recurring && (
                  <div className="pt-3 border-t dark:border-dark-border border-light-border animate-slideDown">
                    <label className="label">Repeat Interval</label>
                    <select className="input cursor-pointer" value={form.recurringType} onChange={set('recurringType')}>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                    </select>
                  </div>
                )}
              </div>
            )}

            {/* Note Input */}
            <div>
              <label className="label">Note <span className="normal-case text-gray-500">(optional)</span></label>
              <textarea
                className="input resize-none"
                rows={3}
                placeholder="Add details, tags, or reminders..."
                value={form.note}
                onChange={set('note')}
              />
            </div>

            {/* Submit Action */}
            <button
              type="submit"
              disabled={loading}
              className={`w-full py-3.5 rounded-xl text-white font-bold text-sm active:scale-[0.98] transition-all hover:opacity-95 shadow-md ${
                form.type === 'income' ? 'gradient-green' : 'gradient-blue'
              }`}
            >
              {loading ? 'Saving...' : isEditing ? 'Update Transaction' : 'Add Transaction'}
            </button>
          </form>
      </div>
    </div>
  )
}
