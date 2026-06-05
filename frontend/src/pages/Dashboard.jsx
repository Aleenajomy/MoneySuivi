import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, Download, FileText, Repeat, WalletCards } from 'lucide-react'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton, StatCardSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useExpense } from '../context/ExpenseContext'
import { useNotification } from '../context/NotificationContext'
import { formatCurrency, formatShortDate } from '../utils/constants'

const budgetColor = (pct) => {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 90) return 'bg-orange-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

export default function Dashboard() {
  const { user } = useAuth()
  const { analytics, expenses, loading, loadingAnalytics, fetchExpenses, fetchAnalytics } = useExpense()
  const { budgets, fetchBudgets } = useBudget()
  const { notifications, unreadCount, fetchNotifications } = useNotification()
  const navigate = useNavigate()

  useEffect(() => {
    fetchAnalytics()
    fetchExpenses({ page: 1 })
    fetchBudgets()
    fetchNotifications()
  }, [fetchAnalytics, fetchExpenses, fetchBudgets, fetchNotifications])

  const balance = analytics.balance ?? 0
  const totalIncome = analytics.totalIncome ?? 0
  const totalExpense = analytics.totalExpense ?? 0
  const upcomingRecurring = analytics.upcomingRecurring || []
  const topBudgets = budgets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 3)
  const latestAlerts = notifications.slice(0, 2)

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-6 animate-fadeIn pr-12">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Good day,</p>
          <h1 className="text-xl font-bold dark:text-white text-slate-800">{user?.name?.split(' ')[0] || 'there'}</h1>
        </div>
      </div>

      <div
        className="rounded-2xl p-6 mb-4 relative overflow-hidden animate-slideUp shadow-lg hover:shadow-xl transition-shadow"
        style={{ background: 'linear-gradient(135deg, #5B4CB8 0%, #6B5FDB 50%, #9B93DB 100%)' }}
      >
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5" />
        <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-2">Total Balance</p>
        {loadingAnalytics
          ? <div className="h-10 w-44 bg-white/20 rounded-xl animate-pulse mb-3" />
          : <p className="text-4xl font-extrabold text-white mb-3 tracking-tight">{formatCurrency(balance)}</p>}
        <p className="text-blue-200 text-xs">
          {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-5">
        {loadingAnalytics ? (
          <><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <StatCard label="Income" amount={totalIncome} icon={ArrowDownRight} tone="secondary" />
            <StatCard label="Expenses" amount={totalExpense} icon={ArrowUpRight} tone="danger" />
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2 mb-5">
        <button type="button" onClick={() => navigate('/history')} className="btn-secondary flex items-center justify-center gap-2">
          <Download size={15} />
          Export CSV
        </button>
        <button type="button" onClick={() => navigate('/history')} className="btn-primary flex items-center justify-center gap-2">
          <FileText size={15} />
          Export PDF
        </button>
      </div>

      <Widget title="Category Budgets" action="Manage" onAction={() => navigate('/budgets')} icon={WalletCards}>
        {topBudgets.length === 0 ? (
          <p className="text-xs dark:text-gray-500 text-gray-500">No category budgets set yet.</p>
        ) : topBudgets.map(budget => (
          <div key={budget.id} className="mb-3 last:mb-0">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-semibold dark:text-gray-300 text-slate-700">{budget.category}</span>
              <span className="text-xs dark:text-gray-500 text-gray-500">{budget.percentage}%</span>
            </div>
            <div className="h-1.5 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden">
              <div className={`h-full ${budgetColor(budget.percentage)}`} style={{ width: `${Math.min(budget.percentage, 100)}%` }} />
            </div>
            <p className="text-[10px] dark:text-gray-600 text-gray-400 mt-1">
              {formatCurrency(budget.spent)} / {formatCurrency(budget.monthlyLimit)}
            </p>
          </div>
        ))}
      </Widget>

      <Widget title="Upcoming Recurring" action="View" onAction={() => navigate('/history')} icon={Repeat}>
        {upcomingRecurring.length === 0 ? (
          <p className="text-xs dark:text-gray-500 text-gray-500">No recurring expenses due in the next 30 days.</p>
        ) : upcomingRecurring.map(item => (
          <div key={item._id} className="flex items-center justify-between py-1">
            <div>
              <p className="text-xs font-semibold dark:text-gray-300 text-slate-700">{item.title}</p>
              <p className="text-[10px] dark:text-gray-600 text-gray-400">{item.recurringType} - {formatShortDate(item.nextRunDate)}</p>
            </div>
            <span className="text-xs font-bold text-danger">{formatCurrency(item.amount)}</span>
          </div>
        ))}
      </Widget>

      {unreadCount > 0 && (
        <Widget title="Budget Alerts" action="Open" onAction={() => navigate('/notifications')} icon={AlertTriangle}>
          {latestAlerts.map(alert => (
            <div key={alert.id} className="text-xs dark:text-gray-400 text-gray-600 mb-2 last:mb-0">
              <span className={alert.type === 'critical' ? 'text-red-500 font-bold' : 'text-yellow-500 font-bold'}>{alert.category}: </span>
              {alert.message}
            </div>
          ))}
        </Widget>
      )}

      <div className="flex items-center justify-between mb-4 animate-slideLeft">
        <h2 className="font-bold dark:text-white">Recent Transactions</h2>
        <button onClick={() => navigate('/history')} className="text-primary text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-all">
          See all
        </button>
      </div>

      {loading && expenses.length === 0
        ? Array(4).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
        : expenses.length === 0
          ? <EmptyState />
          : expenses.slice(0, 5).map(e => <ExpenseCard key={e._id} expense={e} />)}
    </div>
  )
}

function StatCard({ label, amount, icon: Icon, tone }) {
  const color = tone === 'secondary' ? 'text-secondary bg-secondary/10' : 'text-danger bg-danger/10'
  return (
    <div className="card p-4">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold dark:text-gray-500 text-gray-600 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="dark:text-gray-100 text-slate-800 font-bold text-lg">{formatCurrency(amount)}</p>
    </div>
  )
}

function Widget({ title, action, onAction, icon: Icon, children }) {
  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Icon size={16} />
          </span>
          <h2 className="font-bold dark:text-white text-slate-800 text-sm">{title}</h2>
        </div>
        <button type="button" onClick={onAction} className="text-primary text-xs font-semibold px-2 py-1 rounded-lg bg-primary/10">
          {action}
        </button>
      </div>
      {children}
    </div>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="text-center py-14 animate-scaleIn">
      <p className="dark:text-gray-400 text-gray-600 font-medium">No transactions yet</p>
      <p className="dark:text-gray-600 text-gray-500 text-sm mt-1">Start by adding your first expense</p>
      <button onClick={() => navigate('/add')} className="mt-4 px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold hover:bg-primary/20 transition-all active:scale-95">
        Add Expense
      </button>
    </div>
  )
}
