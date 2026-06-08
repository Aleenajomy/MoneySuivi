const prisma = require('../lib/prisma');
const { calculateBalances } = require('../utils/accountBalances');

// ── Assets ──────────────────────────────────────────────
const getAssets = async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, assets });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createAsset = async (req, res) => {
  try {
    const { name, type, value, note } = req.body;
    const asset = await prisma.asset.create({ data: { name, type, value: Number(value), note: note || null, userId: req.user.id } });
    res.status(201).json({ success: true, asset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const updateAsset = async (req, res) => {
  try {
    const existing = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found' });
    const asset = await prisma.asset.update({ where: { id: existing.id }, data: { ...req.body, value: Number(req.body.value) } });
    res.json({ success: true, asset });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const deleteAsset = async (req, res) => {
  try {
    const existing = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found' });
    await prisma.asset.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Liabilities ──────────────────────────────────────────
const getLiabilities = async (req, res) => {
  try {
    const liabilities = await prisma.liability.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, liabilities });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const createLiability = async (req, res) => {
  try {
    const { name, type, value, note } = req.body;
    const liability = await prisma.liability.create({ data: { name, type, value: Number(value), note: note || null, userId: req.user.id } });
    res.status(201).json({ success: true, liability });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const updateLiability = async (req, res) => {
  try {
    const existing = await prisma.liability.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Liability not found' });
    const liability = await prisma.liability.update({ where: { id: existing.id }, data: { ...req.body, value: Number(req.body.value) } });
    res.json({ success: true, liability });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

const deleteLiability = async (req, res) => {
  try {
    const existing = await prisma.liability.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Liability not found' });
    await prisma.liability.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

// ── Net Worth ────────────────────────────────────────────
const getNetWorth = async (req, res) => {
  try {
    const [assets, liabilities, transactions] = await Promise.all([
      prisma.asset.findMany({ where: { userId: req.user.id } }),
      prisma.liability.findMany({ where: { userId: req.user.id } }),
      prisma.expense.findMany({
        where: { userId: req.user.id },
        select: { amount: true, type: true, accountType: true, paymentMethod: true, fromAccountType: true, toAccountType: true },
      }),
    ]);
    const totalAssets = assets.reduce((s, a) => s + a.value, 0);
    const totalLiabilities = liabilities.reduce((s, l) => s + l.value, 0);

    const breakdown = assets.reduce((totals, asset) => {
      const value = asset.value || 0;
      if (['Savings', 'Other'].includes(asset.type)) {
        totals.inHand += value;
      } else if (asset.type === 'Fixed Deposit') {
        totals.bank += value;
      } else {
        totals.investment += value;
      }
      return totals;
    }, { inHand: 0, bank: 0, investment: 0 });
    const accountBalances = calculateBalances(transactions);

    res.json({
      success: true,
      totalAssets,
      totalLiabilities,
      netWorth: totalAssets - totalLiabilities,
      cashInHand: accountBalances.cashBalance || breakdown.inHand,
      bankBalance: accountBalances.bankBalance || breakdown.bank,
      walletBalance: accountBalances.walletBalance,
      totalBalance: accountBalances.totalBalance,
      creditCardDue: accountBalances.creditCardDue,
      investmentBalance: breakdown.investment,
      assets,
      liabilities,
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};

module.exports = { getAssets, createAsset, updateAsset, deleteAsset, getLiabilities, createLiability, updateLiability, deleteLiability, getNetWorth };
