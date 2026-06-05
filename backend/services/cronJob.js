const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { checkBudgetAlert } = require('./budgetAlertService');

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

console.log('[Cron] Recurring expense scheduler started');
