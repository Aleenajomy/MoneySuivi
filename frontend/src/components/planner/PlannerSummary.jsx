import { Banknote, PlusCircle, CalendarClock, CheckCircle2, Receipt, PiggyBank, TrendingUp, Scale, ShoppingCart, Wallet } from 'lucide-react'
import StatCard from '../common/StatCard'
import { formatAmount } from '../../utils/planner'

// Short titles under an "Income" / "Plan" heading fit two cards per row on a 320px phone
// without the shared StatCard truncating them.
function CardGroup({ title, cards }) {
  const id = `summary-${title.toLowerCase()}`
  return (
    <section aria-labelledby={id}>
      <h2 id={id} className="text-xs font-bold uppercase tracking-wider dark:text-gray-400 text-slate-500 mb-2">{title}</h2>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map(card => <StatCard key={card.label} {...card} amount={formatAmount(card.amount)} />)}
      </div>
    </section>
  )
}

export default function PlannerSummary({ summary, kpis }) {
  const { income, plan, unallocated, overAllocated, allocatedPercent } = summary
  const incomeCards = [
    { label: 'Salary', amount: income.expectedSalary, icon: Banknote, tone: 'secondary', subtext: 'Monthly fixed salary' },
    { label: 'Extra', amount: income.expectedAdditional, icon: PlusCircle, tone: 'secondary', subtext: 'Allowances, bonuses' },
    { label: 'Expected', amount: income.expected, icon: CalendarClock, tone: 'info', subtext: `${income.count} source${income.count === 1 ? '' : 's'}` },
    {
      label: 'Received', amount: income.received, icon: CheckCircle2, tone: 'secondary',
      subtext: income.pending > 0 ? `${formatAmount(income.pending)} to come` : (income.count ? 'All received' : 'Nothing expected'),
    },
  ]
  const planCards = [
    { label: 'Expenses', amount: plan.plannedExpenses, icon: Receipt, tone: 'danger', subtext: 'Fixed + variable' },
    { label: 'Savings', amount: plan.plannedSavings, icon: PiggyBank, tone: 'secondary', subtext: 'Set aside' },
    { label: 'Investments', amount: plan.plannedInvestments, icon: TrendingUp, tone: 'warning', subtext: 'Planned to invest' },
    {
      label: overAllocated ? 'Over plan' : 'Unallocated',
      amount: Math.abs(unallocated),
      icon: Scale,
      tone: overAllocated ? 'danger' : 'info',
      subtext: allocatedPercent === null ? 'Add income first' : `${allocatedPercent}% planned`,
    },
  ]

  return (
    <div className="space-y-4" data-testid="planner-summary">
      <CardGroup title="Income" cards={incomeCards} />
      <CardGroup title="Plan" cards={planCards} />
      {kpis && (
        <CardGroup title="Actual" cards={[
          {
            label: 'Spent', amount: kpis.expenses, icon: ShoppingCart, tone: 'danger',
            subtext: kpis.budgetUtilization === null ? 'No spending planned' : `${kpis.budgetUtilization}% of planned spending`,
          },
          { label: 'Saved', amount: kpis.savingsNet, icon: PiggyBank, tone: 'secondary', subtext: kpis.savingsRate === null ? 'In savings goals' : `${kpis.savingsRate}% of income received` },
          { label: 'Invested', amount: kpis.investmentNet, icon: TrendingUp, tone: 'warning', subtext: 'Net of redemptions' },
          { label: 'Available', amount: kpis.available, icon: Wallet, tone: Number(kpis.available) < 0 ? 'danger' : 'info', subtext: 'Received − spent − saved − invested' },
        ]} />
      )}
    </div>
  )
}
