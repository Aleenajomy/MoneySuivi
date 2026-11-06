const crypto = require('crypto');
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

// A Savings line may track one of the user's goals and an Investment line one of their investments.
const LINKS = [
  { field: 'savingsGoalId', group: 'SAVINGS', model: 'savingsGoal', label: 'A savings goal can only be linked to a Savings line' },
  { field: 'investmentPlanId', group: 'INVESTMENT', model: 'investmentPlan', label: 'An investment can only be linked to an Investment line' },
];

/**
 * Applies the link fields of a create/update to `data`. A link must point at the user's own goal or
 * investment, sit on a line of the matching group, and be used by only one line per month, so that
 * month's contributions are never counted on two lines. Moving a line to another group drops a link
 * that no longer fits. The plan row is locked so two lines can't claim the same goal concurrently.
 */
const applyLinks = async (tx, userId, planId, existing, body, data) => {
  const group = data.group ?? existing?.group;
  for (const link of LINKS) {
    const requested = body[link.field];
    if (group !== link.group) {
      if (requested) throw new HttpError(400, link.label);
      if (existing?.[link.field]) data[link.field] = null;
      continue;
    }
    if (requested === undefined) continue;
    if (requested === null) {
      data[link.field] = null;
      continue;
    }
    await tx.$queryRaw`SELECT id FROM "BudgetPlan" WHERE id = ${planId} FOR UPDATE`;
    const owned = await tx[link.model].findFirst({ where: { id: requested, userId }, select: { id: true } });
    if (!owned) throw new HttpError(404, link.field === 'savingsGoalId' ? 'Savings goal not found' : 'Investment not found');
    const taken = await tx.budgetAllocation.findFirst({
      where: { planId, [link.field]: requested, ...(existing && { id: { not: existing.id } }) },
      select: { name: true },
    });
    if (taken) throw new HttpError(409, `Already tracked by "${taken.name}" this month.`, 'DUPLICATE_LINK');
    data[link.field] = requested;
  }
  return data;
};

// Savings and investment lines never take spending, so pins on a line that moves into one of those
// groups are removed in the same transaction as the move.
const dropPinsOffSpendingLines = (tx, allocationIds) => tx.allocationAssignment.deleteMany({
  where: { allocationId: { in: allocationIds }, allocation: { group: { notIn: EXPENSE_GROUPS } } },
});

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
    // Plan row first, as every other allocation write does, so concurrent edits can't deadlock.
    await tx.$queryRaw`SELECT id FROM "BudgetPlan" WHERE id = ${plan.id} FOR UPDATE`;
    if (req.body.note !== undefined) await tx.budgetPlan.update({ where: { id: plan.id }, data: { note: req.body.note || null } });
    for (const edit of edits) {
      const existing = await tx.budgetAllocation.findFirst({ where: { id: edit.id, planId: plan.id } });
      if (!existing) throw NOT_FOUND_ALLOCATION;
      const data = await applyLinks(tx, userId, plan.id, existing, edit, allocationData(edit));
      await tx.budgetAllocation.update({ where: { id: existing.id }, data });
    }
    await dropPinsOffSpendingLines(tx, edits.map(e => e.id));
  }, { timeout: 15000 });
  await respondWithMonth(res, userId, plan.year, plan.month);
}, 'planner.updateBudget');

const addAllocation = withDuplicateNameGuard(async (req, res) => {
  const plan = await findPlan(req.user.id, req.params.id);
  let { sortOrder } = req.body;
  if (sortOrder === undefined) {
    const last = await prisma.budgetAllocation.aggregate({ where: { planId: plan.id }, _max: { sortOrder: true } });
    sortOrder = (last._max.sortOrder ?? -1) + 1;
  }
  const allocation = await prisma.$transaction(async (tx) => tx.budgetAllocation.create({
    data: {
      planId: plan.id,
      recurring: true,
      matchCategories: [],
      ...(await applyLinks(tx, req.user.id, plan.id, null, req.body, allocationData({ ...req.body, sortOrder }))),
    },
  }));
  await respondWithMonth(res, req.user.id, plan.year, plan.month, 201, { allocationId: allocation.id });
}, 'planner.addAllocation');

// Allocations belong to one month's plan, so editing or deleting one never changes another month.
const updateAllocation = withDuplicateNameGuard(async (req, res) => {
  const allocation = await findAllocation(req.user.id, req.params.allocationId);
  await prisma.$transaction(async (tx) => {
    const data = await applyLinks(tx, req.user.id, allocation.planId, allocation, req.body, allocationData(req.body));
    await tx.budgetAllocation.update({ where: { id: allocation.id }, data });
    await dropPinsOffSpendingLines(tx, [allocation.id]);
  });
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
    select: { id: true, type: true, category: true, expenseDate: true },
  });
  if (!expense) throw new HttpError(404, 'Transaction not found');
  // Income, transfers and investments never count as spending, so pinning them would be meaningless.
  if (expense.type !== 'expense' || planner.isInvestmentCategory(expense.category)) {
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
    const owned = await findAllocation(userId, req.body.allocationId);
    const date = expense.expenseDate;
    if (date.getUTCFullYear() !== owned.plan.year || date.getUTCMonth() + 1 !== owned.plan.month) {
      throw new HttpError(400, 'That line belongs to a different month than this transaction.');
    }
    await prisma.$transaction(async (tx) => {
      // Locking the line means a concurrent group change or delete either finishes first (and is
      // seen here) or waits until this pin exists (and then removes it), never in between.
      const [line] = await tx.$queryRaw`SELECT "group" FROM "BudgetAllocation" WHERE id = ${owned.id} FOR UPDATE`;
      if (!line) throw NOT_FOUND_ALLOCATION;
      if (!EXPENSE_GROUPS.includes(line.group)) {
        throw new HttpError(400, 'Savings and investment lines do not take spending. Choose a fixed or variable line.');
      }
      // One statement, so concurrent first-time pins for the same transaction can't both insert.
      await tx.$executeRaw`
        INSERT INTO "AllocationAssignment" ("id", "expenseId", "allocationId")
        VALUES (${crypto.randomUUID()}, ${expense.id}, ${owned.id})
        ON CONFLICT ("expenseId") DO UPDATE SET "allocationId" = EXCLUDED."allocationId"`;
    });
    await respondWithMonth(res, userId, owned.plan.year, owned.plan.month);
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
