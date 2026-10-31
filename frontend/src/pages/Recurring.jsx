import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Repeat, Pencil, StopCircle, Plus, CalendarClock } from 'lucide-react'
import toast from 'react-hot-toast'
import api from '../services/api'
import { formatCurrency, formatDate } from '../utils/constants'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { ExpenseCardSkeleton } from '../components/Skeleton'

const INTERVAL_LABEL = { weekly: 'Weekly', monthly: 'Monthly' }

const byNextRun = (a, b) => new Date(a.nextRunDate || 0) - new Date(b.nextRunDate || 0)

export default function Recurring() {
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [stopping, setStopping] = useState(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/expenses', { params: { recurring: true, limit: 100 } })
      setItems([...(res.data.expenses || [])].sort(byNextRun))
    } catch {
      toast.error('Could not load recurring payments')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const confirmStop = async () => {
    const item = stopping
    setStopping(null)
    try {
      await api.put(`/expenses/${item.id}`, { recurring: false })
      setItems(prev => prev.filter(i => i.id !== item.id))
      toast.success(`${item.title} stopped`)
    } catch {
      toast.error('Could not stop this payment')
    }
  }

  const monthlyTotal = items.reduce((sum, i) => {
    const amount = Number(i.amount || 0)
    return sum + (i.recurringType === 'weekly' ? (amount * 52) / 12 : amount)
  }, 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Recurring Payments"
        subtitle="Rent, subscriptions and other repeating expenses"
        showBack
        actions={
          <button
            onClick={() => navigate('/add')}
            className="w-10 h-10 rounded-xl bg-sky-500 hover:bg-sky-600 text-white flex items-center justify-center transition-all active:scale-95 shadow-md shadow-sky-500/20"
            aria-label="Add recurring payment"
          >
            <Plus size={20} />
          </button>
        }
      />

      {!loading && items.length > 0 && (
        <div className="card p-4 flex items-center justify-between">
          <div>
            <p className="text-[10px] uppercase font-bold tracking-wider dark:text-gray-400 text-slate-500">Approx. per month</p>
            <p className="text-2xl font-black tabular-nums dark:text-white text-slate-800 mt-0.5">{formatCurrency(monthlyTotal)}</p>
          </div>
          <span className="text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400">
            {items.length} active
          </span>
        </div>
      )}

      {loading ? (
        Array(3).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
      ) : items.length === 0 ? (
        <EmptyState
          icon={Repeat}
          title="No recurring payments"
          description="Add an expense and turn on Recurring to schedule rent, subscriptions or bills."
          actionLabel="Add Transaction"
          onAction={() => navigate('/add')}
        />
      ) : (
        <div className="space-y-2.5">
          {items.map(item => (
            <div key={item.id} className="card p-4" data-testid="recurring-item">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-bold text-sm dark:text-white text-slate-800 truncate">{item.title}</p>
                  <p className="text-xs dark:text-gray-400 text-slate-500 mt-0.5">
                    {INTERVAL_LABEL[item.recurringType] || item.recurringType} · {item.category}
                    {item.paymentMethod ? ` · ${item.paymentMethod}` : ''}
                  </p>
                </div>
                <p className="font-bold text-sm tabular-nums text-danger flex-shrink-0">-{formatCurrency(item.amount)}</p>
              </div>

              <div className="flex items-center justify-between gap-3 mt-3 pt-3 border-t dark:border-dark-border border-light-border">
                <span className="flex items-center gap-1.5 text-xs dark:text-gray-300 text-slate-600">
                  <CalendarClock size={14} className="text-sky-500" />
                  Next: {item.nextRunDate ? formatDate(item.nextRunDate) : 'not scheduled'}
                </span>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => navigate(`/edit/${item.id}`)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-sky-500/10 text-sky-600 dark:text-sky-400 active:scale-95 transition-all"
                  >
                    <Pencil size={13} /> Edit
                  </button>
                  <button
                    type="button"
                    onClick={() => setStopping(item)}
                    className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 active:scale-95 transition-all"
                  >
                    <StopCircle size={13} /> Stop
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={Boolean(stopping)}
        title="Stop this payment?"
        message={stopping ? `${stopping.title} will no longer be added automatically. Payments already recorded stay in your history.` : ''}
        confirmText="Stop"
        variant="warning"
        onConfirm={confirmStop}
        onCancel={() => setStopping(null)}
      />
    </div>
  )
}
