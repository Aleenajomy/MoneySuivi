const prisma = require('../lib/prisma');
const { HttpError, handleError } = require('../utils/http');
const { toPaise } = require('../utils/plannerCalculations');
const planner = require('../services/plannerService');

const NOT_FOUND_PAYMENT = new HttpError(404, 'EMI payment not found');
const ALREADY_LINKED = new HttpError(409, 'That transaction is already linked to another EMI payment.', 'TRANSACTION_ALREADY_LINKED');

const findPayment = async (userId, id, db = prisma) => {
  const payment = await db.eMIPayment.findFirst({
    where: { id, emi: { userId } },
    include: { emi: { select: { title: true } }, expense: { select: planner.EMI_LINK_EXPENSE_SELECT } },
  });
  if (!payment) throw NOT_FOUND_PAYMENT;
  return payment;
};

const periodOf = (date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });

const respondWithPaymentMonth = async (res, userId, payment) => {
  const { year, month } = periodOf(payment.paidAt);
  const data = await planner.getMonth(userId, year, month, { includeSpending: true });
  res.json({ success: true, ...data });
};

// Expenses the user could link: spending near the payment that no other payment claims, exact
// amount first, then closest date. Listing them changes nothing.
const getCandidates = async (req, res) => {
  try {
    const payment = await findPayment(req.user.id, req.params.paymentId);
    const span = planner.EMI_LINK_MAX_DAYS * planner.DAY_MS;
    const expenses = await prisma.expense.findMany({
      where: {
        userId: req.user.id,
        type: 'expense',
        emiPayment: { is: null },
        investmentTransaction: { is: null },
        NOT: { category: { equals: 'Investment', mode: 'insensitive' } },
        expenseDate: { gte: new Date(payment.paidAt.getTime() - span), lte: new Date(payment.paidAt.getTime() + span) },
      },
      select: planner.EMI_LINK_EXPENSE_SELECT,
      take: 100,
    });
    const amount = toPaise(payment.amount);
    const candidates = expenses
      .map(e => ({ ...planner.serializeLinkableExpense(e), sameAmount: toPaise(e.amount) === amount, daysApart: planner.daysApart(e.expenseDate, payment.paidAt) }))
      .filter(c => c.daysApart <= planner.EMI_LINK_MAX_DAYS)
      .sort((a, b) => (Number(b.sameAmount) - Number(a.sameAmount)) || (a.daysApart - b.daysApart))
      .slice(0, 20);
    res.json({ success: true, candidates });
  } catch (error) {
    handleError(res, error, 'planner.emiCandidates');
  }
};

/**
 * Links an EMI-tracker payment to the History expense the user confirms is the same money, so the
 * planner counts it once. Only the link is stored: no transaction, EMI or balance is changed.
 * Both rows are locked so a concurrent History edit or delete is seen by the checks below.
 */
const linkPayment = async (req, res) => {
  try {
    const userId = req.user.id;
    const payment = await prisma.$transaction(async (tx) => {
      const existing = await findPayment(userId, req.params.paymentId, tx);
      await tx.$queryRaw`SELECT id FROM "EMIPayment" WHERE id = ${existing.id} FOR UPDATE`;
      await tx.$queryRaw`SELECT id FROM "Expense" WHERE id = ${req.body.expenseId} AND "userId" = ${userId} FOR UPDATE`;
      const expense = await tx.expense.findFirst({
        where: { id: req.body.expenseId, userId },
        select: { ...planner.EMI_LINK_EXPENSE_SELECT, emiPayment: { select: { id: true } } },
      });
      if (!expense) throw new HttpError(404, 'Transaction not found');
      if (expense.type !== 'expense' || planner.isInvestmentCategory(expense.category) || expense.investmentTransaction) {
        throw new HttpError(400, 'Only a spending transaction can be linked to an EMI payment.', 'NOT_SPENDING');
      }
      if (toPaise(expense.amount) !== toPaise(existing.amount)) {
        throw new HttpError(400, 'The transaction amount must equal the EMI payment amount.', 'AMOUNT_MISMATCH');
      }
      if (planner.daysApart(expense.expenseDate, existing.paidAt) > planner.EMI_LINK_MAX_DAYS) {
        throw new HttpError(400, `The transaction must be within ${planner.EMI_LINK_MAX_DAYS} days of the EMI payment.`, 'TOO_FAR_APART');
      }
      if (expense.emiPayment && expense.emiPayment.id !== existing.id) throw ALREADY_LINKED;
      await tx.eMIPayment.update({ where: { id: existing.id }, data: { expenseId: expense.id } });
      return existing;
    });
    await respondWithPaymentMonth(res, userId, payment);
  } catch (error) {
    if (error?.code === 'P2002') return handleError(res, ALREADY_LINKED);
    handleError(res, error, 'planner.linkEmiPayment');
  }
};

// Removes only the link; afterwards the expense counts as ordinary spending again.
const unlinkPayment = async (req, res) => {
  try {
    const payment = await findPayment(req.user.id, req.params.paymentId);
    await prisma.eMIPayment.update({ where: { id: payment.id }, data: { expenseId: null } });
    await respondWithPaymentMonth(res, req.user.id, payment);
  } catch (error) {
    handleError(res, error, 'planner.unlinkEmiPayment');
  }
};

module.exports = { getCandidates, linkPayment, unlinkPayment };
