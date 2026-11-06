// Seeds one synthetic user with a large history plus Salary Planner data, then times the planner's
// read endpoints in-process (no network tool needed).
// Usage: TEST_DATABASE_URL=<local *test* db> node loadtest/planner-latency.js [transactions=20000]
// It refuses any database that is not local and named like a test database.
process.env.TEST_DATABASE_URL = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
const { app, request, prisma, createUser, auth } = require('../tests/helpers/setup');
const { currentPeriod } = require('../services/plannerService');

const COUNT = Number(process.argv[2]) || 20000;
const RUNS = 20;
const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];
const now = currentPeriod();
const monthStart = (back) => new Date(Date.UTC(now.year, now.month - 1 - back, 1));

const seed = async () => {
  const user = await createUser({ email: `planner-load-${Date.now()}@example.test` });
  const userId = user.id;
  const span = 24; // months of history
  const rows = Array.from({ length: COUNT }, (_, i) => {
    const back = Math.floor((i / COUNT) * span);
    const day = new Date(monthStart(back).getTime() + ((i * 7) % 27) * 86400000);
    const income = i % 25 === 0;
    return {
      userId, title: income ? 'Salary' : `Item ${i % 300}`, amount: income ? 15000 : 50 + (i % 900),
      category: income ? 'Salary' : (i % 40 === 0 ? 'Investment' : CATEGORIES[i % CATEGORIES.length]),
      type: income ? 'income' : (i % 97 === 0 ? 'transfer' : 'expense'), accountType: 'UPI', paymentMethod: 'UPI', expenseDate: day,
      isAutoCreated: i % 11 === 0,
    };
  });
  for (let i = 0; i < rows.length; i += 5000) await prisma.expense.createMany({ data: rows.slice(i, i + 5000) });
  for (let r = 0; r < 25; r += 1) {
    await prisma.expense.create({ data: {
      userId, title: `Bill ${r}`, amount: 100 + r, category: 'Bills', type: 'expense', accountType: 'UPI', paymentMethod: 'UPI',
      expenseDate: monthStart(12), recurring: true, recurringType: r % 4 ? 'monthly' : 'weekly', nextRunDate: monthStart(-1),
    } });
  }

  const source = await prisma.incomeSource.create({ data: { userId, name: 'Salary', expectedAmount: '15000' } });
  const goals = await Promise.all(Array.from({ length: 10 }, (_, g) => prisma.savingsGoal.create({ data: { userId, name: `Goal ${g}`, targetAmount: '100000', initialAmount: '1000', monthlyContribution: '2000' } })));
  await prisma.savingsContribution.createMany({ data: Array.from({ length: 600 }, (_, c) => ({ goalId: goals[c % 10].id, amount: '250', date: monthStart(c % span) })) });
  const plans = await Promise.all(Array.from({ length: 5 }, (_, k) => prisma.investmentPlan.create({ data: { userId, name: `Fund ${k}`, category: 'MUTUAL_FUND', monthlyPlannedAmount: '1000' } })));
  for (let t = 0; t < 300; t += 1) {
    const e = await prisma.expense.create({ data: { userId, title: `Fund ${t % 5}`, amount: 500, category: 'Investment', type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', expenseDate: monthStart(t % span) } });
    await prisma.investmentTransaction.create({ data: { planId: plans[t % 5].id, amount: '500', date: e.expenseDate, expenseId: e.id } });
  }
  for (let k = 0; k < 6; k += 1) {
    const emi = await prisma.eMI.create({ data: { userId, title: `Loan ${k}`, totalAmount: 120000, emiAmount: 5000, totalInstallments: 24, paidInstallments: 12, paidAmount: 60000, startDate: monthStart(13), nextDueDate: monthStart(-1) } });
    await prisma.eMIPayment.createMany({ data: Array.from({ length: 12 }, (_, m) => ({ emiId: emi.id, amount: 5000, paidAt: monthStart(m + 1) })) });
  }
  for (let back = 0; back < 12; back += 1) {
    const d = monthStart(back);
    const plan = await prisma.budgetPlan.create({ data: { userId, year: d.getUTCFullYear(), month: d.getUTCMonth() + 1 } });
    await prisma.budgetAllocation.createMany({ data: Array.from({ length: 15 }, (_, a) => ({
      planId: plan.id, group: a < 10 ? (a % 2 ? 'FIXED' : 'VARIABLE') : (a < 13 ? 'SAVINGS' : 'INVESTMENT'), name: `Line ${a}`,
      plannedAmount: '700', matchCategories: a < 10 ? [CATEGORIES[a % CATEGORIES.length]] : [],
      savingsGoalId: a >= 10 && a < 13 ? goals[a - 10].id : null, investmentPlanId: a >= 13 ? plans[a - 13].id : null,
    })) });
    await prisma.monthlySalary.create({ data: { userId, incomeSourceId: source.id, label: 'Salary', year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, expectedAmount: '15000' } });
  }
  return user;
};

const percentile = (values, p) => values[Math.min(values.length - 1, Math.ceil((p / 100) * values.length) - 1)];

const time = async (user, path) => {
  const samples = [];
  for (let i = 0; i < RUNS; i += 1) {
    const t = process.hrtime.bigint();
    const res = await request(app).get(path).set(auth(user));
    if (res.status !== 200) throw new Error(`${path} -> ${res.status}`);
    samples.push(Number(process.hrtime.bigint() - t) / 1e6);
  }
  samples.sort((a, b) => a - b);
  const t = process.hrtime.bigint();
  await Promise.all(Array.from({ length: 10 }, () => request(app).get(path).set(auth(user))));
  const burst = Number(process.hrtime.bigint() - t) / 1e6;
  return { p50: percentile(samples, 50), p95: percentile(samples, 95), burst };
};

(async () => {
  const started = Date.now();
  const user = await seed();
  console.log(`Seeded ${COUNT} transactions + planner data in ${((Date.now() - started) / 1000).toFixed(1)}s`);
  const q = `year=${now.year}&month=${now.month}`;
  const endpoints = [
    ['overview', `/api/planner/overview?${q}`],
    ['report (6 months)', `/api/planner/report?${q}`],
    ['report (12 months)', `/api/planner/report?${q}&months=12`],
    ['bills', `/api/planner/bills?${q}`],
    ['spending', `/api/planner/budgets/spending?${q}`],
    ['goals', `/api/planner/goals?${q}`],
    ['investments', `/api/planner/investments?${q}`],
    ['salary history', '/api/planner/salaries/history?months=12'],
  ];
  console.log(`${'endpoint'.padEnd(20)}  p50 ms  p95 ms  10 concurrent ms`);
  for (const [name, path] of endpoints) {
    const { p50, p95, burst } = await time(user, path);
    console.log(`${name.padEnd(20)}  ${p50.toFixed(0).padStart(6)}  ${p95.toFixed(0).padStart(6)}  ${burst.toFixed(0).padStart(16)}`);
  }
  await prisma.user.delete({ where: { id: user.id } });
  await prisma.$disconnect();
})().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
