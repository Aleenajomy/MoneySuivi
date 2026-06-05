import { useEffect, useState } from 'react'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { ArrowLeft, Repeat } from 'lucide-react'
import toast from 'react-hot-toast'
import { useExpense } from '../context/ExpenseContext'
import api from '../services/api'
import {
  CATEGORIES,
  CATEGORY_COLORS,
  CATEGORY_ICONS,
  EXPENSE_CATEGORIES,
  INCOME_CATEGORIES,
  PAYMENT_METHODS,
} from '../utils/constants'

const today = new Date().toISOString().split('T')[0]

const defaultForm = {
  title: '',
  amount: '',
  category: CATEGORIES[0],
  type: 'expense',
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
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (!isEditing) return
    api.get(`/expenses/${id}`).then(res => {
      const e = res.data.expense
      setForm({
        title: e.title,
        amount: e.amount,
        category: e.category,
        type: e.type,
        paymentMethod: e.paymentMethod,
        note: e.note || '',
        expenseDate: e.expenseDate.split('T')[0],
        recurring: Boolean(e.recurring),
        recurringType: e.recurringType || 'monthly',
      })
    }).catch(() => toast.error('Failed to load transaction'))
  }, [id, isEditing])

  useEffect(() => {
    if (isEditing) return
    const type = searchParams.get('type')
    if (type === 'income' || type === 'expense') {
      handleTypeChange(type)
    }
  }, [isEditing, searchParams])

  const set = key => e => setForm(prev => ({ ...prev, [key]: e.target.value }))
  const setChecked = key => e => setForm(prev => ({ ...prev, [key]: e.target.checked }))
  const activeCategories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const handleTypeChange = (type) => {
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    setForm(prev => ({
      ...prev,
      type,
      category: cats[0],
      recurring: type === 'expense' ? prev.recurring : false,
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount')

    setLoading(true)
    try {
      const data = {
        ...form,
        amount: Number(form.amount),
        recurring: form.type === 'expense' && form.recurring,
        recurringType: form.type === 'expense' && form.recurring ? form.recurringType : undefined,
      }
      if (isEditing) await updateExpense(id, data)
      else await addExpense(data)
      navigate(-1)
    } catch (err) {
      toast.error(err.message || 'Something went wrong')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen dark:bg-dark-bg bg-light-bg px-4 py-6">
      <div className="flex items-center gap-3 mb-7">
        <button
          type="button"
          onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border border flex items-center justify-center"
        >
          <ArrowLeft size={18} className="dark:text-gray-400 text-gray-500" />
        </button>
        <h1 className="text-lg font-bold dark:text-white text-slate-800">
          {isEditing ? 'Edit Transaction' : 'New Transaction'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="card p-1.5 flex gap-1">
          {['expense', 'income'].map(type => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all ${
                form.type === type
                  ? type === 'expense'
                    ? 'bg-red-500 text-white shadow-sm'
                    : 'bg-green-500 text-white shadow-sm'
                  : 'dark:text-gray-600 text-gray-400 hover:text-gray-500'
              }`}
            >
              {type === 'expense' ? 'Expense' : 'Income'}
            </button>
          ))}
        </div>

        <div className="card p-5 text-center">
          <label className="label text-center block mb-3">Amount</label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-2xl font-bold dark:text-gray-400 text-gray-500">Rs.</span>
            <input
              type="number"
              step="0.01"
              min="0.01"
              required
              className="text-4xl font-extrabold dark:text-white text-slate-800 bg-transparent outline-none text-center w-full dark:placeholder-gray-700 placeholder-gray-300"
              placeholder="0.00"
              value={form.amount}
              onChange={set('amount')}
            />
          </div>
        </div>

        <div>
          <label className="label">Title</label>
          <input className="input" placeholder="e.g. Lunch, Salary, Rent" value={form.title} onChange={set('title')} required />
        </div>

        <div>
          <label className="label">Category</label>
          <div className="grid grid-cols-4 gap-2">
            {activeCategories.map(cat => {
              const isSelected = form.category === cat
              const color = CATEGORY_COLORS[cat] || '#0066FF'
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setForm(prev => ({ ...prev, category: cat }))}
                  className={`p-2.5 rounded-xl text-center transition-all border ${
                    isSelected ? 'border-primary bg-primary/10' : 'dark:border-dark-border border-light-border dark:bg-dark-card bg-light-card'
                  }`}
                >
                  <div className="text-xs font-bold mb-1" style={{ color }}>{CATEGORY_ICONS[cat]}</div>
                  <div className={`text-[10px] font-semibold truncate ${isSelected ? 'text-primary' : 'dark:text-gray-600 text-gray-500'}`}>
                    {cat}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Payment</label>
            <select className="input" value={form.paymentMethod} onChange={set('paymentMethod')}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={today} value={form.expenseDate} onChange={set('expenseDate')} />
          </div>
        </div>

        {form.type === 'expense' && (
          <div className="card p-4">
            <label className="flex items-center justify-between gap-3">
              <span className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center">
                  <Repeat size={16} className="text-primary" />
                </span>
                <span>
                  <span className="block text-sm font-semibold dark:text-white text-slate-800">Recurring</span>
                  <span className="block text-xs dark:text-gray-500 text-gray-500">Automatically create future expenses</span>
                </span>
              </span>
              <input type="checkbox" className="w-5 h-5 accent-indigo-500" checked={form.recurring} onChange={setChecked('recurring')} />
            </label>

            {form.recurring && (
              <div className="mt-4">
                <label className="label">Repeat</label>
                <select className="input" value={form.recurringType} onChange={set('recurringType')}>
                  <option value="weekly">Weekly</option>
                  <option value="monthly">Monthly</option>
                </select>
              </div>
            )}
          </div>
        )}

        <div>
          <label className="label">Note <span className="normal-case text-gray-700">(optional)</span></label>
          <textarea className="input resize-none" rows={3} placeholder="Add a note..." value={form.note} onChange={set('note')} />
        </div>

        <button
          type="submit"
          disabled={loading}
          className={`w-full py-4 rounded-xl text-white font-bold text-sm active:scale-95 transition-all disabled:opacity-50 ${
            form.type === 'income' ? 'gradient-green' : 'gradient-blue'
          }`}
        >
          {loading ? 'Saving...' : isEditing ? 'Update Transaction' : 'Add Transaction'}
        </button>
      </form>
    </div>
  )
}
