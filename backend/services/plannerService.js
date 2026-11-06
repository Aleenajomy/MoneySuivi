const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const { todayInTimezone } = require('../utils/recurrence');
const calc = require('../utils/plannerCalculations');

const { normalizeAccountType } = require('../utils/accountBalances');

const { toPaise, toApiAmount } = calc;

// Mirrors the Add Transaction form: the account follows the payment method, and "Other" lands in
// the Other (net banking) balance row. Used for every transaction the planner creates.
const accountTypeForPayment = (paymentMethod) => {
  const m = String(paymentMethod || '').trim().toLowerCase();
  if (m === 'cash') return 'Cash';
  if (m === 'credit card') return 'Credit Card';
  if (m === 'upi' || m === 'wallet') return 'UPI';
  if (m === 'debit card') return 'Debit Card';
  return normalizeAccountType('Net Banking');
};

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
  expense: {
    select: {
      id: true, title: true, amount: true, expenseDate: true, paymentMethod: true, accountType: true,
      type: true, category: true, investmentTransaction: { select: { id: true } },
    },
  },
  incomeSource: { select: { payDay: true, active: true } },
};

const isInvestmentCategory = (category) => String(category || '').trim().toLowerCase() === 'investment';
const isInvestment = (expense) => Boolean(expense.investmentTransaction) || isInvestmentCategory(expense.category);

/**
 * A salary record is backed by its transaction only while that transaction is a non-investment
 * income dated in the record's own month. Otherwise "received" and actual income would disagree:
 * the money would be counted in another month, or as spending/investment, as well as received.
 */
const isValidSalaryLink = (expense, { year, month }) => Boolean(expense)
  && expense.type === 'income'
  && !isInvestment(expense)
  && expense.expenseDate.getUTCFullYear() === year
  && expense.expenseDate.getUTCMonth() + 1 === month;

// The linked transaction is the source of truth, so a later edit to its amount shows here and a
// link that stopped being valid (see isValidSalaryLink) reads as not received.
const isReceived = (record) => Boolean(record.receivedAt) && isValidSalaryLink(record.expense, record);
/**
 * Puts back to pending any salary record whose linked transaction no longer qualifies after a
 * History edit, inside the caller's transaction so the two can never disagree.
 */
const resetInvalidSalaryLinks = async (tx, userId, expenseId) => {
  const record = await tx.monthlySalary.findFirst({ where: { userId, expenseId }, include: SALARY_INCLUDE });
  if (record && !isValidSalaryLink(record.expense, record)) {
    await tx.monthlySalary.update({ where: { id: record.id }, data: { receivedAmount: '0', receivedAt: null, expenseId: null } });
  }
};

const salaryReceivedPaise = (record) => (isReceived(record) ? toPaise(record.expense.amount) : 0n);

const salaryStatus = (record, expectedPaise, receivedPaise) => {
  if (!isReceived(record)) return 'PENDING';
  return receivedPaise < expectedPaise ? 'PARTIAL' : 'RECEIVED';
};

const serializeSalary = (record) => {
  const expectedPaise = toPaise(record.expectedAmount);
  const receivedPaise = salaryReceivedPaise(record);
  return {
    id: record.id,
    incomeSourceId: record.incomeSourceId,
    label: record.label,
    kind: record.kind,
    year: record.year,
    month: record.month,
    payDay: record.incomeSource?.payDay ?? null,
    expectedAmount: toApiAmount(expectedPaise),
    receivedAmount: toApiAmount(receivedPaise),
    status: salaryStatus(record, expectedPaise, receivedPaise),
    receivedAt: isReceived(record) ? record.receivedAt : null,
    expenseId: isReceived(record) ? record.expenseId : null,
    transaction: isReceived(record) ? (({ id, title, amount, expenseDate, paymentMethod, accountType }) => ({
      id, title, amount: toApiAmount(toPaise(amount)), expenseDate, paymentMethod, accountType,
    }))(record.expense) : null,
  };
};

const serializeIncomeSource = (source) => ({
  id: source.id,
  name: source.name,
  kind: source.kind,
  expectedAmount: toApiAmount(toPaise(source.expectedAmount)),
  payDay: source.payDay,
  active: source.active,
  createdAt: source.createdAt,
  updatedAt: source.updatedAt,
});

const incomeInput = (records) => records.map((r) => ({
  kind: r.kind,
  expectedPaise: toPaise(r.expectedAmount),
  receivedPaise: salaryReceivedPaise(r),
}));

const rupees = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, toApiAmount(v)]));

const serializeSummary = (summary, unplannedByCategory) => {
  const { pending, receivedCount, count, ...incomeMoney } = summary.income;
  const { byGroup, ...planMoney } = summary.plan;
  return {
    income: { ...rupees(incomeMoney), pending: toApiAmount(pending), receivedCount, count },
    plan: { ...rupees(planMoney), byGroup: rupees(byGroup) },
    unallocated: toApiAmount(summary.unallocated),
    overAllocated: summary.overAllocated,
    allocatedPercent: summary.allocatedPercent,
    actual: rupees(summary.actual),
    unplanned: unplannedByCategory.map(u => ({ category: u.category, amount: toApiAmount(u.paise) })),
  };
};

const serializeAllocation = (allocation, spentPaise, transactionCount, linkedNet) => {
  const plannedPaise = toPaise(allocation.plannedAmount);
  // Fixed/variable lines are measured by matched spending. A savings line is measured by the net
  // contributions to its linked goal this month, an investment line by the net buys of its linked
  // investment; without a link there is nothing to measure, so it reports "not tracked", not zero.
  const isSpending = calc.EXPENSE_GROUPS.includes(allocation.group);
  const linkId = allocation.group === 'SAVINGS' ? allocation.savingsGoalId
    : allocation.group === 'INVESTMENT' ? allocation.investmentPlanId : null;
  const tracked = isSpending || Boolean(linkId);
  const actualPaise = isSpending ? spentPaise : (linkedNet.get(linkId) || 0n);
  return {
    id: allocation.id,
    planId: allocation.planId,
    group: allocation.group,
    name: allocation.name,
    plannedAmount: toApiAmount(plannedPaise),
    matchCategories: allocation.matchCategories,
    recurring: allocation.recurring,
    sortOrder: allocation.sortOrder,
    savingsGoalId: allocation.savingsGoalId,
    investmentPlanId: allocation.investmentPlanId,
    actualAmount: tracked ? toApiAmount(actualPaise) : null,
    remainingAmount: tracked ? toApiAmount(plannedPaise - actualPaise) : null,
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
      ? { id: r.id, source: 'EMI', title: emi.emi.title, category: calc.EMI_CATEGORY, amount: toApiAmount(toPaise(emi.amount)), date: emi.paidAt, paymentMethod: null }
      : (({ id, title, category, amount, expenseDate, paymentMethod }) => ({
        id, source: 'TRANSACTION', title, category, amount: toApiAmount(toPaise(amount)), date: expenseDate, paymentMethod,
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
const getMonth = async (userId, year, month, { includeSpending = false, includeRaw = false } = {}, db = prisma) => {
  const range = monthRange(year, month);
  const [salaries, plan, transactions, emiPayments, contributions] = await Promise.all([
    db.monthlySalary.findMany({ where: { userId, year, month }, include: SALARY_INCLUDE, orderBy: [{ createdAt: 'asc' }] }),
    db.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } }, include: { allocations: { orderBy: ALLOCATION_ORDER } } }),
    db.expense.findMany({
      where: { userId, expenseDate: range, type: { in: ['income', 'expense'] } },
      select: {
        id: true, type: true, title: true, category: true, amount: true, expenseDate: true, paymentMethod: true,
        investmentTransaction: { select: { id: true, planId: true } }, allocationAssignment: { select: { allocationId: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    }),
    db.eMIPayment.findMany({
      where: { emi: { userId }, paidAt: range },
      select: { id: true, amount: true, paidAt: true, emi: { select: { title: true } } },
      orderBy: { paidAt: 'desc' },
    }),
    db.savingsContribution.findMany({ where: { goal: { userId }, date: range }, select: { goalId: true, type: true, amount: true } }),
  ]);

  const allocations = plan?.allocations || [];
  const actuals = calc.classifyActuals(
    transactions.map(t => ({
      id: t.id,
      type: t.type,
      title: t.title,
      category: t.category,
      amountPaise: toPaise(t.amount),
      // The category decides, exactly as in Analytics: a buy recategorised in History is no longer
      // an investment anywhere, and nothing is counted as both.
      isInvestment: false,
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
  // Net this month per linked goal and per linked investment, keyed by their ids.
  const linkedNet = new Map();
  const addNet = (id, value) => linkedNet.set(id, (linkedNet.get(id) || 0n) + value);
  contributions.forEach(c => addNet(c.goalId, c.type === 'WITHDRAWAL' ? -toPaise(c.amount) : toPaise(c.amount)));
  transactions.filter(t => t.investmentTransaction && isInvestmentCategory(t.category)).forEach(t => addNet(t.investmentTransaction.planId, t.type === 'income' ? -toPaise(t.amount) : toPaise(t.amount)));
  const savingsNet = calc.sumPaise(contributions.map(c => (c.type === 'WITHDRAWAL' ? -toPaise(c.amount) : toPaise(c.amount))));
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
      allocations: allocations.map(a => serializeAllocation(a, matched.byAllocation.get(a.id) ?? 0n, counts.get(a.id) || 0, linkedNet)),
    } : null,
    salaries: salaries.map(serializeSalary),
    summary: serializeSummary(summary, plan ? matched.unplannedByCategory : []),
    ...(includeSpending && { spending: serializeSpending(matched.resolved, transactions, emiPayments) }),
    // Exact BigInt figures for reports and insights, so they reuse this calculation instead of
    // re-deriving it. Never sent to clients as is.
    ...(includeRaw && {
      raw: {
        summary,
        spendingCount: actuals.spending.length,
        unplanned: matched.unplanned,
        unplannedByCategory: matched.unplannedByCategory,
        byCategory: [...actuals.spending.reduce((m, s) => m.set(s.category || 'Other', (m.get(s.category || 'Other') || 0n) + s.amountPaise), new Map())]
          .map(([category, paise]) => ({ category, paise })),
        allocations: allocations.map(a => ({
          id: a.id,
          name: a.name,
          group: a.group,
          savingsGoalId: a.savingsGoalId,
          plannedPaise: toPaise(a.plannedAmount),
          spentPaise: matched.byAllocation.get(a.id) ?? 0n,
        })),
      },
    }),
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
  accountTypeForPayment,
  isInvestmentCategory,
  isValidSalaryLink,
  isReceived,
  resetInvalidSalaryLinks,
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
