const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const { todayInTimezone } = require('../utils/recurrence');
const calc = require('../utils/plannerCalculations');

const { toPaise, fromPaise } = calc;

// Transaction dates are stored as UTC midnight of the chosen calendar day, so a calendar month
// is exactly this UTC range.
const monthRange = (year, month) => ({
  gte: new Date(Date.UTC(year, month - 1, 1)),
  lt: new Date(Date.UTC(year, month, 1)),
});

const currentPeriod = (now = new Date()) => {
  const today = todayInTimezone(config.timezone, now);
  return { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
};

const periodIndex = ({ year, month }) => year * 12 + (month - 1);

// Matches (year, month) at or after the given period.
const fromPeriodWhere = ({ year, month }) => ({ OR: [{ year: { gt: year } }, { year, month: { gte: month } }] });

const SALARY_INCLUDE = {
  expense: { select: { id: true, title: true, amount: true, expenseDate: true, paymentMethod: true, accountType: true } },
  incomeSource: { select: { payDay: true, active: true } },
};

const salaryReceivedPaise = (record) => (record.expense ? toPaise(record.expense.amount) : toPaise(record.receivedAmount));

const salaryStatus = (record, expectedPaise, receivedPaise) => {
  if (!record.receivedAt) return 'PENDING';
  return receivedPaise < expectedPaise ? 'PARTIAL' : 'RECEIVED';
};

const serializeSalary = (record) => {
  const expectedPaise = toPaise(record.expectedAmount);
  const receivedPaise = record.receivedAt ? salaryReceivedPaise(record) : 0;
  return {
    id: record.id,
    incomeSourceId: record.incomeSourceId,
    label: record.label,
    kind: record.kind,
    year: record.year,
    month: record.month,
    payDay: record.incomeSource?.payDay ?? null,
    expectedAmount: fromPaise(expectedPaise),
    receivedAmount: fromPaise(receivedPaise),
    status: salaryStatus(record, expectedPaise, receivedPaise),
    receivedAt: record.receivedAt,
    expenseId: record.expenseId,
    transaction: record.expense ? { ...record.expense, amount: fromPaise(toPaise(record.expense.amount)) } : null,
  };
};

const serializeIncomeSource = (source) => ({
  id: source.id,
  name: source.name,
  kind: source.kind,
  expectedAmount: fromPaise(toPaise(source.expectedAmount)),
  payDay: source.payDay,
  active: source.active,
  createdAt: source.createdAt,
  updatedAt: source.updatedAt,
});

const incomeInput = (records) => records.map((r) => ({
  kind: r.kind,
  expectedPaise: toPaise(r.expectedAmount),
  receivedPaise: r.receivedAt ? salaryReceivedPaise(r) : 0,
}));

const rupees = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, fromPaise(v)]));

const serializeSummary = (summary, unplannedByCategory) => {
  const { pending, receivedCount, count, ...incomeMoney } = summary.income;
  const { byGroup, ...planMoney } = summary.plan;
  return {
    income: { ...rupees(incomeMoney), pending: fromPaise(pending), receivedCount, count },
    plan: { ...rupees(planMoney), byGroup: rupees(byGroup) },
    unallocated: fromPaise(summary.unallocated),
    overAllocated: summary.overAllocated,
    allocatedPercent: summary.allocatedPercent,
    actual: rupees(summary.actual),
    unplanned: unplannedByCategory.map(u => ({ category: u.category, amount: fromPaise(u.paise) })),
  };
};

const serializeAllocation = (allocation, actualPaise, transactionCount) => {
  const plannedPaise = toPaise(allocation.plannedAmount);
  // Savings and investment actuals come from goals and investment plans (Phase 5), not from
  // category matching, so they are reported as not tracked rather than as zero.
  const tracked = calc.EXPENSE_GROUPS.includes(allocation.group);
  return {
    id: allocation.id,
    planId: allocation.planId,
    group: allocation.group,
    name: allocation.name,
    plannedAmount: fromPaise(plannedPaise),
    matchCategories: allocation.matchCategories,
    recurring: allocation.recurring,
    sortOrder: allocation.sortOrder,
    savingsGoalId: allocation.savingsGoalId,
    investmentPlanId: allocation.investmentPlanId,
    actualAmount: tracked ? fromPaise(actualPaise) : null,
    remainingAmount: tracked ? fromPaise(plannedPaise - actualPaise) : null,
    utilization: tracked ? calc.percentOf(actualPaise, plannedPaise) : null,
    transactionCount,
  };
};

const EMI_PREFIX = 'emi:';

// Newest first. EMI payments come from the EMI tracker and follow the "EMI" category rule, so
// they can be seen here but not reassigned (there is no transaction row to pin).
const serializeSpending = (resolved, transactions, emiPayments) => {
  const txById = new Map(transactions.map(t => [t.id, t]));
  const emiById = new Map(emiPayments.map(p => [`${EMI_PREFIX}${p.id}`, p]));
  return resolved.map((r) => {
    const emi = emiById.get(r.id);
    const base = emi
      ? { id: r.id, source: 'EMI', title: emi.emi.title, category: calc.EMI_CATEGORY, amount: fromPaise(toPaise(emi.amount)), date: emi.paidAt, paymentMethod: null }
      : (({ id, title, category, amount, expenseDate, paymentMethod }) => ({
        id, source: 'TRANSACTION', title, category, amount: fromPaise(toPaise(amount)), date: expenseDate, paymentMethod,
      }))(txById.get(r.id));
    return { ...base, allocationId: r.allocationId, matchedBy: r.matchedBy, reassignable: !emi };
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
};

const ALLOCATION_ORDER = [{ sortOrder: 'asc' }, { createdAt: 'asc' }];

/**
 * Everything the planner shows for one month. Read-only: it never creates plans or records, and
 * it only reads the user's existing transactions, so nothing recorded in History is duplicated.
 * With `includeSpending`, it also returns each spending item and the line it counted toward.
 */
const getMonth = async (userId, year, month, { includeSpending = false } = {}, db = prisma) => {
  const range = monthRange(year, month);
  const [salaries, plan, transactions, emiPayments, contributions] = await Promise.all([
    db.monthlySalary.findMany({ where: { userId, year, month }, include: SALARY_INCLUDE, orderBy: [{ createdAt: 'asc' }] }),
    db.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } }, include: { allocations: { orderBy: ALLOCATION_ORDER } } }),
    db.expense.findMany({
      where: { userId, expenseDate: range, type: { in: ['income', 'expense'] } },
      select: {
        id: true, type: true, title: true, category: true, amount: true, expenseDate: true, paymentMethod: true,
        investmentTransaction: { select: { id: true } }, allocationAssignment: { select: { allocationId: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    }),
    db.eMIPayment.findMany({
      where: { emi: { userId }, paidAt: range },
      select: { id: true, amount: true, paidAt: true, emi: { select: { title: true } } },
      orderBy: { paidAt: 'desc' },
    }),
    db.savingsContribution.findMany({ where: { goal: { userId }, date: range }, select: { type: true, amount: true } }),
  ]);

  const allocations = plan?.allocations || [];
  const actuals = calc.classifyActuals(
    transactions.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      category: t.category,
      amountPaise: toPaise(t.amount),
      isInvestment: Boolean(t.investmentTransaction),
      assignedAllocationId: t.allocationAssignment?.allocationId,
    })),
    emiPayments.map(p => ({ id: p.id, amountPaise: toPaise(p.amount) })),
  );
  const matched = calc.matchSpending(
    allocations.map(a => ({ id: a.id, group: a.group, name: a.name, matchCategories: a.matchCategories, sortOrder: a.sortOrder })),
    actuals.spending,
  );
  const counts = new Map();
  matched.resolved.forEach(r => r.allocationId && counts.set(r.allocationId, (counts.get(r.allocationId) || 0) + 1));
  const savingsNet = calc.sumPaise(contributions.map(c => (c.type === 'WITHDRAWAL' ? -1 : 1) * toPaise(c.amount)));
  const summary = calc.buildMonthSummary({
    income: calc.summarizeIncome(incomeInput(salaries)),
    plan: calc.summarizePlan(allocations.map(a => ({ group: a.group, plannedPaise: toPaise(a.plannedAmount) }))),
    actuals,
    savingsNet,
  });

  return {
    year,
    month,
    plan: plan ? {
      id: plan.id,
      year: plan.year,
      month: plan.month,
      note: plan.note,
      allocations: allocations.map(a => serializeAllocation(a, matched.byAllocation.get(a.id) || 0, counts.get(a.id) || 0)),
    } : null,
    salaries: salaries.map(serializeSalary),
    summary: serializeSummary(summary, plan ? matched.unplannedByCategory : []),
    ...(includeSpending && { spending: serializeSpending(matched.resolved, transactions, emiPayments) }),
  };
};

const latestEarlierPlan = (tx, userId, year, month) => tx.budgetPlan.findFirst({
  where: { userId, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
  orderBy: [{ year: 'desc' }, { month: 'desc' }],
  include: { allocations: { where: { recurring: true }, orderBy: ALLOCATION_ORDER } },
});

/** Copies the latest earlier plan's recurring allocations; names already in the plan are kept as they are. */
const copyRecurringAllocations = async (tx, userId, plan) => {
  const source = await latestEarlierPlan(tx, userId, plan.year, plan.month);
  if (!source || source.allocations.length === 0) return 0;
  const { count } = await tx.budgetAllocation.createMany({
    data: source.allocations.map(a => ({
      planId: plan.id,
      group: a.group,
      name: a.name,
      plannedAmount: a.plannedAmount,
      matchCategories: a.matchCategories,
      recurring: true,
      sortOrder: a.sortOrder,
      savingsGoalId: a.savingsGoalId,
      investmentPlanId: a.investmentPlanId,
    })),
    skipDuplicates: true,
  });
  return count;
};

/** Adds a pending record for each active source that existed by the end of the month. */
const initializeSalaries = async (tx, userId, year, month) => {
  const sources = await tx.incomeSource.findMany({
    where: { userId, active: true, createdAt: { lt: monthRange(year, month).lt } },
  });
  if (sources.length === 0) return 0;
  const { count } = await tx.monthlySalary.createMany({
    data: sources.map(s => ({
      userId, incomeSourceId: s.id, label: s.name, kind: s.kind, year, month, expectedAmount: s.expectedAmount,
    })),
    skipDuplicates: true,
  });
  return count;
};

/**
 * Idempotent month set-up. ON CONFLICT DO NOTHING (skipDuplicates) on the unique keys means two
 * concurrent calls cannot create two plans or duplicate salary records, and only the call that
 * actually created the plan copies allocations into it.
 */
const initializeMonth = (userId, year, month) => prisma.$transaction(async (tx) => {
  const { count: planCreated } = await tx.budgetPlan.createMany({ data: [{ userId, year, month }], skipDuplicates: true });
  const plan = await tx.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } } });
  const copiedAllocations = planCreated ? await copyRecurringAllocations(tx, userId, plan) : 0;
  const addedSalaries = await initializeSalaries(tx, userId, year, month);
  return { created: planCreated === 1, copiedAllocations, addedSalaries };
});

module.exports = {
  monthRange,
  currentPeriod,
  periodIndex,
  fromPeriodWhere,
  SALARY_INCLUDE,
  serializeSalary,
  serializeIncomeSource,
  getMonth,
  initializeMonth,
  initializeSalaries,
  copyRecurringAllocations,
};
