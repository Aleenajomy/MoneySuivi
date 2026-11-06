const test = require('node:test');
const assert = require('node:assert/strict');
const s = require('../../utils/billSchedule');

const d = (iso) => new Date(`${iso}T00:00:00.000Z`);
const month = (y, m) => ({ gte: new Date(Date.UTC(y, m - 1, 1)), lt: new Date(Date.UTC(y, m, 1)) });
const days = (dates) => dates.map(x => x.toISOString().slice(0, 10));

test('monthly bills fall once a month and month-end anchors clamp like the scheduler', () => {
  assert.deepEqual(days(s.occurrencesInRange(d('2026-01-31'), 'monthly', month(2026, 2))), ['2026-02-28']);
  assert.deepEqual(days(s.occurrencesInRange(d('2026-01-31'), 'monthly', month(2026, 3))), ['2026-03-31']);
  assert.deepEqual(days(s.occurrencesInRange(d('2026-01-31'), 'monthly', month(2026, 1))), ['2026-01-31']);
  assert.deepEqual(days(s.occurrencesInRange(d('2026-05-10'), 'monthly', month(2026, 4))), []);
  assert.deepEqual(days(s.occurrencesInRange(d('2020-03-15'), 'monthly', month(2026, 11))), ['2026-11-15']);
});

test('weekly bills fall on every matching weekday in the month', () => {
  assert.deepEqual(days(s.occurrencesInRange(d('2026-10-26'), 'weekly', month(2026, 11))), ['2026-11-02', '2026-11-09', '2026-11-16', '2026-11-23', '2026-11-30']);
  assert.deepEqual(days(s.occurrencesInRange(d('2026-11-20'), 'weekly', month(2026, 11))), ['2026-11-20', '2026-11-27']);
});

test('bill status follows the scheduler: before nextRunDate it was recorded (or is missing)', () => {
  const today = d('2026-11-06');
  const next = d('2026-11-15');
  assert.equal(s.billStatus({ date: d('2026-11-01'), nextRunDate: next, recorded: { id: 'x' }, today }), 'RECORDED');
  assert.equal(s.billStatus({ date: d('2026-11-01'), nextRunDate: next, recorded: undefined, today }), 'NOT_FOUND');
  assert.equal(s.billStatus({ date: d('2026-11-15'), nextRunDate: next, recorded: undefined, today }), 'SCHEDULED');
  assert.equal(s.billStatus({ date: d('2026-11-06'), nextRunDate: d('2026-11-06'), recorded: undefined, today }), 'DUE');
});

test('fixed EMI installment k is due k months after the start, and only while installments remain', () => {
  const emi = { startDate: d('2026-01-31'), totalInstallments: 3 };
  assert.equal(s.fixedInstallmentInRange(emi, month(2026, 1)), null);
  assert.deepEqual(s.fixedInstallmentInRange(emi, month(2026, 2)), { index: 1, dueDate: d('2026-02-28') });
  assert.deepEqual(s.fixedInstallmentInRange(emi, month(2026, 4)), { index: 3, dueDate: d('2026-04-30') });
  assert.equal(s.fixedInstallmentInRange(emi, month(2026, 5)), null);
});

test('due status compares calendar days', () => {
  const today = d('2026-11-06');
  assert.equal(s.dueStatus(d('2026-11-05'), today), 'OVERDUE');
  assert.equal(s.dueStatus(d('2026-11-06'), today), 'DUE_TODAY');
  assert.equal(s.dueStatus(d('2026-11-07'), today), 'UPCOMING');
  assert.equal(s.dueStatus(null, today), 'NO_DATE');
});

test('a transaction in History settles a bill date whatever the schedule pointer says', () => {
  const today = d('2026-11-06');
  // e.g. the pointer was reset by an edit: the date is "after" it, but the payment is recorded.
  assert.equal(s.billStatus({ date: d('2026-10-05'), nextRunDate: d('2026-06-05'), recorded: { id: 'x' }, today }), 'RECORDED');
  assert.equal(s.billStatus({ date: d('2026-10-05'), nextRunDate: d('2026-06-05'), recorded: undefined, today }), 'DUE');
  assert.equal(s.billStatus({ date: d('2026-11-20'), nextRunDate: null, recorded: undefined, today }), 'SCHEDULED');
});

test('something due monthly on its anchor day falls once a month from the anchor month on', () => {
  assert.equal(s.monthlyDueInRange(d('2026-11-25'), month(2026, 10)), null);
  assert.deepEqual(s.monthlyDueInRange(d('2026-11-25'), month(2026, 11)), d('2026-11-25'));
  assert.deepEqual(s.monthlyDueInRange(d('2026-11-25'), month(2027, 1)), d('2027-01-25'));
  assert.deepEqual(s.monthlyDueInRange(d('2026-01-31'), month(2026, 2)), d('2026-02-28'));
});
