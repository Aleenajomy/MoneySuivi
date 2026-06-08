const prisma = require('../lib/prisma');
const { checkBudgetAlert } = require('../services/budgetAlertService');
const {
  calculateBalances,
  buildBalanceAlerts,
  normalizeAccountType,
} = require('../utils/accountBalances');

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
    const { title, amount, category, type, accountType, paymentMethod, note, expenseDate, recurring, recurringType } = req.body;
    const date = expenseDate ? new Date(expenseDate) : new Date();
    const isRecurring = Boolean(recurring);
    const normalizedType = type === 'income' ? 'income' : 'expense';
    const normalizedAccountType = normalizeAccountType(accountType || paymentMethod);
    const expense = await prisma.expense.create({
      data: {
        title, category,
        amount: Number(amount),
        type: normalizedType,
        accountType: normalizedAccountType,
        paymentMethod: paymentMethod || 'Cash',
        note: note || null,
        expenseDate: date,
        userId: req.user.id,
        recurring: isRecurring,
        recurringType: isRecurring ? recurringType : null,
        nextRunDate: isRecurring ? calcNextRunDate(date, recurringType) : null,
      },
    });
    const notification = normalizedType === 'expense' ? await checkBudgetAlert(req.user.id, category) : null;
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
    const fields = ['title', 'category', 'paymentMethod', 'note'];
    fields.forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (req.body.type !== undefined) data.type = req.body.type === 'income' ? 'income' : 'expense';
    if (req.body.accountType !== undefined) data.accountType = normalizeAccountType(req.body.accountType);
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

    const [monthlyTotals, categoryTotals, monthlyTrendRows, balanceGrowthRows, upcomingRecurring, accountTotals, investmentTotals, categoryAllTime, allTransactions] = await Promise.all([
      prisma.expense.groupBy({ by: ['type'], where: { userId: req.user.id, type: { in: ['expense', 'income'] }, expenseDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['category'], where: { userId: req.user.id, type: 'expense', expenseDate: { gte: startOfMonth, lte: endOfMonth } }, _sum: { amount: true }, orderBy: { _sum: { amount: 'desc' } } }),
      prisma.$queryRaw`
        SELECT EXTRACT(YEAR FROM "expenseDate")::int AS year, EXTRACT(MONTH FROM "expenseDate")::int AS month, SUM(amount)::float AS total
        FROM "Expense" WHERE "userId" = ${req.user.id} AND type = 'expense' AND "expenseDate" >= ${sixMonthsAgo}
        GROUP BY year, month ORDER BY year ASC, month ASC`,
      prisma.$queryRaw`
        SELECT EXTRACT(YEAR FROM "expenseDate")::int AS year, EXTRACT(MONTH FROM "expenseDate")::int AS month,
          SUM(CASE
            WHEN type = 'income' AND "accountType" <> 'Credit Card' THEN amount
            WHEN type = 'expense' AND "accountType" <> 'Credit Card' THEN -amount
            ELSE 0
          END)::float AS total
        FROM "Expense" WHERE "userId" = ${req.user.id} AND type IN ('income', 'expense') AND "expenseDate" >= ${sixMonthsAgo}
        GROUP BY year, month ORDER BY year ASC, month ASC`,
      prisma.expense.findMany({ where: { userId: req.user.id, recurring: true, nextRunDate: { gte: now, lte: next30Days } }, orderBy: { nextRunDate: 'asc' }, take: 5 }),
      prisma.expense.groupBy({ by: ['accountType', 'type'], where: { userId: req.user.id, type: { in: ['expense', 'income'] } }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['type'], where: { userId: req.user.id, category: 'Investment' }, _sum: { amount: true } }),
      prisma.expense.groupBy({ by: ['category', 'type'], where: { userId: req.user.id, type: { in: ['expense', 'income'] } }, _sum: { amount: true } }),
      prisma.expense.findMany({ where: { userId: req.user.id }, select: { amount: true, type: true, accountType: true, paymentMethod: true, fromAccountType: true, toAccountType: true } }),
    ]);

    const totalIncome = monthlyTotals.find(i => i.type === 'income')?._sum.amount || 0;
    const totalExpense = monthlyTotals.find(i => i.type === 'expense')?._sum.amount || 0;
    const accountBreakdownMap = {};
    accountTotals.forEach(item => {
      const key = normalizeAccountType(item.accountType);
      const amount = item._sum.amount || 0;
      if (!accountBreakdownMap[key]) accountBreakdownMap[key] = { income: 0, expense: 0 };
      accountBreakdownMap[key][item.type] += amount;
    });
    const expensesByAccountType = Object.entries(accountBreakdownMap).map(([accountType, totals]) => ({ accountType, total: totals.expense }));
    const incomeByAccountType = Object.entries(accountBreakdownMap).map(([accountType, totals]) => ({ accountType, total: totals.income }));

    // Calculate absolute all-time net balance
    const balances = calculateBalances(allTransactions);
    console.log('[Analytics] allTransactions count:', allTransactions.length);
    console.log('[Analytics] sample paymentMethods:', allTransactions.slice(0, 5).map(t => ({ type: t.type, amount: t.amount, pm: t.paymentMethod, at: t.accountType })));
    console.log('[Analytics] balances:', balances);
    const balanceAlerts = buildBalanceAlerts(balances);

    const investmentBalance = (investmentTotals.find(i => i.type === 'income')?._sum.amount || 0) - (investmentTotals.find(i => i.type === 'expense')?._sum.amount || 0)

    const categoryBalancesMap = {}
    if (categoryAllTime) {
      categoryAllTime.forEach(item => {
        const cat = item.category || 'Other'
        const delta = (item.type === 'income' ? 1 : -1) * (item._sum.amount || 0)
        categoryBalancesMap[cat] = (categoryBalancesMap[cat] || 0) + delta
      })
    }
    const categoryBalances = Object.entries(categoryBalancesMap).map(([category, balance]) => ({ category, balance }))

    res.json({
      success: true,
      analytics: {
        totalIncome, totalExpense,
        balance: balances.totalBalance,
        ...balances,
        balanceAlerts,
        categorySpending: categoryTotals.map(i => ({ _id: i.category, total: i._sum.amount || 0 })),
        monthlyTrend: monthlyTrendRows.map(i => ({ _id: { year: i.year, month: i.month }, total: i.total || 0 })),
        monthlyBalanceGrowth: balanceGrowthRows.map(i => ({ _id: { year: i.year, month: i.month }, total: i.total || 0 })),
        upcomingRecurring: upcomingRecurring.map(toExpenseResponse),
        accountBreakdown: Object.entries(accountBreakdownMap).map(([accountType, totals]) => ({ accountType, ...totals, net: totals.income - totals.expense })),
        expensesByAccountType,
        incomeByAccountType,
        investmentBalance,
        categoryBalances,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const getBalances = async (req, res) => {
  try {
    const transactions = await prisma.expense.findMany({
      where: { userId: req.user.id },
      select: { amount: true, type: true, accountType: true, paymentMethod: true, fromAccountType: true, toAccountType: true },
    });
    const balances = calculateBalances(transactions);
    res.json({ success: true, balances, alerts: buildBalanceAlerts(balances) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense, getAnalytics, getBalances };
// Non-destructive debug endpoint to inspect analytics internals
const getAnalyticsDebug = async (req, res) => {
  try {
    const paymentTotals = await prisma.expense.groupBy({ by: ['accountType', 'paymentMethod', 'type'], where: { userId: req.user.id }, _sum: { amount: true } })
    const recent = await prisma.expense.findMany({ where: { userId: req.user.id }, orderBy: { expenseDate: 'desc' }, take: 20 })

    const paymentBreakdownMap = {}
    paymentTotals.forEach(item => {
      const key = item.paymentMethod || 'Other'
      const delta = (item.type === 'income' ? 1 : -1) * (item._sum.amount || 0)
      paymentBreakdownMap[key] = (paymentBreakdownMap[key] || 0) + delta
    })

    const normalizedPaymentMap = {}
    Object.entries(paymentBreakdownMap).forEach(([k, v]) => {
      const key = (k || 'other').toString().toLowerCase()
      normalizedPaymentMap[key] = (normalizedPaymentMap[key] || 0) + v
    })

    const cashKeys = ['cash']
    const bankKeys = ['upi', 'credit card', 'debit card', 'net banking', 'bank', 'bank transfer']

    const cashBalance = cashKeys.reduce((s, k) => s + (normalizedPaymentMap[k] || 0), 0)
    const bankBalance = bankKeys.reduce((s, k) => s + (normalizedPaymentMap[k] || 0), 0)

    res.json({ success: true, paymentTotals, paymentBreakdownMap, normalizedPaymentMap, cashBalance, bankBalance, recent })
  } catch (e) {
    res.status(500).json({ success: false, message: e.message })
  }
}

module.exports.getAnalyticsDebug = getAnalyticsDebug
