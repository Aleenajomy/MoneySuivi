import { useEffect, useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { AlertTriangle, ArrowDownRight, ArrowUpRight, BarChart3, CreditCard, Repeat, TrendingUp, WalletCards, Clock, X, TrendingDown, Sparkles, Plus } from 'lucide-react'
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts'
import { motion } from 'framer-motion'
import ExpenseCard from '../components/ExpenseCard'
import { ExpenseCardSkeleton, StatCardSkeleton } from '../components/Skeleton'
import { useAuth } from '../context/AuthContext'
import { useBudget } from '../context/BudgetContext'
import { useExpense } from '../context/ExpenseContext'
import { useNotification } from '../context/NotificationContext'
import { useEMI } from '../context/EMIContext'
import { useNetWorth } from '../context/NetWorthContext'
import { CATEGORY_COLORS, formatCurrency, formatShortDate, getLoanDetails } from '../utils/constants'

const budgetColor = (pct) => {
  if (pct >= 100) return 'bg-red-500'
  if (pct >= 90) return 'bg-orange-500'
  if (pct >= 70) return 'bg-yellow-400'
  return 'bg-emerald-500'
}

const getDisplayBalances = (analytics) => {
  const cash = Math.max(0, Number(analytics.cashBalance || 0))
  const upi = Math.max(0, Number(analytics.upiBalance || 0))
  const creditCard = Number(analytics.creditCardBalance || 0) // Credit card can be negative (money owed)
  const debitCard = Math.max(0, Number(analytics.debitCardBalance || 0))
  const netBanking = Math.max(0, Number(analytics.netBankingBalance || 0))
  const breakdown = cash + upi + creditCard + debitCard + netBanking
  const total = breakdown !== 0 ? Math.max(0, breakdown) : Math.max(0, Number(analytics.totalBalance ?? analytics.balance ?? 0))
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
  const [showDailyAlert, setShowDailyAlert] = useState(false)
  const [todaySpend, setTodaySpend] = useState(0)
  const [period, setPeriod] = useState('this_month')
  const navigate = useNavigate()

  useEffect(() => {
    fetchAnalytics(period)
    fetchExpenses({ page: 1 })
    fetchBudgets()
    fetchNotifications()
    fetchEMIs()
    fetchNetWorth()
  }, [fetchAnalytics, fetchExpenses, fetchBudgets, fetchNotifications, fetchEMIs, fetchNetWorth, period])

  // Daily spending alert — show once per calendar day, using only today's expenses
  useEffect(() => {
    if (loading || expenses.length === 0) return
    const today = new Date().toISOString().slice(0, 10)
    const lastShown = localStorage.getItem('dailyAlertShownDate')
    if (lastShown === today) return

    const todayTotal = expenses
      .filter(e => {
        if (e.type !== 'expense') return false
        const d = new Date(e.expenseDate)
        return d.toISOString().slice(0, 10) === today
      })
      .reduce((sum, e) => sum + Number(e.amount), 0)

    if (todayTotal > 0) {
      setTodaySpend(todayTotal)
      setShowDailyAlert(true)
      localStorage.setItem('dailyAlertShownDate', today)
    }
  }, [loading, expenses])

  const totalIncome = analytics.totalIncome ?? 0
  const totalExpense = analytics.totalExpense ?? 0
  const upcomingRecurring = analytics.upcomingRecurring || []
  const topBudgets = budgets.slice().sort((a, b) => b.percentage - a.percentage).slice(0, 3)
  const latestAlerts = notifications.slice(0, 2)
  const upcomingEMIs = emis.filter(e => e.active).slice(0, 3)
  const netWorth = summary.netWorth ?? 0
  const isPositiveNW = netWorth >= 0

  const { cash: cashAmount, upi: upiAmount, creditCard: creditCardAmount, debitCard: debitCardAmount, netBanking: netBankingAmount, total: displayBalance } = getDisplayBalances(analytics)

  const PERIODS = [
    { key: 'this_month', label: 'This Month' },
    { key: 'last_month', label: 'Last Month' },
    { key: 'this_year',  label: 'This Year'  },
    { key: 'all_time',   label: 'All Time'   },
  ]

  const periodLabel = PERIODS.find(p => p.key === period)?.label || 'This Month'
  const savingsRate = totalIncome > 0 ? Math.max(0, Math.round(((totalIncome - totalExpense) / totalIncome) * 100)) : 0

  return (
    <div className="page space-y-6">
      {/* Welcome header/greeting section */}
      <div className="flex items-center justify-between animate-fadeIn pr-12">
        <div>
          <h1 className="text-2xl font-black tracking-tight text-slate-800 dark:text-white">
            Hello, <span className="text-gradient-blue">{user?.name?.split(' ')[0] || 'there'}</span>
          </h1>
          <p className="text-xs text-gray-500 dark:text-gray-400">Here's your financial status overview today.</p>
        </div>
      </div>

      {/* Main Responsive Grid: Stacks on mobile/tablet, 3 columns on desktop */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
        
        {/* Column 1: Balance and Stats (Main Financial Summary) */}
        <div className="space-y-6 lg:col-span-1">
          {/* Glass Balance Card */}
          <motion.div
            whileHover={{ y: -4 }}
            className="w-full text-left rounded-2xl p-6 relative overflow-hidden border dark:border-dark-border border-sky-500/20 bg-gradient-to-br from-sky-500 to-sky-600 dark:from-sky-950/40 dark:to-sky-900/20 text-white shadow-xl flex flex-col justify-between backdrop-blur-md transition-all duration-300"
          >
            {/* Background elements */}
            <div className="absolute -top-6 -right-6 w-32 h-32 rounded-full bg-white/10 blur-xl pointer-events-none" />
            <div className="absolute -bottom-8 -left-4 w-24 h-24 rounded-full bg-white/5 blur-lg pointer-events-none" />
            
            <div>
              <div className="flex items-center justify-between mb-4">
                <span className="text-sky-100 dark:text-sky-300 text-[10px] font-bold uppercase tracking-widest">Total Balance</span>
                <span className="px-2 py-0.5 rounded-full bg-white/20 text-[9px] font-bold text-white uppercase tracking-wider backdrop-blur-sm">Active</span>
              </div>
              {loadingAnalytics ? (
                <div className="h-10 w-44 bg-white/20 rounded-xl animate-pulse mb-3" />
              ) : (
                <p className="text-3xl font-black text-white mb-2 tracking-tight">{formatCurrency(displayBalance)}</p>
              )}
            </div>

            <div className="flex items-center justify-between mt-4 pt-4 border-t border-white/10">
              <span className="text-sky-200 dark:text-sky-400 text-xs">Breakdown by Accounts</span>
              <button
                type="button"
                onClick={() => setShowBalanceBreakdown(true)}
                className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-white text-[10px] font-bold tracking-wide transition-colors duration-200 flex items-center gap-1 active:scale-95"
              >
                <span>View Details</span>
              </button>
            </div>
          </motion.div>

          {/* Period Toggle */}
          <div className="flex gap-1 p-1 rounded-2xl dark:bg-dark-card bg-slate-100 border dark:border-dark-border border-light-border">
            {PERIODS.map(p => (
              <button
                key={p.key}
                type="button"
                onClick={() => setPeriod(p.key)}
                className={`flex-1 py-1.5 rounded-xl text-[10px] font-bold transition-all ${
                  period === p.key
                    ? 'gradient-blue text-white shadow-sm'
                    : 'dark:text-gray-500 text-gray-400 hover:dark:text-gray-300 hover:text-gray-600'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>

          {/* Metric Grid: 2x2 grid representing core metrics */}
          <div className="grid grid-cols-2 gap-4">
            {loadingAnalytics ? (
              <>
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
                <StatCardSkeleton />
              </>
            ) : (
              <>
                <StatCard
                  label={`Income · ${periodLabel}`}
                  amount={totalIncome}
                  icon={ArrowDownRight}
                  tone="secondary"
                  onClick={() => navigate('/add?type=income')}
                />
                <StatCard
                  label={`Expenses · ${periodLabel}`}
                  amount={totalExpense}
                  icon={ArrowUpRight}
                  tone="danger"
                  onClick={() => navigate('/add?type=expense')}
                />
                <StatCard
                  label="Net Worth"
                  amount={netWorth}
                  icon={TrendingUp}
                  tone={isPositiveNW ? "secondary" : "danger"}
                  onClick={() => navigate('/networth')}
                />
                <StatCard
                  label="Savings Rate"
                  amount={`${savingsRate}%`}
                  icon={WalletCards}
                  tone="info"
                  isPercentage
                />
              </>
            )}
          </div>
        </div>

        {/* Column 2: Spending Analysis & Budgets */}
        <div className="space-y-6">
          <AnalysisWidget
            analytics={analytics}
            loading={loadingAnalytics}
            onAction={() => navigate('/analytics')}
          />
          
          <Widget title="Category Budgets" action="Manage" onAction={() => navigate('/budgets')} icon={WalletCards}>
            {topBudgets.length === 0 ? (
              <p className="text-xs dark:text-gray-500 text-gray-500">No category budgets set yet.</p>
            ) : (
              <div className="space-y-3.5 mt-2">
                {topBudgets.map(budget => (
                  <div key={budget.id} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-bold dark:text-gray-200 text-slate-700">{budget.category}</span>
                      <span className="font-semibold text-sky-500">{budget.percentage}%</span>
                    </div>
                    <div className="h-2 dark:bg-dark-border bg-slate-200 rounded-full overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all duration-500 ${budgetColor(budget.percentage)}`}
                        style={{ width: `${Math.min(budget.percentage, 100)}%` }}
                      />
                    </div>
                    <div className="flex items-center justify-between text-[10px] dark:text-gray-500 text-gray-400">
                      <span>{formatCurrency(budget.spent)} / {formatCurrency(budget.monthlyLimit)}</span>
                      <span className="font-semibold">Left: {formatCurrency(budget.remaining)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Widget>
        </div>

        {/* Column 3: Recent Activity & Reminders/Alerts */}
        <div className="space-y-6">
          {/* Recent Transactions Widget */}
          <div className="card p-5">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className="w-8 h-8 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                  <Clock size={16} />
                </span>
                <h2 className="font-bold dark:text-white text-slate-800 text-sm">Recent Transactions</h2>
              </div>
              <button
                onClick={() => navigate('/history')}
                className="text-sky-500 text-xs font-semibold px-2.5 py-1 rounded-lg bg-sky-500/10 hover:bg-sky-500/20 transition-all active:scale-95"
              >
                See all
              </button>
            </div>
            
            <div className="space-y-3.5">
              {loading && expenses.length === 0 ? (
                Array(4).fill(0).map((_, i) => <ExpenseCardSkeleton key={i} />)
              ) : expenses.length === 0 ? (
                <EmptyState />
              ) : (
                expenses.slice(0, 4).map(e => <ExpenseCard key={e._id} expense={e} />)
              )}
            </div>
          </div>

          {/* Upcoming EMIs & Recurring Widget */}
          <div className="space-y-4">
            {unreadCount > 0 && (
              <Widget title="Alerts" action="Open" onAction={() => navigate('/notifications')} icon={AlertTriangle}>
                <div className="space-y-2 mt-2">
                  {latestAlerts.map(alert => (
                    <div key={alert.id} className="text-xs dark:text-gray-400 text-gray-600 p-2.5 rounded-xl border border-yellow-500/20 bg-yellow-500/5 dark:bg-yellow-500/5">
                      <span className={alert.type === 'critical' ? 'text-red-500 font-bold' : 'text-yellow-500 font-bold'}>
                        {alert.category}:{' '}
                      </span>
                      {alert.message}
                    </div>
                  ))}
                </div>
              </Widget>
            )}

            <Widget title="Upcoming Payments" action="View All" onAction={() => navigate('/emis')} icon={CreditCard}>
              <div className="space-y-3 mt-2">
                {upcomingEMIs.length === 0 && upcomingRecurring.length === 0 ? (
                  <p className="text-xs dark:text-gray-500 text-gray-500">No upcoming EMIs or recurring dues.</p>
                ) : (
                  <>
                    {upcomingEMIs.map(emi => {
                      const details = getLoanDetails(emi)
                      const isFixed = emi.type !== 'FLEXIBLE'
                      const detailText = isFixed
                        ? `${emi.paidInstallments}/${emi.totalInstallments} paid · Due ${formatShortDate(emi.nextDueDate)}`
                        : `Paid: ${formatCurrency(details.amountPaid)} / ${formatCurrency(details.totalPayableAmount)}`
                      const rightText = isFixed
                        ? `${formatCurrency(emi.emiAmount)}`
                        : emi.emiAmount ? `${formatCurrency(emi.emiAmount)}` : `Left: ${formatCurrency(details.remainingBalance)}`

                      return (
                        <div key={emi.id} className="flex items-center justify-between py-2 border-b dark:border-dark-border border-light-border last:border-0">
                          <div>
                            <p className="text-xs font-bold dark:text-gray-200 text-slate-700">{emi.title}</p>
                            <p className="text-[10px] dark:text-gray-500 text-gray-400">{detailText}</p>
                          </div>
                          <span className="text-xs font-bold text-danger">{rightText}</span>
                        </div>
                      )
                    })}
                    {upcomingRecurring.slice(0, 2).map(item => (
                      <div key={item._id} className="flex items-center justify-between py-2 border-b dark:border-dark-border border-light-border last:border-0">
                        <div>
                          <p className="text-xs font-bold dark:text-gray-200 text-slate-700">{item.title}</p>
                          <p className="text-[10px] dark:text-gray-500 text-gray-400">{item.recurringType} · Due {formatShortDate(item.nextRunDate)}</p>
                        </div>
                        <span className="text-xs font-bold text-danger">{formatCurrency(item.amount)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </Widget>
          </div>
        </div>

      </div>

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

      {showDailyAlert && (
        <DailySpendAlert
          amount={todaySpend}
          onClose={() => setShowDailyAlert(false)}
        />
      )}

      {/* Floating Action Button (FAB) on mobile/tablet */}
      <button
        onClick={() => navigate('/add')}
        className="fixed bottom-24 right-6 z-40 w-14 h-14 rounded-full gradient-blue text-white shadow-lg hover:shadow-xl active:scale-95 transition-all flex items-center justify-center lg:hidden"
        title="Add Transaction"
      >
        <Plus size={24} strokeWidth={2.5} />
      </button>
    </div>
  )
}

function StatCard({ label, amount, icon: Icon, tone, onClick, isPercentage }) {
  const color = tone === 'secondary'
    ? 'text-secondary bg-secondary/10'
    : tone === 'danger'
      ? 'text-danger bg-danger/10'
      : tone === 'info'
        ? 'text-sky-500 bg-sky-500/10'
        : 'text-secondary bg-secondary/10'
  const Component = onClick ? 'button' : 'div'
  return (
    <Component
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`card p-4 text-left ${onClick ? 'active:scale-[0.98] transition-all cursor-pointer hover:border-sky-500/30' : ''}`}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-bold dark:text-gray-500 text-gray-600 uppercase tracking-wide">{label}</span>
        <div className={`w-8 h-8 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={16} />
        </div>
      </div>
      <p className="dark:text-gray-100 text-slate-800 font-black text-sm sm:text-base md:text-lg">
        {isPercentage ? amount : formatCurrency(amount)}
      </p>
    </Component>
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
        <SummaryRow label="Other" amount={netBankingAmount} />
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

function DailySpendAlert({ amount, onClose }) {
  const timerRef = useRef(null)
  const [progress, setProgress] = useState(100)

  useEffect(() => {
    const duration = 8000
    const interval = 50
    let elapsed = 0
    timerRef.current = setInterval(() => {
      elapsed += interval
      setProgress(Math.max(0, 100 - (elapsed / duration) * 100))
      if (elapsed >= duration) {
        clearInterval(timerRef.current)
        onClose()
      }
    }, interval)
    return () => clearInterval(timerRef.current)
  }, [onClose])

  const isHigh = amount > 1000

  return (
    <div className="fixed inset-0 z-[70] flex items-start justify-center pt-8 px-4" onClick={onClose}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/30 backdrop-blur-sm" />

      {/* Alert Card */}
      <motion.div
        initial={{ opacity: 0, y: -40, scale: 0.95 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -20, scale: 0.95 }}
        transition={{ type: 'spring', damping: 20, stiffness: 300 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-sm overflow-hidden rounded-2xl border shadow-2xl
          dark:bg-dark-card dark:border-dark-border bg-white border-slate-200"
      >
        {/* Gradient top accent */}
        <div className={`h-1.5 w-full ${
          isHigh
            ? 'bg-gradient-to-r from-orange-400 via-red-400 to-pink-500'
            : 'bg-gradient-to-r from-emerald-400 via-sky-400 to-blue-500'
        }`} />

        <div className="p-5">
          {/* Header */}
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                isHigh
                  ? 'bg-orange-500/10 text-orange-500'
                  : 'bg-emerald-500/10 text-emerald-500'
              }`}>
                {isHigh ? <TrendingDown size={20} /> : <Sparkles size={20} />}
              </div>
              <div>
                <p className="text-sm font-bold dark:text-white text-slate-800">Daily Spending Summary</p>
                <p className="text-[10px] dark:text-gray-500 text-gray-400 font-medium">
                  {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-7 h-7 rounded-lg dark:bg-dark-border bg-slate-100 flex items-center justify-center dark:text-gray-400 text-gray-500 hover:text-red-400 transition-colors"
            >
              <X size={14} />
            </button>
          </div>

          {/* Amount */}
          <div className="text-center py-4">
            <p className="text-[10px] uppercase tracking-widest dark:text-gray-500 text-gray-400 font-bold mb-2">Total Spent Today</p>
            <p className={`text-3xl font-black tracking-tight ${
              isHigh ? 'text-orange-500' : 'text-emerald-500'
            }`}>
              {formatCurrency(amount)}
            </p>
          </div>

          {/* Message */}
          <div className={`rounded-xl p-3 mt-2 ${
            isHigh
              ? 'bg-orange-500/5 dark:bg-orange-500/10 border border-orange-500/10'
              : 'bg-emerald-500/5 dark:bg-emerald-500/10 border border-emerald-500/10'
          }`}>
            <p className="text-xs dark:text-gray-300 text-slate-600 leading-relaxed text-center">
              {isHigh
                ? '⚠️ Your spending is on the higher side today. Review your expenses and try to cut back on non-essential purchases.'
                : '✅ Great job keeping your spending in check today! Keep up the smart money habits.'
              }
            </p>
          </div>
        </div>

        {/* Auto-dismiss progress bar */}
        <div className="h-0.5 w-full dark:bg-dark-border bg-slate-100">
          <div
            className={`h-full transition-all duration-100 ease-linear ${
              isHigh
                ? 'bg-gradient-to-r from-orange-400 to-red-400'
                : 'bg-gradient-to-r from-emerald-400 to-sky-400'
            }`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </motion.div>
    </div>
  )
}
