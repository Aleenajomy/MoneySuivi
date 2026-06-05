import { useState, useEffect } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useExpense } from '../context/ExpenseContext'
import { ArrowLeft } from 'lucide-react'
import { CATEGORIES, INCOME_CATEGORIES, EXPENSE_CATEGORIES, PAYMENT_METHODS, CATEGORY_ICONS, CATEGORY_COLORS } from '../utils/constants'
import toast from 'react-hot-toast'
import api from '../services/api'

const today = new Date().toISOString().split('T')[0]

const defaultForm = {
  title: '', amount: '', category: CATEGORIES[0],
  type: 'expense', paymentMethod: PAYMENT_METHODS[0],
  note: '', expenseDate: today
}

export default function AddExpense() {
  const { id } = useParams()
  const isEditing = Boolean(id)
  const navigate = useNavigate()
  const { addExpense, updateExpense } = useExpense()
  const [form, setForm] = useState(defaultForm)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (isEditing) {
      api.get(`/expenses/${id}`).then(res => {
        const e = res.data.expense
        setForm({
          title: e.title, amount: e.amount, category: e.category,
          type: e.type, paymentMethod: e.paymentMethod,
          note: e.note || '', expenseDate: e.expenseDate.split('T')[0]
        })
      }).catch(() => toast.error('Failed to load expense'))
    }
  }, [id])

  const set = key => e => setForm(p => ({ ...p, [key]: e.target.value }))

  const activeCategories = form.type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  const handleTypeChange = (type) => {
    const cats = type === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES
    setForm(p => ({ ...p, type, category: cats[0] }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!form.title.trim()) return toast.error('Title is required')
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount')
    setLoading(true)
    try {
      const data = { ...form, amount: Number(form.amount) }
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

      {/* Header */}
      <div className="flex items-center gap-3 mb-7">
        <button onClick={() => navigate(-1)}
          className="w-10 h-10 rounded-xl dark:bg-dark-card bg-light-card
                     dark:border-dark-border border-light-border border
                     flex items-center justify-center">
          <ArrowLeft size={18} className="dark:text-gray-400 text-gray-500" />
        </button>
        <h1 className="text-lg font-bold dark:text-white text-slate-800">
          {isEditing ? 'Edit Expense' : 'New Transaction'}
        </h1>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">

        {/* Type Toggle */}
        <div className="card p-1.5 flex gap-1">
          {['expense', 'income'].map(type => (
            <button key={type} type="button"
              onClick={() => handleTypeChange(type)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all
                      ${
                        form.type === type
                          ? type === 'expense'
                            ? 'bg-red-500 text-white shadow-sm'
                            : 'bg-green-500 text-white shadow-sm'
                          : 'dark:text-gray-600 text-gray-400 hover:text-gray-500'
                      }`}>
              {type === 'expense' ? '💸 Expense' : '💰 Income'}
            </button>
          ))}
        </div>

        {/* Amount — big input */}
        <div className="card p-5 text-center">
          <label className="label text-center block mb-3">Amount</label>
          <div className="flex items-center justify-center gap-2">
            <span className="text-3xl font-bold dark:text-gray-400 text-gray-500">₹</span>
            <input
              type="number" step="0.01" min="0.01" required
              className="text-4xl font-extrabold dark:text-white text-slate-800 bg-transparent outline-none
                         text-center w-full dark:placeholder-gray-700 placeholder-gray-300"
              placeholder="0.00"
              value={form.amount} onChange={set('amount')} />
          </div>
        </div>

        {/* Title */}
        <div>
          <label className="label">Title</label>
          <input className="input" placeholder="e.g. Lunch, Salary, Rent"
            value={form.title} onChange={set('title')} required />
        </div>

        {/* Category Grid */}
        <div>
          <label className="label">Category</label>
          <div className="grid grid-cols-4 gap-2">
            {activeCategories.map(cat => {
              const isSelected = form.category === cat
              const color = CATEGORY_COLORS[cat] || '#0066FF'
              return (
                <button key={cat} type="button"
                  onClick={() => setForm(p => ({ ...p, category: cat }))}
                  className={`p-2.5 rounded-xl text-center transition-all border
                    ${isSelected ? 'border-primary bg-primary/10' : 'dark:border-dark-border border-light-border dark:bg-dark-card bg-light-card'}`}>
                  <div className="text-2xl mb-1">{CATEGORY_ICONS[cat]}</div>
                  <div className={`text-[10px] font-semibold truncate
                    ${isSelected ? 'text-primary' : 'dark:text-gray-600 text-gray-500'}`}>
                    {cat}
                  </div>
                </button>
              )
            })}
          </div>
        </div>

        {/* Payment + Date row */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label">Payment</label>
            <select className="input" value={form.paymentMethod} onChange={set('paymentMethod')}>
              {PAYMENT_METHODS.map(m => <option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <label className="label">Date</label>
            <input type="date" className="input" max={today}
              value={form.expenseDate} onChange={set('expenseDate')} />
          </div>
        </div>

        {/* Note */}
        <div>
          <label className="label">Note <span className="normal-case text-gray-700">(optional)</span></label>
          <textarea className="input resize-none" rows={3}
            placeholder="Add a note..."
            value={form.note} onChange={set('note')} />
        </div>

        {/* Submit */}
        <button type="submit" disabled={loading}
          className={`w-full py-4 rounded-xl text-white font-bold text-sm
                      active:scale-95 transition-all disabled:opacity-50
                      ${form.type === 'income' ? 'gradient-green' : 'gradient-blue'}`}>
          {loading
            ? <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
              </span>
            : isEditing ? 'Update Transaction' : 'Add Transaction'
          }
        </button>
      </form>
    </div>
  )
}
