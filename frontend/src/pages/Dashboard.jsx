import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, Repeat, TrendingUp, UserCircle, WalletCards } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton, StatCardSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useExpense } from '../context/ExpenseContext'
import { useNotification } from '../context/NotificationContext'
import { useEMI } from '../context/EMIContext'
import { useNetWorth } from '../context/NetWorthContext'
import { CATEGORY_COLORS, formatCurrency, formatShortDate } from '../utils/constants'

const budgetColor = (pct) => {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 90) return 'bg-orange-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

const getDisplayBalances = (analytics) => {
  const cash = Number(analytics.cashBalance || 0)
  const upi = Number(analytics.upiBalance || 0)
  const creditCard = Number(analytics.creditCardBalance || 0)
  const debitCard = Number(analytics.debitCardBalance || 0)
  const netBanking = Number(analytics.netBankingBalance || 0)
  const breakdown = cash + upi + creditCard + debitCard + netBanking
  const total = breakdown !== 0 ? breakdown : Number(analytics.totalBalance ?? analytics.balance ?? 0)
  return { cash, upi, creditCard, debitCard, netBanking, total }
}

export default function Dashboard() {
  const { user } = useAuth()
  const { analytics, expenses, loading, loadingAnalytics, fetchExpenses, fetchAnalytics } = useExpense()
  const { budgets, fetchBudgets } = useBudget()
  const { notifications, unreadCount, fetchNotifications } = useNotification()
  const { emis, fetchEMIs } = useEMI()
  const { summary, fetchNetWorth } = useNetWorth()
  const [showBalanceBreakdown, setShowBalanceBreakdown] = useState(false)
  const navigate = useNavigate()

  useEffect(() => {
    fetchAnalytics()
    fetchExpenses({ page: 1 })
    fetchBudgets()
    fetchNotifications()
    fetchEMIs()
    fetchNetWorth()
  }, [fetchAnalytics, fetchExpenses, fetchBudgets, fetchNotifications, fetchEMIs, fetchNetWorth])

  const totalIncome = analytics.totalIncome ?? 0
  const totalExpense = analytics.totalExpense ?? 0
  const upcomingRecurring = analytics.upcomingRecurring || []
  const topBudgets = budgets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 3)
  const latestAlerts = notifications.slice(0, 2)
  const upcomingEMIs = emis.filter(e => e.active).slice(0, 3)
  const netWorth = summary.netWorth ?? 0
  const isPositiveNW = netWorth >= 0

  const { cash: cashAmount, upi: upiAmount, creditCard: creditCardAmount, debitCard: debitCardAmount, netBanking: netBankingAmount, total: displayBalance } = getDisplayBalances(analytics)
  const balanceAlerts = analytics.balanceAlerts || []

  return (
    <div className="page">
      <div className="flex items-center justify-between mb-6 animate-fadeIn pr-12">
        <button
          type="button"
          onClick={() => navigate('/profile')}
          className="flex items-center gap-3 text-left rounded-xl active:scale-95 transition-transform"
        >
          <span className="w-10 h-10 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <UserCircle size={22} />
          </span>
          <span>
            <span className="block text-gray-500 dark:text-gray-400 text-sm">Good day,</span>
            <span className="block text-xl font-bold dark:text-white text-slate-800">{user?.name?.split(' ')[0] || 'there'}</span>
          </span>
        </button>
      </div>

      <button
        type="button"
        onClick={() => setShowBalanceBreakdown(true)}
        className="w-full text-left rounded-2xl p-6 mb-4 relative overflow-hidden animate-slideUp shadow-lg hover:shadow-xl active:scale-[0.98] transition-shadow"
        style={{ background: 'linear-gradient(135deg, #0284C7 0%, #0EA5E9 50%, #38BDF8 100%)' }}
      >
        <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/5" />
        <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5" />
        <p className="text-blue-200 text-xs font-semibold uppercase tracking-widest mb-2">Total Balance</p>
        {loadingAnalytics
          ? <div className="h-10 w-44 bg-white/20 rounded-xl animate-pulse mb-3" />
          : <p className="text-4xl font-extrabold text-white mb-3 tracking-tight">{formatCurrency(displayBalance)}</p>}
        <p className="text-blue-200 text-xs">
          Cash, bank and wallet balances
        </p>
      </button>

      {balanceAlerts.length > 0 && (
        <div className="card p-4 mb-5 border-yellow-400/30">
          {balanceAlerts.map(alert => (
            <div key={alert.message} className="flex items-start gap-2 text-xs dark:text-yellow-200 text-yellow-700 mb-2 last:mb-0">
              <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
              <span>{alert.message}</span>
            </div>
          ))}
        </div>
      )}

      {showBalanceBreakdown && !loadingAnalytics && (
        <BalanceModal
          cashAmount={cashAmount}
          upiAmount={upiAmount}
          creditCardAmount={creditCardAmount}
          debitCardAmount={debitCardAmount}
          netBankingAmount={netBankingAmount}
          total={displayBalance}
          onClose={() => setShowBalanceBreakdown(false)}
        />
      )}

      <div className="grid grid-cols-2 gap-3 mb-5">
        {loadingAnalytics ? (
          <><StatCardSkeleton /><StatCardSkeleton /></>
        ) : (
          <>
            <StatCard label="Income" amount={totalIncome} icon={ArrowDownRight} tone="secondary" onClick={() => navigate('/add?type=income')} />
            <StatCard label="Expenses" amount={totalExpense} icon={ArrowUpRight} tone="danger" onClick={() => navigate('/add?type=expense')} />
          </>
        )}
      </div>

      {/* Net Worth Mini Card */}
      <button
        type="button"
        onClick={() => navigate('/networth')}
        className="w-full card p-4 mb-5 flex items-center justify-between active:scale-[0.98] transition-transform"
      >
        <div className="flex items-center gap-3">
          <span className={`w-10 h-10 rounded-xl flex items-center justify-center ${isPositiveNW ? 'bg-secondary/10' : 'bg-danger/10'}`}>
            <TrendingUp size={18} className={isPositiveNW ? 'text-secondary' : 'text-danger'} />
          </span>
          <div className="text-left">
            <p className="text-xs dark:text-gray-500 text-gray-400 font-medium">Net Worth</p>
            <p className={`text-lg font-extrabold ${isPositiveNW ? 'text-secondary' : 'text-danger'}`}>{formatCurrency(netWorth)}</p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-[10px] dark:text-gray-600 text-gray-400">Assets</p>
          <p className="text-xs font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(summary.totalAssets)}</p>
          <p className="text-[10px] dark:text-gray-600 text-gray-400 mt-1">Liabilities</p>
          <p className="text-xs font-semibold dark:text-gray-300 text-slate-700">{formatCurrency(summary.totalLiabilities)}</p>
        </div>
      </button>

      <AnalysisWidget
        analytics={analytics}
        loading={loadingAnalytics}
        onAction={() => navigate('/analytics')}
      />

      <Widget title="Upcoming EMIs" action="View All" onAction={() => navigate('/emis')} icon={CreditCard}>
        {upcomingEMIs.length === 0 ? (
          <p className="text-xs dark:text-gray-500 text-gray-500">No active EMIs.</p>
        ) : upcomingEMIs.map(emi => (
          <div key={emi.id} className="flex items-center justify-between py-1.5 border-b dark:border-dark-border border-light-border last:border-0">
            <div>
              <p className="text-xs font-semibold dark:text-gray-300 text-slate-700">{emi.title}</p>
              <p className="text-[10px] dark:text-gray-600 text-gray-400">
                {emi.paidInstallments}/{emi.totalInstallments} paid · Due {formatShortDate(emi.nextDueDate)}
              </p>
            </div>
            <span className="text-xs font-bold text-danger">{formatCurrency(emi.emiAmount)}/mo</span>
          </div>
        ))}
      </Widget>

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
            <div className="flex items-center justify-between mt-1">
              <p className="text-[10px] dark:text-gray-600 text-gray-400">
                {formatCurrency(budget.spent)} / {formatCurrency(budget.monthlyLimit)}
              </p>
              <p className="text-[10px] font-semibold dark:text-gray-300 text-slate-700">
                Left: {formatCurrency(budget.remaining)}
              </p>
            </div>
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
        <button onClick={() => navigate('/history')} className="text-sky-500 text-xs font-semibold px-3 py-1.5 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all">
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

function AnalysisWidget({ analytics, loading, onAction }) {
  const categoryData = (analytics.categorySpending || []).map(item => ({
    name: item._id,
    value: item.total,
    color: CATEGORY_COLORS[item._id] || '#0EA5E9',
  }))
  const totalSpent = categoryData.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <span className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <BarChart3 size={16} />
          </span>
          <h2 className="font-bold dark:text-white text-slate-800 text-sm">Spending Analysis</h2>
        </div>
        <button type="button" onClick={onAction} className="text-sky-500 text-xs font-semibold px-2 py-1 rounded-lg bg-sky-500/10">
          Details
        </button>
      </div>

      {loading ? (
        <div className="h-[170px] rounded-xl dark:bg-dark-bg bg-light-muted animate-pulse" />
      ) : categoryData.length > 0 ? (
        <div className="flex items-center gap-4">
          <div className="relative flex-shrink-0">
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={categoryData} cx="50%" cy="50%"
                  innerRadius={48} outerRadius={70}
                  dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270}>
                  {categoryData.map((entry, i) => (
                    <Cell key={i} fill={entry.color} stroke="transparent" />
                  ))}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <p className="text-[10px] dark:text-gray-500 text-gray-400">Total</p>
              <p className="text-sm font-bold dark:text-white text-slate-800">{formatCurrency(totalSpent)}</p>
            </div>
          </div>
          <div className="flex-1 space-y-2.5">
            {categoryData.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                  <span className="text-xs dark:text-gray-400 text-gray-500">{item.name}</span>
                </div>
                <span className="text-xs font-semibold dark:text-white text-slate-700">
                  {Math.round((item.value / totalSpent) * 100)}%
                </span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="text-center py-8">
          <p className="dark:text-gray-400 text-gray-500 text-sm font-medium">No analytics yet</p>
          <p className="dark:text-gray-600 text-gray-400 text-xs mt-1">Add expenses to build your graph.</p>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, amount, icon: Icon, tone, onClick }) {
  const color = tone === 'secondary' ? 'text-secondary bg-secondary/10' : 'text-danger bg-danger/10'
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-4 text-left ${onClick ? 'active:scale-[0.98] transition-transform' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs font-semibold dark:text-gray-500 text-gray-600 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="dark:text-gray-100 text-slate-800 font-bold text-lg">{formatCurrency(amount)}</p>
    </Component>
  )
}

function BalanceModal({ cashAmount, upiAmount, creditCardAmount, debitCardAmount, netBankingAmount, total, onClose }) {
  return (
    <div className="fixed inset-0 z-50 bg-black/50 px-4 flex items-center justify-center" onClick={onClose}>
      <div className="card p-5 w-full max-w-sm shadow-2xl animate-scaleIn" onClick={e => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-lg font-bold dark:text-white text-slate-800">Account Summary</h2>
          <button type="button" onClick={onClose} className="text-xs font-semibold text-sky-500 px-3 py-1.5 rounded-lg bg-sky-500/10">
            Close
          </button>
        </div>
        <SummaryRow label="Cash" amount={cashAmount} />
        <SummaryRow label="UPI" amount={upiAmount} />
        <SummaryRow label="Credit Card" amount={creditCardAmount} />
        <SummaryRow label="Debit Card" amount={debitCardAmount} />
        <SummaryRow label="Net Banking" amount={netBankingAmount} />
        <div className="border-t dark:border-dark-border border-light-border mt-4 pt-4">
          <SummaryRow label="Total Balance" amount={total} strong />
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, amount, strong = false }) {
  return (
    <div className="flex items-center justify-between py-2">
      <span className={`${strong ? 'font-bold dark:text-white text-slate-800' : 'dark:text-gray-400 text-gray-600'} text-sm`}>{label}</span>
      <span className={`${strong ? 'text-lg' : 'text-sm'} font-bold dark:text-white text-slate-800`}>{formatCurrency(amount)}</span>
    </div>
  )
}

function Widget({ title, action, onAction, icon: Icon, children }) {
  return (
    <div className="card p-4 mb-5">
      <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
            <Icon size={16} />
          </span>
          <h2 className="font-bold dark:text-white text-slate-800 text-sm">{title}</h2>
        </div>
        <button type="button" onClick={onAction} className="text-sky-500 text-xs font-semibold px-2 py-1 rounded-lg bg-sky-500/10">
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
      <button onClick={() => navigate('/add')} className="mt-4 px-5 py-2.5 rounded-xl bg-sky-500/10 text-sky-500 text-sm font-semibold hover:bg-sky-500/20 transition-all active:scale-95">
        Add Expense
      </button>
    </div>
  )
}
