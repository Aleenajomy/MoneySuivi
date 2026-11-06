import { AlertOctagon, AlertTriangle, CheckCircle2, Info } from 'lucide-react'
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LabelList, Legend } from 'recharts'
import { useTheme } from '../../context/ThemeContext'
import { formatAmount } from '../../utils/planner'

// Slots 1 and 2 of the categorical palette validated for both card surfaces (see utils/planner.js);
// the planned track is the neutral used for "unallocated" elsewhere. Legend and label text always
// uses the ink colour, never the series colour, so it stays readable.
const COLORS = {
  light: { income: '#2a78d6', spend: '#eb6834', actual: '#2a78d6', planned: '#cbd5e1', ink: '#475569', grid: '#e2e8f0' },
  dark: { income: '#3987e5', spend: '#d95926', actual: '#3987e5', planned: '#475569', ink: '#cbd5e1', grid: '#334155' },
}
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const compact = (v) => {
  const n = Number(v) || 0
  if (Math.abs(n) >= 100000) return `₹${(n / 100000).toFixed(n % 100000 ? 1 : 0)}L`
  if (Math.abs(n) >= 1000) return `₹${(n / 1000).toFixed(n % 1000 ? 1 : 0)}k`
  return `₹${n}`
}

const TONES = {
  critical: { icon: AlertOctagon, label: 'Needs attention', className: 'text-red-500' },
  warning: { icon: AlertTriangle, label: 'Heads-up', className: 'text-amber-500' },
  positive: { icon: CheckCircle2, label: 'Good news', className: 'text-emerald-500' },
  info: { icon: Info, label: 'For your information', className: 'text-sky-500' },
}

export function InsightsCard({ insights }) {
  if (!insights?.length) return null
  return (
    <section className="card p-4 sm:p-5" aria-labelledby="insights-title" data-testid="insights">
      <h2 id="insights-title" className="text-sm font-bold dark:text-white text-slate-800">Insights</h2>
      <p className="text-xs dark:text-gray-400 text-slate-500 mt-0.5">Based only on what you've recorded and planned for this month.</p>
      <ul className="mt-3 space-y-2.5">
        {insights.map((i) => {
          const tone = TONES[i.tone] || TONES.info
          const Icon = tone.icon
          return (
            <li key={i.id} className="flex items-start gap-2.5 text-sm dark:text-gray-200 text-slate-700">
              <Icon size={16} className={`flex-shrink-0 mt-0.5 ${tone.className}`} aria-label={tone.label} role="img" />
              <span>{i.text}</span>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function ChartTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg dark:bg-dark-bg bg-white border dark:border-dark-border border-slate-200 space-y-0.5">
      <p className="font-semibold dark:text-gray-300 text-slate-600">{label}</p>
      {payload.map(p => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="w-3 h-0.5 rounded" style={{ background: p.color }} aria-hidden="true" />
          <strong className="dark:text-white text-slate-800">{formatAmount(p.value)}</strong>
          <span className="dark:text-gray-400 text-slate-500">{p.name}</span>
        </p>
      ))}
    </div>
  )
}

const Card = ({ id, title, subtitle, children, testId }) => (
  <section className="card p-4 sm:p-5" aria-labelledby={id} data-testid={testId}>
    <h2 id={id} className="text-sm font-bold dark:text-white text-slate-800">{title}</h2>
    {subtitle && <p className="text-xs dark:text-gray-400 text-slate-500 mt-0.5">{subtitle}</p>}
    <div className="mt-3">{children}</div>
  </section>
)

export function TrendChart({ trend }) {
  const { dark } = useTheme()
  const c = COLORS[dark ? 'dark' : 'light']
  if (!trend?.some(t => Number(t.income) || Number(t.expenses))) return null
  const data = trend.map(t => ({ label: `${MONTHS[t.month - 1]} ${String(t.year).slice(2)}`, income: Number(t.income), expenses: Number(t.expenses) }))
  return (
    <Card id="trend-title" title="Income vs spending" subtitle={`Last ${trend.length} months, from recorded transactions`} testId="trend-chart">
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: -8 }}>
            <CartesianGrid stroke={c.grid} strokeWidth={1} vertical={false} />
            <XAxis dataKey="label" tick={{ fill: c.ink, fontSize: 11 }} tickLine={false} axisLine={false} />
            <YAxis tickFormatter={compact} tick={{ fill: c.ink, fontSize: 11 }} tickLine={false} axisLine={false} width={52} />
            <Tooltip content={<ChartTooltip />} cursor={{ stroke: c.grid, strokeWidth: 1 }} />
            <Legend iconType="plainline" wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: c.ink }}>{value}</span>} />
            <Line type="monotone" dataKey="income" name="Income" stroke={c.income} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
            <Line type="monotone" dataKey="expenses" name="Spending" stroke={c.spend} strokeWidth={2} dot={{ r: 4, strokeWidth: 2 }} activeDot={{ r: 5 }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>Income and spending by month</caption>
        <thead><tr><th scope="col">Month</th><th scope="col">Income</th><th scope="col">Spending</th></tr></thead>
        <tbody>{data.map(d => <tr key={d.label}><th scope="row">{d.label}</th><td>{formatAmount(d.income)}</td><td>{formatAmount(d.expenses)}</td></tr>)}</tbody>
      </table>
    </Card>
  )
}

export function PlannedVsActual({ lines }) {
  const { dark } = useTheme()
  const c = COLORS[dark ? 'dark' : 'light']
  if (!lines?.length) return null
  const data = lines.map(l => ({ name: l.name, planned: Number(l.planned), actual: Number(l.actual), utilization: l.utilization }))
  return (
    <Card id="pva-title" title="Planned vs actual spending" subtitle="Each fixed and variable line this month" testId="planned-vs-actual">
      <div style={{ height: data.length * 48 + 40 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 64, bottom: 0, left: 0 }} barGap={2} barCategoryGap={10}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false}
              tick={({ x, y, payload }) => <text x={x} y={y} dy={4} textAnchor="end" fill={c.ink} fontSize={11}>{payload.value.length > 13 ? `${payload.value.slice(0, 12)}…` : payload.value}</text>} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }} />
            <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} formatter={(value) => <span style={{ color: c.ink }}>{value}</span>} />
            <Bar dataKey="planned" name="Planned" fill={c.planned} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false} />
            <Bar dataKey="actual" name="Actual" fill={c.actual} radius={[0, 4, 4, 0]} maxBarSize={14} isAnimationActive={false}>
              <LabelList dataKey="utilization" position="right" formatter={(v) => (v === null || v === undefined ? '' : `${v}%`)} style={{ fill: c.ink, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export function CategoryBreakdown({ categories }) {
  const { dark } = useTheme()
  const c = COLORS[dark ? 'dark' : 'light']
  if (!categories?.length) return null
  const data = categories.slice(0, 8).map(x => ({ name: x.category, amount: Number(x.amount) }))
  return (
    <Card id="cat-title" title="Where the money went" subtitle="Spending by category this month, including EMI payments" testId="category-breakdown">
      <div style={{ height: data.length * 32 + 8 }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
            <XAxis type="number" hide />
            <YAxis type="category" dataKey="name" width={96} tickLine={false} axisLine={false} tick={{ fill: c.ink, fontSize: 11 }} />
            <Tooltip content={<ChartTooltip />} cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }} />
            <Bar dataKey="amount" name="Spent" fill={c.actual} radius={[0, 4, 4, 0]} maxBarSize={18} isAnimationActive={false}>
              <LabelList dataKey="amount" position="right" formatter={formatAmount} style={{ fill: c.ink, fontSize: 11, fontWeight: 600 }} />
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <table className="w-full text-xs mt-3" data-testid="category-table">
        <caption className="sr-only">Spending by category compared with last month</caption>
        <thead><tr className="dark:text-gray-500 text-slate-400 text-left">
          <th scope="col" className="font-semibold pb-1.5">Category</th>
          <th scope="col" className="font-semibold pb-1.5 text-right">This month</th>
          <th scope="col" className="font-semibold pb-1.5 text-right">Share</th>
          <th scope="col" className="font-semibold pb-1.5 text-right">Last month</th>
        </tr></thead>
        <tbody className="dark:text-gray-300 text-slate-600">
          {categories.map(x => (
            <tr key={x.category} className="border-t dark:border-dark-border border-light-border">
              <th scope="row" className="py-1.5 font-medium text-left">{x.category}</th>
              <td className="py-1.5 text-right tabular-nums">{formatAmount(x.amount)}</td>
              <td className="py-1.5 text-right tabular-nums">{x.share ?? 0}%</td>
              <td className="py-1.5 text-right tabular-nums">{formatAmount(x.previousAmount)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </Card>
  )
}

export function GoalsProgress({ goals }) {
  if (!goals?.length) return null
  return (
    <Card id="goals-progress-title" title="Savings goals" subtitle="Saved so far towards each goal" testId="goals-progress">
      <ul className="space-y-3">
        {goals.map(g => (
          <li key={g.id}>
            <div className="flex justify-between gap-3 text-xs">
              <span className="font-semibold dark:text-white text-slate-800 truncate">{g.name}</span>
              <span className="dark:text-gray-400 text-slate-500 tabular-nums flex-shrink-0">{formatAmount(g.savedAmount)} of {formatAmount(g.targetAmount)} · {g.progress}%</span>
            </div>
            <div className="mt-1 h-2 rounded-full dark:bg-dark-border bg-slate-100 overflow-hidden" role="progressbar"
              aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(g.progress, 100)} aria-label={`${g.name}: ${g.progress}% saved`}>
              <div className={`h-full rounded-full ${g.reached ? 'bg-emerald-500' : 'bg-sky-500'}`} style={{ width: `${Math.min(Math.max(g.progress, 0), 100)}%` }} />
            </div>
          </li>
        ))}
      </ul>
    </Card>
  )
}
