const DAY_MS = 24 * 60 * 60 * 1000;

const daysInMonthUTC = (year, month) => new Date(Date.UTC(year, month + 1, 0)).getUTCDate();

// Adds months without overflowing: Jan 31 + 1 month is Feb 28/29, never Mar 3.
const addMonthsClamped = (date, months) => {
  const d = new Date(date);
  const targetMonth = d.getUTCMonth() + months;
  const year = d.getUTCFullYear() + Math.floor(targetMonth / 12);
  const month = ((targetMonth % 12) + 12) % 12;
  const day = Math.min(d.getUTCDate(), daysInMonthUTC(year, month));
  return new Date(Date.UTC(year, month, day, d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds(), d.getUTCMilliseconds()));
};

const occurrence = (anchor, type, index) => (type === 'monthly'
  ? addMonthsClamped(anchor, index)
  : new Date(new Date(anchor).getTime() + index * 7 * DAY_MS));

const firstRunDate = (anchor, type) => occurrence(anchor, type, 1);

/**
 * The occurrence after `current`, always computed from the original anchor date so that
 * month-end clamping (Jan 31 -> Feb 28) does not drift later runs to the 28th.
 */
const nextRunAfter = (anchor, current, type) => {
  const a = new Date(anchor);
  const c = new Date(current);
  let index;
  if (type === 'monthly') {
    index = (c.getUTCFullYear() - a.getUTCFullYear()) * 12 + (c.getUTCMonth() - a.getUTCMonth());
  } else {
    index = Math.round((c - a) / (7 * DAY_MS));
  }
  let i = Math.max(index, 0) + 1;
  let next = occurrence(a, type, i);
  // Legacy rows may hold dates that don't sit on the anchor's schedule; always move forward.
  while (next <= c) next = occurrence(a, type, ++i);
  return next;
};

// Calendar date "today" in the app timezone, as UTC midnight (how date-only values are stored).
const todayInTimezone = (timezone, now = new Date()) => {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  return new Date(`${ymd}T00:00:00.000Z`);
};

module.exports = { addMonthsClamped, firstRunDate, nextRunAfter, todayInTimezone, DAY_MS };
