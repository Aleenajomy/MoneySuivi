const prisma = require('../lib/prisma');
const { checkBudgetAlert } = require('../services/budgetAlertService');

const toExpenseResponse = (e) => ({ ...e, _id: e.id });

const buildFilter = (userId, query) => {
  const { category, startDate, endDate, search } = query;
  const where = { userId };
  if (category && category !== 'All') where.category = category;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) where.expenseDate.gte = new Date(startDate);
    if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.expenseDate.lte = d; }
  }
  return where;
};

const calcNextRunDate = (from, type) => {
  const d = new Date(from);
  if (type === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  return d;
};

const getExpenses = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const where = buildFilter(req.user.id, req.query);
    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    res.json({ success: true, count: expenses.length, total, totalPages: Math.ceil(total / limit), currentPage: page, expenses: expenses.map(toExpenseResponse) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, expense: toExpenseResponse(expense) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createExpense = async (req, res) => {
  try {
    const { title, amount, category, type, paymentMethod, note, expenseDate, recurring, recurringType } = req.body;
    const date = expenseDate ? new Date(expenseDate) : new Date();
    const isRecurring = Boolean(recurring);
    const expense = await prisma.expense.create({
      data: {
        title, category,
        amount: Number(amount),
        type: type || 'expense',
        paymentMethod: paymentMethod || 'Cash',
        note: note || null,
        expenseDate: date,
        userId: req.user.id,
        recurring: isRecurring,
        recurringType: isRecurring ? recurringType : null,
        nextRunDate: isRecurring ? calcNextRunDate(date, recurringType) : null,
      },
    });
    const notification = (type || 'expense') === 'expense' ? await checkBudgetAlert(req.user.id, category) : null;
    res.status(201).json({ success: true, message: 'Expense added successfully', expense: toExpenseResponse(expense), notification });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateExpense = async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Expense not found' });
    const data = {};
    const fields = ['title', 'category', 'type', 'paymentMethod', 'note'];
    fields.forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (req.body.amount !== undefined) data.amount = Number(req.body.amount);
    if (req.body.expenseDate !== undefined) data.expenseDate = new Date(req.body.expenseDate);
    if (req.body.recurring !== undefined) {
      data.recurring = Boolean(req.body.recurring);
      data.recurringType = req.body.recurring ? req.body.recurringType : null;
      data.nextRunDate = req.body.recurring ? calcNextRunDate(data.expenseDate || existing.expenseDate, req.body.recurringType) : null;
    } else if (existing.recurring && (req.body.expenseDate !== undefined || req.body.recurringType !== undefined)) {
      const nextType = req.body.recurringType || existing.recurringType;
      data.recurringType = nextType;
      data.nextRunDate = calcNextRunDate(data.expenseDate || existing.expenseDate, nextType);
    }
    const expense = await prisma.expense.update({ where: { id: existing.id }, data });
    if ((data.type || existing.type) === 'expense' && (data.amount !== undefined || data.category || data.type)) {
      await checkBudgetAlert(req.user.id, data.category || existing.category);
    }
    res.json({ success: true, message: 'Expense updated successfully', expense: toExpenseResponse(expense) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteExpense = async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Expense not found' });
    await prisma.expense.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const next30Days = new Date(now); next30Days.setDate(now.getDate() + 30);

    const [monthlyTotals, categoryTotals, monthlyTrendRows, upcomingRecurring] = await Promise.all([
      prisma.expense.groupBy({ by: ['type'], where: { userId: req.user.id, expenseDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['category'], where: { userId: req.user.id, type: 'expense', expenseDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } }),
      prisma.$queryRaw`
        SELECT EXTRACT(YEAR FROM "expenseDate")::int AS year, EXTRACT(MONTH FROM "expenseDate")::int AS month, SUM(amount)::float AS total
        FROM "Expense" WHERE "userId" = ${req.user.id} AND type = 'expense' AND "expenseDate" >= ${sixMonthsAgo}
        GROUP BY year, month ORDER BY year ASC, month ASC`,
      prisma.expense.findMany({ where: { userId: req.user.id, recurring: true, nextRunDate: { gte: now, lte: next30Days } }, orderBy: { nextRunDate: 'asc' }, take: 5 }),
    ]);

    const totalIncome = monthlyTotals.find(i => i.type === 'income')?._sum.amount || 0;
    const totalExpense = monthlyTotals.find(i => i.type === 'expense')?._sum.amount || 0;

    res.json({
      success: true,
      analytics: {
        totalIncome, totalExpense,
        balance: totalIncome - totalExpense,
        categorySpending: categoryTotals.map(i => ({ _id: i.category, total: i._sum.amount || 0 })),
        monthlyTrend: monthlyTrendRows.map(i => ({ _id: { year: i.year, month: i.month }, total: i.total || 0 })),
        upcomingRecurring: upcomingRecurring.map(toExpenseResponse),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense, getAnalytics };
