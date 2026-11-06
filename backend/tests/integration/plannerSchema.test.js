const { test, beforeEach, after } = require('node:test');
const assert = require('node:assert/strict');
const { app, request, prisma, resetDb, createUser, auth } = require('../helpers/setup');

beforeEach(resetDb);
after(() => prisma.$disconnect());

const expense = (userId, data = {}) => prisma.expense.create({ data: {
  userId, title: 'Tx', amount: 100, category: 'Other', type: 'expense', accountType: 'UPI', paymentMethod: 'UPI', ...data,
} });

// One record of every planner table, children included, for the given user.
const seedPlanner = async (userId) => {
  const salaryTx = await expense(userId, { title: 'Salary', amount: 15000, category: 'Salary', type: 'income', accountType: 'Bank', paymentMethod: 'Net Banking' });
  const rentTx = await expense(userId, { title: 'Rent', amount: 3500, category: 'Bills' });
  const goldTx = await expense(userId, { title: 'Gold', amount: 1000, category: 'Investment' });

  const source = await prisma.incomeSource.create({ data: { userId, name: 'Salary', expectedAmount: '15000.00', payDay: 1 } });
  await prisma.monthlySalary.create({ data: {
    userId, incomeSourceId: source.id, label: 'Salary', year: 2026, month: 11, expectedAmount: '15000', receivedAmount: '15000', expenseId: salaryTx.id,
  } });
  const goal = await prisma.savingsGoal.create({ data: { userId, name: 'Emergency Fund', targetAmount: '50000' } });
  await prisma.savingsContribution.create({ data: { goalId: goal.id, amount: '3000', date: new Date('2026-11-02') } });
  const invest = await prisma.investmentPlan.create({ data: { userId, name: 'Gold', category: 'GOLD', monthlyPlannedAmount: '1000' } });
  await prisma.investmentTransaction.create({ data: { planId: invest.id, amount: '1000', date: new Date('2026-11-03'), expenseId: goldTx.id } });
  const plan = await prisma.budgetPlan.create({ data: { userId, year: 2026, month: 11 } });
  const rent = await prisma.budgetAllocation.create({ data: { planId: plan.id, group: 'FIXED', name: 'Rent', plannedAmount: '3500', matchCategories: ['Bills'] } });
  await prisma.budgetAllocation.create({ data: { planId: plan.id, group: 'SAVINGS', name: 'Emergency', plannedAmount: '3000', savingsGoalId: goal.id } });
  await prisma.allocationAssignment.create({ data: { expenseId: rentTx.id, allocationId: rent.id } });
  return { salaryTx, rentTx, goldTx, source, goal, invest, plan, rent };
};

const plannerCounts = async (userId) => Promise.all([
  prisma.incomeSource.count({ where: { userId } }),
  prisma.monthlySalary.count({ where: { userId } }),
  prisma.budgetPlan.count({ where: { userId } }),
  prisma.budgetAllocation.count({ where: { plan: { userId } } }),
  prisma.allocationAssignment.count({ where: { allocation: { plan: { userId } } } }),
  prisma.savingsGoal.count({ where: { userId } }),
  prisma.savingsContribution.count({ where: { goal: { userId } } }),
  prisma.investmentPlan.count({ where: { userId } }),
  prisma.investmentTransaction.count({ where: { plan: { userId } } }),
]);

test('reset-all removes every planner record, children included, and leaves other users alone', async () => {
  const user = await createUser();
  const other = await createUser();
  await seedPlanner(user.id);
  await seedPlanner(other.id);
  assert.deepEqual(await plannerCounts(user.id), [1, 1, 1, 2, 1, 1, 1, 1, 1]);

  const res = await request(app).delete('/api/auth/reset').set(auth(user)).send({ password: user.password });
  assert.equal(res.status, 200);

  assert.deepEqual(await plannerCounts(user.id), [0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 0);
  assert.deepEqual(await plannerCounts(other.id), [1, 1, 1, 2, 1, 1, 1, 1, 1]);
  assert.equal(await prisma.expense.count({ where: { userId: other.id } }), 3);
});

test('reset-all is atomic across planner tables: a failure part-way keeps planner and transaction data', async () => {
  const user = await createUser();
  await seedPlanner(user.id);
  const original = prisma.investmentPlan.deleteMany;
  prisma.investmentPlan.deleteMany = () => prisma.$queryRaw`SELECT 1/0`;
  try {
    const res = await request(app).delete('/api/auth/reset').set(auth(user)).send({ password: user.password });
    assert.equal(res.status, 500);
  } finally {
    prisma.investmentPlan.deleteMany = original;
  }
  assert.deepEqual(await plannerCounts(user.id), [1, 1, 1, 2, 1, 1, 1, 1, 1]);
  assert.equal(await prisma.expense.count({ where: { userId: user.id } }), 3);
});

test('a transaction can back at most one salary record, one allocation and one investment', async () => {
  const user = await createUser();
  const s = await seedPlanner(user.id);
  const isUniqueViolation = (err) => err.code === 'P2002';

  await assert.rejects(prisma.monthlySalary.create({ data: {
    userId: user.id, label: 'Bonus', kind: 'BONUS', year: 2026, month: 11, expectedAmount: '1', expenseId: s.salaryTx.id,
  } }), isUniqueViolation);
  const other = await prisma.budgetAllocation.create({ data: { planId: s.plan.id, group: 'VARIABLE', name: 'Misc', plannedAmount: '500' } });
  await assert.rejects(prisma.allocationAssignment.create({ data: { expenseId: s.rentTx.id, allocationId: other.id } }), isUniqueViolation);
  await assert.rejects(prisma.investmentTransaction.create({ data: { planId: s.invest.id, amount: '1', date: new Date(), expenseId: s.goldTx.id } }), isUniqueViolation);
  await assert.rejects(prisma.budgetPlan.create({ data: { userId: user.id, year: 2026, month: 11 } }), isUniqueViolation);
  await assert.rejects(prisma.monthlySalary.create({ data: {
    userId: user.id, incomeSourceId: s.source.id, label: 'Salary', year: 2026, month: 11, expectedAmount: '1',
  } }), isUniqueViolation);
});

test('deleting a transaction in History: salary history stays, the assignment and the investment go with it', async () => {
  const user = await createUser();
  const s = await seedPlanner(user.id);
  for (const tx of [s.salaryTx, s.rentTx, s.goldTx]) {
    assert.equal((await request(app).delete(`/api/expenses/${tx.id}`).set(auth(user))).status, 200);
  }
  const salary = await prisma.monthlySalary.findFirst({ where: { userId: user.id } });
  assert.equal(salary.expenseId, null);
  assert.equal(salary.receivedAmount.toFixed(2), '15000.00');
  assert.equal(await prisma.allocationAssignment.count(), 0);
  assert.equal(await prisma.investmentTransaction.count(), 0);
  assert.equal(await prisma.budgetAllocation.count({ where: { planId: s.plan.id } }), 2);
});

test('deleting an income source, goal or investment plan keeps month history readable', async () => {
  const user = await createUser();
  const s = await seedPlanner(user.id);
  await prisma.incomeSource.delete({ where: { id: s.source.id } });
  await prisma.savingsGoal.delete({ where: { id: s.goal.id } });
  const salary = await prisma.monthlySalary.findFirst({ where: { userId: user.id } });
  assert.equal(salary.incomeSourceId, null);
  assert.equal(salary.label, 'Salary');
  const emergency = await prisma.budgetAllocation.findFirst({ where: { planId: s.plan.id, name: 'Emergency' } });
  assert.equal(emergency.savingsGoalId, null);
  assert.equal(await prisma.savingsContribution.count(), 0);
});

test('Decimal columns store paise exactly, with no binary floating-point drift', async () => {
  const user = await createUser();
  const goal = await prisma.savingsGoal.create({ data: { userId: user.id, name: 'Exact', targetAmount: '9999999999.99' } });
  for (const amount of ['0.10', '0.20']) {
    await prisma.savingsContribution.create({ data: { goalId: goal.id, amount, date: new Date() } });
  }
  const sum = await prisma.savingsContribution.aggregate({ where: { goalId: goal.id }, _sum: { amount: true } });
  assert.equal(sum._sum.amount.toFixed(2), '0.30');
  assert.equal((await prisma.savingsGoal.findUnique({ where: { id: goal.id } })).targetAmount.toFixed(2), '9999999999.99');
});

test('database CHECK constraints reject invalid planner rows', async () => {
  const user = await createUser();
  const plan = await prisma.budgetPlan.create({ data: { userId: user.id, year: 2026, month: 1 } });
  const goal = await prisma.savingsGoal.create({ data: { userId: user.id, name: 'G', targetAmount: '1' } });
  const invest = await prisma.investmentPlan.create({ data: { userId: user.id, name: 'I', category: 'STOCK' } });
  const isCheckViolation = (err) => /check constraint/i.test(err.message);

  const invalid = [
    prisma.budgetPlan.create({ data: { userId: user.id, year: 2026, month: 13 } }),
    prisma.budgetAllocation.create({ data: { planId: plan.id, group: 'LUXURY', name: 'X', plannedAmount: '1' } }),
    prisma.budgetAllocation.create({ data: { planId: plan.id, group: 'FIXED', name: 'Y', plannedAmount: '-1' } }),
    prisma.incomeSource.create({ data: { userId: user.id, name: 'S', expectedAmount: '1', payDay: 32 } }),
    prisma.incomeSource.create({ data: { userId: user.id, name: 'S', kind: 'LOTTERY', expectedAmount: '1' } }),
    prisma.savingsGoal.create({ data: { userId: user.id, name: 'Zero', targetAmount: '0' } }),
    prisma.savingsContribution.create({ data: { goalId: goal.id, amount: '0', date: new Date() } }),
    prisma.savingsContribution.create({ data: { goalId: goal.id, type: 'GIFT', amount: '1', date: new Date() } }),
    prisma.investmentPlan.create({ data: { userId: user.id, name: 'C', category: 'CRYPTO' } }),
    prisma.investmentTransaction.create({ data: { planId: invest.id, type: 'SELL', amount: '1', date: new Date() } }),
  ];
  for (const write of invalid) await assert.rejects(write, isCheckViolation);
});
