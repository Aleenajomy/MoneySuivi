// Salary Planner maths. Every amount is a BigInt number of paise, so no total can overflow or lose
// a paisa however many lines a month has. Rupee values only exist at the edges: toPaise on the way
// in, toApiAmount / paiseToDecimalString on the way out. Conversions go through decimal strings,
// never `x * 100`, so binary floating point cannot shift a paisa.

const GROUPS = ['FIXED', 'VARIABLE', 'SAVINGS', 'INVESTMENT'];
const EXPENSE_GROUPS = ['FIXED', 'VARIABLE'];
const INCOME_KINDS = ['SALARY', 'ALLOWANCE', 'BONUS', 'INCENTIVE', 'OTHER'];
// Largest value DECIMAL(14,2) can hold.
const MAX_PLANNER_AMOUNT = 999999999999.99;
// EMI payments are not Expense rows; allocations opt in to them with this pseudo-category.
const EMI_CATEGORY = 'EMI';
const INVESTMENT_CATEGORY = 'investment';

const DECIMAL_PATTERN = /^(-)?(\d+)(?:\.(\d{1,2}))?$/;
// A double prints any decimal of up to 15 significant digits exactly, so amounts below
// ₹10,00,00,00,00,000.00 (10^15 paise) survive as JSON numbers; larger ones are sent as strings.
const EXACT_NUMBER_LIMIT = 10n ** 15n;

const toPaise = (value) => {
  if (value === null || value === undefined || value === '') return 0n;
  if (typeof value === 'bigint') return value;
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
  const paise = BigInt(rupees) * 100n + BigInt(fraction.padEnd(2, '0'));
  return sign ? -paise : paise;
};

// The output helpers take paise as BigInt only: toPaise(150) means ₹150, so accepting a Number here
// would silently multiply a caller's paise by 100.
const requirePaise = (paise) => {
  if (typeof paise !== 'bigint') throw new TypeError('Expected an amount in paise as a BigInt');
  return paise;
};

const paiseToDecimalString = (paise) => {
  const p = requirePaise(paise);
  const abs = p < 0n ? -p : p;
  return `${p < 0n ? '-' : ''}${abs / 100n}.${String(abs % 100n).padStart(2, '0')}`;
};

// Rupees for JSON: a number while that is exact (what the existing frontend expects), otherwise the
// exact decimal string, so a huge total is never silently rounded.
const toApiAmount = (paise) => {
  const p = requirePaise(paise);
  const text = paiseToDecimalString(p);
  return (p < 0n ? -p : p) < EXACT_NUMBER_LIMIT ? Number(text) : text;
};

// For the legacy Float `Expense.amount` column; planner amounts are capped far below its limits.
const paiseToNumber = (paise) => Number(paiseToDecimalString(paise));

const sumPaise = (values) => values.reduce((total, v) => total + toPaise(v), 0n);
const maxPaise = (a, b) => (a > b ? a : b);
const comparePaise = (a, b) => (a > b ? 1 : a < b ? -1 : 0);

// Whole-number percentage rounded half up, or null when there is nothing to compare against
// (avoids a fake 0%).
const percentOf = (part, whole) => {
  const p = toPaise(part);
  const w = toPaise(whole);
  if (w <= 0n) return null;
  const scaled = p * 100n;
  const rounded = scaled >= 0n ? (scaled * 2n + w) / (2n * w) : -((-scaled * 2n + w) / (2n * w));
  return Number(rounded);
};

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
    pending: maxPaise(expected - received, 0n),
    receivedCount: records.filter(r => r.receivedPaise > 0n).length,
    count: records.length,
  };
};

/** Planned totals. Allocations: [{ group, plannedPaise }]. */
const summarizePlan = (allocations) => {
  const byGroup = Object.fromEntries(GROUPS.map(g => [g, 0n]));
  allocations.forEach(a => { byGroup[a.group] += a.plannedPaise; });
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
  const ordered = [...allocations]
    .filter(a => EXPENSE_GROUPS.includes(a.group))
    .sort((a, b) => (a.sortOrder - b.sortOrder) || String(a.id).localeCompare(String(b.id)));
  const categoryOwner = new Map();
  ordered.forEach(a => (a.matchCategories || []).forEach((c) => {
    const key = normalizeCategory(c);
    if (key && !categoryOwner.has(key)) categoryOwner.set(key, a.id);
  }));
  const keywords = ordered.map(a => ({ id: a.id, keywords: nameKeywords(a.name) })).filter(k => k.keywords.length);
  // Every line reports a total, but only fixed and variable lines can receive spending - even via a
  // pin, so a line moved to Savings/Investment after it was pinned can't hide that spending.
  const byAllocation = new Map(allocations.map(a => [a.id, 0n]));
  const spendingLines = new Set(ordered.map(a => a.id));

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
    if (s.assignedAllocationId && spendingLines.has(s.assignedAllocationId)) return [s.assignedAllocationId, MATCHED_BY.ASSIGNED];
    const named = s.title ? byName(s.title) : undefined;
    if (named) return [named, MATCHED_BY.NAME];
    const categorized = categoryOwner.get(normalizeCategory(s.category));
    if (categorized) return [categorized, MATCHED_BY.CATEGORY];
    return [null, MATCHED_BY.UNPLANNED];
  };

  const unplannedByCategory = new Map();
  let unplanned = 0n;
  const resolved = spending.map((s) => {
    const [allocationId, matchedBy] = resolve(s);
    if (allocationId) {
      byAllocation.set(allocationId, byAllocation.get(allocationId) + s.amountPaise);
    } else {
      unplanned += s.amountPaise;
      const label = s.category || 'Other';
      unplannedByCategory.set(label, (unplannedByCategory.get(label) || 0n) + s.amountPaise);
    }
    return { id: s.id, allocationId, matchedBy };
  });

  return {
    byAllocation,
    resolved,
    unplanned,
    unplannedByCategory: [...unplannedByCategory].map(([category, paise]) => ({ category, paise })).sort((a, b) => comparePaise(b.paise, a.paise)),
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
  let income = 0n;
  let investmentNet = 0n;
  const spending = [];
  transactions.forEach((t) => {
    if (t.type !== 'income' && t.type !== 'expense') return;
    if (t.isInvestment || normalizeCategory(t.category) === INVESTMENT_CATEGORY) {
      investmentNet += t.type === 'expense' ? t.amountPaise : -t.amountPaise;
    } else if (t.type === 'income') {
      income += t.amountPaise;
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
const buildMonthSummary = ({ income, plan, actuals, savingsNet = 0n }) => {
  const unallocated = income.expected - plan.totalAllocated;
  return {
    income,
    plan,
    unallocated,
    overAllocated: unallocated < 0n,
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
  toApiAmount,
  paiseToNumber,
  paiseToDecimalString,
  sumPaise,
  comparePaise,
  percentOf,
  summarizeIncome,
  summarizePlan,
  nameKeywords,
  matchSpending,
  classifyActuals,
  buildMonthSummary,
};
