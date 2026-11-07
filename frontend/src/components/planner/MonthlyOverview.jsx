import { CalendarClock, CheckCircle2, ClipboardList, Receipt, Scale, Wallet } from 'lucide-react'
import { formatAmount } from '../../utils/planner'

const TONES = {
  secondary: 'text-secondary bg-secondary/10',
  danger: 'text-danger bg-danger/10',
  info: 'text-sky-500 bg-sky-500/10',
  warning: 'text-amber-500 bg-amber-500/10',
}

// Rows rather than tiles, so full labels and amounts fit on a 320px phone.
function Position({ title, testId, cards, note }) {
  const id = `overview-${testId}`
  return (
    <section aria-labelledby={id} data-testid={testId} className="card p-4">
      <h3 id={id} className="text-xs font-bold uppercase tracking-wider dark:text-gray-400 text-slate-500 mb-1">{title}</h3>
      <dl className="divide-y dark:divide-dark-border divide-light-border">
        {cards.map(({ label, amount, icon: Icon, tone, subtext, total }) => (
          <div key={label} className="flex items-center gap-3 py-2.5">
            <span className={`w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0 ${TONES[tone]}`} aria-hidden="true"><Icon size={15} /></span>
            <div className="min-w-0 flex-1">
              <dt className={`text-sm ${total ? 'font-bold dark:text-white text-slate-800' : 'font-semibold dark:text-gray-200 text-slate-700'}`}>
                {label}
                <span className="block text-[11px] font-normal dark:text-gray-500 text-slate-400">{subtext}</span>
              </dt>
            </div>
            <dd className={`tabular-nums flex-shrink-0 ${total ? 'text-lg font-black' : 'text-sm font-bold'} ${tone === 'danger' && total ? 'text-red-500' : 'dark:text-white text-slate-800'}`}>{formatAmount(amount)}</dd>
          </div>
        ))}
      </dl>
      {note && <p className="text-[11px] dark:text-gray-500 text-slate-400 mt-1">{note}</p>}
    </section>
  )
}

/**
 * The month's two positions side by side. Planned uses expected income and planned amounts;
 * actual uses only money that has really arrived or been spent, so the two are never mixed.
 */
export default function MonthlyOverview({ position, income }) {
  const pending = Math.max(Number(position.expectedIncome) - Number(position.receivedIncome), 0)
  return (
    <div className="space-y-3" data-testid="monthly-overview">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
        <Position
          title="Planned"
          testId="planned-position"
          cards={[
            { label: 'Expected income', amount: position.expectedIncome, icon: CalendarClock, tone: 'info', subtext: `${income.count} income record${income.count === 1 ? '' : 's'}` },
            { label: 'Planned expenses', amount: position.plannedExpenses, icon: ClipboardList, tone: 'warning', subtext: 'Targets, not payments' },
            {
              label: position.plannedRemaining < 0 ? 'Planned shortfall' : 'Planned remaining',
              amount: Math.abs(position.plannedRemaining), icon: Scale, tone: position.plannedRemaining < 0 ? 'danger' : 'secondary', subtext: 'Expected − planned', total: true,
            },
          ]}
        />
        <Position
          title="Actual"
          testId="actual-position"
          cards={[
            { label: 'Received income', amount: position.receivedIncome, icon: CheckCircle2, tone: 'secondary', subtext: pending > 0 ? `${formatAmount(pending)} still expected` : 'Money that has arrived' },
            { label: 'Actual expenses', amount: position.actualExpenses, icon: Receipt, tone: 'danger', subtext: 'Recorded spending + EMIs paid' },
            {
              label: position.actualRemaining < 0 ? 'Actual shortfall' : 'Actual remaining',
              amount: Math.abs(position.actualRemaining), icon: Wallet, tone: position.actualRemaining < 0 ? 'danger' : 'secondary', subtext: 'Received − actual', total: true,
            },
          ]}
          note={Number(position.investedNet) !== 0 ? `Also takes out ${formatAmount(position.investedNet)} moved into investments this month.` : null}
        />
      </div>
      <p className="text-[11px] dark:text-gray-500 text-slate-400">
        Received income counts salary you marked received (including "Already in my balance") and other income recorded in History.
        The planner only reads your transactions; your account balances change only when you record a transaction.
      </p>
    </div>
  )
}
