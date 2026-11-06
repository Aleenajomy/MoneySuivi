const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const { HttpError, handleError } = require('../utils/http');
const { todayInTimezone } = require('../utils/recurrence');
const calc = require('../utils/plannerCalculations');
const planner = require('../services/plannerService');

const { toPaise, toApiAmount, paiseToDecimalString } = calc;

const NOT_FOUND_GOAL = new HttpError(404, 'Savings goal not found');
const NOT_FOUND_CONTRIBUTION = new HttpError(404, 'Contribution not found');
const BELOW_ZERO = new HttpError(409, 'That would take the goal below ₹0. Withdraw at most what is saved.', 'INSUFFICIENT_SAVED');

const decimal = (value) => paiseToDecimalString(toPaise(value));
const calendarDay = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);
const signed = (c) => (c.type === 'WITHDRAWAL' ? -toPaise(c._sum?.amount ?? c.amount) : toPaise(c._sum?.amount ?? c.amount));

const findGoal = async (userId, id, db = prisma) => {
  const goal = await db.savingsGoal.findFirst({ where: { id, userId } });
  if (!goal) throw NOT_FOUND_GOAL;
  return goal;
};

// Contributions only earmark money that stays in the user's accounts, so no transaction is ever
// created or changed here and account balances are untouched.
const netContributions = async (db, where) => {
  const groups = await db.savingsContribution.groupBy({ by: ['goalId', 'type'], where, _sum: { amount: true } });
  const byGoal = new Map();
  groups.forEach(g => byGoal.set(g.goalId, (byGoal.get(g.goalId) || 0n) + signed(g)));
  return byGoal;
};

// Lock the goal row so concurrent withdrawals or deletions are checked one after another against
// the up-to-date balance and can never take it below zero together.
const lockedSaved = async (tx, goal) => {
  await tx.$queryRaw`SELECT id FROM "SavingsGoal" WHERE id = ${goal.id} FOR UPDATE`;
  const fresh = await tx.savingsGoal.findUnique({ where: { id: goal.id } });
  const net = (await netContributions(tx, { goalId: goal.id })).get(goal.id) || 0n;
  return { fresh, saved: toPaise(fresh.initialAmount) + net };
};

const serializeGoal = (goal, net, thisMonth, today) => {
  const status = calc.goalStatus({
    targetPaise: toPaise(goal.targetAmount),
    savedPaise: toPaise(goal.initialAmount) + net,
    targetDate: goal.targetDate,
    today,
  });
  return {
    id: goal.id,
    name: goal.name,
    targetAmount: toApiAmount(status.target),
    initialAmount: toApiAmount(toPaise(goal.initialAmount)),
    monthlyContribution: goal.monthlyContribution === null ? null : toApiAmount(toPaise(goal.monthlyContribution)),
    targetDate: goal.targetDate,
    archived: goal.archived,
    note: goal.note,
    savedAmount: toApiAmount(status.saved),
    remainingAmount: toApiAmount(status.remaining),
    progress: status.progress,
    reached: status.reached,
    monthsLeft: status.monthsLeft,
    overdue: status.overdue,
    requiredMonthly: status.requiredMonthly === null ? null : toApiAmount(status.requiredMonthly),
    thisMonthAmount: toApiAmount(thisMonth),
    createdAt: goal.createdAt,
  };
};

const loadGoals = async (userId, { year, month } = planner.currentPeriod(), ids) => {
  const where = { userId, ...(ids && { id: { in: ids } }) };
  const [goals, allTime, inMonth] = await Promise.all([
    prisma.savingsGoal.findMany({ where, orderBy: [{ archived: 'asc' }, { createdAt: 'asc' }] }),
    netContributions(prisma, { goal: where }),
    netContributions(prisma, { goal: where, date: planner.monthRange(year, month) }),
  ]);
  const today = todayInTimezone(config.timezone);
  return goals.map(g => serializeGoal(g, allTime.get(g.id) || 0n, inMonth.get(g.id) || 0n, today));
};

const respondWithGoal = async (res, userId, id, status = 200) => {
  const [goal] = await loadGoals(userId, undefined, [id]);
  res.status(status).json({ success: true, goal });
};

const listGoals = async (req, res) => {
  try {
    const period = req.query.year ? { year: req.query.year, month: req.query.month } : undefined;
    res.json({ success: true, goals: await loadGoals(req.user.id, period) });
  } catch (error) {
    handleError(res, error, 'planner.listGoals');
  }
};

const goalData = (body) => {
  const data = {};
  if (body.name !== undefined) data.name = body.name;
  if (body.targetAmount !== undefined) data.targetAmount = decimal(body.targetAmount);
  if (body.initialAmount !== undefined) data.initialAmount = decimal(body.initialAmount);
  if (body.monthlyContribution !== undefined) data.monthlyContribution = body.monthlyContribution === null ? null : decimal(body.monthlyContribution);
  if (body.targetDate !== undefined) data.targetDate = body.targetDate === null ? null : calendarDay(body.targetDate);
  if (body.note !== undefined) data.note = body.note || null;
  return data;
};

const createGoal = async (req, res) => {
  try {
    const goal = await prisma.savingsGoal.create({ data: { userId: req.user.id, ...goalData(req.body) } });
    await respondWithGoal(res, req.user.id, goal.id, 201);
  } catch (error) {
    handleError(res, error, 'planner.createGoal');
  }
};

const updateGoal = async (req, res) => {
  try {
    const existing = await findGoal(req.user.id, req.params.id);
    await prisma.$transaction(async (tx) => {
      const data = goalData(req.body);
      if (data.initialAmount !== undefined) {
        // Lowering the starting amount must not leave past withdrawals exceeding what was saved.
        const { fresh, saved } = await lockedSaved(tx, existing);
        if (saved - toPaise(fresh.initialAmount) + toPaise(data.initialAmount) < 0n) throw BELOW_ZERO;
      }
      await tx.savingsGoal.update({ where: { id: existing.id }, data });
    });
    await respondWithGoal(res, req.user.id, existing.id);
  } catch (error) {
    handleError(res, error, 'planner.updateGoal');
  }
};

const setGoalArchived = async (req, res) => {
  try {
    const existing = await findGoal(req.user.id, req.params.id);
    await prisma.savingsGoal.update({ where: { id: existing.id }, data: { archived: req.body.archived } });
    await respondWithGoal(res, req.user.id, existing.id);
  } catch (error) {
    handleError(res, error, 'planner.setGoalArchived');
  }
};

// Removes the goal and its contribution history. Budget lines linked to it are kept and simply
// unlinked (foreign key SET NULL); no transaction is affected because contributions never had one.
const deleteGoal = async (req, res) => {
  try {
    const existing = await findGoal(req.user.id, req.params.id);
    await prisma.savingsGoal.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Savings goal deleted' });
  } catch (error) {
    handleError(res, error, 'planner.deleteGoal');
  }
};

const listContributions = async (req, res) => {
  try {
    const goal = await findGoal(req.user.id, req.params.id);
    const rows = await prisma.savingsContribution.findMany({
      where: { goalId: goal.id },
      orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
      take: 200,
    });
    res.json({
      success: true,
      contributions: rows.map(c => ({ id: c.id, type: c.type, amount: toApiAmount(toPaise(c.amount)), date: c.date, note: c.note, createdAt: c.createdAt })),
    });
  } catch (error) {
    handleError(res, error, 'planner.listContributions');
  }
};

const addContribution = async (req, res) => {
  try {
    const goal = await findGoal(req.user.id, req.params.id);
    const { type, amount, date, note } = req.body;
    if (goal.archived) throw new HttpError(409, 'This goal is archived. Restore it to add or withdraw money.', 'ARCHIVED');
    await prisma.$transaction(async (tx) => {
      if (type === 'WITHDRAWAL') {
        const { saved } = await lockedSaved(tx, goal);
        if (toPaise(amount) > saved) throw BELOW_ZERO;
      }
      await tx.savingsContribution.create({
        data: { goalId: goal.id, type, amount: decimal(amount), date: calendarDay(date), note: note || null },
      });
    });
    await respondWithGoal(res, req.user.id, goal.id, 201);
  } catch (error) {
    handleError(res, error, 'planner.addContribution');
  }
};

const deleteContribution = async (req, res) => {
  try {
    const row = await prisma.savingsContribution.findFirst({
      where: { id: req.params.contributionId, goal: { userId: req.user.id } },
      include: { goal: true },
    });
    if (!row) throw NOT_FOUND_CONTRIBUTION;
    await prisma.$transaction(async (tx) => {
      // Removing a deposit must not leave later withdrawals larger than what remains.
      if (row.type === 'CONTRIBUTION') {
        const { saved } = await lockedSaved(tx, row.goal);
        if (saved - toPaise(row.amount) < 0n) throw BELOW_ZERO;
      }
      await tx.savingsContribution.delete({ where: { id: row.id } });
    });
    await respondWithGoal(res, req.user.id, row.goalId);
  } catch (error) {
    handleError(res, error, 'planner.deleteContribution');
  }
};

module.exports = {
  loadGoals, listGoals, createGoal, updateGoal, setGoalArchived, deleteGoal,
  listContributions, addContribution, deleteContribution,
};
