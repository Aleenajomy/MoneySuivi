const { config } = require('../config/env');
const { handleError } = require('../utils/http');
const { todayInTimezone } = require('../utils/recurrence');
const calc = require('../utils/plannerCalculations');
const { buildInsights } = require('../utils/plannerInsights');
const planner = require('../services/plannerService');
const { loadGoals } = require('./plannerGoalController');
const { buildBills } = require('./plannerBillsController');

const { toPaise, toApiAmount, percentOf, comparePaise } = calc;

const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const shift = ({ year, month }, by) => {
  const i = year * 12 + (month - 1) + by;
  return { year: Math.floor(i / 12), month: (i % 12) + 1 };
};
const label = ({ year, month }) => `${MONTH_NAMES[month - 1]} ${year}`;
const shortMonth = (date) => new Date(date).toLocaleDateString('en-IN', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const index = ({ year, month }) => year * 12 + month;

/**
 * The monthly financial report: the month's actual position, a trend over the previous months,
 * spending by category against last month, planned vs actual per line, goal progress and insights.
 * Read-only, and every figure comes from plannerService.getMonth, the same calculation behind the
 * other planner tabs, so the report can never disagree with them.
 */
const buildReport = async (userId, period, months, now = new Date()) => {
  const today = todayInTimezone(config.timezone, now);
  const thisMonth = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const periods = Array.from({ length: months }, (_, i) => shift(period, i - months + 1));
  if (!periods.some(p => index(p) === index(shift(period, -1)))) periods.unshift(shift(period, -1));

  const [monthData, goals, bills] = await Promise.all([
    Promise.all(periods.map(p => planner.getMonth(userId, p.year, p.month, { includeRaw: true }))),
    loadGoals(userId, period),
    index(period) === index(thisMonth) ? buildBills(userId, period.year, period.month, now) : null,
  ]);
  const byIndex = new Map(monthData.map(m => [index(m), m]));
  const current = byIndex.get(index(period));
  const previous = byIndex.get(index(shift(period, -1)));
  const { summary, byCategory, allocations } = current.raw;

  const goalInputs = goals.map(g => ({
    id: g.id,
    name: g.name,
    archived: g.archived,
    reached: g.reached,
    overdue: g.overdue,
    remainingPaise: toPaise(g.remainingAmount),
    requiredMonthlyPaise: g.requiredMonthly === null ? null : toPaise(g.requiredMonthly),
    monthlyContributionPaise: g.monthlyContribution === null ? null : toPaise(g.monthlyContribution),
    targetLabel: g.targetDate ? shortMonth(g.targetDate) : null,
  }));

  const insights = buildInsights({
    current: current.raw,
    previous: previous.raw,
    previousLabel: label(shift(period, -1)),
    goals: goalInputs,
    overdueEmis: bills ? bills.emis.filter(e => e.status === 'OVERDUE') : [],
    isCurrentMonth: index(period) === index(thisMonth),
    hasStarted: index(period) <= index(thisMonth),
  });

  const totalSpent = summary.actual.expenses;
  const before = new Map(previous.raw.byCategory.map(c => [c.category, c.paise]));
  const categories = [...byCategory].sort((a, b) => comparePaise(b.paise, a.paise)).map(c => ({
    category: c.category,
    amount: toApiAmount(c.paise),
    share: percentOf(c.paise, totalSpent),
    previousAmount: toApiAmount(before.get(c.category) || 0n),
  }));

  const lines = allocations.filter(a => a.group === 'FIXED' || a.group === 'VARIABLE').map(a => ({
    id: a.id,
    name: a.name,
    group: a.group,
    planned: toApiAmount(a.plannedPaise),
    actual: toApiAmount(a.spentPaise),
    utilization: percentOf(a.spentPaise, a.plannedPaise),
  }));

  const trend = periods.slice(-months).map((p) => {
    const m = byIndex.get(index(p));
    const s = m.raw.summary;
    return {
      year: p.year,
      month: p.month,
      hasPlan: Boolean(m.plan),
      expectedIncome: toApiAmount(s.income.expected),
      income: toApiAmount(s.actual.income),
      expenses: toApiAmount(s.actual.expenses),
      plannedExpenses: toApiAmount(s.plan.plannedExpenses),
      savingsNet: toApiAmount(s.actual.savingsNet),
      investmentNet: toApiAmount(s.actual.investmentNet),
      available: toApiAmount(s.actual.available),
    };
  });

  return {
    year: period.year,
    month: period.month,
    kpis: {
      income: toApiAmount(summary.actual.income),
      expectedIncome: toApiAmount(summary.income.expected),
      plannedExpenses: toApiAmount(summary.plan.plannedExpenses),
      expenses: toApiAmount(summary.actual.expenses),
      savingsNet: toApiAmount(summary.actual.savingsNet),
      investmentNet: toApiAmount(summary.actual.investmentNet),
      available: toApiAmount(summary.actual.available),
      // Null rather than 0% when there is nothing to compare against.
      budgetUtilization: percentOf(summary.actual.expenses, summary.plan.plannedExpenses),
      savingsRate: percentOf(summary.actual.savingsNet, summary.actual.income),
    },
    trend,
    categories,
    lines,
    goals: goals.filter(g => !g.archived).map(g => ({
      id: g.id, name: g.name, savedAmount: g.savedAmount, targetAmount: g.targetAmount, progress: g.progress, reached: g.reached,
    })),
    insights,
  };
};

const getReport = async (req, res) => {
  try {
    const period = req.query.year ? { year: req.query.year, month: req.query.month } : planner.currentPeriod();
    res.json({ success: true, ...(await buildReport(req.user.id, period, req.query.months || 6)) });
  } catch (error) {
    handleError(res, error, 'planner.getReport');
  }
};

module.exports = { buildReport, getReport };
