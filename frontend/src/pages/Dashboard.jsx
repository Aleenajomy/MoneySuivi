import { useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useExpense } from '../context/ExpenseContext'
import { useTheme } from '../context/ThemeContext'
import { ArrowDownRight, ArrowUpRight, AlertTriangle, Bell } from 'lucide-react'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton, StatCardSkeleton } from '../components/Skeleton'
import { formatCurrency } from '../utils/constants'

export default function Dashboard() {
  const { user } = useAuth()
  const { analytics, expenses, loading, loadingAnalytics, fetchExpenses, fetchAnalytics } = useExpense()
  const navigate = useNavigate()

  useEffect(() => {
    fetchAnalytics()
    fetchExpenses({ page: 1 })
  }, [])

  const balance = analytics.balance ?? 0
  const totalIncome = analytics.totalIncome ?? 0
  const totalExpense = analytics.totalExpense ?? 0
  const budgetLimit = user?.budgetLimit || 0
  const budgetUsed = budgetLimit > 0 ? totalExpense / budgetLimit : 0
  const showBudgetWarning = budgetLimit > 0 && budgetUsed >= 0.8

  return (
    <div className="page">

      {/* Header */}
      <div className="flex items-center justify-between mb-6 animate-fadeIn">
        <div>
          <p className="text-gray-500 dark:text-gray-400 text-sm">Good day,</p>
          <h1 className="text-xl font-bold dark:text-white text-slate-800">{user?.name?.split(' ')[0]} 👋</h1>
        </div>
        <button className="w-10 h-10 rounded-xl card border
                           flex items-center justify-center relative
                           transition-transform hover:scale-105">
          <Bell size={18} className="dark:text-gray-400 text-gray-500" />
          <span className="absolute top-2 right-2 w-2 h-2 rounded-full bg-primary animate-pulse" />
        </button>
      </div>

      {/* Balance Card */}
      <div className="rounded-2xl p-6 mb-4 relative overflow-hidden animate-slideUp
                      shadow-lg hover:shadow-xl transition-shadow"
        style={{ background: 'linear-gradient(135deg, #5B4CB8 0%, #6B5FDB 50%, #9B93DB 100%)' }}>
        {/* decorative circles */}
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5" />

        <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-2">
          Total Balance
        </p>
        {loadingAnalytics
          ? <div className="h-10 w-44 bg-white/20 rounded-xl animate-pulse mb-3" />
          : <p className="text-4xl font-extrabold text-white mb-3 tracking-tight">
              {formatCurrency(balance)}
            </p>
        }
        <p className="text-blue-200 text-xs">
          {new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
        </p>
      </div>

      {/* Income / Expense stat cards */}
      <div className="grid grid-cols-2 gap-3 mb-5">
        {loadingAnalytics ? (
          <><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <div className="card p-4 animate-slideLeft">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold dark:text-gray-500 text-gray-600 uppercase tracking-wide">Income</span>
                <div className="w-8 h-8 rounded-xl bg-secondary/10 flex items-center justify-center">
                  <ArrowDownRight size={16} className="text-secondary" />
                </div>
              </div>
              <p className="dark:text-white text-slate-800 font-bold text-lg">{formatCurrency(totalIncome)}</p>
              <div className="mt-2 h-1 dark:bg-dark-border bg-light-border rounded-full">
                <div className="h-full bg-secondary rounded-full transition-all" style={{ width: '60%' }} />
              </div>
            </div>

            <div className="card p-4 animate-slideRight">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold dark:text-gray-500 text-gray-600 uppercase tracking-wide">Expenses</span>
                <div className="w-8 h-8 rounded-xl bg-danger/10 flex items-center justify-center">
                  <ArrowUpRight size={16} className="text-danger" />
                </div>
              </div>
              <p className="dark:text-white text-slate-800 font-bold text-lg">{formatCurrency(totalExpense)}</p>
              <div className="mt-2 h-1 dark:bg-dark-border bg-light-border rounded-full">
                <div className="h-full bg-danger rounded-full transition-all"
                  style={{ width: budgetLimit > 0 ? `${Math.min(budgetUsed * 100, 100)}%` : '45%' }} />
              </div>
            </div>
          </>
        )}
      </div>

      {/* Budget Warning */}
      {showBudgetWarning && (
        <div className={`rounded-xl p-4 mb-5 border flex items-start gap-3 animate-slideDown
          ${budgetUsed >= 1
            ? 'bg-danger/10 border-danger/20'
            : 'bg-warning/10 border-warning/20'}`}>
          <AlertTriangle size={16} className={budgetUsed >= 1 ? 'text-danger mt-0.5' : 'text-warning mt-0.5'} />
          <div className="flex-1">
            <p className={`text-xs font-bold ${budgetUsed >= 1 ? 'text-danger' : 'text-warning'}`}>
              {budgetUsed >= 1 ? 'Budget Exceeded!' : 'Approaching Budget Limit'}
            </p>
            <div className="h-1.5 dark:bg-dark-border bg-light-border rounded-full mt-2">
              <div className="h-full rounded-full transition-all"
                style={{
                  width: `${Math.min(budgetUsed * 100, 100)}%`,
                  backgroundColor: budgetUsed >= 1 ? '#F87171' : '#FBBF24'
                }} />
            </div>
            <p className="text-[11px] dark:text-gray-500 text-gray-600 mt-1.5">
              {formatCurrency(totalExpense)} spent of {formatCurrency(budgetLimit)} limit
            </p>
          </div>
        </div>
      )}

      {/* Recent Transactions */}
      <div className="flex items-center justify-between mb-4 animate-slideLeft">
        <h2 className="font-bold dark:text-white">Recent Transactions</h2>
        <button onClick={() => navigate('/history')}
          className="text-primary text-xs font-semibold px-3 py-1.5 rounded-lg bg-primary/10
                     hover:bg-primary/20 transition-all">
          See all
        </button>
      </div>

      {loading && expenses.length === 0
        ? Array(4).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
        : expenses.length === 0
          ? <EmptyState />
          : expenses.slice(0, 5).map(e => <ExpenseCard key={e._id} expense={e} />)
      }
    </div>
  )
}

function EmptyState() {
  const navigate = useNavigate()
  return (
    <div className="text-center py-14 animate-scaleIn">
      <div className="w-16 h-16 rounded-2xl dark:bg-dark-card dark:border-dark-border
                      bg-light-card border-light-border
                      flex items-center justify-center mx-auto mb-4 animate-bounce">
        <span className="text-3xl">💸</span>
      </div>
      <p className="dark:text-gray-400 text-gray-600 font-medium">No transactions yet</p>
      <p className="dark:text-gray-600 text-gray-500 text-sm mt-1">Start by adding your first expense</p>
      <button onClick={() => navigate('/add')}
        className="mt-4 px-5 py-2.5 rounded-xl bg-primary/10 text-primary text-sm font-semibold
                   hover:bg-primary/20 transition-all active:scale-95">
        Add Expense
      </button>
    </div>
  )
}
