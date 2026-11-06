const cron = require('node-cron');
const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const { checkBudgetAlert } = require('./budgetAlertService');
const notificationService = require('./notificationService');
const { nextRunAfter, todayInTimezone, DAY_MS } = require('../utils/recurrence');
const logger = require('../utils/logger');

// Bounds catch-up after long downtime so one bad row cannot generate unbounded transactions.
const MAX_CATCH_UP = 60;

/**
 * Materialises one due occurrence of a recurring template. The conditional update on
 * nextRunDate acts as a compare-and-swap: if two instances (or a retry) race on the same
 * occurrence, only the one whose update matches creates the transaction; the other sees
 * count 0 and its transaction rolls back without creating anything.
 */
const runOccurrence = async (template) => {
  const occurrenceDate = template.nextRunDate;
  const next = nextRunAfter(template.expenseDate, occurrenceDate, template.recurringType);

  return prisma.$transaction(async (tx) => {
    const claimed = await tx.expense.updateMany({
      where: { id: template.id, recurring: true, nextRunDate: occurrenceDate },
      data: { nextRunDate: next },
    });
    if (claimed.count !== 1) return null;

    const created = await tx.expense.create({
      data: {
        userId: template.userId,
        title: template.title,
        amount: template.amount,
        category: template.category,
        type: template.type,
        accountType: template.accountType,
        fromAccountType: template.fromAccountType,
        toAccountType: template.toAccountType,
        paymentMethod: template.paymentMethod,
        note: template.note,
        expenseDate: occurrenceDate,
        recurring: false,
        isAutoCreated: true,
      },
    });
    return { created, next };
  });
};

const processRecurring = async (now = new Date()) => {
  const dueBefore = new Date(todayInTimezone(config.timezone, now).getTime() + DAY_MS);
  const stats = { templates: 0, created: 0, failed: 0 };

  const due = await prisma.expense.findMany({
    where: { recurring: true, recurringType: { in: ['weekly', 'monthly'] }, nextRunDate: { lt: dueBefore } },
  });
  stats.templates = due.length;

  for (const template of due) {
    let current = template;
    try {
      for (let i = 0; i < MAX_CATCH_UP && current.nextRunDate < dueBefore; i++) {
        const result = await runOccurrence(current);
        if (!result) break;
        stats.created += 1;
        current = { ...current, nextRunDate: result.next };

        if (template.type === 'expense') await checkBudgetAlert(template.userId, template.category);
        notificationService.sendToUser(template.userId, {
          title: '🔄 Recurring Transaction',
          body: `Your scheduled transaction for ${template.title} (₹${template.amount}) has been processed.`,
          category: 'Recurring',
          type: 'info',
          data: { url: '/history' },
          saveInApp: true,
        }).catch(err => logger.error('[Cron] Recurring notification failed', { error: err.message }));
      }
    } catch (error) {
      stats.failed += 1;
      logger.error('[Cron] Recurring occurrence failed', { expenseId: template.id, error: error.message });
    }
  }
  return stats;
};

const checkDueEMIs = async (now = new Date()) => {
  const today = todayInTimezone(config.timezone, now);
  const threeDaysLater = new Date(today.getTime() + 4 * DAY_MS - 1);

  const upcomingEMIs = await prisma.eMI.findMany({
    where: { active: true, nextDueDate: { gte: today, lte: threeDaysLater } },
  });

  for (const emi of upcomingEMIs) {
    const amountStr = emi.emiAmount ? ` (₹${Math.round(emi.emiAmount)})` : '';
    await notificationService.sendToUser(emi.userId, {
      title: '💳 EMI Reminder',
      body: `Your EMI payment for ${emi.title}${amountStr} is due soon.`,
      category: 'EMI',
      type: 'warning',
      data: { url: '/emis', emiId: emi.id },
      saveInApp: true,
    }).catch(err => logger.error('[Cron] EMI reminder failed', { error: err.message }));
  }
  return { reminders: upcomingEMIs.length };
};

const BILL_REMINDER_CATEGORY = 'Bill Reminder';
const REMINDER_DEDUP_MS = 20 * 60 * 60 * 1000;

/**
 * A heads-up the day before a recurring bill is added automatically, so the account it is paid from
 * can be topped up. Identical bills (same title, amount and account) share one reminder. Each one is
 * sent at most once a day, even when the job runs twice or on two instances: the check and the
 * in-app record happen inside one transaction holding a lock on that reminder.
 */
const checkUpcomingBills = async (now = new Date()) => {
  const tomorrow = new Date(todayInTimezone(config.timezone, now).getTime() + DAY_MS);
  const due = await prisma.expense.findMany({
    where: { recurring: true, type: 'expense', recurringType: { in: ['weekly', 'monthly'] }, nextRunDate: { gte: tomorrow, lt: new Date(tomorrow.getTime() + DAY_MS) } },
    select: { userId: true, title: true, amount: true, paymentMethod: true },
  });
  const groups = new Map();
  due.forEach((bill) => {
    const key = `${bill.userId}\u0000${bill.title}\u0000${bill.amount}\u0000${bill.paymentMethod || ''}`;
    groups.set(key, { ...bill, count: (groups.get(key)?.count || 0) + 1 });
  });

  let sent = 0;
  for (const bill of groups.values()) {
    const amount = `₹${Number(bill.amount).toLocaleString('en-IN')}`;
    const what = bill.count > 1 ? `${bill.count} payments of ${bill.title} (${amount} each)` : `${bill.title} (${amount})`;
    const body = `${what} will be added tomorrow${bill.paymentMethod ? ` from ${bill.paymentMethod}` : ''}.`;
    try {
      const created = await prisma.$transaction(async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`bill-reminder:${bill.userId}:${body}`}))`;
        const already = await tx.notification.findFirst({
          where: { userId: bill.userId, category: BILL_REMINDER_CATEGORY, message: body, createdAt: { gte: new Date(now.getTime() - REMINDER_DEDUP_MS) } },
          select: { id: true },
        });
        if (already) return null;
        return tx.notification.create({ data: { userId: bill.userId, category: BILL_REMINDER_CATEGORY, message: body, type: 'info' } });
      });
      if (!created) continue;
      sent += 1;
      // The in-app record is already saved above; this only delivers the push.
      notificationService.sendToUser(bill.userId, {
        title: '🧾 Bill tomorrow', body, category: BILL_REMINDER_CATEGORY, type: 'info', data: { url: '/planner?tab=bills' }, saveInApp: false,
      }).catch(err => logger.error('[Cron] Bill reminder push failed', { error: err.message }));
    } catch (error) {
      logger.error('[Cron] Bill reminder failed', { error: error.message });
    }
  }
  return { due: due.length, sent };
};

const sendDailySummaries = async (now = new Date()) => {
  // Expense dates are stored as UTC midnight of the calendar day, so "today" is that one day.
  const today = todayInTimezone(config.timezone, now);
  const tomorrow = new Date(today.getTime() + DAY_MS);

  const totals = await prisma.expense.groupBy({
    by: ['userId'],
    where: { type: 'expense', expenseDate: { gte: today, lt: tomorrow } },
    _sum: { amount: true },
  });
  const spentByUser = new Map(totals.map(t => [t.userId, t._sum.amount || 0]));
  const users = await prisma.user.findMany({ select: { id: true } });

  for (const user of users) {
    const total = spentByUser.get(user.id) || 0;
    await notificationService.sendToUser(user.id, {
      title: '📅 Daily Spending Summary',
      body: `You spent ₹${total.toFixed(0)} today across all categories.`,
      category: 'Daily Summary',
      type: 'info',
      data: { url: '/' },
      saveInApp: true,
    }).catch(err => logger.error('[Cron] Daily summary failed', { error: err.message }));
  }
  return { users: users.length };
};

// Every run logs start, outcome and duration so a silently failing job shows up in Render logs.
const tracked = (name, fn) => async () => {
  const started = Date.now();
  try {
    const result = await fn();
    logger.info(`[Cron] ${name} completed`, { durationMs: Date.now() - started, ...result });
  } catch (error) {
    logger.error(`[Cron] ${name} failed`, { durationMs: Date.now() - started, error: error.message });
  }
};

const tasks = [];
const start = () => {
  const options = { timezone: config.timezone };
  tasks.push(cron.schedule('0 0 * * *', async () => {
    await tracked('recurring', processRecurring)();
    await tracked('emi-reminders', checkDueEMIs)();
    await tracked('bill-reminders', checkUpcomingBills)();
  }, options));
  tasks.push(cron.schedule('0 21 * * *', tracked('daily-summary', sendDailySummaries), options));
  logger.info(`[Cron] Scheduler started (timezone ${config.timezone})`);
};

const stop = () => tasks.splice(0).forEach(t => t.stop());

module.exports = { processRecurring, checkDueEMIs, checkUpcomingBills, sendDailySummaries, runOccurrence, start, stop };
