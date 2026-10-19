const prisma = require('../lib/prisma');
const logger = require('../utils/logger');

const ALERT_CATEGORY = 'Budget Alert';

const getCurrentMonthRange = () => {
  const now = new Date();
  return {
    gte: new Date(now.getFullYear(), now.getMonth(), 1),
    lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
};

const checkBudgetAlert = async (userId, category) => {
  try {
    const budget = await prisma.budget.findUnique({
      where: { userId_category: { userId, category } },
    });
    if (!budget || budget.monthlyLimit <= 0) return null;

    const range = getCurrentMonthRange();
    const result = await prisma.expense.aggregate({
      where: { userId, category, type: 'expense', expenseDate: range },
      _sum: { amount: true },
    });

    const spent = result._sum.amount || 0;
    const percentage = (spent / budget.monthlyLimit) * 100;
    const threshold = percentage >= 100 ? 100 : percentage >= 80 ? 80 : 0;
    if (!threshold) return null;

    const type = threshold === 100 ? 'critical' : 'warning';
    // Alerts are stored under ALERT_CATEGORY with a message that starts with the budget's
    // category; matching on that is what limits each threshold to one alert per month.
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        category: ALERT_CATEGORY,
        type,
        message: { startsWith: `${category} budget ` },
        createdAt: { gte: range.gte },
      },
    });
    if (existing) return null;

    const roundedSpent = Math.round(spent);
    const roundedLimit = Math.round(budget.monthlyLimit);
    const message = threshold === 100
      ? `${category} budget exceeded. Spent Rs. ${roundedSpent} of Rs. ${roundedLimit}.`
      : `${category} budget is ${Math.round(percentage)}% used. Rs. ${Math.max(roundedLimit - roundedSpent, 0)} remaining.`;

    const title = type === 'critical' ? `🚨 Budget Exceeded: ${category}` : `⚠️ Budget Warning: ${category}`;

    const notificationService = require('./notificationService');
    const { inAppNotification } = await notificationService.sendToUser(userId, {
      title,
      body: message,
      category: ALERT_CATEGORY,
      type,
      percentage: Math.round(percentage),
      data: { url: '/budgets', category },
      saveInApp: true,
    });

    return inAppNotification;
  } catch (error) {
    logger.error('[BudgetAlert] Failed', { error: error.message });
    return null;
  }
};

module.exports = { checkBudgetAlert };
