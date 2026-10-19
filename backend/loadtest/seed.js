// Seeds one synthetic user with a large transaction history for load testing.
// Usage: DATABASE_URL=<local test db> node loadtest/seed.js [transactions=20000]
const { URL } = require('url');
const bcrypt = require('bcrypt');

const dbUrl = new URL(process.env.DATABASE_URL || '');
if (!['localhost', '127.0.0.1'].includes(dbUrl.hostname) || !/test/i.test(dbUrl.pathname)) {
  throw new Error('Refusing to seed a non-local or non-test database');
}

const prisma = require('../lib/prisma');

const COUNT = Number(process.argv[2]) || 20000;
const EMAIL = 'loadtest@example.test';
const PASSWORD = 'loadtest-password';
const CATEGORIES = ['Food', 'Travel', 'Shopping', 'Bills', 'Entertainment', 'Healthcare', 'Other'];
const ACCOUNTS = [['Cash', 'Cash'], ['UPI', 'UPI'], ['Bank', 'Net Banking'], ['Credit Card', 'Credit Card'], ['Debit Card', 'Debit Card']];

(async () => {
  await prisma.user.deleteMany({ where: { email: EMAIL } });
  const user = await prisma.user.create({ data: { name: 'Load Test', email: EMAIL, password: await bcrypt.hash(PASSWORD, 12) } });

  const start = Date.UTC(2022, 0, 1);
  const span = Date.UTC(2026, 9, 1) - start;
  const rows = Array.from({ length: COUNT }, (_, i) => {
    const [accountType, paymentMethod] = ACCOUNTS[i % ACCOUNTS.length];
    const day = new Date(start + Math.floor((i / COUNT) * span));
    day.setUTCHours(0, 0, 0, 0);
    const isIncome = i % 20 === 0;
    return {
      userId: user.id,
      title: isIncome ? 'Salary' : `Purchase ${i}`,
      amount: isIncome ? 50000 : Math.round((50 + (i * 37) % 5000) * 100) / 100,
      category: isIncome ? 'Salary' : CATEGORIES[i % CATEGORIES.length],
      type: isIncome ? 'income' : 'expense',
      accountType,
      paymentMethod,
      expenseDate: day,
    };
  });
  for (let i = 0; i < rows.length; i += 5000) {
    await prisma.expense.createMany({ data: rows.slice(i, i + 5000) });
  }
  await prisma.budget.createMany({ data: CATEGORIES.map(category => ({ userId: user.id, category, monthlyLimit: 10000 })) });
  console.log(JSON.stringify({ userId: user.id, email: EMAIL, password: PASSWORD, transactions: COUNT }));
  await prisma.$disconnect();
})();
