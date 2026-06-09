import { useEffect } from 'react'
import { useExpense } from '../context/ExpenseContext'
import { useTheme } from '../context/ThemeContext'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { CATEGORY_COLORS, CATEGORY_ICONS, formatCurrency } from '../utils/constants'
import { RefreshCw, Sun, Moon, TrendingUp, Wallet, Coins, Activity, Calendar } from 'lucide-react'

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
    <div className="card p-8 text-center flex flex-col items-center justify-center border border-dashed dark:border-dark-border border-light-border bg-slate-50/50 dark:bg-dark-bg/20 animate-fadeIn">
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

function SummaryCard({ title, name, value, color, description, icon: Icon = Coins }) {
  return (
    <div className="card p-5 mb-4 animate-fadeIn">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{title}</p>
      <div className="flex items-center gap-4 bg-slate-50 dark:bg-dark-bg p-4 rounded-2xl border dark:border-dark-border border-light-border">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-white flex-shrink-0 shadow-md" style={{ backgroundColor: color || '#0EA5E9' }}>
          <Icon size={22} />
        </div>
        <div>
          <p className="text-xs dark:text-gray-500 text-gray-400 font-bold uppercase tracking-wider">{name}</p>
          <p className="text-2xl font-black dark:text-white text-slate-800 mt-1">{formatCurrency(value)}</p>
          <p className="text-xs dark:text-gray-500 text-gray-500 mt-1.5 leading-relaxed">{description}</p>
        </div>
      </div>
    </div>
  )
}

export default function Analytics() {
  const { analytics, loadingAnalytics, fetchAnalytics } = useExpense()
  const { mode, toggle } = useTheme()

  useEffect(() => { fetchAnalytics() }, [])

  const categoryData = (analytics.categorySpending || []).map(item => ({
    name: item._id,
    value: item.total,
    color: CATEGORY_COLORS[item._id] || '#0EA5E9'
  }))

  const trendData = (analytics.monthlyTrend || []).map(item => ({
    month: MONTHS[item._id.month - 1],
    amount: item.total
  }))
  let chartTrendData = [...trendData]
  if (chartTrendData.length === 1 && analytics.monthlyTrend && analytics.monthlyTrend[0]) {
    const currentMonthNum = analytics.monthlyTrend[0]._id.month
    const prevMonthNum = currentMonthNum === 1 ? 12 : currentMonthNum - 1
    const prevMonthName = MONTHS[prevMonthNum - 1]
    chartTrendData.unshift({
      month: prevMonthName,
      amount: 0
    })
  }

  const growthData = (analytics.monthlyBalanceGrowth || []).map(item => ({
    month: MONTHS[item._id.month - 1],
    amount: item.total
  }))
  let chartGrowthData = [...growthData]
  if (chartGrowthData.length === 1 && analytics.monthlyBalanceGrowth && analytics.monthlyBalanceGrowth[0]) {
    const currentMonthNum = analytics.monthlyBalanceGrowth[0]._id.month
    const prevMonthNum = currentMonthNum === 1 ? 12 : currentMonthNum - 1
    const prevMonthName = MONTHS[prevMonthNum - 1]
    chartGrowthData.unshift({
      month: prevMonthName,
      amount: 0
    })
  }

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

  if (loadingAnalytics) {
    return (
      <div className="page flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="page pb-24">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-black dark:text-white text-slate-800 tracking-tight">Analytics</h1>
          <p className="text-xs dark:text-gray-400 text-gray-500 mt-0.5">Visualize your income, expenses, and balance trends</p>
        </div>
        <div className="flex items-center gap-2.5">
          <button onClick={fetchAnalytics}
            title="Refresh analytics data"
            className="w-10 h-10 rounded-xl dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border border
                       flex items-center justify-center transition-all active:scale-90 shadow-md">
            <RefreshCw size={16} className="dark:text-gray-400 text-gray-500" />
          </button>
          <button onClick={toggle}
            title={mode === 'dark' ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            className="w-10 h-10 rounded-xl dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border border
                       flex items-center justify-center transition-all active:scale-90 shadow-md">
            {mode === 'dark'
              ? <Sun size={16} className="text-yellow-400" />
              : <Moon size={16} className="text-sky-500" />}
          </button>
        </div>
      </div>

      {/* Spending by Category */}
      {categoryData.length === 0 ? (
        <div className="card p-5 mb-4">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
            Spending by Category
          </p>
          <EmptyState title="No spending data this month" subtitle="Add more transactions to build your category distribution chart." />
        </div>
      ) : categoryData.length === 1 ? (
        <SummaryCard
          title="Spending by Category"
          name={categoryData[0].name}
          value={categoryData[0].value}
          color={categoryData[0].color}
          description={`100% of your expenses this month fall under the ${categoryData[0].name} category.`}
          icon={Coins}
        />
      ) : (
        <div className="card p-5 mb-4 animate-fadeIn">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
            Spending by Category
          </p>
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
              {/* Center label */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <p className="text-[10px] dark:text-gray-500 text-gray-400">Total</p>
                <p className="text-sm font-bold dark:text-white text-slate-800">{formatCurrency(totalSpent)}</p>
              </div>
            </div>

            {/* Legend */}
            <div className="flex-1 space-y-2.5">
              {categoryData.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-2 h-2 rounded-full flex-shrink-0"
                      style={{ backgroundColor: item.color }} />
                    <span className="text-xs dark:text-gray-400 text-gray-500">
                      {CATEGORY_ICONS[item.name]} {item.name}
                    </span>
                  </div>
                  <span className="text-xs font-semibold dark:text-white text-slate-700">
                    {Math.round((item.value / totalSpent) * 100)}%
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Account Type Analysis */}
      <AccountPie title="Expenses by Account Type" data={expensesByAccountType} />
      <AccountPie title="Income by Account Type" data={incomeByAccountType} />

      {/* Category breakdown list */}
      {categoryData.length > 1 && (
        <div className="card p-4 mb-4 animate-fadeIn">
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
            Breakdown
          </p>
          <div className="space-y-3">
            {categoryData.map((item, i) => (
              <div key={i}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm dark:text-gray-300 text-slate-600 font-medium">
                    {CATEGORY_ICONS[item.name]} {item.name}
                  </span>
                  <span className="text-sm font-bold dark:text-white text-slate-800">{formatCurrency(item.value)}</span>
                </div>
                <div className="h-1.5 dark:bg-dark-border bg-light-border rounded-full">
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

      {/* 6-Month Bar Chart */}
      <div className="card p-5 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          6-Month Expense Trend
        </p>
        {trendData.length === 0 ? (
          <EmptyState title="No trend data available" subtitle="Spend across multiple months to visualize your monthly spending trend." />
        ) : (
          <div className="animate-fadeIn">
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={chartTrendData} barSize={24} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <XAxis dataKey="month" axisLine={false} tickLine={false}
                  tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
                <Bar dataKey="amount" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* Balance Growth Line Chart */}
      <div className="card p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">
          Monthly Balance Growth
        </p>
        {growthData.length === 0 ? (
          <EmptyState title="No growth data available" subtitle="Add transactions over multiple months to track your balance growth." />
        ) : (
          <div className="animate-fadeIn">
            <ResponsiveContainer width="100%" height={190}>
              <LineChart data={chartGrowthData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" />
                <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
                <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(14,165,233,0.25)' }} />
                <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  )
}

function AccountPie({ title, data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  if (data.length === 0) {
    return (
      <div className="card p-5 mb-4">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">{title}</p>
        <EmptyState title={`No data for ${title.toLowerCase()}`} subtitle="Record more transactions to enable account-based analysis." />
      </div>
    )
  }

  if (data.length === 1) {
    const single = data[0]
    let desc = `100% of your transactions are in the ${single.name} account.`
    if (title.toLowerCase().includes('expense')) {
      desc = `100% of your expenses this month were paid using your ${single.name} account.`
    } else if (title.toLowerCase().includes('income')) {
      desc = `100% of your income this month was received in your ${single.name} account.`
    } else if (title.toLowerCase().includes('balance')) {
      desc = `Your tracked liquid balance is entirely held in your ${single.name} account.`
    }

    return (
      <SummaryCard
        title={title}
        name={single.name}
        value={single.value}
        color={single.color}
        description={desc}
        icon={Wallet}
      />
    )
  }

  return (
    <div className="card p-5 mb-4 animate-fadeIn">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{title}</p>
      <div className="flex items-center gap-4">
        <div className="relative flex-shrink-0">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={64} dataKey="value" paddingAngle={3}>
                {data.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
            <p className="text-[9px] dark:text-gray-500 text-gray-400">Total</p>
            <p className="text-xs font-bold dark:text-white text-slate-800">{formatCurrency(total)}</p>
          </div>
        </div>
        <div className="flex-1 space-y-2.5">
          {data.map(item => (
            <div key={item.name} className="flex items-center justify-between">
              <span className="flex items-center gap-2 text-xs dark:text-gray-400 text-gray-500">
                <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: item.color }} />
                {item.name}
              </span>
              <span className="text-xs font-semibold dark:text-white text-slate-700">{Math.round((item.value / total) * 100)}%</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
