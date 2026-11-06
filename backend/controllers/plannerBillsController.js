const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const { handleError } = require('../utils/http');
const { todayInTimezone, addMonthsClamped, DAY_MS } = require('../utils/recurrence');
const calc = require('../utils/plannerCalculations');
const schedule = require('../utils/billSchedule');
const planner = require('../services/plannerService');

const { toPaise, toApiAmount, sumPaise } = calc;

const UPCOMING_DAYS = 30;
const dayKey = (date) => date.toISOString().slice(0, 10);
const minPaise = (a, b) => (a < b ? a : b);
const positive = (v) => (v > 0n ? v : 0n);

/**
 * Finds the History transaction behind each bill date. Auto-created copies carry the template's
 * title and category, so that is tried first; a template renamed or recategorised later still
 * matches its past copies by day, amount and payment method. Each transaction backs one date only.
 */
const matchRecorded = (dates, rows) => {
  const used = new Set();
  const take = (row) => { used.add(row.id); return row; };
  const found = new Map();
  dates.forEach((d) => {
    const own = d.template.id && schedule.sameDay(d.date, d.template.expenseDate) ? rows.find(r => r.id === d.template.id) : null;
    if (own) found.set(d.key, take(own));
  });
  dates.forEach((d) => {
    if (found.has(d.key)) return;
    const exact = rows.find(r => !used.has(r.id) && r.isAutoCreated && r.title === d.template.title
      && r.category === d.template.category && schedule.sameDay(r.expenseDate, d.date));
    if (exact) found.set(d.key, take(exact));
  });
  dates.forEach((d) => {
    if (found.has(d.key)) return;
    const loose = rows.find(r => !used.has(r.id) && r.isAutoCreated && schedule.sameDay(r.expenseDate, d.date)
      && toPaise(r.amount) === toPaise(d.template.amount) && r.paymentMethod === d.template.paymentMethod);
    if (loose) found.set(d.key, take(loose));
  });
  return found;
};

/**
 * One EMI's position in a month, using the EMI tracker's own rules so the planner never disagrees
 * with Loans & EMIs:
 * - FIXED: installment k is due k months after the start and is settled once the tracker counts it
 *   paid (paidInstallments >= k), in whichever month the payment was made. Money paid this month
 *   for another installment is shown but settles that installment's month, not this one.
 * - FLEXIBLE with an EMI amount: due monthly on its due day (nextDueDate, else a month after the
 *   start); this month's payments settle this month's amount.
 * - FLEXIBLE without an amount: only its nextDueDate month, settled by whatever was paid.
 */
const emiForMonth = (emi, range, today, viewingCurrentMonth) => {
  const paid = sumPaise(emi.payments.map(p => p.amount));
  const expected = emi.emiAmount === null ? null : toPaise(emi.emiAmount);

  if (emi.type === 'FIXED') {
    const installment = schedule.fixedInstallmentInRange(emi, range);
    if (!installment) {
      return paid > 0n ? { dueDate: null, expected: null, paid, settled: 0n, pending: 0n, status: 'PAID', payable: false } : null;
    }
    const isPaid = emi.paidInstallments >= installment.index;
    return {
      dueDate: installment.dueDate,
      expected,
      paid,
      settled: isPaid ? expected : 0n,
      pending: isPaid ? 0n : expected,
      status: isPaid ? 'PAID' : schedule.dueStatus(installment.dueDate, today),
      // The tracker always pays the next unpaid installment, so only that row offers to pay.
      payable: emi.active && installment.index === emi.paidInstallments + 1,
    };
  }

  const anchor = emi.nextDueDate || addMonthsClamped(emi.startDate, 1);
  const dueDate = expected !== null && emi.active
    ? schedule.monthlyDueInRange(anchor, range)
    : (emi.nextDueDate && emi.nextDueDate >= range.gte && emi.nextDueDate < range.lt ? emi.nextDueDate : null);
  if (!dueDate && paid === 0n) return null;
  let status;
  if (expected === null) status = paid > 0n ? 'PAID' : schedule.dueStatus(dueDate, today);
  else if (paid >= expected) status = 'PAID';
  else if (paid > 0n) status = 'PARTIAL';
  else status = schedule.dueStatus(dueDate, today);
  return {
    dueDate,
    expected: dueDate ? expected : null,
    paid,
    settled: expected === null || !dueDate ? paid : minPaise(paid, expected),
    pending: expected === null || !dueDate ? 0n : positive(expected - paid),
    status,
    // Payments are recorded as of today, so they can only settle the current month.
    payable: emi.active && status !== 'PAID' && viewingCurrentMonth,
  };
};

/**
 * The month's bills, read from what MoneySuivi already holds: active recurring expenses (Recurring
 * Payments) and EMIs (Loans & EMIs). Nothing is created here, so no bill or EMI is ever duplicated.
 */
const buildBills = async (userId, year, month, now = new Date()) => {
  const range = planner.monthRange(year, month);
  const today = todayInTimezone(config.timezone, now);
  const horizon = new Date(today.getTime() + (UPCOMING_DAYS + 1) * DAY_MS);
  const current = planner.monthRange(today.getUTCFullYear(), today.getUTCMonth() + 1);
  const viewingCurrentMonth = range.gte.getTime() === current.gte.getTime();

  const [templates, emis] = await Promise.all([
    prisma.expense.findMany({
      where: { userId, recurring: true, type: 'expense', recurringType: { in: ['weekly', 'monthly'] } },
      select: { id: true, title: true, category: true, amount: true, expenseDate: true, recurringType: true, nextRunDate: true, paymentMethod: true },
      orderBy: { title: 'asc' },
    }),
    prisma.eMI.findMany({
      where: { userId, OR: [{ active: true }, { payments: { some: { paidAt: range } } }] },
      include: { payments: { where: { paidAt: { gte: current.gte, lt: current.lt } }, select: { amount: true } } },
      orderBy: { title: 'asc' },
    }),
  ]);
  // Payments in the viewed month (the include above serves the current month for "upcoming").
  const monthPayments = await prisma.eMIPayment.groupBy({
    by: ['emiId'], where: { emi: { userId }, paidAt: range }, _sum: { amount: true },
  });
  const paidInMonth = new Map(monthPayments.map(p => [p.emiId, p._sum.amount]));

  const dates = [];
  templates.forEach((t) => {
    schedule.occurrencesInRange(t.expenseDate, t.recurringType, range).forEach((date) => {
      dates.push({ key: `${t.id}:${dayKey(date)}`, template: t, date });
    });
  });
  const recordedRows = dates.length ? await prisma.expense.findMany({
    where: { userId, type: 'expense', expenseDate: range, OR: [{ id: { in: templates.map(t => t.id) } }, { isAutoCreated: true }] },
    select: { id: true, title: true, category: true, amount: true, expenseDate: true, paymentMethod: true, isAutoCreated: true },
  }) : [];
  const recorded = matchRecorded(dates, recordedRows);

  const bills = dates.map(({ key, template: t, date }) => {
    const row = recorded.get(key);
    return {
      id: key,
      templateId: t.id,
      title: t.title,
      category: t.category,
      recurringType: t.recurringType,
      paymentMethod: t.paymentMethod,
      dueDate: date,
      amountPaise: toPaise(row ? row.amount : t.amount),
      status: schedule.billStatus({ date, nextRunDate: t.nextRunDate, recorded: row, today }),
      transactionId: row?.id ?? null,
    };
  }).sort((a, b) => a.dueDate - b.dueDate);

  const emiRows = emis.map((emi) => {
    const view = emiForMonth({ ...emi, payments: [{ amount: paidInMonth.get(emi.id) || 0 }] }, range, today, viewingCurrentMonth);
    if (!view) return null;
    return {
      id: emi.id,
      title: emi.title,
      type: emi.type,
      active: emi.active,
      nextDueDate: emi.nextDueDate,
      remainingInstallments: emi.type === 'FIXED' && emi.totalInstallments ? Math.max(emi.totalInstallments - emi.paidInstallments, 0) : null,
      ...view,
    };
  }).filter(Boolean).sort((a, b) => (a.dueDate || horizon) - (b.dueDate || horizon));

  // Next 30 days from today, whatever month is viewed, plus EMIs already overdue.
  const upcomingEmis = emis.filter(e => e.active).map((e) => {
    if (e.type === 'FIXED') {
      return e.nextDueDate ? { emi: e, dueDate: e.nextDueDate, status: schedule.dueStatus(e.nextDueDate, today) } : null;
    }
    const view = emiForMonth(e, current, today, true);
    if (view && view.dueDate && view.status !== 'PAID') return { emi: e, dueDate: view.dueDate, status: view.status };
    if (e.emiAmount === null) return null;
    const next = schedule.monthlyDueInRange(e.nextDueDate || addMonthsClamped(e.startDate, 1),
      planner.monthRange(current.lt.getUTCFullYear(), current.lt.getUTCMonth() + 1));
    return next ? { emi: e, dueDate: next, status: schedule.dueStatus(next, today) } : null;
  }).filter(u => u && u.dueDate < horizon);

  const upcoming = [
    ...templates.filter(t => t.nextRunDate && t.nextRunDate < horizon).map(t => ({
      id: `bill:${t.id}`, source: 'BILL', title: t.title, dueDate: t.nextRunDate, amountPaise: toPaise(t.amount),
      status: t.nextRunDate <= today ? 'DUE' : 'SCHEDULED',
    })),
    ...upcomingEmis.map(({ emi, dueDate, status }) => ({
      id: `emi:${emi.id}`, source: 'EMI', title: emi.title, dueDate, status,
      amountPaise: emi.emiAmount === null ? null : toPaise(emi.emiAmount),
    })),
  ].sort((a, b) => a.dueDate - b.dueDate);

  const unpaidBills = bills.filter(b => b.status !== 'RECORDED');
  const money = (value) => (value === null ? null : toApiAmount(value));
  return {
    year,
    month,
    bills: bills.map(({ amountPaise, ...b }) => ({ ...b, amount: money(amountPaise) })),
    emis: emiRows.map(({ expected, paid, settled, pending, ...e }) => ({ ...e, expectedAmount: money(expected), paidThisMonth: money(paid) })),
    upcoming: upcoming.map(({ amountPaise, ...u }) => ({ ...u, amount: money(amountPaise) })),
    summary: {
      expected: toApiAmount(sumPaise([...bills.map(b => b.amountPaise), ...emiRows.map(e => e.expected ?? 0n)])),
      settled: toApiAmount(sumPaise([...bills.filter(b => b.status === 'RECORDED').map(b => b.amountPaise), ...emiRows.map(e => e.settled)])),
      // Added up item by item, so one EMI paid ahead can't hide another bill that is still unpaid.
      pending: toApiAmount(sumPaise([...unpaidBills.map(b => b.amountPaise), ...emiRows.map(e => e.pending)])),
      overdueCount: emiRows.filter(e => e.status === 'OVERDUE').length + unpaidBills.filter(b => b.dueDate < today).length,
      notFoundCount: bills.filter(b => b.status === 'NOT_FOUND').length,
    },
  };
};

const getBills = async (req, res) => {
  try {
    const period = req.query.year ? { year: req.query.year, month: req.query.month } : planner.currentPeriod();
    res.json({ success: true, ...(await buildBills(req.user.id, period.year, period.month)) });
  } catch (error) {
    handleError(res, error, 'planner.getBills');
  }
};

module.exports = { buildBills, getBills };
