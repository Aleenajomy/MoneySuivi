const prisma = require('../lib/prisma');
const { calculateBalances } = require('../utils/accountBalances');

// Aggregating in SQL keeps this O(distinct account combinations) instead of loading every
// transaction the user has ever recorded into memory on each dashboard load.
const getAccountBalances = async (userId, db = prisma) => {
  const groups = await db.expense.groupBy({
    by: ['type', 'accountType', 'paymentMethod', 'fromAccountType', 'toAccountType'],
    where: { userId },
    _sum: { amount: true },
  });
  return calculateBalances(groups.map(g => ({ ...g, amount: g._sum.amount || 0 })));
};

module.exports = { getAccountBalances };
