// Pure date logic for the planner's bills view. Dates are UTC-midnight calendar days, the way
// transaction and due dates are stored; `range` is { gte, lt } for one calendar month.
const { addMonthsClamped, occurrence, DAY_MS } = require('./recurrence');

const WEEK_MS = 7 * DAY_MS;
const monthsBetween = (from, to) => (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + (to.getUTCMonth() - from.getUTCMonth());
const sameDay = (a, b) => a.getTime() === b.getTime();
const MAX_OCCURRENCES = 6; // a weekly bill has at most 5 dates in a month

/** Every date a recurring template falls on within the range, using the scheduler's own rules. */
const occurrencesInRange = (anchor, type, range) => {
  const start = new Date(anchor);
  const first = type === 'monthly'
    ? Math.max(monthsBetween(start, range.gte) - 1, 0)
    : Math.max(Math.floor((range.gte - start) / WEEK_MS) - 1, 0);
  const dates = [];
  for (let i = first; dates.length < MAX_OCCURRENCES; i += 1) {
    const date = occurrence(start, type, i);
    if (date >= range.lt) break;
    if (date >= range.gte) dates.push(date);
  }
  return dates;
};

/**
 * Status of one recurring-bill date. A matching transaction in History settles it, whatever the
 * schedule says. Otherwise: the scheduler records an occurrence and moves nextRunDate past it in one
 * step, so a date before nextRunDate without a transaction was deleted or edited in History.
 */
const billStatus = ({ date, nextRunDate, recorded, today }) => {
  if (recorded) return 'RECORDED';
  if (nextRunDate && date < nextRunDate) return 'NOT_FOUND';
  return date <= today ? 'DUE' : 'SCHEDULED';
};

/** The due date in the range for something due monthly on the anchor's day, from the anchor's month on. */
const monthlyDueInRange = (anchor, range) => {
  const start = new Date(anchor);
  const k = monthsBetween(start, range.gte);
  if (k < 0) return null;
  const date = addMonthsClamped(start, k);
  return date >= range.gte && date < range.lt ? date : null;
};

/**
 * Which installment of a fixed EMI falls due in the range. Installment k is due k months after the
 * start date (the EMI tracker's rule), so it exists only for 1 <= k <= totalInstallments.
 */
const fixedInstallmentInRange = (emi, range) => {
  const start = new Date(emi.startDate);
  const k = monthsBetween(start, range.gte);
  if (k < 1 || (emi.totalInstallments && k > emi.totalInstallments)) return null;
  const dueDate = addMonthsClamped(start, k);
  return dueDate >= range.gte && dueDate < range.lt ? { index: k, dueDate } : null;
};

const dueStatus = (dueDate, today) => {
  if (!dueDate) return 'NO_DATE';
  if (dueDate < today) return 'OVERDUE';
  return sameDay(dueDate, today) ? 'DUE_TODAY' : 'UPCOMING';
};

module.exports = { occurrencesInRange, billStatus, monthlyDueInRange, fixedInstallmentInRange, dueStatus, sameDay, monthsBetween };
