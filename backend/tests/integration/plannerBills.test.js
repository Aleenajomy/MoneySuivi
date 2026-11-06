const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');
const { config } = require('../../config/env');
const { todayInTimezone, addMonthsClamped, DAY_MS } = require('../../utils/recurrence');
const { processRecurring, checkUpcomingBills } = require('../../services/cronJob');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const today = todayInTimezone(config.timezone);
const day = (date) => date.toISOString().slice(0, 10);
const period = (date) => ({ year: date.getUTCFullYear(), month: date.getUTCMonth() + 1 });
const monthStart = (offset) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, 1));
const onDay = (offset, d) => new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + offset, d));
const q = (date) => `year=${period(date).year}&month=${period(date).month}`;

const bills = async (user, date) => {
  const res = await request(app).get(`/api/planner/bills?${q(date)}`).set(auth(user));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return res.body;
};
const addTx = async (user, body) => {
  const res = await request(app).post('/api/expenses').set(auth(user))
    .send({ category: 'Bills', accountType: 'UPI', paymentMethod: 'UPI', type: 'expense', ...body });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.expense;
};
const addEmi = async (user, body) => {
  const res = await request(app).post('/api/emis').set(auth(user)).send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.emi;
};
const payEmi = (user, id, body = {}) => request(app).patch(`/api/emis/${id}/pay`).set(auth(user)).send(body);

test('recurring bills: recorded months, a deleted occurrence, and future dates', async () => {
  const user = await createUser();
  const rent = await addTx(user, { title: 'Rent', amount: 15000, expenseDate: day(onDay(-3, 10)), recurring: true, recurringType: 'monthly' });
  await processRecurring(new Date());

  const last = await bills(user, monthStart(-1));
  assert.equal(last.bills.length, 1);
  const [lastRent] = last.bills;
  assert.deepEqual([lastRent.title, lastRent.amount, lastRent.status, day(new Date(lastRent.dueDate))], ['Rent', 15000, 'RECORDED', day(onDay(-1, 10))]);
  assert.ok(lastRent.transactionId);
  assert.deepEqual([last.summary.expected, last.summary.settled, last.summary.pending], [15000, 15000, 0]);

  // The very first payment is the template row itself.
  assert.equal((await bills(user, monthStart(-3))).bills[0].transactionId, rent.id);

  // Deleting the recorded payment in History shows the gap instead of hiding it.
  await request(app).delete(`/api/expenses/${lastRent.transactionId}`).set(auth(user));
  const gap = await bills(user, monthStart(-1));
  assert.equal(gap.bills[0].status, 'NOT_FOUND');
  assert.equal(gap.summary.settled, 0);
  assert.equal(gap.summary.notFoundCount, 1);

  const before = await prisma.expense.count({ where: { userId: user.id } });
  const future = await bills(user, monthStart(2));
  assert.deepEqual(future.bills.map(b => [b.status, day(new Date(b.dueDate))]), [['SCHEDULED', day(onDay(2, 10))]]);
  // Reading bills never creates anything.
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), before);
});

test('weekly bills list every date; stopped, income and transfer schedules are not bills', async () => {
  const user = await createUser();
  await addTx(user, { title: 'Milk', amount: 210.5, category: 'Food', expenseDate: day(onDay(-3, 1)), recurring: true, recurringType: 'weekly' });
  const stopped = await addTx(user, { title: 'Old gym', amount: 999, expenseDate: day(onDay(-3, 2)), recurring: true, recurringType: 'monthly' });
  await request(app).put(`/api/expenses/${stopped.id}`).set(auth(user)).send({ recurring: false });
  await addTx(user, { title: 'Salary', amount: 50000, type: 'income', category: 'Salary', expenseDate: day(onDay(-3, 1)), recurring: true, recurringType: 'monthly' });
  await processRecurring(new Date());

  const last = await bills(user, monthStart(-1));
  assert.ok(last.bills.length >= 4 && last.bills.length <= 5);
  assert.ok(last.bills.every(b => b.title === 'Milk' && b.status === 'RECORDED' && b.amount === 210.5));
  assert.equal(last.summary.expected, Math.round(210.5 * last.bills.length * 100) / 100);
});

test('fixed EMI: the month\'s installment is paid once the tracker counts it, early payments included', async () => {
  const user = await createUser();
  const emi = await addEmi(user, { title: 'Phone', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: day(onDay(-2, 5)) });

  // Installment 1 was due last month; installment 2 is due this month.
  let lastMonth = await bills(user, monthStart(-1));
  assert.equal(lastMonth.emis[0].status, 'OVERDUE');
  let thisMonth = await bills(user, monthStart(0));
  const due = onDay(0, 5);
  const expected = due < today ? 'OVERDUE' : due.getTime() === today.getTime() ? 'DUE_TODAY' : 'UPCOMING';
  assert.deepEqual([thisMonth.emis[0].status, thisMonth.emis[0].expectedAmount, day(new Date(thisMonth.emis[0].dueDate))], [expected, 2000, day(due)]);

  assert.equal((await payEmi(user, emi.id, { paidAt: day(today) })).status, 200);
  lastMonth = await bills(user, monthStart(-1));
  assert.equal(lastMonth.emis[0].status, 'PAID');
  thisMonth = await bills(user, monthStart(0));
  assert.equal(thisMonth.emis[0].status, expected);
  assert.equal(thisMonth.emis[0].paidThisMonth, 2000);

  assert.equal((await payEmi(user, emi.id, { paidAt: day(today) })).status, 200);
  thisMonth = await bills(user, monthStart(0));
  assert.equal(thisMonth.emis[0].status, 'PAID');
  assert.equal(thisMonth.emis[0].remainingInstallments, 10);
  // No new EMI records: the planner only reads the tracker.
  assert.equal(await prisma.eMI.count({ where: { userId: user.id } }), 1);
  assert.equal(await prisma.eMIPayment.count(), 2);
});

test('flexible EMI: partial and full payment in the month; an EMI with nothing due this month is not listed', async () => {
  const user = await createUser();
  const due = onDay(0, 25);
  const flex = await addEmi(user, { title: 'Family loan', type: 'FLEXIBLE', totalAmount: 50000, emiAmount: 2000, startDate: day(onDay(-1, 25)), nextDueDate: day(due) });
  await addEmi(user, { title: 'Later', type: 'FIXED', totalAmount: 1000, emiAmount: 100, totalInstallments: 10, startDate: day(onDay(1, 5)) });

  let month = await bills(user, monthStart(0));
  assert.deepEqual(month.emis.map(e => e.title), ['Family loan']);
  await payEmi(user, flex.id, { amount: 500, paidAt: day(today) });
  month = await bills(user, monthStart(0));
  assert.deepEqual([month.emis[0].status, month.emis[0].paidThisMonth], ['PARTIAL', 500]);
  await payEmi(user, flex.id, { amount: 1500, paidAt: day(today) });
  month = await bills(user, monthStart(0));
  assert.equal(month.emis[0].status, 'PAID');
  assert.equal(month.summary.settled, 2000);
});

test('upcoming lists the next 30 days across bills and EMIs, soonest first', async () => {
  const user = await createUser();
  const soon = new Date(today.getTime() + 3 * DAY_MS);
  await addTx(user, { title: 'Internet', amount: 799, expenseDate: day(addMonthsClamped(soon, -1)), recurring: true, recurringType: 'monthly' });
  await addEmi(user, { title: 'Bike', type: 'FLEXIBLE', totalAmount: 30000, emiAmount: 1500, startDate: day(onDay(-1, 1)), nextDueDate: day(new Date(today.getTime() + DAY_MS)) });
  await addEmi(user, { title: 'Far away', type: 'FLEXIBLE', totalAmount: 30000, emiAmount: 1500, startDate: day(onDay(-1, 1)), nextDueDate: day(new Date(today.getTime() + 60 * DAY_MS)) });

  const { upcoming } = await bills(user, monthStart(0));
  assert.deepEqual(upcoming.map(u => [u.source, u.title, u.amount]), [['EMI', 'Bike', 1500], ['BILL', 'Internet', 799]]);
});

test('bills and EMIs are only ever the signed-in user\'s', async () => {
  const user = await createUser();
  const other = await createUser();
  await addTx(other, { title: 'Their rent', amount: 9000, expenseDate: day(onDay(-1, 3)), recurring: true, recurringType: 'monthly' });
  await addEmi(other, { title: 'Their EMI', type: 'FIXED', totalAmount: 1200, emiAmount: 100, totalInstallments: 12, startDate: day(onDay(-1, 3)) });
  const mine = await bills(user, monthStart(0));
  assert.deepEqual([mine.bills, mine.emis, mine.upcoming], [[], [], []]);
  assert.equal((await request(app).get('/api/planner/bills')).status, 401);
  assert.equal((await request(app).get('/api/planner/bills?year=2026').set(auth(user))).status, 400);
});

test('a bill due tomorrow gets one reminder, however many times the job runs', async () => {
  const user = await createUser();
  const tomorrow = new Date(today.getTime() + DAY_MS);
  await addTx(user, { title: 'Rent', amount: 15000, expenseDate: day(addMonthsClamped(tomorrow, -1)), recurring: true, recurringType: 'monthly' });
  await addTx(user, { title: 'Later bill', amount: 100, expenseDate: day(addMonthsClamped(new Date(today.getTime() + 5 * DAY_MS), -1)), recurring: true, recurringType: 'monthly' });

  const first = await checkUpcomingBills();
  const second = await checkUpcomingBills();
  assert.deepEqual([first.due, first.sent, second.sent], [1, 1, 0]);
  const notes = await prisma.notification.findMany({ where: { userId: user.id, category: 'Bill Reminder' } });
  assert.equal(notes.length, 1);
  assert.match(notes[0].message, /^Rent \(₹15,000\) will be added tomorrow from UPI\.$/);
});

// ---------------------------------------------------------------- follow-ups from the Phase 6 review

test('editing or renaming a recurring bill keeps its past payments recorded', async () => {
  const user = await createUser();
  const rent = await addTx(user, { title: 'Rent', amount: 15000, expenseDate: day(onDay(-3, 10)), recurring: true, recurringType: 'monthly' });
  await processRecurring(new Date());
  // Simulate the schedule pointer being moved back (what an edit did before the recurring-edit fix).
  await prisma.expense.update({ where: { id: rent.id }, data: { nextRunDate: onDay(-2, 10), title: 'House rent', category: 'Housing' } });

  const last = await bills(user, monthStart(-1));
  assert.deepEqual(last.bills.map(b => [b.title, b.status]), [['House rent', 'RECORDED']]);
  assert.equal(last.summary.pending, 0);
  assert.equal(last.summary.overdueCount, 0);
});

test('a fixed installment paid late settles its own month, not the month it was paid in', async () => {
  const user = await createUser();
  const emi = await addEmi(user, { title: 'Phone', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: day(onDay(-2, 5)) });
  // First paid last month, so this month's water bill is still to come.
  await addTx(user, { title: 'Water', amount: 300, expenseDate: day(onDay(-1, 28)), recurring: true, recurringType: 'monthly' });
  await payEmi(user, emi.id, { paidAt: day(today) }); // pays last month's installment, this month

  const last = await bills(user, monthStart(-1));
  assert.deepEqual([last.emis[0].status, last.summary.settled, last.summary.pending], ['PAID', 2300, 0]);
  const thisMonth = await bills(user, monthStart(0));
  assert.equal(thisMonth.emis[0].paidThisMonth, 2000);
  assert.notEqual(thisMonth.emis[0].status, 'PAID');
  // This month's installment and the water bill are both still to pay; the late payment hides neither.
  assert.equal(thisMonth.summary.settled, 0);
  assert.equal(thisMonth.summary.pending, 2300);
});

test('only the installment the tracker will pay next offers "pay"; flexible ones only in the current month', async () => {
  const user = await createUser();
  await addEmi(user, { title: 'Phone', type: 'FIXED', totalAmount: 24000, emiAmount: 2000, totalInstallments: 12, startDate: day(onDay(-3, 5)) });
  await addEmi(user, { title: 'Family loan', type: 'FLEXIBLE', totalAmount: 50000, emiAmount: 2000, startDate: day(onDay(-1, 20)), nextDueDate: day(onDay(0, 20)) });

  const payable = async (offset) => Object.fromEntries((await bills(user, monthStart(offset))).emis.map(e => [e.title, e.payable]));
  assert.deepEqual(await payable(-2), { Phone: true });
  assert.deepEqual(await payable(-1), { Phone: false });
  assert.deepEqual(await payable(0), { Phone: false, 'Family loan': true });
  assert.deepEqual(await payable(1), { Phone: false, 'Family loan': false });
});

test('a flexible EMI with an amount is due every month and doesn\'t stay overdue once paid', async () => {
  const user = await createUser();
  const flex = await addEmi(user, { title: 'Family loan', type: 'FLEXIBLE', totalAmount: 50000, emiAmount: 2000, startDate: day(onDay(-2, 20)), nextDueDate: day(onDay(-1, 20)) });
  await prisma.eMIPayment.create({ data: { emiId: flex.id, amount: 2000, paidAt: onDay(-1, 18) } });

  assert.equal((await bills(user, monthStart(-1))).emis[0].status, 'PAID');
  const now = await bills(user, monthStart(0));
  assert.equal(day(new Date(now.emis[0].dueDate)), day(onDay(0, 20)));
  const later = await bills(user, monthStart(2));
  assert.deepEqual([later.emis[0].status, day(new Date(later.emis[0].dueDate))], ['UPCOMING', day(onDay(2, 20))]);
  const due = onDay(0, 20);
  const upcomingFlex = now.upcoming.find(u => u.title === 'Family loan');
  if (due < new Date(today.getTime() + 31 * DAY_MS)) assert.equal(day(new Date(upcomingFlex.dueDate)), day(due));
});

test('identical bills share one reminder, and concurrent runs still send it once', async () => {
  const user = await createUser();
  const tomorrow = new Date(today.getTime() + DAY_MS);
  for (let i = 0; i < 2; i += 1) {
    await addTx(user, { title: 'Milk', amount: 60, category: 'Food', expenseDate: day(addMonthsClamped(tomorrow, -1)), recurring: true, recurringType: 'monthly' });
  }
  const runs = await Promise.all(Array.from({ length: 10 }, () => checkUpcomingBills()));
  assert.equal(runs.reduce((s, r) => s + r.sent, 0), 1);
  const notes = await prisma.notification.findMany({ where: { userId: user.id, category: 'Bill Reminder' } });
  assert.deepEqual(notes.map(n => n.message), ['2 payments of Milk (₹60 each) will be added tomorrow from UPI.']);
});
