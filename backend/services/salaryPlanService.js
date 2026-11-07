const prisma = require('../lib/prisma');
const calc = require('../utils/plannerCalculations');

const { SALARY_PLAN_FIELDS, toPaise, toApiAmount, paiseToDecimalString } = calc;

// The user's starting plan, used only for their very first month. EMI comes from Loans & EMIs.
const INITIAL_PLAN = {
  salaryAmount: '15000.00',
  allowanceAmount: '2560.00',
  rentAmount: '2500.00',
  emergencySavingsAmount: '2000.00',
  generalSavingsAmount: '2000.00',
  shoppingAmount: '1500.00',
  travelAmount: '1000.00',
  foodAmount: '1000.00',
};

/**
 * What the user's active fixed EMIs ask for each month. Only read: the planner keeps its own copy of
 * the figure, so editing the plan never changes an EMI or its payments.
 */
const emiTrackerTotal = async (userId, db = prisma) => {
  const emis = await db.eMI.findMany({ where: { userId, active: true, type: 'FIXED' }, select: { emiAmount: true } });
  return calc.sumPaise(emis.map(e => e.emiAmount || 0));
};

const defaultValues = async (userId, db) => ({
  ...INITIAL_PLAN,
  emiAmount: paiseToDecimalString(await emiTrackerTotal(userId, db)),
});

const isSetUp = (plan) => Boolean(plan) && plan.salaryAmount !== null;
const pickValues = (plan) => Object.fromEntries(SALARY_PLAN_FIELDS.map(f => [f, plan[f]]));

// A new month starts as a copy of the latest earlier month the user planned.
const startingValues = async (tx, userId, year, month) => {
  const earlier = await tx.budgetPlan.findFirst({
    where: { userId, salaryAmount: { not: null }, OR: [{ year: { lt: year } }, { year, month: { lt: month } }] },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  });
  return earlier ? pickValues(earlier) : defaultValues(userId, tx);
};

/**
 * Idempotent: creates the month's plan row if missing and fills its salary plan once. The row lock
 * means two concurrent set-ups can't both fill it. Only the BudgetPlan row is written.
 */
const initialize = (userId, year, month) => prisma.$transaction(async (tx) => {
  await tx.budgetPlan.createMany({ data: [{ userId, year, month }], skipDuplicates: true });
  const [row] = await tx.$queryRaw`SELECT id, "salaryAmount" FROM "BudgetPlan" WHERE "userId" = ${userId} AND year = ${year} AND month = ${month} FOR UPDATE`;
  if (row.salaryAmount !== null) return false;
  await tx.budgetPlan.update({ where: { id: row.id }, data: await startingValues(tx, userId, year, month) });
  return true;
});

const serialize = async (userId, year, month, plan, db = prisma) => {
  const trackerTotal = await emiTrackerTotal(userId, db);
  if (!isSetUp(plan)) return { year, month, plan: null, summary: null, emiTrackerTotal: toApiAmount(trackerTotal) };
  const values = Object.fromEntries(SALARY_PLAN_FIELDS.map(f => [f, toApiAmount(toPaise(plan[f]))]));
  const s = calc.salaryBudget(plan);
  const money = (obj) => Object.fromEntries(Object.entries(obj).map(([k, v]) => [k, typeof v === 'bigint' ? toApiAmount(v) : v]));
  return {
    year,
    month,
    plan: values,
    summary: {
      ...money(Object.fromEntries(Object.entries(s).filter(([k]) => k !== 'breakdown'))),
      breakdown: Object.fromEntries(Object.entries(s.breakdown).map(([k, v]) => [k, money(v)])),
    },
    emiTrackerTotal: toApiAmount(trackerTotal),
  };
};

const findPlan = (userId, year, month, db = prisma) => db.budgetPlan.findUnique({ where: { userId_year_month: { userId, year, month } } });

const get = async (userId, year, month) => serialize(userId, year, month, await findPlan(userId, year, month));

const update = async (userId, year, month, values) => {
  await initialize(userId, year, month);
  const data = Object.fromEntries(SALARY_PLAN_FIELDS.filter(f => values[f] !== undefined).map(f => [f, paiseToDecimalString(toPaise(values[f]))]));
  if (Object.keys(data).length) await prisma.budgetPlan.update({ where: { userId_year_month: { userId, year, month } }, data });
  return get(userId, year, month);
};

const resetToDefaults = async (userId, year, month) => {
  await initialize(userId, year, month);
  await prisma.budgetPlan.update({ where: { userId_year_month: { userId, year, month } }, data: await defaultValues(userId) });
  return get(userId, year, month);
};

module.exports = { INITIAL_PLAN, emiTrackerTotal, initialize, get, update, resetToDefaults };
