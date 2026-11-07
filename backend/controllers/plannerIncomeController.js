const prisma = require('../lib/prisma');
const { HttpError, handleError } = require('../utils/http');
const { toPaise, toApiAmount, paiseToDecimalString, sumPaise } = require('../utils/plannerCalculations');
const planner = require('../services/plannerService');

const NOT_FOUND_SOURCE = new HttpError(404, 'Income source not found');
const NOT_FOUND_SALARY = new HttpError(404, 'Salary record not found');
const ALREADY_RECEIVED = new HttpError(409, 'This income is already marked as received. Undo it first to record it again.', 'ALREADY_RECEIVED');
const ALREADY_LINKED = new HttpError(409, 'That transaction is already linked to another income record.', 'TRANSACTION_ALREADY_LINKED');

const decimal = (value) => paiseToDecimalString(toPaise(value));

const WRONG_MONTH = new HttpError(400, 'The income must be dated in this record\'s month or the month after it.', 'WRONG_MONTH');

// Stored like every transaction date: UTC midnight of the calendar day the user picked, whatever
// time zone the client sent, so the month check matches how the planner groups transactions.
const calendarDay = (value) => new Date(`${String(value).slice(0, 10)}T00:00:00.000Z`);

// A record left marked received after its transaction stopped backing it (deleted, or edited into
// another month or type before the History-side reset existed) is put back to pending.
const STALE_RESET = { receivedAmount: '0', receivedAt: null, expenseId: null, countedInBalance: false };

// Income in the record's received window that no record counts yet: what the user may already
// have entered in History for this salary.
const unlinkedIncomeWhere = (userId, record) => ({
  userId,
  type: 'income',
  expenseDate: planner.receivedWindow(record.year, record.month),
  monthlySalary: { is: null },
  investmentTransaction: { is: null },
  NOT: { category: { equals: 'Investment', mode: 'insensitive' } },
});
const CANDIDATE_SELECT = { id: true, title: true, amount: true, category: true, expenseDate: true, paymentMethod: true };

const findSource = async (userId, id, db = prisma) => {
  const source = await db.incomeSource.findFirst({ where: { id, userId } });
  if (!source) throw NOT_FOUND_SOURCE;
  return source;
};

// Pending (not received) records for this source from the current month on; past months and
// anything already received are history and are never touched.
const pendingFromNow = (sourceId) => ({
  incomeSourceId: sourceId,
  receivedAt: null,
  expenseId: null,
  ...planner.fromPeriodWhere(planner.currentPeriod()),
});

// ---------------------------------------------------------------- income sources

const listIncomeSources = async (req, res) => {
  try {
    const sources = await prisma.incomeSource.findMany({
      where: { userId: req.user.id },
      orderBy: [{ active: 'desc' }, { createdAt: 'asc' }],
    });
    res.json({ success: true, incomeSources: sources.map(planner.serializeIncomeSource) });
  } catch (error) {
    handleError(res, error, 'planner.listIncomeSources');
  }
};

const createIncomeSource = async (req, res) => {
  try {
    const { name, kind, expectedAmount, payDay } = req.body;
    const source = await prisma.incomeSource.create({
      data: { userId: req.user.id, name, kind: kind || 'SALARY', expectedAmount: decimal(expectedAmount), payDay: payDay ?? null },
    });
    res.status(201).json({ success: true, incomeSource: planner.serializeIncomeSource(source) });
  } catch (error) {
    handleError(res, error, 'planner.createIncomeSource');
  }
};

const updateIncomeSource = async (req, res) => {
  try {
    const existing = await findSource(req.user.id, req.params.id);
    const data = {};
    if (req.body.name !== undefined) data.name = req.body.name;
    if (req.body.kind !== undefined) data.kind = req.body.kind;
    if (req.body.expectedAmount !== undefined) data.expectedAmount = decimal(req.body.expectedAmount);
    if (req.body.payDay !== undefined) data.payDay = req.body.payDay;

    const source = await prisma.$transaction(async (tx) => {
      const updated = await tx.incomeSource.update({ where: { id: existing.id }, data });
      // Keep this month's and future pending records in step with the source.
      const propagated = {};
      if (data.name !== undefined) propagated.label = data.name;
      if (data.kind !== undefined) propagated.kind = data.kind;
      if (data.expectedAmount !== undefined) propagated.expectedAmount = data.expectedAmount;
      if (Object.keys(propagated).length) {
        await tx.monthlySalary.updateMany({ where: { userId: req.user.id, ...pendingFromNow(existing.id) }, data: propagated });
      }
      return updated;
    });
    res.json({ success: true, incomeSource: planner.serializeIncomeSource(source) });
  } catch (error) {
    handleError(res, error, 'planner.updateIncomeSource');
  }
};

const setIncomeSourceActive = async (req, res) => {
  try {
    const existing = await findSource(req.user.id, req.params.id);
    const active = req.body.active;
    const source = await prisma.$transaction(async (tx) => {
      const updated = await tx.incomeSource.update({ where: { id: existing.id }, data: { active } });
      // A paused source is no longer expected, so its pending records stop inflating income.
      if (!active) await tx.monthlySalary.deleteMany({ where: { userId: req.user.id, ...pendingFromNow(existing.id) } });
      return updated;
    });
    res.json({ success: true, incomeSource: planner.serializeIncomeSource(source) });
  } catch (error) {
    handleError(res, error, 'planner.setIncomeSourceActive');
  }
};

const deleteIncomeSource = async (req, res) => {
  try {
    const existing = await findSource(req.user.id, req.params.id);
    // Received and past records stay (the foreign key sets incomeSourceId to null; label and kind
    // are stored on the record), so salary history survives deleting the source.
    await prisma.$transaction([
      prisma.monthlySalary.deleteMany({ where: { userId: req.user.id, ...pendingFromNow(existing.id) } }),
      prisma.incomeSource.delete({ where: { id: existing.id } }),
    ]);
    res.json({ success: true, message: 'Income source deleted' });
  } catch (error) {
    handleError(res, error, 'planner.deleteIncomeSource');
  }
};

// ---------------------------------------------------------------- monthly salary records

const findSalary = async (userId, id, db = prisma) => {
  const record = await db.monthlySalary.findFirst({ where: { id, userId }, include: planner.SALARY_INCLUDE });
  if (!record) throw NOT_FOUND_SALARY;
  return record;
};

const respondWithMonth = async (res, userId, year, month, status = 200, extra = {}) => {
  const data = await planner.getMonth(userId, year, month);
  res.status(status).json({ success: true, ...extra, salaries: data.salaries, income: data.summary.income });
};

const getSalaries = async (req, res) => {
  try {
    await respondWithMonth(res, req.user.id, req.query.year, req.query.month);
  } catch (error) {
    handleError(res, error, 'planner.getSalaries');
  }
};

const initializeSalaries = async (req, res) => {
  try {
    const { year, month } = req.body;
    const added = await prisma.$transaction(tx => planner.initializeSalaries(tx, req.user.id, year, month));
    await respondWithMonth(res, req.user.id, year, month, added ? 201 : 200, { added });
  } catch (error) {
    handleError(res, error, 'planner.initializeSalaries');
  }
};

const createSalary = async (req, res) => {
  try {
    const { year, month, label, kind, expectedAmount } = req.body;
    const record = await prisma.monthlySalary.create({
      data: { userId: req.user.id, year, month, label, kind: kind || 'OTHER', expectedAmount: decimal(expectedAmount) },
      include: planner.SALARY_INCLUDE,
    });
    res.status(201).json({ success: true, salary: planner.serializeSalary(record) });
  } catch (error) {
    handleError(res, error, 'planner.createSalary');
  }
};

const updateSalary = async (req, res) => {
  try {
    const existing = await findSalary(req.user.id, req.params.id);
    const data = {};
    if (req.body.expectedAmount !== undefined) data.expectedAmount = decimal(req.body.expectedAmount);
    if (req.body.label !== undefined) data.label = req.body.label;
    const record = await prisma.monthlySalary.update({ where: { id: existing.id }, data, include: planner.SALARY_INCLUDE });
    res.json({ success: true, salary: planner.serializeSalary(record) });
  } catch (error) {
    handleError(res, error, 'planner.updateSalary');
  }
};

/**
 * Marks income as received without ever creating a transaction (income is recorded in Add
 * Transaction):
 *   link             - an income transaction already in History backs it;
 *   alreadyInBalance - the money is already reflected in the user's balances.
 * The conditional claim only succeeds while the record is unreceived, so a double tap or a
 * concurrent request gets 409.
 */
const receiveSalary = async (req, res) => {
  try {
    const userId = req.user.id;
    const { mode, expenseId, receivedAmount, receivedAt } = req.body;

    const record = await prisma.$transaction(async (tx) => {
      const existing = await findSalary(userId, req.params.id, tx);
      if (planner.isReceived(existing)) throw ALREADY_RECEIVED;
      if (existing.receivedAt || existing.expenseId) {
        await tx.monthlySalary.updateMany({ where: { id: existing.id, receivedAt: existing.receivedAt, expenseId: existing.expenseId }, data: STALE_RESET });
      }

      let claim;
      if (mode === 'link') {
        // Lock the transaction so a concurrent History edit or delete either completes first (and is
        // seen by the checks below) or waits until the link exists (and then resets it).
        await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${expenseId} AND "userId" = ${userId} FOR UPDATE`;
        const transaction = await tx.expense.findFirst({
          where: { id: expenseId, userId },
          include: { monthlySalary: { select: { id: true } }, investmentTransaction: { select: { id: true } } },
        });
        if (!transaction) throw new HttpError(404, 'Transaction not found');
        if (transaction.type !== 'income') throw new HttpError(400, 'Only an income transaction can be linked');
        if (transaction.investmentTransaction || String(transaction.category).trim().toLowerCase() === 'investment') {
          throw new HttpError(400, 'An investment transaction cannot be linked as income');
        }
        if (!planner.isValidSalaryLink(transaction, existing)) throw WRONG_MONTH;
        if (transaction.monthlySalary) throw ALREADY_LINKED;
        claim = { receivedAmount: decimal(transaction.amount), receivedAt: transaction.expenseDate, expenseId: transaction.id };
      } else {
        const receivedOn = calendarDay(receivedAt);
        if (!planner.inReceivedWindow(receivedOn, existing)) throw WRONG_MONTH;
        claim = { receivedAmount: decimal(receivedAmount), receivedAt: receivedOn, countedInBalance: true };
      }

      const claimed = await tx.monthlySalary.updateMany({
        where: { id: existing.id, userId, receivedAt: null, expenseId: null },
        data: claim,
      });
      if (claimed.count !== 1) throw ALREADY_RECEIVED;
      return tx.monthlySalary.findUnique({ where: { id: existing.id }, include: planner.SALARY_INCLUDE });
    });

    res.json({ success: true, salary: planner.serializeSalary(record) });
  } catch (error) {
    // Two records racing to link the same transaction hit the unique index on expenseId.
    if (error?.code === 'P2002') return handleError(res, ALREADY_LINKED);
    handleError(res, error, 'planner.receiveSalary');
  }
};

const undoReceived = async (req, res) => {
  try {
    const userId = req.user.id;
    const record = await prisma.$transaction(async (tx) => {
      const existing = await findSalary(userId, req.params.id, tx);
      if (!existing.receivedAt && !existing.expenseId) throw new HttpError(400, 'This income is not marked as received');
      // Only the planner record changes; the linked transaction stays in History.
      await tx.monthlySalary.update({ where: { id: existing.id }, data: STALE_RESET });
      return tx.monthlySalary.findUnique({ where: { id: existing.id }, include: planner.SALARY_INCLUDE });
    });
    res.json({ success: true, salary: planner.serializeSalary(record) });
  } catch (error) {
    handleError(res, error, 'planner.undoReceived');
  }
};

const deleteSalary = async (req, res) => {
  try {
    const existing = await findSalary(req.user.id, req.params.id);
    if (planner.isReceived(existing)) throw new HttpError(409, 'Received income is part of your history. Undo it first to delete the record.', 'ALREADY_RECEIVED');
    await prisma.monthlySalary.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Income record deleted' });
  } catch (error) {
    handleError(res, error, 'planner.deleteSalary');
  }
};

// Every unlinked income transaction in the record's received window (its month and the next),
// closest to the expected amount first, so a salary entered with a slightly different amount or
// date is still offered for linking instead of being recorded twice.
const getLinkCandidates = async (req, res) => {
  try {
    const record = await findSalary(req.user.id, req.params.id);
    const candidates = await prisma.expense.findMany({
      where: unlinkedIncomeWhere(req.user.id, record),
      select: CANDIDATE_SELECT,
      orderBy: { expenseDate: 'desc' },
      take: 50,
    });
    const expected = toPaise(record.expectedAmount);
    const gap = (c) => { const d = toPaise(c.amount) - expected; return d < 0n ? -d : d; };
    const ranked = [...candidates].sort((a, b) => {
      const ga = gap(a);
      const gb = gap(b);
      return ga === gb ? b.expenseDate - a.expenseDate : (ga < gb ? -1 : 1);
    });
    res.json({
      success: true,
      candidates: ranked.slice(0, 20).map(c => ({ ...c, amount: toApiAmount(toPaise(c.amount)), matchesExpected: toPaise(c.amount) === expected })),
    });
  } catch (error) {
    handleError(res, error, 'planner.getLinkCandidates');
  }
};

const getSalaryHistory = async (req, res) => {
  try {
    const months = req.query.months || 12;
    const end = req.query.year ? { year: req.query.year, month: req.query.month } : planner.currentPeriod();
    const endIndex = planner.periodIndex(end);
    const startIndex = endIndex - months + 1;
    const start = { year: Math.floor(startIndex / 12), month: (startIndex % 12) + 1 };
    const records = await prisma.monthlySalary.findMany({
      where: {
        userId: req.user.id,
        AND: [
          planner.fromPeriodWhere(start),
          { OR: [{ year: { lt: end.year } }, { year: end.year, month: { lte: end.month } }] },
        ],
      },
      include: planner.SALARY_INCLUDE,
      orderBy: [{ year: 'desc' }, { month: 'desc' }, { createdAt: 'asc' }],
    });
    const byMonth = new Map();
    records.forEach((r) => {
      const key = `${r.year}-${r.month}`;
      if (!byMonth.has(key)) byMonth.set(key, { year: r.year, month: r.month, records: [] });
      byMonth.get(key).records.push(planner.serializeSalary(r));
    });
    const history = [...byMonth.values()].map(m => ({
      ...m,
      expectedAmount: toApiAmount(sumPaise(m.records.map(r => toPaise(r.expectedAmount)))),
      receivedAmount: toApiAmount(sumPaise(m.records.map(r => toPaise(r.receivedAmount)))),
    }));
    res.json({ success: true, history });
  } catch (error) {
    handleError(res, error, 'planner.getSalaryHistory');
  }
};

module.exports = {
  listIncomeSources,
  createIncomeSource,
  updateIncomeSource,
  setIncomeSourceActive,
  deleteIncomeSource,
  getSalaries,
  initializeSalaries,
  createSalary,
  updateSalary,
  receiveSalary,
  undoReceived,
  deleteSalary,
  getLinkCandidates,
  getSalaryHistory,
};
