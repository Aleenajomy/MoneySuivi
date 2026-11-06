import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { AlertTriangle, CalendarPlus, Info } from 'lucide-react'
import { usePlanner } from '../context/PlannerContext'
import PageHeader from '../components/common/PageHeader'
import EmptyState from '../components/common/EmptyState'
import { Skeleton, StatCardSkeleton } from '../components/Skeleton'
import MonthSelector from '../components/planner/MonthSelector'
import PlannerSummary from '../components/planner/PlannerSummary'
import DistributionChart from '../components/planner/DistributionChart'
import BudgetPanel from '../components/planner/BudgetPanel'
import SalaryPanel from '../components/planner/SalaryPanel'
import SpendingPanel from '../components/planner/SpendingPanel'
import GoalsPanel from '../components/planner/GoalsPanel'
import InvestmentsPanel from '../components/planner/InvestmentsPanel'
import BillsPanel from '../components/planner/BillsPanel'
import { formatAmount, periodLabel } from '../utils/planner'

const TABS = [
  { id: 'overview', label: 'Overview' },
  { id: 'salary', label: 'Salary' },
  { id: 'budget', label: 'Budget' },
  { id: 'spending', label: 'Spending' },
  { id: 'goals', label: 'Goals' },
  { id: 'invest', label: 'Invest' },
  { id: 'bills', label: 'Bills' },
]

function Overview({ month, onOpen }) {
  const { summary, plan, salaries } = month
  const hasIncome = salaries.length > 0
  const hasAllocations = plan.allocations.length > 0
  return (
    <div className="space-y-5">
      <PlannerSummary summary={summary} />
      {!hasIncome && (
        <div className="card p-4 flex items-start gap-3">
          <Info size={18} className="text-sky-500 flex-shrink-0 mt-0.5" aria-hidden="true" />
          <div className="text-xs dark:text-gray-300 text-slate-600">
            <p className="font-bold dark:text-white text-slate-800 text-sm">Start with your salary</p>
            <p className="mt-0.5">Add what you expect to earn this month, then split it into expenses, savings and investments.</p>
            <button type="button" onClick={() => onOpen('salary')} className="btn-primary text-xs mt-3">Add salary</button>
          </div>
        </div>
      )}
      {(hasIncome || hasAllocations) && <DistributionChart summary={summary} allocations={plan.allocations} />}
      {hasIncome && !hasAllocations && (
        <EmptyState icon={CalendarPlus} title="Nothing allocated yet"
          description={`${formatAmount(summary.income.expected)} is expected and none of it is planned.`}
          actionLabel="Plan your budget" onAction={() => onOpen('budget')} />
      )}
      <p className="text-[11px] dark:text-gray-500 text-slate-400">
        Planned amounts are targets, not payments. Actual spending comes only from transactions you record.
        Transfers between your own accounts are never counted as spending.
      </p>
    </div>
  )
}

function LoadingState() {
  return (
    <div className="space-y-4" aria-busy="true" aria-label="Loading planner">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {Array(8).fill(0).map((_, i) => <StatCardSkeleton key={i} />)}
      </div>
      <Skeleton className="h-64 w-full rounded-2xl" />
    </div>
  )
}

export default function SalaryPlanner() {
  const { period, setPeriod, month, loading, error, refresh, startPlan } = usePlanner()
  const [params, setParams] = useSearchParams()
  const tab = TABS.some(t => t.id === params.get('tab')) ? params.get('tab') : 'overview'
  const focusLine = params.get('line')
  const openTab = (id, extra = {}) => setParams(id === 'overview' ? {} : { tab: id, ...extra }, { replace: true })
  const showSpending = (lineId) => openTab('spending', lineId ? { line: lineId } : {})

  useEffect(() => { refresh(period) }, [period, refresh])
  // On a narrow phone the tab bar scrolls; keep the selected tab fully visible.
  useEffect(() => {
    document.getElementById(`tab-${tab}`)?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [tab])

  const ready = month.summary && !error
  const showLoading = loading && !month.summary

  return (
    <div className="space-y-5">
      <PageHeader title="Salary Planner" subtitle="Plan every rupee of your monthly income" />

      <MonthSelector period={period} onChange={setPeriod} />

      {/* Seven tabs don't fit a 320px phone, so the bar scrolls sideways there instead of squeezing labels. */}
      <div role="tablist" aria-label="Planner sections" className="flex gap-1 p-1 rounded-xl dark:bg-dark-card bg-slate-100 border dark:border-dark-border border-transparent overflow-x-auto scrollbar-none">
        {TABS.map(t => (
          <button key={t.id} type="button" role="tab" id={`tab-${t.id}`} aria-selected={tab === t.id} aria-controls="planner-panel"
            onClick={() => openTab(t.id)}
            className={`flex-1 min-w-[4.5rem] px-2 py-2 rounded-lg text-xs sm:text-sm font-bold whitespace-nowrap transition-all ${tab === t.id ? 'bg-white dark:bg-dark-bg shadow-sm dark:text-white text-slate-800' : 'dark:text-gray-400 text-slate-500'}`}>
            {t.label}
          </button>
        ))}
      </div>

      <div id="planner-panel" role="tabpanel" aria-labelledby={`tab-${tab}`} className={loading && month.summary ? 'opacity-60 transition-opacity' : ''}>
        {error ? (
          <div className="card p-6 text-center" role="alert">
            <AlertTriangle size={22} className="text-amber-500 mx-auto mb-2" />
            <p className="font-bold text-sm dark:text-white text-slate-800">Could not load {periodLabel(period)}</p>
            <p className="text-xs dark:text-gray-400 text-slate-500 mt-1">{error}</p>
            <button type="button" onClick={() => refresh(period)} className="btn-primary text-xs mt-4">Try again</button>
          </div>
        ) : showLoading ? (
          <LoadingState />
        ) : ready && !month.plan ? (
          tab === 'salary' ? <SalaryPanel /> : tab === 'spending' ? <SpendingPanel focusLine={null} onFocusLine={() => {}} />
            : tab === 'goals' ? <GoalsPanel /> : tab === 'invest' ? <InvestmentsPanel /> : tab === 'bills' ? <BillsPanel /> : (
            <EmptyState icon={CalendarPlus} title={`No plan for ${periodLabel(period)}`}
              description="This month has passed. You can still start a plan to record what you intended; repeating lines from your latest earlier month are copied in."
              actionLabel="Start plan for this month" onAction={() => startPlan().catch(() => {})} />
          )
        ) : ready ? (
          tab === 'salary' ? <SalaryPanel />
            : tab === 'budget' ? <BudgetPanel onShowSpending={showSpending} />
              : tab === 'spending' ? <SpendingPanel focusLine={focusLine} onFocusLine={showSpending} />
                : tab === 'goals' ? <GoalsPanel />
                  : tab === 'invest' ? <InvestmentsPanel />
                    : tab === 'bills' ? <BillsPanel />
                : <Overview month={month} onOpen={openTab} />
        ) : null}
      </div>
    </div>
  )
}
