// Monthly insights for the Salary Planner. Every insight is computed from money the user actually
// recorded or planned; a rule whose inputs are missing produces nothing, so no income, spending or
// savings is ever assumed. Amounts are BigInt paise throughout.
const { paiseToDecimalString, percentOf } = require('./plannerCalculations');

const MIN_CATEGORY = 50000n; // ₹500: smaller categories swing too much to be worth a remark
const MIN_CHANGE = 20000n; // ₹200
const MIN_CHANGE_PERCENT = 20;
const SUGGEST_STEP = 10000n; // suggestions are rounded down to ₹100

const inr = (paise) => new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: paise % 100n === 0n ? 0 : 2,
  maximumFractionDigits: 2,
}).format(paiseToDecimalString(paise));
const list = (names) => (names.length <= 1 ? names.join('') : `${names.slice(0, -1).join(', ')} and ${names.at(-1)}`);
const sum = (values) => values.reduce((t, v) => t + v, 0n);
const abs = (v) => (v < 0n ? -v : v);
const min = (a, b) => (a < b ? a : b);

/**
 * @param current    raw month from plannerService.getMonth({ includeRaw: true })
 * @param previous   the same for the previous month, or null
 * @param previousLabel e.g. "October 2026"
 * @param goals      [{ name, archived, reached, overdue, remainingPaise, requiredMonthlyPaise, monthlyContributionPaise, targetLabel, id }]
 * @param overdueEmis [{ title }]
 * @param isCurrentMonth / hasStarted  where the viewed month is relative to today
 */
const buildInsights = ({ current, previous, previousLabel, goals = [], overdueEmis = [], isCurrentMonth, hasStarted }) => {
  const out = [];
  const add = (id, tone, text) => out.push({ id, tone, text });
  const { income, plan, actual } = current.summary;
  const lines = current.allocations.filter(a => a.group === 'FIXED' || a.group === 'VARIABLE');

  if (isCurrentMonth && overdueEmis.length) {
    add('emi-overdue', 'critical', `${list(overdueEmis.map(e => e.title))} ${overdueEmis.length === 1 ? 'EMI is' : 'EMIs are'} overdue.`);
  }

  if (current.summary.overAllocated && income.expected > 0n) {
    add('over-allocated', 'warning', `You've planned ${inr(-current.summary.unallocated)} more than your expected income of ${inr(income.expected)}.`);
  }

  if (hasStarted) {
    lines.filter(l => l.plannedPaise > 0n && l.spentPaise > l.plannedPaise)
      .sort((a, b) => (b.spentPaise - b.plannedPaise > a.spentPaise - a.plannedPaise ? 1 : -1))
      .slice(0, 2)
      .forEach(l => add(`over-plan:${l.id}`, 'warning', `${l.name} is ${inr(l.spentPaise - l.plannedPaise)} over plan (${inr(l.spentPaise)} of ${inr(l.plannedPaise)}).`));
  }

  // Month-on-month change by category, only when both months have recorded spending.
  if (hasStarted && previous && previous.spendingCount > 0 && current.spendingCount > 0) {
    const before = new Map(previous.byCategory.map(c => [c.category, c.paise]));
    current.byCategory
      .map(c => ({ ...c, was: before.get(c.category) || 0n }))
      .filter(c => c.was >= MIN_CATEGORY && c.paise >= MIN_CATEGORY && abs(c.paise - c.was) >= MIN_CHANGE)
      .map(c => ({ ...c, pct: percentOf(abs(c.paise - c.was), c.was) }))
      .filter(c => c.pct >= MIN_CHANGE_PERCENT)
      .sort((a, b) => b.pct - a.pct)
      .slice(0, 2)
      .forEach((c) => {
        const more = c.paise > c.was;
        add(`category:${c.category}`, more ? 'warning' : 'positive',
          `You spent ${c.pct}% ${more ? 'more' : 'less'} on ${c.category} than in ${previousLabel} (${inr(c.paise)} vs ${inr(c.was)}).`);
      });
  }

  if (hasStarted && current.unplanned > 0n) {
    const top = current.unplannedByCategory[0];
    add('unplanned', 'info', `${inr(current.unplanned)} was spent outside your plan${top ? `, mostly on ${top.category}` : ''}.`);
  }

  const fixed = lines.filter(l => l.group === 'FIXED');
  const fixedSpent = sum(fixed.map(l => l.spentPaise));
  const fixedPlanned = sum(fixed.map(l => l.plannedPaise));
  const fixedNames = [...fixed].sort((a, b) => (b.plannedPaise > a.plannedPaise ? 1 : -1)).slice(0, 2).map(l => l.name);
  if (hasStarted && actual.income > 0n && fixedSpent > 0n) {
    add('fixed-share', 'info', `Fixed costs (${list(fixedNames)}) took ${percentOf(fixedSpent, actual.income)}% of the income you received.`);
  } else if (income.expected > 0n && fixedPlanned > 0n) {
    add('fixed-share', 'info', `Fixed costs (${list(fixedNames)}) are planned at ${percentOf(fixedPlanned, income.expected)}% of your expected income.`);
  }

  const activeGoals = goals.filter(g => !g.archived);
  if (hasStarted && actual.income > 0n && actual.savingsNet > 0n) {
    const invested = actual.investmentNet > 0n ? `, and invested ${inr(actual.investmentNet)}` : '';
    add('savings-rate', 'positive', `Your savings rate is ${percentOf(actual.savingsNet, actual.income)}%: you set aside ${inr(actual.savingsNet)} of the ${inr(actual.income)} you received${invested}.`);
  } else if (isCurrentMonth && actual.income > 0n && activeGoals.length && actual.savingsNet <= 0n) {
    add('savings-rate', 'info', `Nothing has been set aside in your savings goals yet this month.`);
  }

  if (!current.summary.overAllocated && income.expected > 0n && current.summary.unallocated > 0n) {
    add('unallocated', 'info', `${inr(current.summary.unallocated)} of your expected income isn't allocated yet.`);
  }

  // Only money that is both unplanned and still in hand this month can honestly be suggested.
  if (isCurrentMonth && actual.available > 0n && current.summary.unallocated > 0n) {
    const linked = current.allocations.filter(a => a.group === 'SAVINGS' && a.savingsGoalId)
      .map(a => activeGoals.find(g => g.id === a.savingsGoalId)).filter(g => g && !g.reached);
    const target = linked[0];
    const amount = (min(actual.available, current.summary.unallocated) / SUGGEST_STEP) * SUGGEST_STEP;
    if (target && amount > 0n) {
      add(`suggest:${target.id}`, 'positive', `You could add up to ${inr(amount)} more to ${target.name} this month: that much is both unallocated and still available.`);
    }
  }

  activeGoals.filter(g => !g.reached).forEach((g) => {
    if (g.overdue) {
      add(`goal-overdue:${g.id}`, 'warning', `${g.name}'s target date has passed with ${inr(g.remainingPaise)} still to go.`);
    } else if (g.requiredMonthlyPaise !== null && g.monthlyContributionPaise !== null && g.requiredMonthlyPaise > g.monthlyContributionPaise) {
      add(`goal-behind:${g.id}`, 'warning', `To reach ${g.name} by ${g.targetLabel} you'd need ${inr(g.requiredMonthlyPaise)} a month, ${inr(g.requiredMonthlyPaise - g.monthlyContributionPaise)} more than you planned.`);
    }
  });

  return out;
};

module.exports = { buildInsights, inr };
