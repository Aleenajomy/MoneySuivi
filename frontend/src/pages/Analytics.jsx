import { useEffect } from 'react'
import { useExpense } from '../context/ExpenseContext'
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, LineChart, Line, CartesianGrid } from 'recharts'
import { CATEGORY_COLORS, CATEGORY_ICONS, formatCurrency } from '../utils/constants'
import { RefreshCw } from 'lucide-react'

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

export default function Analytics() {
  const { analytics, loadingAnalytics, fetchAnalytics } = useExpense()

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
  const growthData = (analytics.monthlyBalanceGrowth || []).map(item => ({
    month: MONTHS[item._id.month - 1],
    amount: item.total
  }))
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
  const cashVsBankData = [
    { name: 'Cash', value: Math.max(Number(analytics.cashBalance || 0), 0), color: ACCOUNT_COLORS.Cash },
    { name: 'Bank', value: Math.max(Number(analytics.bankBalance || 0), 0), color: ACCOUNT_COLORS.Bank },
  ].filter(item => item.value > 0)

  const totalSpent = categoryData.reduce((sum, i) => sum + i.value, 0)

  if (loadingAnalytics) {
    return (
      <div className="page flex items-center justify-center">
        <div className="animate-spin w-8 h-8 border-2 border-primary border-t-transparent rounded-full" />
      </div>
    )
  }

  return (
    <div className="page">

      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold dark:text-white text-slate-800">Analytics</h1>
        <button onClick={fetchAnalytics}
          className="w-9 h-9 rounded-xl dark:bg-dark-card bg-light-card dark:border-dark-border border-light-border border
                     flex items-center justify-center">
          <RefreshCw size={15} className="dark:text-gray-400 text-gray-500" />
        </button>
      </div>

      {/* Pie Chart */}
      {categoryData.length > 0 ? (
        <div className="card p-5 mb-4">
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
              <div className="absolute inset-0 flex flex-col items-center justify-center">
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
      ) : (
        <div className="card p-10 mb-4 text-center">
          <p className="text-3xl mb-3">📊</p>
          <p className="dark:text-gray-400 text-gray-500 text-sm">No spending data this month</p>
        </div>
      )}

      <AccountPie title="Expenses by Account Type" data={expensesByAccountType} />
      <AccountPie title="Income by Account Type" data={incomeByAccountType} />
      <AccountPie title="Cash vs Bank Balance" data={cashVsBankData} />

      {/* Category breakdown list */}
      {categoryData.length > 0 && (
        <div className="card p-4 mb-4">
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
                  <div className="h-full rounded-full transition-all"
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
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5">
          6-Month Expense Trend
        </p>
        {trendData.length > 0 ? (
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={trendData} barSize={24} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
              <XAxis dataKey="month" axisLine={false} tickLine={false}
                tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
              <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.03)' }} />
              <Bar dataKey="amount" fill="#0EA5E9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center dark:text-gray-600 text-gray-400 text-sm py-8">No trend data available</p>
        )}
      </div>

      <div className="card p-5">
        <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-5">
          Monthly Balance Growth
        </p>
        {growthData.length > 0 ? (
          <ResponsiveContainer width="100%" height={190}>
            <LineChart data={growthData} margin={{ top: 5, right: 8, left: -20, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke="rgba(148,163,184,0.16)" />
              <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: 'var(--tick-color)' }} />
              <Tooltip content={<CustomTooltip />} cursor={{ stroke: 'rgba(14,165,233,0.25)' }} />
              <Line type="monotone" dataKey="amount" stroke="#22C55E" strokeWidth={3} dot={{ r: 3 }} activeDot={{ r: 5 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-center dark:text-gray-600 text-gray-400 text-sm py-8">No balance growth data available</p>
        )}
      </div>
    </div>
  )
}

function AccountPie({ title, data }) {
  const total = data.reduce((sum, item) => sum + item.value, 0)

  return (
    <div className="card p-5 mb-4">
      <p className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-4">{title}</p>
      {data.length > 0 ? (
        <div className="flex items-center gap-4">
          <ResponsiveContainer width={140} height={140}>
            <PieChart>
              <Pie data={data} cx="50%" cy="50%" innerRadius={42} outerRadius={64} dataKey="value" paddingAngle={3}>
                {data.map((entry, i) => <Cell key={i} fill={entry.color} stroke="transparent" />)}
              </Pie>
            </PieChart>
          </ResponsiveContainer>
          <div className="flex-1 space-y-2.5">
            {data.map(item => (
              <div key={item.name} className="flex items-center justify-between">
                <span className="flex items-center gap-2 text-xs dark:text-gray-400 text-gray-500">
                  <span className="w-2 h-2 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.name}
                </span>
                <span className="text-xs font-semibold dark:text-white text-slate-700">{Math.round((item.value / total) * 100)}%</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-center dark:text-gray-600 text-gray-400 text-sm py-8">No data available</p>
      )}
    </div>
  )
}
