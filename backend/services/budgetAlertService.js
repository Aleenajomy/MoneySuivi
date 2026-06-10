const prisma = require('../lib/prisma');
const { sendPushNotification } = require('./pushService');

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
    const existing = await prisma.notification.findFirst({
      where: {
        userId,
        category,
        type,
        createdAt: { gte: range.gte },
      },
    });
    if (existing) return null;

    const roundedSpent = Math.round(spent);
    const roundedLimit = Math.round(budget.monthlyLimit);
    const message = threshold === 100
      ? `${category} budget exceeded. Spent Rs. ${roundedSpent} of Rs. ${roundedLimit}.`
      : `${category} budget is ${Math.round(percentage)}% used. Rs. ${Math.max(roundedLimit - roundedSpent, 0)} remaining.`;

    const notification = await prisma.notification.create({
      data: {
        userId,
        category,
        percentage: Math.round(percentage),
        message,
        type,
      },
    });

    sendPushNotification(userId, {
      title: type === 'critical' ? `🚨 Budget Exceeded: ${category}` : `⚠️ Budget Warning: ${category}`,
      body: message,
    }).catch(err => console.error('[PushService] Trigger error:', err));

    return notification;
  } catch (error) {
    console.error('[BudgetAlert] Error:', error.message);
    return null;
  }
};

module.exports = { checkBudgetAlert };
