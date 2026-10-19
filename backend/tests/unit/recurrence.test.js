const test = require('node:test');
const assert = require('node:assert/strict');
const { addMonthsClamped, firstRunDate, nextRunAfter, todayInTimezone } = require('../../utils/recurrence');

const d = (s) => new Date(`${s}T00:00:00.000Z`);
const iso = (date) => date.toISOString().slice(0, 10);

test('monthly recurrence clamps to month end instead of overflowing', () => {
  assert.equal(iso(addMonthsClamped(d('2026-01-31'), 1)), '2026-02-28');
  assert.equal(iso(addMonthsClamped(d('2028-01-31'), 1)), '2028-02-29');
  assert.equal(iso(addMonthsClamped(d('2026-03-31'), 1)), '2026-04-30');
  assert.equal(iso(addMonthsClamped(d('2026-12-15'), 1)), '2027-01-15');
  assert.equal(iso(addMonthsClamped(d('2026-11-30'), 3)), '2027-02-28');
});

test('monthly schedule keeps the anchor day after a short month (no drift to the 28th)', () => {
  const anchor = d('2026-01-31');
  const feb = firstRunDate(anchor, 'monthly');
  assert.equal(iso(feb), '2026-02-28');
  const mar = nextRunAfter(anchor, feb, 'monthly');
  assert.equal(iso(mar), '2026-03-31');
  assert.equal(iso(nextRunAfter(anchor, mar, 'monthly')), '2026-04-30');
});

test('weekly schedule advances seven days at a time', () => {
  const anchor = d('2026-10-01');
  assert.equal(iso(firstRunDate(anchor, 'weekly')), '2026-10-08');
  assert.equal(iso(nextRunAfter(anchor, d('2026-10-08'), 'weekly')), '2026-10-15');
});

test('nextRunAfter always moves forward, even from an off-schedule legacy date', () => {
  // Legacy rows were advanced with setMonth, which turned Jan 31 into Mar 3.
  const next = nextRunAfter(d('2026-01-31'), d('2026-03-03'), 'monthly');
  assert.ok(next > d('2026-03-03'));
  assert.equal(iso(next), '2026-04-30');
});

test('todayInTimezone uses the IST calendar date, not the UTC one', () => {
  // 20:00 UTC on Oct 18 is already 01:30 on Oct 19 in India.
  assert.equal(iso(todayInTimezone('Asia/Kolkata', new Date('2026-10-18T20:00:00Z'))), '2026-10-19');
  assert.equal(iso(todayInTimezone('Asia/Kolkata', new Date('2026-10-18T18:00:00Z'))), '2026-10-18');
});
