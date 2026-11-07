const prisma = require('../lib/prisma');
const { HttpError, handleError } = require('../utils/http');
const calc = require('../utils/plannerCalculations');
const planner = require('../services/plannerService');

const { toPaise, toApiAmount, paiseToDecimalString, sumPaise } = calc;

const NOT_FOUND_PLAN = new HttpError(404, 'Investment not found');

// Category the rest of MoneySuivi already treats as investment (Analytics, the planner summary).
const INVESTMENT_CATEGORY = 'Investment';

const decimal = (value) => paiseToDecimalString(toPaise(value));
const calendarDay = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const inRange = (date, range) => date >= range.gte && date < range.lt;

/**
 * The linked transaction is the source of truth for amount, date and direction, so an edit in
 * History shows here exactly as it does in the month summary: an expense is money put in (buy),
 * an income is money taken out (redemption).
 */
const signedPaise = (expense) => (expense.type === 'income' ? -toPaise(expense.amount) : toPaise(expense.amount));

const findPlan = async (userId, id, db = prisma) => {
  const plan = await db.investmentPlan.findFirst({ where: { id, userId } });
  if (!plan) throw NOT_FOUND_PLAN;
  return plan;
};

// Only rows that are still Investment income/expense count, matching the month summary and
// Analytics: a buy turned into a transfer or recategorised in History stops counting here too.
const COUNTED = { type: { in: ['income', 'expense'] }, category: { equals: INVESTMENT_CATEGORY, mode: 'insensitive' } };

const lockPlan = (tx, id) => tx.$queryRaw`SELECT id FROM "InvestmentPlan" WHERE id = ${id} FOR UPDATE`;

const TX_INCLUDE = { expense: { select: { id: true, type: true, amount: true, expenseDate: true, paymentMethod: true } } };

const serializeTx = (t) => ({
  id: t.id,
  planId: t.planId,
  type: t.expense?.type === 'income' ? 'REDEEM' : 'BUY',
  amount: toApiAmount(toPaise(t.expense ? t.expense.amount : t.amount)),
  date: t.expense ? t.expense.expenseDate : t.date,
  paymentMethod: t.expense?.paymentMethod ?? null,
  note: t.note,
  expenseId: t.expenseId,
});

/** Plans with totals, plus this month's planned vs invested. Planning and tracking only: no returns are estimated. */
const loadInvestments = async (userId, { year, month } = planner.currentPeriod()) => {
  const range = planner.monthRange(year, month);
  const [plans, txs, unlinked] = await Promise.all([
    prisma.investmentPlan.findMany({ where: { userId }, orderBy: [{ active: 'desc' }, { createdAt: 'asc' }] }),
    prisma.investmentTransaction.findMany({ where: { plan: { userId }, expense: { is: COUNTED } }, include: TX_INCLUDE }),
    // Investment-category transactions entered in History without a plan still count in the month
    // summary, so they are reported here too and the two totals reconcile.
    prisma.expense.findMany({
      where: {
        userId,
        type: { in: ['income', 'expense'] },
        category: { equals: INVESTMENT_CATEGORY, mode: 'insensitive' },
        investmentTransaction: { is: null },
        expenseDate: range,
      },
      select: { type: true, amount: true },
    }),
  ]);

  const byPlan = new Map(plans.map(p => [p.id, { total: 0n, month: 0n, count: 0, last: null }]));
  txs.forEach((t) => {
    const agg = byPlan.get(t.planId);
    if (!agg) return;
    const value = signedPaise(t.expense);
    agg.total += value;
    agg.count += 1;
    if (inRange(t.expense.expenseDate, range)) agg.month += value;
    if (!agg.last || t.expense.expenseDate > agg.last) agg.last = t.expense.expenseDate;
  });

  const serialized = plans.map((p) => {
    const agg = byPlan.get(p.id);
    const planned = toPaise(p.monthlyPlannedAmount);
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      monthlyPlannedAmount: toApiAmount(planned),
      active: p.active,
      note: p.note,
      investedTotal: toApiAmount(agg.total),
      thisMonthAmount: toApiAmount(agg.month),
      thisMonthProgress: p.active ? calc.percentOf(agg.month, planned) : null,
      transactionCount: agg.count,
      lastTransactionAt: agg.last,
      createdAt: p.createdAt,
    };
  });

  const plannedThisMonth = sumPaise(plans.filter(p => p.active).map(p => toPaise(p.monthlyPlannedAmount)));
  const investedThisMonth = sumPaise([...byPlan.values()].map(a => a.month));
  const unlinkedThisMonth = sumPaise(unlinked.map(signedPaise));
  return {
    year,
    month,
    plans: serialized,
    summary: {
      plannedThisMonth: toApiAmount(plannedThisMonth),
      investedThisMonth: toApiAmount(investedThisMonth),
      unlinkedThisMonth: toApiAmount(unlinkedThisMonth),
      totalThisMonth: toApiAmount(investedThisMonth + unlinkedThisMonth),
      totalInvested: toApiAmount(sumPaise([...byPlan.values()].map(a => a.total))),
      progress: calc.percentOf(investedThisMonth, plannedThisMonth),
    },
  };
};

const respond = async (res, userId, status = 200, extra = {}) => {
  res.status(status).json({ success: true, ...extra, ...(await loadInvestments(userId)) });
};

const listInvestments = async (req, res) => {
  try {
    const period = req.query.year ? { year: req.query.year, month: req.query.month } : undefined;
    res.json({ success: true, ...(await loadInvestments(req.user.id, period)) });
  } catch (error) {
    handleError(res, error, 'planner.listInvestments');
  }
};

const planData = (body) => {
  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.category !== undefined) data.category = body.category;
  if (body.monthlyPlannedAmount !== undefined) data.monthlyPlannedAmount = decimal(body.monthlyPlannedAmount);
  if (body.note !== undefined) data.note = body.note || null;
  return data;
};

const createInvestment = async (req, res) => {
  try {
    const plan = await prisma.investmentPlan.create({ data: { userId: req.user.id, ...planData(req.body) } });
    await respond(res, req.user.id, 201, { investmentId: plan.id });
  } catch (error) {
    handleError(res, error, 'planner.createInvestment');
  }
};

const updateInvestment = async (req, res) => {
  try {
    const plan = await findPlan(req.user.id, req.params.id);
    await prisma.investmentPlan.update({ where: { id: plan.id }, data: planData(req.body) });
    await respond(res, req.user.id);
  } catch (error) {
    handleError(res, error, 'planner.updateInvestment');
  }
};

const setInvestmentActive = async (req, res) => {
  try {
    const plan = await findPlan(req.user.id, req.params.id);
    await prisma.investmentPlan.update({ where: { id: plan.id }, data: { active: req.body.active } });
    await respond(res, req.user.id);
  } catch (error) {
    handleError(res, error, 'planner.setInvestmentActive');
  }
};

/**
 * An investment with transactions can't be deleted from the planner: that would orphan or remove
 * real money movements. Pause it, or delete its transactions in History first.
 */
const deleteInvestment = async (req, res) => {
  try {
    const plan = await findPlan(req.user.id, req.params.id);
    await prisma.$transaction(async (tx) => {
      // Locked so a buy recorded at the same moment can't slip in after the check and be orphaned.
      await lockPlan(tx, plan.id);
      const linked = await tx.investmentTransaction.findMany({ where: { planId: plan.id }, select: { expenseId: true } });
      if (linked.length) {
        throw new HttpError(409, 'This investment has transactions. Pause it instead, or delete its transactions in History first.', 'HAS_TRANSACTIONS');
      }
      await tx.investmentPlan.delete({ where: { id: plan.id } });
    });
    await respond(res, req.user.id);
  } catch (error) {
    handleError(res, error, 'planner.deleteInvestment');
  }
};

const listTransactions = async (req, res) => {
  try {
    const plan = await findPlan(req.user.id, req.params.id);
    const rows = await prisma.investmentTransaction.findMany({
      where: { planId: plan.id, expense: { is: COUNTED } },
      include: TX_INCLUDE,
      orderBy: { expense: { expenseDate: 'desc' } },
      take: 200,
    });
    const transactions = rows.map(serializeTx);
    res.json({ success: true, transactions });
  } catch (error) {
    handleError(res, error, 'planner.listInvestmentTransactions');
  }
};

// Read-only for money: buying, redeeming and deleting investment transactions happen in History.
module.exports = {
  loadInvestments, listInvestments, createInvestment, updateInvestment, setInvestmentActive, deleteInvestment,
  listTransactions,
};
