const prisma = require('../lib/prisma');
const { HttpError, handleError } = require('../utils/http');
const { toPaise, paiseToDecimalString, EXPENSE_GROUPS } = require('../utils/plannerCalculations');
const planner = require('../services/plannerService');

const NOT_FOUND_PLAN = new HttpError(404, 'Budget plan not found');
const NOT_FOUND_ALLOCATION = new HttpError(404, 'Allocation not found');
const DUPLICATE_NAME = new HttpError(409, 'This month already has an allocation with that name.', 'DUPLICATE_ALLOCATION');

const decimal = (value) => paiseToDecimalString(toPaise(value));

const uniqueCategories = (list) => [...new Map((list || []).map(c => [c.trim().toLowerCase(), c.trim()])).values()];

const allocationData = (body) => {
  const data = {};
  if (body.group !== undefined) data.group = body.group;
  if (body.name !== undefined) data.name = body.name;
  if (body.plannedAmount !== undefined) data.plannedAmount = decimal(body.plannedAmount);
  if (body.matchCategories !== undefined) data.matchCategories = uniqueCategories(body.matchCategories);
  if (body.recurring !== undefined) data.recurring = body.recurring;
  if (body.sortOrder !== undefined) data.sortOrder = body.sortOrder;
  return data;
};

const findPlan = async (userId, id, db = prisma) => {
  const plan = await db.budgetPlan.findFirst({ where: { id, userId } });
  if (!plan) throw NOT_FOUND_PLAN;
  return plan;
};

const findAllocation = async (userId, id, db = prisma) => {
  const allocation = await db.budgetAllocation.findFirst({ where: { id, plan: { userId } }, include: { plan: true } });
  if (!allocation) throw NOT_FOUND_ALLOCATION;
  return allocation;
};

// Every budget write answers with the whole month, including the spending breakdown, so the
// screen never shows totals from before the change.
const respondWithMonth = async (res, userId, year, month, status = 200, extra = {}) => {
  const data = await planner.getMonth(userId, year, month, { includeSpending: true });
  res.status(status).json({ success: true, ...extra, ...data });
};

const withDuplicateNameGuard = (handler, context) => async (req, res) => {
  try {
    await handler(req, res);
  } catch (error) {
    if (error?.code === 'P2002') return handleError(res, DUPLICATE_NAME);
    handleError(res, error, context);
  }
};

const getOverview = async (req, res) => {
  try {
    await respondWithMonth(res, req.user.id, req.query.year, req.query.month);
  } catch (error) {
    handleError(res, error, 'planner.getOverview');
  }
};

const getBudget = async (req, res) => {
  try {
    const data = await planner.getMonth(req.user.id, req.query.year, req.query.month);
    res.json({ success: true, year: data.year, month: data.month, plan: data.plan, summary: data.summary });
  } catch (error) {
    handleError(res, error, 'planner.getBudget');
  }
};

const createBudget = async (req, res) => {
  try {
    const { year, month } = req.body;
    const result = await planner.initializeMonth(req.user.id, year, month);
    await respondWithMonth(res, req.user.id, year, month, result.created ? 201 : 200, { initialized: result });
  } catch (error) {
    handleError(res, error, 'planner.createBudget');
  }
};

const copyRecurring = async (req, res) => {
  try {
    const plan = await findPlan(req.user.id, req.params.id);
    const copied = await prisma.$transaction(tx => planner.copyRecurringAllocations(tx, req.user.id, plan));
    await respondWithMonth(res, req.user.id, plan.year, plan.month, 200, { copied });
  } catch (error) {
    handleError(res, error, 'planner.copyRecurring');
  }
};

/** Saves the note and many allocation edits at once; all of it lands or none of it does. */
const updateBudget = withDuplicateNameGuard(async (req, res) => {
  const userId = req.user.id;
  const plan = await findPlan(userId, req.params.id);
  const edits = req.body.allocations || [];
  await prisma.$transaction(async (tx) => {
    if (req.body.note !== undefined) await tx.budgetPlan.update({ where: { id: plan.id }, data: { note: req.body.note || null } });
    for (const edit of edits) {
      const { count } = await tx.budgetAllocation.updateMany({ where: { id: edit.id, planId: plan.id }, data: allocationData(edit) });
      if (count !== 1) throw NOT_FOUND_ALLOCATION;
    }
  });
  await respondWithMonth(res, userId, plan.year, plan.month);
}, 'planner.updateBudget');

const addAllocation = withDuplicateNameGuard(async (req, res) => {
  const plan = await findPlan(req.user.id, req.params.id);
  let { sortOrder } = req.body;
  if (sortOrder === undefined) {
    const last = await prisma.budgetAllocation.aggregate({ where: { planId: plan.id }, _max: { sortOrder: true } });
    sortOrder = (last._max.sortOrder ?? -1) + 1;
  }
  const allocation = await prisma.budgetAllocation.create({
    data: { planId: plan.id, recurring: true, matchCategories: [], ...allocationData({ ...req.body, sortOrder }) },
  });
  await respondWithMonth(res, req.user.id, plan.year, plan.month, 201, { allocationId: allocation.id });
}, 'planner.addAllocation');

// Allocations belong to one month's plan, so editing or deleting one never changes another month.
const updateAllocation = withDuplicateNameGuard(async (req, res) => {
  const allocation = await findAllocation(req.user.id, req.params.allocationId);
  await prisma.budgetAllocation.update({ where: { id: allocation.id }, data: allocationData(req.body) });
  await respondWithMonth(res, req.user.id, allocation.plan.year, allocation.plan.month);
}, 'planner.updateAllocation');

const deleteAllocation = async (req, res) => {
  try {
    const allocation = await findAllocation(req.user.id, req.params.allocationId);
    await prisma.budgetAllocation.delete({ where: { id: allocation.id } });
    await respondWithMonth(res, req.user.id, allocation.plan.year, allocation.plan.month);
  } catch (error) {
    handleError(res, error, 'planner.deleteAllocation');
  }
};

const getSpending = async (req, res) => {
  try {
    const data = await planner.getMonth(req.user.id, req.query.year, req.query.month, { includeSpending: true });
    res.json({ success: true, year: data.year, month: data.month, planId: data.plan?.id ?? null, spending: data.spending });
  } catch (error) {
    handleError(res, error, 'planner.getSpending');
  }
};

const findSpendingTransaction = async (userId, expenseId) => {
  const expense = await prisma.expense.findFirst({
    where: { id: expenseId, userId },
    select: { id: true, type: true, category: true, expenseDate: true, investmentTransaction: { select: { id: true } } },
  });
  if (!expense) throw new HttpError(404, 'Transaction not found');
  // Income, transfers and investments never count as spending, so pinning them would be meaningless.
  if (expense.type !== 'expense' || expense.investmentTransaction || String(expense.category).trim().toLowerCase() === 'investment') {
    throw new HttpError(400, 'Only spending transactions can be assigned to a budget line');
  }
  return expense;
};

/**
 * Pins a transaction to a line, overriding automatic matching. The transaction itself is not
 * changed; the unique expenseId on AllocationAssignment keeps it counted toward one line only.
 */
const assignTransaction = async (req, res) => {
  try {
    const userId = req.user.id;
    const expense = await findSpendingTransaction(userId, req.params.expenseId);
    const allocation = await findAllocation(userId, req.body.allocationId);
    if (!EXPENSE_GROUPS.includes(allocation.group)) {
      throw new HttpError(400, 'Savings and investment lines do not take spending. Choose a fixed or variable line.');
    }
    const date = expense.expenseDate;
    if (date.getUTCFullYear() !== allocation.plan.year || date.getUTCMonth() + 1 !== allocation.plan.month) {
      throw new HttpError(400, 'That line belongs to a different month than this transaction.');
    }
    const write = () => prisma.allocationAssignment.upsert({
      where: { expenseId: expense.id },
      update: { allocationId: allocation.id },
      create: { expenseId: expense.id, allocationId: allocation.id },
    });
    // Two first-time assignments racing both try to insert; the loser retries as an update.
    await write().catch(error => (error?.code === 'P2002' ? write() : Promise.reject(error)));
    await respondWithMonth(res, userId, allocation.plan.year, allocation.plan.month);
  } catch (error) {
    handleError(res, error, 'planner.assignTransaction');
  }
};

const clearAssignment = async (req, res) => {
  try {
    const userId = req.user.id;
    const expense = await prisma.expense.findFirst({ where: { id: req.params.expenseId, userId }, select: { id: true, expenseDate: true } });
    if (!expense) throw new HttpError(404, 'Transaction not found');
    await prisma.allocationAssignment.deleteMany({ where: { expenseId: expense.id } });
    await respondWithMonth(res, userId, expense.expenseDate.getUTCFullYear(), expense.expenseDate.getUTCMonth() + 1);
  } catch (error) {
    handleError(res, error, 'planner.clearAssignment');
  }
};

module.exports = {
  getOverview, getBudget, createBudget, copyRecurring, updateBudget, addAllocation, updateAllocation, deleteAllocation,
  getSpending, assignTransaction, clearAssignment,
};
