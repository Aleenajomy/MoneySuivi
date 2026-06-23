const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { checkBudgetAlert } = require('./budgetAlertService');
const { sendPushNotification } = require('./pushService');

const calcNextRunDate = (from, type) => {
  const d = new Date(from);
  if (type === 'monthly') d.setMonth(d.getMonth() + 1);
  else d.setDate(d.getDate() + 7);
  return d;
};

const processRecurring = async () => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const tomorrow = new Date(today); tomorrow.setDate(today.getDate() + 1);

    const due = await prisma.expense.findMany({
      where: { recurring: true, nextRunDate: { lt: tomorrow } },
    });

    for (const expense of due) {
      await prisma.expense.create({
        data: {
          userId: expense.userId,
          title: expense.title,
          amount: expense.amount,
          category: expense.category,
          type: expense.type,
          paymentMethod: expense.paymentMethod,
          note: expense.note,
          expenseDate: new Date(),
          recurring: false,
          isAutoCreated: true,
        },
      });
      if (expense.type === 'expense') {
        await checkBudgetAlert(expense.userId, expense.category);
      }

      await prisma.expense.update({
        where: { id: expense.id },
        data: { nextRunDate: calcNextRunDate(expense.nextRunDate, expense.recurringType) },
      });
    }

    if (due.length > 0) console.log(`[Cron] Processed ${due.length} recurring expenses`);
  } catch (error) {
    console.error('[Cron] Error:', error.message);
  }
};

// Run every day at midnight
cron.schedule('0 0 * * *', processRecurring);

// Daily spend summary notification at 9 PM IST (15:30 UTC)
cron.schedule('30 15 * * *', async () => {
  try {
    // IST = UTC+5:30, so today 00:00 IST = yesterday 18:30 UTC
    const now = new Date();
    const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
    const istNow = new Date(now.getTime() + IST_OFFSET_MS);
    const istMidnight = new Date(Date.UTC(istNow.getUTCFullYear(), istNow.getUTCMonth(), istNow.getUTCDate()));
    const today = new Date(istMidnight.getTime() - IST_OFFSET_MS);   // today 00:00 IST in UTC
    const tomorrow = new Date(today.getTime() + 24 * 60 * 60 * 1000);

    const users = await prisma.user.findMany({ select: { id: true } });

    for (const user of users) {
      const result = await prisma.expense.aggregate({
        where: { userId: user.id, type: 'expense', expenseDate: { gte: today, lt: tomorrow } },
        _sum: { amount: true },
      });
      const total = result._sum.amount || 0;
      if (total > 0) {
        const message = `You spent ₹${total.toFixed(0)} today across all categories.`;
        await prisma.notification.create({
          data: {
            userId: user.id,
            category: 'Daily Summary',
            message,
            type: 'info',
            percentage: 0,
          },
        });

        sendPushNotification(user.id, {
          title: '📅 Daily Spending Summary',
          body: message,
        }).catch(err => console.error('[PushService] Cron push trigger error:', err));
      }
    }
    console.log('[Cron] Daily spend notifications sent');
  } catch (error) {
    console.error('[Cron] Daily notification error:', error.message);
  }
});

console.log('[Cron] Recurring expense scheduler started');
