const prisma = require('../lib/prisma');

const toExpenseResponse = (expense) => ({
  ...expense,
  _id: expense.id,
});

const buildExpenseFilter = (userId, query) => {
  const { category, startDate, endDate, search } = query;
  const where = { userId };

  if (category && category !== 'All') where.category = category;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) where.expenseDate.gte = new Date(startDate);
    if (endDate) where.expenseDate.lte = new Date(endDate);
  }

  return where;
};

// @desc    Get all expenses for logged-in user
// @route   GET /api/expenses
// @access  Private
const getExpenses = async (req, res) => {
  try {
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 20);
    const where = buildExpenseFilter(req.user.id, req.query);

    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({
        where,
        orderBy: { expenseDate: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
      }),
    ]);

    res.json({
      success: true,
      count: expenses.length,
      total,
      totalPages: Math.ceil(total / limit),
      currentPage: page,
      expenses: expenses.map(toExpenseResponse),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get single expense
// @route   GET /api/expenses/:id
// @access  Private
const getExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, expense: toExpenseResponse(expense) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Create expense
// @route   POST /api/expenses
// @access  Private
const createExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.create({
      data: {
        title: req.body.title,
        amount: Number(req.body.amount),
        category: req.body.category,
        type: req.body.type || 'expense',
        paymentMethod: req.body.paymentMethod || 'Cash',
        note: req.body.note || null,
        expenseDate: req.body.expenseDate ? new Date(req.body.expenseDate) : new Date(),
        userId: req.user.id,
      },
    });
    res.status(201).json({
      success: true,
      message: 'Expense added successfully',
      expense: toExpenseResponse(expense),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update expense
// @route   PUT /api/expenses/:id
// @access  Private
const updateExpense = async (req, res) => {
  try {
    const existingExpense = await prisma.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existingExpense) return res.status(404).json({ success: false, message: 'Expense not found' });

    const data = {};
    if (req.body.title !== undefined) data.title = req.body.title;
    if (req.body.amount !== undefined) data.amount = Number(req.body.amount);
    if (req.body.category !== undefined) data.category = req.body.category;
    if (req.body.type !== undefined) data.type = req.body.type;
    if (req.body.paymentMethod !== undefined) data.paymentMethod = req.body.paymentMethod;
    if (req.body.note !== undefined) data.note = req.body.note || null;
    if (req.body.expenseDate !== undefined) data.expenseDate = new Date(req.body.expenseDate);

    const expense = await prisma.expense.update({
      where: { id: existingExpense.id },
      data,
    });

    res.json({
      success: true,
      message: 'Expense updated successfully',
      expense: toExpenseResponse(expense),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Delete expense
// @route   DELETE /api/expenses/:id
// @access  Private
const deleteExpense = async (req, res) => {
  try {
    const existingExpense = await prisma.expense.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existingExpense) return res.status(404).json({ success: false, message: 'Expense not found' });

    await prisma.expense.delete({ where: { id: existingExpense.id } });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Get dashboard analytics
// @route   GET /api/expenses/analytics
// @access  Private
const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const endOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);

    const [monthlyTotals, categoryTotals, monthlyTrendRows, recentTransactions] = await Promise.all([
      prisma.expense.groupBy({
        by: ['type'],
        where: { userId: req.user.id, expenseDate: { gte: startOfMonth, lte: endOfMonth } },
        _sum: { amount: true },
      }),
      prisma.expense.groupBy({
        by: ['category'],
        where: {
          userId: req.user.id,
          type: 'expense',
          expenseDate: { gte: startOfMonth, lte: endOfMonth },
        },
        _sum: { amount: true },
        orderBy: { _sum: { amount: 'desc' } },
      }),
      prisma.$queryRaw`
        SELECT
          EXTRACT(YEAR FROM "expenseDate")::int AS year,
          EXTRACT(MONTH FROM "expenseDate")::int AS month,
          SUM(amount)::float AS total
        FROM "Expense"
        WHERE "userId" = ${req.user.id}
          AND type = 'expense'
          AND "expenseDate" >= ${sixMonthsAgo}
        GROUP BY year, month
        ORDER BY year ASC, month ASC
      `,
      prisma.expense.findMany({
        where: { userId: req.user.id },
        orderBy: { expenseDate: 'desc' },
        take: 5,
      }),
    ]);

    const totalIncome = monthlyTotals.find((item) => item.type === 'income')?._sum.amount || 0;
    const totalExpense = monthlyTotals.find((item) => item.type === 'expense')?._sum.amount || 0;

    res.json({
      success: true,
      analytics: {
        totalIncome,
        totalExpense,
        balance: totalIncome - totalExpense,
        categorySpending: categoryTotals.map((item) => ({
          _id: item.category,
          total: item._sum.amount || 0,
        })),
        monthlyTrend: monthlyTrendRows.map((item) => ({
          _id: { year: item.year, month: item.month },
          total: item.total || 0,
        })),
        recentTransactions: recentTransactions.map(toExpenseResponse),
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense, getAnalytics };
