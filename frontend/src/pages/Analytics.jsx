import { useEffect } from 'react'
import { useExpense } from '../context/ExpenseContext'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { CATEGORY_COLORS, formatCurrency } from '../utils/constants'
import { RefreshCw, TrendingUp, Coins, Activity, Wallet } from 'lucide-react'
import PageHeader from '../components/common/PageHeader'
import StatCard from '../components/common/StatCard'

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const ACCOUNT_COLORS = {
  Cash: '#22C55E',
  Bank: '#0EA5E9',
  UPI: '#6366F1',
  Wallet: '#F59E0B',
  'Credit Card': '#EF4444',
}

const CustomTooltip = ({ active, payload }) => {
  if (active && payload?.length) {
    return (
      <div className="dark:bg-dark-card bg-white dark:border-dark-border border-light-border border rounded-xl px-3 py-2 text-xs shadow-lg">
        <p className="dark:text-white text-slate-800 font-semibold">{formatCurrency(payload[0].value)}</p>
      </div>
    )
  }
  return null
}

function EmptyState({ title, subtitle }) {
  return (
    <div className="card p-8 text-center flex flex-col items-center justify-center border border-dashed dark:border-dark-border border-light-border bg-slate-50/50 dark:bg-dark-bg/20 animate-fadeIn w-full h-[220px]">
      <div className="w-12 h-12 rounded-xl bg-sky-500/10 text-sky-500 flex items-center justify-center mb-3">
        <Activity size={22} />
      </div>
      <p className="dark:text-gray-300 text-slate-800 font-bold text-sm">{title}</p>
      <p className="dark:text-gray-500 text-gray-400 text-xs mt-1.5 leading-relaxed max-w-[240px] mx-auto">
        {subtitle || 'Add more transactions to see trends'}
      </p>
    </div>
  )
}

export default function Analytics() {
  const { analytics, loadingAnalytics, fetchAnalytics } = useExpense()

  useEffect(() => {
    fetchAnalytics()
  }, [fetchAnalytics])

  const categoryData = (analytics.categorySpending || []).map(item => ({
    name: item._id,
    value: item.total,
    color: CATEGORY_COLORS[item._id] || '#0EA5E9'
  }))

  // ── Build a guaranteed 6-month rolling window (oldest → newest) ──────────
  const build6MonthWindow = (rawData) => {
    const now = new Date()
    const window = []
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      const label = MONTHS[d.getMonth()]
      const year  = d.getFullYear()
      const month = d.getMonth() + 1
      const found = rawData.find(r => r._id.year === year && r._id.month === month)
      window.push({ month: label, amount: found ? found.total : 0 })
    }
    return window
  }

  const chartTrendData  = build6MonthWindow(analytics.monthlyTrend || [])
  const chartGrowthData = build6MonthWindow(analytics.monthlyBalanceGrowth || [])

  // ── Compute clean Y-axis domain + evenly spaced ticks ────────────────────
  const getYAxisProps = (data) => {
    const max = Math.max(...data.map(d => Math.abs(d.amount)), 0)
    if (max === 0) return { domain: [0, 100], ticks: [0, 25, 50, 75, 100] }
    const magnitude = Math.pow(10, Math.floor(Math.log10(max)))
    const step = Math.ceil(max / (4 * magnitude)) * magnitude
    const top  = step * 4
    return {
      domain: [0, top],
      ticks: [0, step, step * 2, step * 3, top],
    }
  }

  const trendYAxis  = getYAxisProps(chartTrendData)
  const growthYAxis = getYAxisProps(chartGrowthData)

  const expensesByAccountType = (analytics.expensesByAccountType || []).filter(item => item.total > 0).map(item => ({
    name: item.accountType,
    value: item.total,
    color: ACCOUNT_COLORS[item.accountType] || '#94A3B8',
  }))
  const incomeByAccountType = (analytics.incomeByAccountType || []).filter(item => item.total > 0).map(item => ({
    name: item.accountType,
    value: item.total,
    color: ACCOUNT_COLORS[item.accountType] || '#94A3B8',
  }))

  const totalSpent = categoryData.reduce((sum, i) => sum + i.value, 0)

  const formatYAxisTick = (val) => {
    if (val === 0) return '0'
    if (val >= 10000000) return `₹${(val / 10000000).toFixed(1)}Cr`
    if (val >= 100000) return `₹${(val / 100000).toFixed(1)}L`
    if (val >= 1000) return `₹${(val / 1000).toFixed(0)}k`
    return `₹${val}`
  }

  if (loadingAnalytics) {
    return (
      <div className="page flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="space-y-6">

      {/* Header */}
      <PageHeader
        title="Financial Analytics"
        subtitle="Visualize your income, expenses, and balance trends"
        actions={
          <button
            onClick={fetchAnalytics}
            title="Refresh analytics data"
            className="icon-btn"
            aria-label="Refresh analytics data"
          >
            <RefreshCw size={18} />
          </button>
        }
      />

      {/* Overview Metric Cards Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 animate-fadeIn">
        <StatCard
          label="Total Income"
          amount={analytics.totalIncome || 0}
          icon={TrendingUp}
          tone="secondary"
          subtext="All-time earnings tracked"
        />

        <StatCard
          label="Total Expenses"
          amount={analytics.totalExpense || 0}
          icon={Coins}
          tone="danger"
          subtext="All-time spending tracked"
        />

        <StatCard
          label="Net Savings"
          amount={(analytics.totalIncome || 0) - (analytics.totalExpense || 0)}
          icon={Wallet}
          tone="info"
          subtext="Net cash retained"
        />

        <StatCard
          label="Investments"
          amount={analytics.investmentBalance || 0}
          icon={Activity}
          tone="warning"
          subtext="Transactions + Assets (Stocks, MF, FD, Gold)"
        >
          {analytics.investmentBreakdown && Object.keys(analytics.investmentBreakdown).length > 0 && (
            <div className="mt-3 space-y-1 border-t dark:border-dark-border border-light-border pt-3">
              {Object.entries(analytics.investmentBreakdown).map(([type, val]) => (
                <div key={type} className="flex justify-between text-[10px]">
                  <span className="dark:text-gray-500 text-gray-400">{type}</span>
                  <span className="font-bold dark:text-gray-300 text-slate-700 tabular-nums">{formatCurrency(val)}</span>
                </div>
              ))}
            </div>
          )}
        </StatCard>
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        
        {/* Section 1: Spending by Category */}
        <div className="card p-5 animate-fadeIn flex flex-col justify-between min-h-[300px]">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
              Spending by Category
            </p>
          </div>

          {categoryData.length === 0 ? (
            <EmptyState title="No spending data this month" subtitle="Add more transactions to build your category distribution chart." />
          ) : (
            <div className="flex flex-col sm:flex-row items-center gap-6 my-auto">
              <div className="relative flex-shrink-0 mx-auto w-[150px] h-[150px] flex items-center justify-center">
                <PieChart width={150} height={150}>
                  <Pie data={categoryData} cx="50%" cy="50%"
                    innerRadius={48} outerRadius={70}
                    dataKey="value" paddingAngle={3} startAngle={90} endAngle={-270}>
                    {categoryData.map((entry, i) => (
                      <Cell key={i} fill={entry.color} stroke="transparent" />
                    ))}
                  </Pie>
                </PieChart>
                <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                  <p className="text-[10px] dark:text-gray-500 text-gray-400">Total</p>
                  <p className="text-sm font-bold dark:text-white text-slate-850">{formatCurrency(totalSpent)}</p>
                </div>
              </div>

              <div className="flex-1 w-full space-y-2.5 max-h-[170px] overflow-y-auto pr-1">
                {categoryData.map((item, i) => (
                  <div key={i} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                        style={{ backgroundColor: item.color }} />
                      <span className="text-xs dark:text-gray-300 text-slate-700 font-semibold truncate max-w-[120px]">
                        {item.name}
                      </span>
                    </div>
                    <span className="text-xs font-bold dark:text-white text-slate-850">
                      {Math.round((item.value / totalSpent) * 100)}%
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Section 2: Account Allocation */}
        <div className="card p-5 animate-fadeIn flex flex-col justify-between min-h-[300px]">
          <div>
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
              Account Allocation
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 my-auto">
            <div className="space-y-4">
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-center">Expenses by Account</p>
              <AccountPieChart data={expensesByAccountType} />
            </div>
            <div className="space-y-4">
              <p className="text-[10px] font-extrabold text-gray-400 uppercase tracking-wider text-center">Income by Account</p>
              <AccountPieChart data={incomeByAccountType} />
            </div>
          </div>
        </div>

        {/* Section Breakdown: Detailed Category Breakdown */}
        {categoryData.length > 0 && (
          <div className="card p-5 lg:col-span-2 animate-fadeIn space-y-4">
            <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest">
              Detailed Category Breakdown
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {categoryData.map((item, i) => (
                <div key={i} className="bg-slate-50 dark:bg-dark-bg/20 p-4 rounded-2xl border dark:border-dark-border border-light-border transition-all">
                  <div className="flex items-center justify-between mb-2 text-xs">
                    <span className="dark:text-gray-200 text-slate-700 font-bold flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                      {item.name}
                    </span>
                    <div className="text-right">
                      <span className="font-extrabold dark:text-white text-slate-800">{formatCurrency(item.value)}</span>
                      <span className="text-gray-400 dark:text-gray-500 ml-1.5">({Math.round((item.value / totalSpent) * 100)}%)</span>
                    </div>
                  </div>
                  <div className="h-2 dark:bg-dark-border bg-slate-100 rounded-full overflow-hidden">
                    <div className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${(item.value / totalSpent) * 100}%`,
                        backgroundColor: item.color
                      }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Section 3: 6-Month Expense Trend */}
        <div className="card p-5 animate-fadeIn">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
            6-Month Expense Trend
          </p>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={chartTrendData} barSize={24} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--tick-color)' }} tickFormatter={formatYAxisTick} domain={trendYAxis.domain} ticks={trendYAxis.ticks} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="amount" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Section 4: Monthly Balance Growth */}
        <div className="card p-5 animate-fadeIn">
          <p className="text-xs font-bold text-gray-500 dark:text-gray-400 uppercase tracking-widest mb-4">
            Monthly Balance Growth
          </p>
          <div className="w-full">
            <ResponsiveContainer width="100%" height={220}>
              <LineChart data={chartGrowthData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.08)" strokeDasharray="3 3" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: 'var(--tick-color)' }} tickFormatter={formatYAxisTick} domain={growthYAxis.domain} ticks={growthYAxis.ticks} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(14,165,233,0.25)' }} />
                <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

      </div>
    </div>
  )
}

function AccountPieChart({ data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (data.length === 0) {
    return (
      <div className="py-10 text-center flex flex-col items-center justify-center h-[170px]">
        <p className="text-xs text-gray-450 dark:text-gray-500">No data this month</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col items-center gap-4">
      <div className="relative flex-shrink-0 w-[130px] h-[130px] flex items-center justify-center">
        <PieChart width={130} height={130}>
          <Pie data={data} cx="50%" cy="50%" innerRadius={36} outerRadius={54} dataKey="value" paddingAngle={3}>
            {data.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
          </Pie>
        </PieChart>
        <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
          <p className="text-[8px] dark:text-gray-500 text-gray-400">Total</p>
          <p className="text-xs font-bold dark:text-white text-slate-800">{formatCurrency(total)}</p>
        </div>
      </div>
      <div className="w-full space-y-1.5 max-h-[75px] overflow-y-auto pr-1">
        {data.map(item => (
          <div key={item.name} className="flex items-center justify-between text-[11px]">
            <span className="flex items-center gap-1.5 dark:text-gray-300 text-slate-755 font-semibold">
              <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
              {item.name}
            </span>
            <span className="font-bold dark:text-white text-slate-800">{Math.round((item.value / total) * 100)}%</span>
          </div>
        ))}
      </div>
    </div>
  )
}
