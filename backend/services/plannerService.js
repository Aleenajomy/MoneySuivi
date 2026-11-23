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

const DAY_MS = 24 * 60 * 60 * 1000;
const dayNumber = (date) => Math.floor(date.getTime() / DAY_MS);
const daysApart = (a, b) => Math.abs(dayNumber(a) - dayNumber(b));

// Salary for a month is often paid early the next month (October's salary on 5 November), so the
// money may arrive in the earning month or the one after. The record stays in its earning month;
// the transaction keeps its real date, so balances move on the day the money actually arrived.
const receivedWindow = (year, month) => ({
  gte: new Date(Date.UTC(year, month - 1, 1)),
  lt: new Date(Date.UTC(year, month + 1, 1)),
});
const inReceivedWindow = (date, { year, month }) => {
  const { gte, lt } = receivedWindow(year, month);
  return date >= gte && date < lt;
};

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
 * income dated in the record's received window. Otherwise the money could be counted as spending
 * or investment as well as received.
 */
const isValidSalaryLink = (expense, period) => Boolean(expense)
  && expense.type === 'income'
  && !isInvestment(expense)
  && inReceivedWindow(expense.expenseDate, period);

// The linked transaction is the source of truth, so a later edit to its amount shows here and a
// link that stopped being valid (see isValidSalaryLink) reads as not received. A record marked
// "already in my balance" has no transaction and stands on its own stored amount.
const isReceived = (record) => Boolean(record.receivedAt)
  && (record.countedInBalance ? !record.expenseId : isValidSalaryLink(record.expense, record));

/**
 * An EMI payment and a History expense are the same money only when the user linked them and the
 * expense still looks like that payment: spending (not income, a transfer or an investment), the
 * exact amount, and dated within EMI_LINK_MAX_DAYS. Amount and date alone never create a link.
 */
const EMI_LINK_MAX_DAYS = 31;
const EMI_SUGGEST_MAX_DAYS = 3;
const isValidEmiLink = (expense, payment) => Boolean(expense) && Boolean(payment)
  && expense.type === 'expense'
  && !isInvestment(expense)
  && toPaise(expense.amount) === toPaise(payment.amount)
  && daysApart(expense.expenseDate, payment.paidAt) <= EMI_LINK_MAX_DAYS;

// Called inside a History edit's transaction: a link the edit invalidated is removed, so that
// expense counts as ordinary spending again instead of silently disappearing from the planner.
const resetInvalidEmiLinks = async (tx, userId, expenseId) => {
  const payment = await tx.eMIPayment.findFirst({ where: { expenseId, emi: { userId } }, include: { expense: { include: { investmentTransaction: { select: { id: true } } } } } });
  if (payment && !isValidEmiLink(payment.expense, payment)) {
    await tx.eMIPayment.update({ where: { id: payment.id }, data: { expenseId: null } });
  }
};
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

const salaryReceivedPaise = (record) => {
  if (!isReceived(record)) return 0n;
  return record.countedInBalance ? toPaise(record.receivedAmount) : toPaise(record.expense.amount);
};

const receivedVia = (record) => {
  if (!isReceived(record)) return null;
  return record.countedInBalance ? 'ALREADY_IN_BALANCE' : 'TRANSACTION';
};

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
    receivedVia: receivedVia(record),
    countedInBalance: isReceived(record) && record.countedInBalance,
    expenseId: isReceived(record) ? record.expenseId : null,
    transaction: isReceived(record) && !record.countedInBalance ? (({ id, title, amount, expenseDate, paymentMethod, accountType }) => ({
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

const serializePosition = ({ savingsPercent, ...money }) => ({ ...rupees(money), savingsPercent });

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

const EMI_LINK_EXPENSE_SELECT = {
  id: true, title: true, amount: true, expenseDate: true, type: true, category: true, paymentMethod: true,
  investmentTransaction: { select: { id: true } },
};

const serializeLinkableExpense = (e) => ({
  id: e.id, title: e.title, amount: toApiAmount(toPaise(e.amount)), date: e.expenseDate, category: e.category, paymentMethod: e.paymentMethod,
});

/**
 * The month's EMI-tracker payments, each with the History expense the user linked to it, or with
 * expenses that merely look like it (same amount within EMI_SUGGEST_MAX_DAYS). Suggestions are
 * hints for the user to review; they never change a total.
 */
const emiMonth = async (db, userId, year, month, payments) => {
  const unlinked = payments.filter(p => !isValidEmiLink(p.expense, p));
  let nearby = [];
  if (unlinked.length) {
    const { gte, lt } = monthRange(year, month);
    nearby = await db.expense.findMany({
      where: {
        userId,
        type: 'expense',
        emiPayment: { is: null },
        investmentTransaction: { is: null },
        NOT: { category: { equals: 'Investment', mode: 'insensitive' } },
        amount: { in: [...new Set(unlinked.map(p => p.amount))] },
        expenseDate: { gte: new Date(gte.getTime() - EMI_SUGGEST_MAX_DAYS * DAY_MS), lt: new Date(lt.getTime() + EMI_SUGGEST_MAX_DAYS * DAY_MS) },
      },
      select: EMI_LINK_EXPENSE_SELECT,
      orderBy: { expenseDate: 'asc' },
    });
  }
  const list = payments.map((p) => {
    const linked = isValidEmiLink(p.expense, p);
    return {
      id: p.id,
      emiId: p.emiId,
      title: p.emi.title,
      amount: toApiAmount(toPaise(p.amount)),
      paidAt: p.paidAt,
      linkedTransaction: linked ? serializeLinkableExpense(p.expense) : null,
      possibleDuplicates: linked ? [] : nearby
        .filter(e => toPaise(e.amount) === toPaise(p.amount) && daysApart(e.expenseDate, p.paidAt) <= EMI_SUGGEST_MAX_DAYS)
        .map(serializeLinkableExpense),
    };
  });
  return {
    payments: list,
    paid: toApiAmount(calc.sumPaise(payments.map(p => toPaise(p.amount)))),
    possibleDoubleCounts: list.filter(p => p.possibleDuplicates.length).length,
  };
};

// The starting lines of a brand-new plan. Rent and EMI are fixed costs; the rest vary. All are
// planned amounts only and can be edited or deleted.
const DEFAULT_RENT = '2500.00';
const DEFAULT_LINES = [
  { group: 'FIXED', name: 'Rent', matchCategories: [] },
  { group: 'FIXED', name: 'EMI', matchCategories: [calc.EMI_CATEGORY] },
  { group: 'FIXED', name: 'Mess / Food', matchCategories: ['Food'] },
  { group: 'VARIABLE', name: 'Travel', matchCategories: ['Travel'] },
  { group: 'VARIABLE', name: 'Other Personal', matchCategories: ['Shopping', 'Entertainment', 'Healthcare', 'Other'] },
];

// What the user's active fixed EMIs ask for each month, as a starting figure for the EMI line.
const plannedEmiAmount = async (tx, userId) => {
  const emis = await tx.eMI.findMany({ where: { userId, active: true, type: 'FIXED' }, select: { emiAmount: true } });
  return calc.paiseToDecimalString(calc.sumPaise(emis.map(e => e.emiAmount || 0)));
};

/**
 * Adds the default lines a plan does not already cover. A line counts as covered when an existing
 * spending line shares its name or a distinctive word of it ("Rent / Accommodation" covers Rent),
 * so pressing the button on a plan the user built never adds a second rent or EMI line.
 */
const addDefaultLines = async (tx, userId, plan) => {
  const existing = await tx.budgetAllocation.findMany({ where: { planId: plan.id }, select: { name: true, group: true, sortOrder: true } });
  const spendingWords = new Set(existing.filter(a => calc.EXPENSE_GROUPS.includes(a.group)).flatMap(a => calc.nameKeywords(a.name)));
  const names = new Set(existing.map(a => a.name.toLowerCase()));
  const missing = DEFAULT_LINES.filter(d => !names.has(d.name.toLowerCase()) && !calc.nameKeywords(d.name).some(w => spendingWords.has(w)));
  if (!missing.length) return 0;
  const emiAmount = missing.some(d => d.name === 'EMI') ? await plannedEmiAmount(tx, userId) : '0.00';
  const start = existing.reduce((max, a) => Math.max(max, a.sortOrder + 1), 0);
  const { count } = await tx.budgetAllocation.createMany({
    data: missing.map((d, i) => ({
      planId: plan.id,
      group: d.group,
      name: d.name,
      plannedAmount: d.name === 'Rent' ? DEFAULT_RENT : d.name === 'EMI' ? emiAmount : '0.00',
      matchCategories: d.matchCategories,
      recurring: true,
      sortOrder: start + i,
    })),
    skipDuplicates: true,
  });
  return count;
};

/**
 * Everything the planner shows for one month. Read-only: it never creates plans or records, and
 * it only reads the user's existing transactions, so nothing recorded in History is duplicated.
 * With `includeSpending`, it also returns each spending item and the line it counted toward.
 */
const getMonth = async (userId, year, month, { includeSpending = false } = {}, db = prisma) => {
  const range = monthRange(year, month);
  const [salaries, plan, transactions, emiPayments, contributions, salaryBacked] = await Promise.all([
    db.monthlySalary.findMany({ where: { userId, year, month }, include: SALARY_INCLUDE, orderBy: [{ createdAt: 'asc' }] }),
    db.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } }, include: { allocations: { orderBy: ALLOCATION_ORDER } } }),
    db.expense.findMany({
      where: { userId, expenseDate: range, type: { in: ['income', 'expense'] } },
      select: {
        id: true, type: true, title: true, category: true, amount: true, expenseDate: true, paymentMethod: true,
        investmentTransaction: { select: { id: true, planId: true } }, allocationAssignment: { select: { allocationId: true } },
        emiPayment: { select: { id: true, amount: true, paidAt: true } },
      },
      orderBy: [{ expenseDate: 'desc' }, { createdAt: 'desc' }],
    }),
    db.eMIPayment.findMany({
      where: { emi: { userId }, paidAt: range },
      select: { id: true, emiId: true, amount: true, paidAt: true, emi: { select: { title: true } }, expense: { select: EMI_LINK_EXPENSE_SELECT } },
      orderBy: { paidAt: 'desc' },
    }),
    db.savingsContribution.findMany({ where: { goal: { userId }, date: range }, select: { goalId: true, type: true, amount: true } }),
    // Income dated this month that a received record (this month's or last month's salary paid
    // late) already counts, so it is not counted again as other income.
    db.monthlySalary.findMany({ where: { userId, expense: { is: { expenseDate: range, type: 'income' } } }, include: SALARY_INCLUDE }),
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
      emiLinked: isValidEmiLink(t, t.emiPayment),
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
  const income = calc.summarizeIncome(incomeInput(salaries));
  const countedByRecord = new Set(salaryBacked.filter(isReceived).map(r => r.expenseId));
  const otherIncome = calc.sumPaise(transactions
    .filter(t => t.type === 'income' && !isInvestmentCategory(t.category) && !countedByRecord.has(t.id))
    .map(t => toPaise(t.amount)));
  const summary = calc.buildMonthSummary({
    income,
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
      savingsPercent: plan.savingsPercent,
      allocations: allocations.map(a => serializeAllocation(a, matched.byAllocation.get(a.id) ?? 0n, counts.get(a.id) || 0, linkedNet)),
    } : null,
    salaries: salaries.map(serializeSalary),
    summary: serializeSummary(summary, plan ? matched.unplannedByCategory : []),
    position: serializePosition(calc.planPosition({
      expectedIncome: income.expected,
      receivedIncome: income.received + otherIncome,
      plannedExpenses: summary.plan.plannedExpenses,
      actualExpenses: actuals.expenses,
      investedNet: actuals.investmentNet,
      savingsPercent: plan?.savingsPercent ?? calc.DEFAULT_SAVINGS_PERCENT,
    })),
    receivedBreakdown: rupees({ fromRecords: income.received, otherIncome }),
    emi: await emiMonth(db, userId, year, month, emiPayments),
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
const initializeMonth = (userId, year, month, { defaults = false } = {}) => prisma.$transaction(async (tx) => {
  const { count: planCreated } = await tx.budgetPlan.createMany({ data: [{ userId, year, month }], skipDuplicates: true });
  const plan = await tx.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } } });
  const copiedAllocations = planCreated ? await copyRecurringAllocations(tx, userId, plan) : 0;
  if (planCreated) {
    const earlier = await latestEarlierPlan(tx, userId, year, month);
    if (earlier && earlier.savingsPercent !== plan.savingsPercent) {
      await tx.budgetPlan.update({ where: { id: plan.id }, data: { savingsPercent: earlier.savingsPercent } });
    }
  }
  // When asked, a plan with nothing to carry forward (the user's first) starts from the default lines.
  const defaultLines = defaults && planCreated && copiedAllocations === 0 ? await addDefaultLines(tx, userId, plan) : 0;
  const addedSalaries = await initializeSalaries(tx, userId, year, month);
  return { created: planCreated === 1, copiedAllocations, defaultLines, addedSalaries };
});

/**
 * Clears planner data only. Every row removed here is planner bookkeeping (plans, lines, pins,
 * salary records, sources, EMI links); no cascade from them reaches an Expense, EMI, EMI payment
 * or Lend/Borrow row, so History and every balance stay exactly as they were. Older savings-goal
 * and investment records are left alone because investment records are tied to real transactions.
 */
const resetMonth = (userId, year, month) => prisma.$transaction(async (tx) => {
  const range = monthRange(year, month);
  const { count: salaries } = await tx.monthlySalary.deleteMany({ where: { userId, year, month } });
  const restored = await initializeSalaries(tx, userId, year, month);
  const plan = await tx.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } } });
  let lines = 0;
  if (plan) {
    await tx.$queryRaw`SELECT id FROM "BudgetPlan" WHERE id = ${plan.id} FOR UPDATE`;
    ({ count: lines } = await tx.budgetAllocation.deleteMany({ where: { planId: plan.id } }));
    await tx.budgetPlan.update({ where: { id: plan.id }, data: { savingsPercent: calc.DEFAULT_SAVINGS_PERCENT, note: null } });
    await addDefaultLines(tx, userId, plan);
  }
  const { count: emiLinks } = await tx.eMIPayment.updateMany({ where: { emi: { userId }, paidAt: range, expenseId: { not: null } }, data: { expenseId: null } });
  return { salaries, restoredSalaries: restored, lines, emiLinks };
});

const resetAll = (userId) => prisma.$transaction(async (tx) => {
  const { count: plans } = await tx.budgetPlan.deleteMany({ where: { userId } });
  const { count: salaries } = await tx.monthlySalary.deleteMany({ where: { userId } });
  const { count: sources } = await tx.incomeSource.deleteMany({ where: { userId } });
  const { count: emiLinks } = await tx.eMIPayment.updateMany({ where: { emi: { userId }, expenseId: { not: null } }, data: { expenseId: null } });
  return { plans, salaries, sources, emiLinks };
});

module.exports = {
  resetMonth,
  resetAll,
  accountTypeForPayment,
  isInvestmentCategory,
  isValidSalaryLink,
  isReceived,
  resetInvalidSalaryLinks,
  isValidEmiLink,
  resetInvalidEmiLinks,
  EMI_LINK_MAX_DAYS,
  EMI_LINK_EXPENSE_SELECT,
  serializeLinkableExpense,
  daysApart,
  receivedWindow,
  inReceivedWindow,
  addDefaultLines,
  DAY_MS,
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
