const prisma = require('../lib/prisma');
const { checkBudgetAlert } = require('../services/budgetAlertService');
const notificationService = require('../services/notificationService');
const { getAccountBalances } = require('../services/balanceService');
const { buildBalanceAlerts, normalizeAccountType } = require('../utils/accountBalances');
const { roundMoney, roundMoneyFields } = require('../utils/money');
const { firstRunDate } = require('../utils/recurrence');
const { handleError } = require('../utils/http');
const logger = require('../utils/logger');

const toExpenseResponse = (e) => ({ ...e, _id: e.id });

const buildFilter = (userId, query) => {
  const { category, startDate, endDate, search, type } = query;
  const where = { userId };
  if (category && category !== 'All') where.category = category;
  if (type && type !== 'All') where.type = type;
  if (search) where.title = { contains: search, mode: 'insensitive' };
  if (startDate || endDate) {
    where.expenseDate = {};
    if (startDate) where.expenseDate.gte = new Date(startDate);
    if (endDate) { const d = new Date(endDate); d.setHours(23, 59, 59, 999); where.expenseDate.lte = d; }
  }
  return where;
};

const getExpenses = async (req, res) => {
  try {
    const page = req.query.page || 1;
    const limit = req.query.limit || 20;
    const where = buildFilter(req.user.id, req.query);
    const [total, expenses] = await Promise.all([
      prisma.expense.count({ where }),
      prisma.expense.findMany({ where, orderBy: { expenseDate: 'desc' }, skip: (page - 1) * limit, take: limit }),
    ]);
    res.json({ success: true, count: expenses.length, total, totalPages: Math.ceil(total / limit), currentPage: page, expenses: expenses.map(toExpenseResponse) });
  } catch (error) {
    handleError(res, error, 'expense.getExpenses');
  }
};

const getExpense = async (req, res) => {
  try {
    const expense = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
    res.json({ success: true, expense: toExpenseResponse(expense) });
  } catch (error) {
    handleError(res, error, 'expense.getExpense');
  }
};

const createExpense = async (req, res) => {
  try {
    const { title, amount, category, type, accountType, fromAccountType, toAccountType, paymentMethod, note, expenseDate, recurring, recurringType } = req.body;
    const date = expenseDate ? new Date(expenseDate) : new Date();
    const isRecurring = Boolean(recurring);
    const normalizedType = type === 'income' ? 'income' : (type === 'transfer' ? 'transfer' : 'expense');
    const normalizedAccountType = normalizeAccountType(accountType || paymentMethod || fromAccountType);
    let resolvedPaymentMethod = paymentMethod;
    if (!resolvedPaymentMethod) {
      if (normalizedType === 'transfer') resolvedPaymentMethod = 'Transfer';
      else if (normalizedAccountType === 'Cash') resolvedPaymentMethod = 'Cash';
      else if (normalizedAccountType === 'Credit Card') resolvedPaymentMethod = 'Credit Card';
      else if (normalizedAccountType === 'Debit Card') resolvedPaymentMethod = 'Debit Card';
      else resolvedPaymentMethod = 'UPI';
    }
    const expense = await prisma.expense.create({
      data: {
        title,
        category: category || (normalizedType === 'transfer' ? 'Transfer' : 'Other'),
        amount: roundMoney(amount),
        type: normalizedType,
        accountType: normalizedAccountType,
        fromAccountType: normalizedType === 'transfer' ? fromAccountType : null,
        toAccountType: normalizedType === 'transfer' ? toAccountType : null,
        paymentMethod: resolvedPaymentMethod,
        note: note || null,
        expenseDate: date,
        userId: req.user.id,
        recurring: isRecurring,
        recurringType: isRecurring ? recurringType : null,
        nextRunDate: isRecurring ? firstRunDate(date, recurringType) : null,
      },
    });
    const notification = normalizedType === 'expense' && category ? await checkBudgetAlert(req.user.id, category) : null;

    const formattedAmount = `₹${Number(expense.amount).toLocaleString('en-IN')}`;
    if (normalizedType === 'expense') {
      notificationService.sendToUser(req.user.id, {
        title: '💸 Expense Added',
        body: `${formattedAmount} expense added to ${expense.category}.`,
        category: 'Expense',
        type: 'info',
        data: { url: '/history', expenseId: expense.id },
        saveInApp: false,
      }).catch(err => logger.error('[Expense] Push error', { error: err.message }));
    } else if (normalizedType === 'income') {
      notificationService.sendToUser(req.user.id, {
        title: '💰 Income Added',
        body: `${formattedAmount} income was added successfully.`,
        category: 'Income',
        type: 'info',
        data: { url: '/history', expenseId: expense.id },
        saveInApp: true,
      }).catch(err => logger.error('[Expense] Push error', { error: err.message }));
    }

    res.status(201).json({ success: true, message: 'Expense added successfully', expense: toExpenseResponse(expense), notification });
  } catch (error) {
    handleError(res, error, 'expense.createExpense');
  }
};

const updateExpense = async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Expense not found' });
    const data = {};
    const fields = ['title', 'category', 'paymentMethod', 'note', 'fromAccountType', 'toAccountType'];
    fields.forEach(f => { if (req.body[f] !== undefined) data[f] = req.body[f]; });
    if (req.body.type !== undefined) {
      data.type = req.body.type === 'income' ? 'income' : (req.body.type === 'transfer' ? 'transfer' : 'expense');
    }
    if (req.body.accountType !== undefined) data.accountType = normalizeAccountType(req.body.accountType);
    if (data.accountType === 'Cash' && req.body.paymentMethod === undefined) {
      data.paymentMethod = 'Cash';
    } else if (data.paymentMethod === 'Cash' && req.body.accountType === undefined) {
      data.accountType = 'Cash';
    } else if (data.accountType === 'Credit Card' && req.body.paymentMethod === undefined) {
      data.paymentMethod = 'Credit Card';
    } else if (data.paymentMethod === 'Credit Card' && req.body.accountType === undefined) {
      data.accountType = 'Credit Card';
    } else if (data.accountType === 'Debit Card' && req.body.paymentMethod === undefined) {
      data.paymentMethod = 'Debit Card';
    } else if (data.paymentMethod === 'Debit Card' && req.body.accountType === undefined) {
      data.accountType = 'Debit Card';
    }
    if (req.body.amount !== undefined) data.amount = roundMoney(req.body.amount);
    if (req.body.expenseDate !== undefined) data.expenseDate = new Date(req.body.expenseDate);
    if (req.body.recurring !== undefined) {
      data.recurring = Boolean(req.body.recurring);
      data.recurringType = req.body.recurring ? req.body.recurringType : null;
      data.nextRunDate = req.body.recurring ? firstRunDate(data.expenseDate || existing.expenseDate, req.body.recurringType) : null;
    } else if (existing.recurring && (req.body.expenseDate !== undefined || req.body.recurringType !== undefined)) {
      const nextType = req.body.recurringType || existing.recurringType;
      data.recurringType = nextType;
      data.nextRunDate = firstRunDate(data.expenseDate || existing.expenseDate, nextType);
    }
    const expense = await prisma.expense.update({ where: { id: existing.id }, data });
    if ((data.type || existing.type) === 'expense' && (data.amount !== undefined || data.category || data.type)) {
      await checkBudgetAlert(req.user.id, data.category || existing.category);
    }
    res.json({ success: true, message: 'Expense updated successfully', expense: toExpenseResponse(expense) });
  } catch (error) {
    handleError(res, error, 'expense.updateExpense');
  }
};

const deleteExpense = async (req, res) => {
  try {
    const existing = await prisma.expense.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Expense not found' });
    await prisma.expense.delete({ where: { id: existing.id } });
    res.json({ success: true, message: 'Expense deleted successfully' });
  } catch (error) {
    handleError(res, error, 'expense.deleteExpense');
  }
};

const getAnalytics = async (req, res) => {
  try {
    const now = new Date();
    const period = req.query.period || 'this_month';
    let startOfMonth, endOfMonth;
    if (period === 'last_month') {
      startOfMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      endOfMonth   = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    } else if (period === 'this_year') {
      startOfMonth = new Date(now.getFullYear(), 0, 1);
      endOfMonth   = new Date(now.getFullYear(), 11, 31, 23, 59, 59);
    } else if (period === 'all_time') {
      startOfMonth = new Date('2000-01-01');
      endOfMonth   = new Date('2099-12-31');
    } else {
      startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
      endOfMonth   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
    }
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
    const next30Days = new Date(now); next30Days.setDate(now.getDate() + 30);

    const [monthlyTotals, categoryTotals, monthlyTrendRows, balanceGrowthRows, upcomingRecurring, accountTotals, investmentTotals, categoryAllTime, balances, investmentAssets] = await Promise.all([
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
      getAccountBalances(req.user.id),
      prisma.asset.findMany({ where: { userId: req.user.id, type: { in: ['Stocks', 'Mutual Funds', 'Fixed Deposit', 'Gold'] } }, select: { type: true, value: true } }),
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

    const balanceAlerts = buildBalanceAlerts(balances);

    const txInvestment = (investmentTotals.find(i => i.type === 'income')?._sum.amount || 0) - (investmentTotals.find(i => i.type === 'expense')?._sum.amount || 0)
    const assetInvestment = investmentAssets.reduce((sum, a) => sum + a.value, 0)
    const investmentBalance = txInvestment + assetInvestment
    const investmentBreakdown = investmentAssets.reduce((acc, a) => {
      acc[a.type] = (acc[a.type] || 0) + a.value
      return acc
    }, {})

    const categoryBalancesMap = {}
    if (categoryAllTime) {
      categoryAllTime.forEach(item => {
        const cat = item.category || 'Other'
        const delta = (item.type === 'income' ? 1 : -1) * (item._sum.amount || 0)
        categoryBalancesMap[cat] = (categoryBalancesMap[cat] || 0) + delta
      })
    }
    const categoryBalances = Object.entries(categoryBalancesMap).map(([category, balance]) => ({ category, balance: roundMoney(balance) }))

    res.json({
      success: true,
      analytics: {
        totalIncome: roundMoney(totalIncome),
        totalExpense: roundMoney(totalExpense),
        balance: roundMoney(balances.totalBalance),
        ...roundMoneyFields(balances),
        balanceAlerts,
        categorySpending: categoryTotals.map(i => ({ _id: i.category, total: roundMoney(i._sum.amount) })),
        monthlyTrend: monthlyTrendRows.map(i => ({ _id: { year: i.year, month: i.month }, total: roundMoney(i.total) })),
        monthlyBalanceGrowth: balanceGrowthRows.map(i => ({ _id: { year: i.year, month: i.month }, total: roundMoney(i.total) })),
        upcomingRecurring: upcomingRecurring.map(toExpenseResponse),
        accountBreakdown: Object.entries(accountBreakdownMap).map(([accountType, totals]) => ({ accountType, ...roundMoneyFields(totals), net: roundMoney(totals.income - totals.expense) })),
        expensesByAccountType,
        incomeByAccountType,
        investmentBalance: roundMoney(investmentBalance),
        investmentBreakdown: roundMoneyFields(investmentBreakdown),
        categoryBalances,
      },
    });
  } catch (error) {
    handleError(res, error, 'expense.getAnalytics');
  }
};

const getBalances = async (req, res) => {
  try {
    const balances = roundMoneyFields(await getAccountBalances(req.user.id));
    res.json({ success: true, balances, alerts: buildBalanceAlerts(balances) });
  } catch (error) {
    handleError(res, error, 'expense.getBalances');
  }
};

module.exports = { getExpenses, getExpense, createExpense, updateExpense, deleteExpense, getAnalytics, getBalances };
