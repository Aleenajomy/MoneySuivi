// Salary Planner maths. Every amount is an integer number of paise; rupee values only exist at the
// edges (toPaise on the way in, fromPaise / paiseToDecimalString on the way out). Conversions go
// through decimal strings, never `x * 100`, so binary floating point cannot shift a paisa.

const GROUPS = ['FIXED', 'VARIABLE', 'SAVINGS', 'INVESTMENT'];
const EXPENSE_GROUPS = ['FIXED', 'VARIABLE'];
const INCOME_KINDS = ['SALARY', 'ALLOWANCE', 'BONUS', 'INCENTIVE', 'OTHER'];
// Largest value DECIMAL(14,2) can hold, kept well inside Number.MAX_SAFE_INTEGER paise.
const MAX_PLANNER_AMOUNT = 999999999999.99;
// EMI payments are not Expense rows; allocations opt in to them with this pseudo-category.
const EMI_CATEGORY = 'EMI';
const INVESTMENT_CATEGORY = 'investment';

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;

const assertSafe = (paise) => {
  if (!Number.isSafeInteger(paise)) throw new RangeError('Amount is outside the supported range');
  return paise;
};

const toPaise = (value) => {
  if (value === null || value === undefined || value === '') return 0;
  let text;
  if (typeof value === 'number') {
    if (!Number.isFinite(value)) throw new RangeError('Amount must be a finite number');
    // Legacy Float columns are already rounded to paise, so two places are exact for them.
    text = value.toFixed(2);
  } else if (typeof value === 'object' && typeof value.toFixed === 'function') {
    text = value.toFixed(2); // Prisma.Decimal
  } else {
    text = String(value).trim();
  }
  const match = DECIMAL_PATTERN.exec(text);
  if (!match) throw new RangeError(`Not a valid amount with at most 2 decimals: ${text}`);
  const [, sign, rupees, fraction = ''] = match;
  const paise = Number(rupees) * 100 + Number(fraction.padEnd(2, '0'));
  return assertSafe(sign && paise !== 0 ? -paise : paise);
};

// Dividing a safe integer by 100 gives the closest double to the exact rupee value, which is what
// JSON consumers (the existing frontend uses plain numbers) expect.
const fromPaise = (paise) => assertSafe(paise) / 100;

const paiseToDecimalString = (paise) => {
  assertSafe(paise);
  const abs = Math.abs(paise);
  return `${paise < 0 ? '-' : ''}${Math.floor(abs / 100)}.${String(abs % 100).padStart(2, '0')}`;
};

const sumPaise = (values) => values.reduce((total, v) => assertSafe(total + assertSafe(v)), 0);

// Whole-number percentage, or null when there is nothing to compare against (avoids a fake 0%).
const percentOf = (part, whole) => (whole > 0 ? Math.round((part * 100) / whole) : null);

/** Income for one month. Records: [{ kind, expectedPaise, receivedPaise }]. */
const summarizeIncome = (records) => {
  const expectedSalary = sumPaise(records.filter(r => r.kind === 'SALARY').map(r => r.expectedPaise));
  const expected = sumPaise(records.map(r => r.expectedPaise));
  const received = sumPaise(records.map(r => r.receivedPaise));
  return {
    expected,
    received,
    expectedSalary,
    expectedAdditional: expected - expectedSalary,
    pending: Math.max(expected - received, 0),
    receivedCount: records.filter(r => r.receivedPaise > 0).length,
    count: records.length,
  };
};

/** Planned totals. Allocations: [{ group, plannedPaise }]. */
const summarizePlan = (allocations) => {
  const byGroup = Object.fromEntries(GROUPS.map(g => [g, 0]));
  allocations.forEach(a => { byGroup[a.group] = assertSafe(byGroup[a.group] + a.plannedPaise); });
  const plannedExpenses = byGroup.FIXED + byGroup.VARIABLE;
  return {
    byGroup,
    plannedExpenses,
    plannedSavings: byGroup.SAVINGS,
    plannedInvestments: byGroup.INVESTMENT,
    totalAllocated: sumPaise(Object.values(byGroup)),
  };
};

const normalizeCategory = (category) => String(category || '').trim().toLowerCase();

// Words too common in line names to identify one ("Other Bills", "Personal Savings").
const GENERIC_WORDS = new Set([
  'and', 'the', 'for', 'other', 'others', 'bill', 'bills', 'misc', 'miscellaneous', 'personal',
  'expense', 'expenses', 'fund', 'funds', 'monthly', 'payment', 'payments', 'general',
]);
const words = (text) => String(text || '').toLowerCase().split(/[^a-z0-9]+/).filter(Boolean);
const nameKeywords = (name) => [...new Set(words(name).filter(w => w.length >= 3 && !GENERIC_WORDS.has(w)))];

const MATCHED_BY = { ASSIGNED: 'ASSIGNED', NAME: 'NAME', CATEGORY: 'CATEGORY', UNPLANNED: 'UNPLANNED' };

/**
 * Splits a month's spending across allocations so that each transaction is counted exactly once.
 * Rules, first match wins:
 *   1. ASSIGNED - the user pinned the transaction to a line in this plan;
 *   2. NAME     - the title contains a distinctive word from a line's name ("Mess" -> "Mess / Food");
 *                 the line with the most matching words wins, then the lower sortOrder;
 *   3. CATEGORY - the first line (by sortOrder) whose matchCategories include the category;
 *   4. UNPLANNED.
 * Only FIXED and VARIABLE lines take spending automatically; an assignment from another month's
 * plan (the transaction's date was edited) is ignored rather than trusted.
 *
 * allocations: [{ id, group, name, matchCategories, sortOrder }]
 * spending:    [{ id, title?, category, amountPaise, assignedAllocationId? }]
 */
const matchSpending = (allocations, spending) => {
  const byAllocation = new Map(allocations.map(a => [a.id, 0]));
  const ordered = [...allocations]
    .filter(a => EXPENSE_GROUPS.includes(a.group))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.id).localeCompare(String(b.id)));
  const categoryOwner = new Map();
  ordered.forEach(a => (a.matchCategories || []).forEach((c) => {
    const key = normalizeCategory(c);
    if (key && !categoryOwner.has(key)) categoryOwner.set(key, a.id);
  }));
  const keywords = ordered.map(a => ({ id: a.id, keywords: nameKeywords(a.name) })).filter(k => k.keywords.length);

  const byName = (title) => {
    const titleWords = new Set(words(title));
    let best = null;
    keywords.forEach((k) => {
      const score = k.keywords.filter(w => titleWords.has(w)).length;
      if (score > 0 && (!best || score > best.score)) best = { id: k.id, score };
    });
    return best?.id;
  };

  const resolve = (s) => {
    if (s.assignedAllocationId && byAllocation.has(s.assignedAllocationId)) return [s.assignedAllocationId, MATCHED_BY.ASSIGNED];
    const named = s.title ? byName(s.title) : undefined;
    if (named) return [named, MATCHED_BY.NAME];
    const categorized = categoryOwner.get(normalizeCategory(s.category));
    if (categorized) return [categorized, MATCHED_BY.CATEGORY];
    return [null, MATCHED_BY.UNPLANNED];
  };

  const unplannedByCategory = new Map();
  let unplanned = 0;
  const resolved = spending.map((s) => {
    const [allocationId, matchedBy] = resolve(s);
    if (allocationId) {
      byAllocation.set(allocationId, assertSafe(byAllocation.get(allocationId) + s.amountPaise));
    } else {
      unplanned = assertSafe(unplanned + s.amountPaise);
      const label = s.category || 'Other';
      unplannedByCategory.set(label, assertSafe((unplannedByCategory.get(label) || 0) + s.amountPaise));
    }
    return { id: s.id, allocationId, matchedBy };
  });

  return {
    byAllocation,
    resolved,
    unplanned,
    unplannedByCategory: [...unplannedByCategory].map(([category, paise]) => ({ category, paise })).sort((a, b) => b.paise - a.paise),
  };
};

/**
 * Classifies a month of Expense rows so nothing is counted twice:
 * - transfers move money between the user's own accounts and are ignored;
 * - Investment-category rows, or rows linked to an InvestmentTransaction, are investments
 *   (buys add, redemptions subtract) and never count as income or spending;
 * - everything else is ordinary income or spending.
 * EMI payments live in EMIPayment, not Expense, so they are added as spending here.
 *
 * transactions: [{ id, type, title?, category, amountPaise, isInvestment?, assignedAllocationId? }]
 * emiPayments:  [{ id, amountPaise }]
 */
const classifyActuals = (transactions, emiPayments = []) => {
  let income = 0;
  let investmentNet = 0;
  const spending = [];
  transactions.forEach((t) => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    if (t.isInvestment || normalizeCategory(t.category) === INVESTMENT_CATEGORY) {
      investmentNet = assertSafe(investmentNet + (t.type === 'expense' ? t.amountPaise : -t.amountPaise));
    } else if (t.type === 'income') {
      income = assertSafe(income + t.amountPaise);
    } else {
      spending.push({ id: t.id, title: t.title, category: t.category, amountPaise: t.amountPaise, assignedAllocationId: t.assignedAllocationId });
    }
  });
  emiPayments.forEach(p => spending.push({ id: `emi:${p.id}`, category: EMI_CATEGORY, amountPaise: p.amountPaise }));
  return {
    income,
    investmentNet,
    spending,
    expenses: sumPaise(spending.map(s => s.amountPaise)),
    emi: sumPaise(emiPayments.map(p => p.amountPaise)),
  };
};

/**
 * Whole-month position. Planned figures never count as actual payments: "unallocated" compares
 * expected income with the plan, "available" uses only money that has actually moved.
 */
const buildMonthSummary = ({ income, plan, actuals, savingsNet = 0 }) => {
  const unallocated = income.expected - plan.totalAllocated;
  return {
    income,
    plan,
    unallocated,
    overAllocated: unallocated < 0,
    allocatedPercent: percentOf(plan.totalAllocated, income.expected),
    actual: {
      income: actuals.income,
      expenses: actuals.expenses,
      emi: actuals.emi,
      savingsNet,
      investmentNet: actuals.investmentNet,
      available: actuals.income - actuals.expenses - savingsNet - actuals.investmentNet,
    },
  };
};

module.exports = {
  GROUPS,
  EXPENSE_GROUPS,
  INCOME_KINDS,
  MAX_PLANNER_AMOUNT,
  EMI_CATEGORY,
  MATCHED_BY,
  toPaise,
  fromPaise,
  paiseToDecimalString,
  sumPaise,
  percentOf,
  summarizeIncome,
  summarizePlan,
  nameKeywords,
  matchSpending,
  classifyActuals,
  buildMonthSummary,
};
