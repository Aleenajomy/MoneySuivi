import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { Repeat, Utensils, Bus, ShoppingBag, Receipt, Tv, Banknote, HeartPulse, Briefcase, TrendingUp, Gift, CircleDot, ArrowRightLeft } from 'lucide-react'
import toast from 'react-hot-toast'
import { useExpense } from '../context/ExpenseContext'
import { useBudget } from '../context/BudgetContext'
import { useNetWorth } from '../context/NetWorthContext'
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
import PageHeader from '../components/common/PageHeader'

const today = new Date().toISOString().split('T')[0]

const accountTypeForPayment = (paymentMethod) => {
  const m = String(paymentMethod || '').trim().toLowerCase()
  if (m === 'cash') return 'Cash'
  if (m === 'credit card') return 'Credit Card'
  if (m === 'upi' || m === 'wallet') return 'UPI'
  if (m === 'debit card') return 'Debit Card'
  if (m === 'net banking' || m === 'bank' || m === 'bank transfer') return 'Net Banking'
  return 'UPI'
}

const defaultForm = {
  title: '',
  amount: '',
  category: CATEGORIES[0],
  type: 'expense',
  accountType: 'UPI',
  fromAccountType: 'Bank',
  toAccountType: 'Cash',
  paymentMethod: 'UPI',
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
  const { fetchNetWorth } = useNetWorth()
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
      const isTrf = e.type === 'transfer'
      setForm({
        title: e.title,
        amount: e.amount,
        category: e.category || (isTrf ? 'Transfer' : isInc ? INCOME_CATEGORIES[0] : EXPENSE_CATEGORIES[0]),
        type: e.type || 'expense',
        accountType: e.accountType || e.paymentMethod || ACCOUNT_TYPES[0],
        fromAccountType: e.fromAccountType || 'Bank',
        toAccountType: e.toAccountType || 'Cash',
        paymentMethod: e.paymentMethod || 'Bank',
        note: e.note || '',
        expenseDate: e.expenseDate ? e.expenseDate.split('T')[0] : today,
        recurring: Boolean(e.recurring),
        recurringType: e.recurringType || 'monthly',
      })
      if ((isInc || isTrf) && (e.title !== e.category || e.category === 'Other')) {
        setCustomizeTitle(true)
      }
    }).catch((err) => toast.error(err?.isTimeout ? 'Server is waking up. Please wait a moment...' : 'Failed to load transaction', {
      id: err?.isTimeout ? 'server-connection-status' : 'load-transaction'
    }))
  }, [id, isEditing])

  useEffect(() => {
    if (isEditing) return
    const type = searchParams.get('type')
    if (type === 'income' || type === 'expense' || type === 'transfer') {
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
      setForm(prev => ({ ...prev, title: prev.type === 'transfer' ? `Transfer to ${prev.toAccountType}` : prev.category }))
    }
  }

  const handleTypeChange = (type) => {
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    const newCategory = type === 'transfer' ? 'Transfer' : cats[0]
    setForm(prev => {
      const nextPayment = type === 'transfer'
        ? 'Transfer'
        : (prev.paymentMethod === 'Bank' || prev.paymentMethod === 'Transfer' ? 'UPI' : prev.paymentMethod || 'UPI')
      const nextAccount = type === 'transfer'
        ? prev.fromAccountType || 'Bank'
        : accountTypeForPayment(nextPayment)

      return {
        ...prev,
        type,
        category: newCategory,
        paymentMethod: nextPayment,
        accountType: nextAccount,
        title: type === 'income' && !customizeTitle && newCategory !== 'Other'
          ? newCategory
          : (type === 'transfer' && !customizeTitle ? `Transfer ${prev.fromAccountType} to ${prev.toAccountType}` : prev.title),
        recurring: type === 'expense' ? prev.recurring : false,
      }
    })
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

    if (form.type === 'transfer') {
      if (form.fromAccountType === form.toAccountType) {
        return toast.error('From and To accounts must be different')
      }
      if (!customizeTitle || !finalTitle) {
        finalTitle = `Transfer ${form.fromAccountType} to ${form.toAccountType}`
      }
    } else if (form.type === 'income') {
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
      const isTransfer = form.type === 'transfer'

      const data = {
        title: finalTitle,
        amount: Number(form.amount),
        type: form.type,
        category: isTransfer ? 'Transfer' : form.category,
        paymentMethod: isTransfer ? form.fromAccountType : form.paymentMethod,
        accountType: isTransfer ? form.fromAccountType : accountTypeForPayment(form.paymentMethod),
        fromAccountType: isTransfer ? form.fromAccountType : undefined,
        toAccountType: isTransfer ? form.toAccountType : undefined,
        expenseDate: form.expenseDate,
        note: form.note,
        recurring: isExpense && form.recurring,
        recurringType: isExpense && form.recurring ? form.recurringType : undefined,
      }

      if (isEditing) await updateExpense(id, data)
      else await addExpense(data)

      await fetchBudgets()
      await fetchNetWorth()
      navigate(-1)
    } catch (err) {
      toast.error(err.message || 'Something went wrong', {
        id: err.isTimeout ? 'server-connection-status' : undefined
      })
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-3xl w-full mx-auto space-y-6">
      {/* Header */}
      <PageHeader
        title={isEditing ? 'Edit Transaction' : 'New Transaction'}
        subtitle={isEditing ? 'Modify transaction details' : 'Record an expense, income, or transfer'}
        showBack
      />

      {/* Form Panel */}
      <div className="card p-5 sm:p-7 animate-scaleIn">
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Income vs Expense vs Transfer sliding pills */}
          <div className="segmented-control p-1 gap-1">
            {[
              { key: 'expense', label: 'Expense', activeClass: 'bg-rose-500 text-white shadow-sm' },
              { key: 'income', label: 'Income', activeClass: 'bg-emerald-500 text-white shadow-sm' },
              { key: 'transfer', label: 'Transfer', activeClass: 'bg-sky-500 text-white shadow-sm' },
            ].map(tab => (
              <button
                key={tab.key}
                type="button"
                onClick={() => handleTypeChange(tab.key)}
                className={`flex-1 py-2 rounded-lg text-xs sm:text-sm font-bold transition-all ${
                  form.type === tab.key
                    ? tab.activeClass
                    : 'text-slate-500 dark:text-gray-400 hover:text-slate-800 dark:hover:text-white'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Amount Card Container */}
          <div className="card p-5 bg-slate-50/70 dark:bg-dark-bg/40 border-slate-200/80 dark:border-dark-border text-center flex flex-col items-center justify-center relative transition-all focus-within:ring-2 focus-within:ring-sky-500/20 focus-within:border-sky-500">
            <label className="label text-center block mb-1">Transaction Amount</label>
            <div className="flex items-center justify-center gap-1.5 w-full max-w-[280px]">
              <span className="text-2xl sm:text-3xl font-extrabold text-primary flex-shrink-0">₹</span>
              <input
                type="number"
                step="0.01"
                min="0.01"
                required
                autoFocus
                className="text-3xl sm:text-4xl font-black dark:text-white text-slate-800 bg-transparent outline-none text-center w-full dark:placeholder-gray-700 placeholder-slate-300 tabular-nums"
                placeholder="0.00"
                value={form.amount}
                onChange={set('amount')}
              />
            </div>
          </div>

          {/* Transfer Accounts Selection */}
          {form.type === 'transfer' && (
            <div className="card p-4 bg-slate-50 dark:bg-dark-bg/25 border-light-border dark:border-dark-border space-y-3">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="label">Transfer From</label>
                  <select
                    className="input cursor-pointer"
                    value={form.fromAccountType}
                    onChange={set('fromAccountType')}
                  >
                    {ACCOUNT_TYPES.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Transfer To</label>
                  <select
                    className="input cursor-pointer"
                    value={form.toAccountType}
                    onChange={set('toAccountType')}
                  >
                    {ACCOUNT_TYPES.map(acc => <option key={acc} value={acc}>{acc}</option>)}
                  </select>
                </div>
              </div>
            </div>
          )}

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
          ) : form.type === 'transfer' ? (
            <div className="space-y-3">
              <label className="flex items-center gap-2 cursor-pointer w-fit">
                <input
                  type="checkbox"
                  className="w-4 h-4 rounded accent-sky-500 cursor-pointer"
                  checked={customizeTitle}
                  onChange={(e) => handleCustomizeTitleToggle(e.target.checked)}
                />
                <span className="text-xs font-semibold dark:text-gray-400 text-gray-500 uppercase tracking-wide">
                  Customize Description
                </span>
              </label>
              {customizeTitle ? (
                <div className="animate-slideDown">
                  <label className="label">Description</label>
                  <input
                    className="input"
                    placeholder={`e.g. ATM cash withdrawal, Move to savings`}
                    value={form.title}
                    onChange={set('title')}
                  />
                </div>
              ) : (
                <div className="text-xs text-gray-500 dark:text-gray-450 bg-slate-50 dark:bg-dark-bg/25 px-4 py-3.5 rounded-xl border dark:border-dark-border border-light-border flex items-center justify-between transition-all animate-fadeIn">
                  <span className="font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider text-[10px]">Transfer Flow</span>
                  <span className="font-bold dark:text-white text-slate-800 flex items-center gap-1.5">
                    <span>{form.fromAccountType}</span>
                    <ArrowRightLeft size={13} className="text-sky-500" />
                    <span>{form.toAccountType}</span>
                  </span>
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

          {/* Category Selector Grid for Expenses & Income */}
          {form.type !== 'transfer' && (
            <div>
              <label className="label mb-2.5">Category</label>
              <div className={`grid ${form.type === 'income' ? 'grid-cols-3 sm:grid-cols-5' : 'grid-cols-4 sm:grid-cols-6 lg:grid-cols-7'} gap-2 sm:gap-3 bg-slate-50/70 dark:bg-dark-bg/40 p-3 sm:p-4 rounded-2xl border dark:border-dark-border border-slate-200/80`}>
                {activeCategories.map(cat => {
                  const isSelected = form.category === cat
                  const color = CATEGORY_COLORS[cat] || '#0EA5E9'
                  const Icon = ICONS[cat] || CircleDot
                  return (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => handleCategorySelect(cat)}
                      className="flex flex-col items-center justify-center py-2 px-1 rounded-xl transition-all focus:outline-none group active:scale-95"
                    >
                      <div
                        className={`w-11 h-11 sm:w-12 sm:h-12 rounded-2xl flex items-center justify-center mb-1.5 transition-all border ${
                          isSelected
                            ? 'scale-105 border-transparent shadow-md'
                            : 'dark:border-dark-border border-slate-200/80 dark:bg-dark-card bg-white dark:text-gray-400 text-slate-500 group-hover:border-sky-500/30'
                        }`}
                        style={{
                          backgroundColor: isSelected ? `${color}22` : undefined,
                          borderColor: isSelected ? color : undefined,
                          color: isSelected ? color : undefined,
                          boxShadow: isSelected ? `0 4px 12px ${color}35` : undefined
                        }}
                      >
                        <Icon size={19} />
                      </div>
                      <span className={`text-[11px] font-semibold tracking-tight text-center leading-tight truncate w-full ${
                        isSelected ? 'dark:text-white text-slate-800 font-bold' : 'dark:text-gray-400 text-slate-500'
                      }`}>
                        {cat}
                      </span>
                    </button>
                  )
                })}
              </div>
            </div>
          )}

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
            {form.type !== 'transfer' && (
              <div>
                <label className="label">{form.type === 'income' ? 'Received In' : 'Paid Using'}</label>
                <select
                  className="input cursor-pointer"
                  value={form.paymentMethod}
                  onChange={handlePaymentChange}
                >
                  {PAYMENT_METHODS.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
              </div>
            )}
            <div className={form.type === 'transfer' ? 'sm:col-span-2' : ''}>
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
            className={`btn-primary min-h-[48px] text-base font-bold shadow-md hover:shadow-lg active:scale-98 transition-all ${
              form.type === 'income' ? '!bg-emerald-500 hover:!bg-emerald-600' : ''
            }`}
          >
            {loading ? (
              <span className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isEditing ? 'Update Transaction' : 'Save Transaction'}
          </button>
        </form>
      </div>
    </div>
  )
}
