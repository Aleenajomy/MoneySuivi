const prisma = require('../lib/prisma');

const getMonthRange = () => {
  const now = new Date();
  return {
    gte: new Date(now.getFullYear(), now.getMonth(), 1),
    lte: new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59),
  };
};

const getBudgets = async (req, res) => {
  try {
    const budgets = await prisma.budget.findMany({ where: { userId: req.user.id } });
    const range = getMonthRange();

    const spending = await prisma.expense.groupBy({
      by: ['category'],
      where: { userId: req.user.id, type: 'expense', expenseDate: range },
      _sum: { amount: true },
    });

    const spendMap = Object.fromEntries(spending.map(s => [s.category, s._sum.amount || 0]));

    const result = budgets.map(b => {
      const spent = spendMap[b.category] || 0;
      const percentage = b.monthlyLimit > 0 ? (spent / b.monthlyLimit) * 100 : 0;
      return {
        ...b,
        spent,
        remaining: Math.max(b.monthlyLimit - spent, 0),
        percentage: Math.round(percentage),
      };
    });

    res.json({ success: true, budgets: result });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const createBudget = async (req, res) => {
  try {
    const { category, monthlyLimit } = req.body;
    const budget = await prisma.budget.upsert({
      where: { userId_category: { userId: req.user.id, category } },
      update: { monthlyLimit: Number(monthlyLimit) },
      create: { userId: req.user.id, category, monthlyLimit: Number(monthlyLimit) },
    });
    res.status(201).json({ success: true, budget });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const updateBudget = async (req, res) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    const updated = await prisma.budget.update({
      where: { id: req.params.id },
      data: { monthlyLimit: Number(req.body.monthlyLimit) },
    });
    res.json({ success: true, budget: updated });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const deleteBudget = async (req, res) => {
  try {
    const budget = await prisma.budget.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!budget) return res.status(404).json({ success: false, message: 'Budget not found' });
    await prisma.budget.delete({ where: { id: req.params.id } });
    res.json({ success: true, message: 'Budget deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { getBudgets, createBudget, updateBudget, deleteBudget };
