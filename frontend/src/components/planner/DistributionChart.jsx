import { useMemo, useState } from 'react'
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, LabelList, Cell } from 'recharts'
import { useTheme } from '../../context/ThemeContext'
import { GROUPS, GROUP_META, UNALLOCATED_COLOR, formatAmount } from '../../utils/planner'

const MAX_RANKED = 8

// Text inside a coloured block is white or near-black by the fill's luminance, the same in both modes.
const inkFor = (hex) => {
  const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map(c => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 0.3 ? '#0f172a' : '#ffffff'
}

const share = (part, whole) => (whole > 0 ? Math.round((part * 100) / whole) : 0)

function SegmentedBar({ parts, whole, label }) {
  const [active, setActive] = useState(null)
  const visible = parts.filter(p => p.amount > 0)
  const focused = visible.find(p => p.key === active)

  return (
    <div>
      <div className="h-5 text-xs dark:text-gray-300 text-slate-600 mb-1.5" aria-live="polite">
        {focused ? (
          <span><strong className="dark:text-white text-slate-800">{formatAmount(focused.amount)}</strong> · {focused.label} · {share(focused.amount, whole)}%</span>
        ) : <span className="dark:text-gray-500 text-slate-400">Hover or tap a block for details</span>}
      </div>
      <div className="flex w-full h-7 gap-[2px]" role="img" aria-label={label} data-testid="distribution-bar">
        {visible.map(p => {
          const pct = share(p.amount, whole)
          return (
            <button
              key={p.key}
              type="button"
              className="h-full rounded-[4px] flex items-center px-1.5 text-[11px] font-bold outline-none focus-visible:ring-2 focus-visible:ring-sky-400 min-w-[3px]"
              style={{ flexGrow: p.amount, flexBasis: 0, background: p.color, color: inkFor(p.color) }}
              onMouseEnter={() => setActive(p.key)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(p.key)}
              onBlur={() => setActive(null)}
              onClick={() => setActive(prev => (prev === p.key ? null : p.key))}
              aria-label={`${p.label}: ${formatAmount(p.amount)}, ${pct}%`}
            >
              {/* Only blocks wide enough for the text print it; the table below always has the value. */}
              {pct >= 12 ? `${pct}%` : ''}
            </button>
          )
        })}
      </div>
      <ul className="flex flex-wrap gap-x-4 gap-y-1.5 mt-3" aria-label="Legend">
        {visible.map(p => (
          <li key={p.key} className="flex items-center gap-1.5 text-xs dark:text-gray-300 text-slate-600">
            <span className="w-2.5 h-2.5 rounded-sm flex-shrink-0" style={{ background: p.color }} aria-hidden="true" />
            {p.label}
          </li>
        ))}
      </ul>
    </div>
  )
}

// Recharts wraps tick text at spaces; one truncated line keeps rows aligned with their bars.
function NameTick({ x, y, payload, fill }) {
  const name = payload.value.length > 14 ? `${payload.value.slice(0, 13)}…` : payload.value
  return <text x={x} y={y} dy={4} textAnchor="end" fill={fill} fontSize={11}>{name}</text>
}

function RankedTooltip({ active, payload }) {
  if (!active || !payload?.length) return null
  const row = payload[0].payload
  return (
    <div className="rounded-xl px-3 py-2 text-xs shadow-lg dark:bg-dark-bg bg-white border dark:border-dark-border border-slate-200">
      <p className="font-bold dark:text-white text-slate-800">{formatAmount(row.amount)}</p>
      <p className="dark:text-gray-400 text-slate-500">{row.name} · {row.groupLabel}</p>
    </div>
  )
}

export default function DistributionChart({ summary, allocations }) {
  const { dark } = useTheme()
  const mode = dark ? 'dark' : 'light'
  const expected = summary.income.expected
  const allocated = summary.plan.totalAllocated
  const whole = Math.max(expected, allocated)

  const parts = [
    ...GROUPS.map(g => ({ key: g, label: GROUP_META[g].label, amount: summary.plan.byGroup[g], color: GROUP_META[g][mode] })),
    { key: 'UNALLOCATED', label: 'Unallocated', amount: Math.max(summary.unallocated, 0), color: UNALLOCATED_COLOR[mode] },
  ]

  const ranked = useMemo(() => {
    const rows = [...allocations]
      .filter(a => a.plannedAmount > 0)
      .sort((a, b) => b.plannedAmount - a.plannedAmount)
      .map(a => ({ name: a.name, amount: a.plannedAmount, groupLabel: GROUP_META[a.group].short }))
    if (rows.length <= MAX_RANKED) return rows
    const rest = rows.slice(MAX_RANKED - 1)
    return [...rows.slice(0, MAX_RANKED - 1), {
      name: `${rest.length} other lines`,
      amount: rest.reduce((s, r) => s + Math.round(r.amount * 100), 0) / 100,
      groupLabel: 'Mixed',
    }]
  }, [allocations])

  if (whole <= 0) return null

  const barColor = dark ? '#3987e5' : '#2a78d6'
  const ink = dark ? '#cbd5e1' : '#475569'

  return (
    <section className="card p-4 sm:p-5 space-y-5" aria-labelledby="distribution-title">
      <div>
        <h2 id="distribution-title" className="text-sm font-bold dark:text-white text-slate-800">Salary distribution</h2>
        <p className="text-xs dark:text-gray-400 text-slate-500 mt-0.5">
          {expected > 0 ? `How ${formatAmount(expected)} of expected income is planned` : 'Planned amounts (no income added for this month yet)'}
        </p>
      </div>

      <SegmentedBar
        parts={parts}
        whole={whole}
        label={`Planned split of ${formatAmount(whole)}: ${parts.filter(p => p.amount > 0).map(p => `${p.label} ${formatAmount(p.amount)}`).join(', ')}`}
      />

      {summary.overAllocated && (
        <p className="text-xs font-semibold text-red-500 flex items-center gap-1.5" role="status">
          <span aria-hidden="true">⚠</span> Planned {formatAmount(allocated)} is {formatAmount(-summary.unallocated)} more than expected income.
        </p>
      )}

      <table className="w-full text-xs" data-testid="distribution-table">
        <caption className="sr-only">Planned amount by group</caption>
        <thead>
          <tr className="dark:text-gray-500 text-slate-400 text-left">
            <th scope="col" className="font-semibold pb-1.5">Group</th>
            <th scope="col" className="font-semibold pb-1.5 text-right">Planned</th>
            <th scope="col" className="font-semibold pb-1.5 text-right w-14">Share</th>
          </tr>
        </thead>
        <tbody className="dark:text-gray-300 text-slate-600">
          {parts.map(p => (
            <tr key={p.key} className="border-t dark:border-dark-border border-light-border">
              <th scope="row" className="py-1.5 font-medium text-left">
                <span className="inline-flex items-center gap-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm" style={{ background: p.color }} aria-hidden="true" />
                  {p.label}
                </span>
              </th>
              <td className="py-1.5 text-right tabular-nums">{formatAmount(p.amount)}</td>
              <td className="py-1.5 text-right tabular-nums">{share(p.amount, whole)}%</td>
            </tr>
          ))}
          <tr className="border-t-2 dark:border-dark-border border-slate-200 font-bold dark:text-white text-slate-800">
            <th scope="row" className="py-1.5 text-left">Total planned</th>
            <td className="py-1.5 text-right tabular-nums">{formatAmount(allocated)}</td>
            <td className="py-1.5 text-right tabular-nums">{summary.allocatedPercent === null ? '—' : `${summary.allocatedPercent}%`}</td>
          </tr>
        </tbody>
      </table>

      {ranked.length > 0 && (
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider dark:text-gray-400 text-slate-500 mb-2">Largest planned lines</h3>
          <div style={{ height: ranked.length * 34 + 8 }} data-testid="ranked-allocations">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={ranked} layout="vertical" margin={{ top: 0, right: 72, bottom: 0, left: 0 }} barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="name" width={112} tickLine={false} axisLine={false} tick={<NameTick fill={ink} />} />
                <Tooltip content={<RankedTooltip />} cursor={{ fill: dark ? 'rgba(255,255,255,0.04)' : 'rgba(15,23,42,0.04)' }} />
                <Bar dataKey="amount" radius={[0, 4, 4, 0]} maxBarSize={20} isAnimationActive={false}>
                  {ranked.map(r => <Cell key={r.name} fill={barColor} />)}
                  <LabelList dataKey="amount" position="right" formatter={formatAmount} style={{ fill: ink, fontSize: 11, fontWeight: 600 }} />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}
    </section>
  )
}
