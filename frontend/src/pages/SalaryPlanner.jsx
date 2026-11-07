import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarPlus, CheckCircle2, Loader2, ShieldCheck } from 'lucide-react'
import { usePlanner } from '../context/PlannerContext'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import ConfirmDialog from '../components/ConfirmDialog'
import { Skeleton } from '../components/Skeleton'
import MonthSelector from '../components/planner/MonthSelector'
import AmountRow from '../components/planner/AmountRow'
import { formatAmount, periodLabel } from '../utils/planner'

function Section({ id, letter, title, children }) {
  return (
    <section aria-labelledby={id} className="card p-4">
      <h2 id={id} className="text-xs font-black uppercase tracking-wider dark:text-gray-400 text-slate-500 mb-1">
        <span className="text-sky-500">{letter}.</span> {title}
      </h2>
      {children}
    </section>
  )
}

function TotalRow({ label, amount, tone = 'normal', testId, strong = false }) {
  const color = tone === 'danger' ? 'text-red-500' : tone === 'good' ? 'text-emerald-600 dark:text-emerald-400' : 'dark:text-white text-slate-800'
  return (
    <div className="flex items-center justify-between gap-3 py-1.5" data-testid={testId}>
      <span className={`text-sm ${strong ? 'font-bold dark:text-white text-slate-800' : 'dark:text-gray-300 text-slate-600'}`}>{label}</span>
      <span className={`tabular-nums ${strong ? 'text-base font-black' : 'text-sm font-bold'} ${color}`}>{formatAmount(amount)}</span>
    </div>
  )
}

const Divider = () => <div className="border-t dark:border-dark-border border-light-border my-1.5" />

const SEGMENTS = [
  { key: 'fixed', label: 'Fixed', className: 'bg-sky-500' },
  { key: 'spending', label: 'Spending', className: 'bg-amber-500' },
  { key: 'savings', label: 'Savings', className: 'bg-emerald-500' },
  { key: 'remaining', label: 'Remaining', className: 'bg-slate-300 dark:bg-slate-600' },
]

// Widths are shares of everything planned, so the bar stays whole even when over budget; the
// legend carries the exact amounts and shares of salary as text.
function SalaryBar({ summary }) {
  const total = SEGMENTS.reduce((t, s) => t + Number(summary.breakdown[s.key].amount), 0)
  return (
    <div className="mt-3" data-testid="salary-breakdown">
      <p className="text-xs font-bold dark:text-gray-300 text-slate-600 mb-2">Where your {formatAmount(summary.salary)} goes</p>
      <div className="flex h-3 w-full overflow-hidden rounded-full dark:bg-dark-border bg-slate-100" aria-hidden="true">
        {total > 0 && SEGMENTS.map(s => {
          const width = (Number(summary.breakdown[s.key].amount) / total) * 100
          return width > 0 ? <div key={s.key} className={s.className} style={{ width: `${width}%` }} /> : null
        })}
      </div>
      <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-1.5">
        {SEGMENTS.map(s => {
          const part = summary.breakdown[s.key]
          return (
            <li key={s.key} className="flex items-center gap-2 text-xs dark:text-gray-300 text-slate-600">
              <span className={`w-2.5 h-2.5 rounded-sm flex-shrink-0 ${s.className}`} aria-hidden="true" />
              <span className="flex-1">{s.label}</span>
              <span className="tabular-nums font-semibold">{formatAmount(part.amount)}</span>
              <span className="tabular-nums w-9 text-right dark:text-gray-500 text-slate-400">{part.percent === null ? '–' : `${part.percent}%`}</span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function SaveStatus({ state }) {
  if (state === 'saving') return <span className="flex items-center gap-1 text-xs dark:text-gray-400 text-slate-500" role="status"><Loader2 size={12} className="animate-spin" /> Saving…</span>
  if (state === 'saved') return <span className="flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400" role="status"><CheckCircle2 size={12} /> Saved</span>
  return null
}

function Plan() {
  const { data, saveValues, resetToDefault, saveState } = usePlanner()
  const [confirmReset, setConfirmReset] = useState(false)
  const { plan, summary, emiTrackerTotal } = data
  const field = (key) => ({ value: plan[key], onSave: (value) => saveValues({ [key]: value }) })
  const over = Number(summary.overBudget) > 0
  const emiDiffers = Number(emiTrackerTotal) !== Number(plan.emiAmount)

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 min-h-[1.25rem]">
        <p className="flex items-center gap-1.5 text-[11px] text-emerald-600 dark:text-emerald-400">
          <ShieldCheck size={13} aria-hidden="true" /> Planning only, never changes your account balances.
        </p>
        <SaveStatus state={saveState} />
      </div>

      <Section id="salary-title" letter="A" title="Monthly Salary">
        <AmountRow label="Salary" {...field('salaryAmount')} />
        <AmountRow label="Company mess allowance" hint="Paid for your mess; not part of your salary budget" {...field('allowanceAmount')} />
        <Divider />
        <TotalRow label="Personal salary" amount={summary.salary} />
        <TotalRow label="Company allowance (mess)" amount={summary.allowance} />
        <TotalRow label="Total Income + Allowance" amount={summary.incomeWithAllowance} strong testId="income-with-allowance" />
        <p className="text-[11px] dark:text-gray-500 text-slate-400 mt-1">Your budget below uses the salary only, so the mess allowance and the mess bill are never counted twice.</p>
      </Section>

      <Section id="fixed-title" letter="B" title="Fixed Expenses">
        <AmountRow label="EMI" hint="Planned amount; your EMI records are not changed" {...field('emiAmount')}>
          {emiDiffers && (
            <button type="button" onClick={() => saveValues({ emiAmount: String(emiTrackerTotal) }).catch(() => {})}
              className="mt-1 text-[11px] font-semibold text-sky-600 dark:text-sky-400 underline-offset-2 hover:underline">
              Loans &amp; EMIs total is {formatAmount(emiTrackerTotal)}. Use this
            </button>
          )}
        </AmountRow>
        <AmountRow label="Room rent" {...field('rentAmount')} />
        <Divider />
        <TotalRow label="Left after fixed expenses" amount={summary.afterFixed} strong
          tone={Number(summary.afterFixed) < 0 ? 'danger' : 'normal'} testId="after-fixed" />
      </Section>

      <Section id="budget-title" letter="C" title={`Monthly Budget (from ${formatAmount(Math.max(Number(summary.afterFixed), 0))})`}>
        <AmountRow label="Emergency savings" {...field('emergencySavingsAmount')} />
        <AmountRow label="General savings" {...field('generalSavingsAmount')} />
        <AmountRow label="Shopping / personal needs" {...field('shoppingAmount')} />
        <AmountRow label="Travel" {...field('travelAmount')} />
        <AmountRow label="Food / other expenses" {...field('foodAmount')} />
        <Divider />
        {over ? (
          <div className="flex items-start gap-2 rounded-xl bg-red-500/10 p-2.5 my-1" role="alert" data-testid="over-budget">
            <AlertTriangle size={15} className="text-red-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
            <div className="flex-1 text-sm">
              <p className="font-bold text-red-500">Over budget by {formatAmount(summary.overBudget)}</p>
              <p className="text-[11px] dark:text-gray-400 text-slate-500">Lower an amount above so the budget fits your salary.</p>
            </div>
          </div>
        ) : (
          <TotalRow label="Extra balance (auto)" amount={summary.extraBalance} tone="good" testId="extra-balance" />
        )}
        <TotalRow label="Total" amount={Number(summary.allocated) + Number(summary.extraBalance)} strong testId="budget-total" />
        <div className="flex justify-end">
          <button type="button" onClick={() => setConfirmReset(true)} className="text-[11px] font-semibold dark:text-gray-400 text-slate-500 underline underline-offset-2">
            Reset to my default plan
          </button>
        </div>
      </Section>

      <Section id="summary-title" letter="D" title="Savings Summary">
        <TotalRow label="Planned savings" amount={summary.plannedSavings} tone="good" testId="planned-savings" />
        <TotalRow label="Planned expenses" amount={summary.plannedExpenses} testId="planned-expenses" />
        <TotalRow label="Money remaining" amount={summary.moneyRemaining} strong tone={over ? 'danger' : 'normal'} testId="money-remaining" />
        {over && <p className="text-[11px] text-red-500">Nothing is left: the plan is {formatAmount(summary.overBudget)} over your salary.</p>}
        <SalaryBar summary={summary} />
      </Section>

      <p className="text-[11px] dark:text-gray-500 text-slate-400">
        These are planned amounts only. Record your real salary and spending in Add Transaction; your balances come only from those transactions.
      </p>

      <ConfirmDialog
        open={confirmReset}
        title="Reset to your default plan?"
        message="This month's amounts go back to Salary ₹15,000, Allowance ₹2,560, Rent ₹2,500, EMI from Loans & EMIs, and savings/spending of ₹2,000, ₹2,000, ₹1,500, ₹1,000 and ₹1,000. Only planned amounts change; no transaction or balance is touched."
        confirmText="Reset"
        variant="warning"
        onConfirm={() => { setConfirmReset(false); resetToDefault() }}
        onCancel={() => setConfirmReset(false)}
      />
    </div>
  )
}

export default function SalaryPlanner() {
  const { period, setPeriod, data, loaded, loading, error, refresh, startPlan } = usePlanner()

  useEffect(() => { refresh(period) }, [period, refresh])

  return (
    <div className="space-y-5 max-w-2xl">
      <PageHeader title="Salary Planner" subtitle="Salary → Fixed → Budget → Savings → Remaining" />
      <MonthSelector period={period} onChange={setPeriod} />

      <div className={loading && loaded ? 'opacity-60 transition-opacity' : ''}>
        {error ? (
          <div className="card p-6 text-center" role="alert">
            <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
            <p className="font-bold text-sm dark:text-white text-slate-800">Could not load {periodLabel(period)}</p>
            <p className="text-xs dark:text-gray-400 text-slate-500 mt-1">{error}</p>
            <button type="button" onClick={() => refresh(period)} className="btn-primary text-xs mt-4">Try again</button>
          </div>
        ) : !loaded ? (
          <div className="space-y-4" aria-busy="true" aria-label="Loading planner">
            {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-40 w-full rounded-2xl" />)}
          </div>
        ) : data.plan ? (
          <Plan />
        ) : (
          <EmptyState icon={CalendarPlus} title={`No plan for ${periodLabel(period)}`}
            description="This month has passed. You can still create a plan for it, copied from your latest planned month."
            actionLabel="Create plan for this month" onAction={startPlan} />
        )}
      </div>
    </div>
  )
}
