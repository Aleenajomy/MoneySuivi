import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarPlus, RotateCcw } from 'lucide-react'
import { usePlanner } from '../context/PlannerContext'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import { Skeleton, StatCardSkeleton } from '../components/Skeleton'
import MonthSelector from '../components/planner/MonthSelector'
import MonthlyOverview from '../components/planner/MonthlyOverview'
import SalaryPanel from '../components/planner/SalaryPanel'
import ExpensesPanel from '../components/planner/ExpensesPanel'
import SavingsPanel from '../components/planner/SavingsPanel'
import ResetPlannerDialog from '../components/planner/ResetPlannerDialog'
import { periodLabel } from '../utils/planner'

function Section({ id, title, subtitle, children }) {
  return (
    <section aria-labelledby={id} className="space-y-3">
      <div>
        <h2 id={id} className="text-base font-black dark:text-white text-slate-800">{title}</h2>
        {subtitle && <p className="text-xs dark:text-gray-400 text-slate-500">{subtitle}</p>}
      </div>
      {children}
    </section>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading planner">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
        {Array(6).fill(0).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

export default function SalaryPlanner() {
  const { period, setPeriod, month, loading, error, refresh, startPlan } = usePlanner()
  const [resetting, setResetting] = useState(false)

  useEffect(() => { refresh(period) }, [period, refresh])

  const ready = month.summary && !error
  const showLoading = loading && !month.summary

  return (
    <div className="space-y-6">
      <PageHeader title="Salary Planner" subtitle="Plan your month. Planning never changes your account balances." />

      <MonthSelector period={period} onChange={setPeriod} />
      {month.summary && !error && (
        <div className="flex justify-end -mt-3">
          <button type="button" onClick={() => setResetting(true)} className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-red-500/10 text-red-500 active:scale-95 transition-all">
            <RotateCcw size={12} /> Reset planner
          </button>
        </div>
      )}
      {resetting && <ResetPlannerDialog onClose={() => setResetting(false)} />}

      <div className={`space-y-8 ${loading && month.summary ? 'opacity-60 transition-opacity' : ''}`}>
        {error ? (
          <div className="card p-6 text-center" role="alert">
            <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
            <p className="font-bold text-sm dark:text-white text-slate-800">Could not load {periodLabel(period)}</p>
            <p className="text-xs dark:text-gray-400 text-slate-500 mt-1">{error}</p>
            <button type="button" onClick={() => refresh(period)} className="btn-primary text-xs mt-4">Try again</button>
          </div>
        ) : showLoading ? (
          <LoadingState />
        ) : ready ? (
          <>
            <Section id="overview-title" title="Monthly Overview" subtitle={`Planned and actual position for ${periodLabel(period)}`}>
              <MonthlyOverview position={month.position} income={month.summary.income} />
            </Section>

            <Section id="income-title" title="Salary & Other Income" subtitle="Expected income for this month, and how each payment was counted">
              <SalaryPanel />
            </Section>

            <Section id="expenses-title" title="Monthly Expenses" subtitle="Planned amounts compared with what you actually spent">
              {month.plan ? <ExpensesPanel /> : (
                <EmptyState icon={CalendarPlus} title={`No plan for ${periodLabel(period)}`}
                  description="This month has passed. You can still start a plan to record what you intended."
                  actionLabel="Start plan for this month" onAction={() => startPlan().catch(() => {})} />
              )}
            </Section>

            <Section id="savings-title" title="Savings Suggestion" subtitle={`${month.position.savingsPercent}% of what remains, as a guide`}>
              {month.plan ? <SavingsPanel position={month.position} /> : (
                <p className="text-xs dark:text-gray-500 text-slate-400">Start a plan for this month to see a savings suggestion.</p>
              )}
            </Section>
          </>
        ) : null}
      </div>
    </div>
  )
}
