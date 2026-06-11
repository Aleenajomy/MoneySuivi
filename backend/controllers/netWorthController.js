const prisma = require('../lib/prisma');
const { calculateBalances } = require('../utils/accountBalances');
const { getLoanDetails } = require('../utils/loanUtils');

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

// ── Helper for Loan/EMI outstanding balance ──────────────────
// getLoanDetails imported from ../utils/loanUtils

// ── Net Worth ────────────────────────────────────────────
const getNetWorth = async (req, res) => {
  try {
    const [assets, activeEmis, transactions, ledgerContacts] = await Promise.all([
      prisma.asset.findMany({ where: { userId: req.user.id } }),
      prisma.eMI.findMany({
        where: { userId: req.user.id, active: true },
        include: { payments: true },
      }),
      prisma.expense.findMany({
        where: { userId: req.user.id },
        select: { amount: true, type: true, accountType: true, paymentMethod: true, fromAccountType: true, toAccountType: true },
      }),
      prisma.ledgerContact.findMany({
        where: { userId: req.user.id },
        include: { entries: true },
      }),
    ]);

    const totalAssets = assets.reduce((s, a) => s + a.value, 0);

    let outstandingLoans = 0;
    let outstandingEMIs = 0;

    const mappedLiabilities = activeEmis.map(emi => {
      const details = getLoanDetails(emi);
      const remainingBalance = details.remainingBalance;
      if (emi.type === 'FLEXIBLE') {
        outstandingLoans += remainingBalance;
      } else {
        outstandingEMIs += remainingBalance;
      }
      return {
        id: emi.id,
        name: emi.title,
        type: emi.type === 'FLEXIBLE' ? 'Loan' : 'EMI',
        value: remainingBalance,
        note: emi.note,
        isAuto: true,
        createdAt: emi.createdAt,
        updatedAt: emi.updatedAt,
      };
    });

    // ── Ledger receivables / payables ────────────────────
    let ledgerReceivable = 0;  // money others owe user  → asset
    let ledgerPayable    = 0;  // money user owes others → liability

    for (const c of ledgerContacts) {
      let bal = 0;
      for (const e of c.entries) {
        const amt = Number(e.amount);
        if (e.type === 'LENT')               bal += amt;
        if (e.type === 'REPAYMENT_RECEIVED') bal -= amt;
        if (e.type === 'BORROWED')           bal -= amt;
        if (e.type === 'REPAYMENT_MADE')     bal += amt;
      }
      if (bal > 0) ledgerReceivable += bal;
      else         ledgerPayable    += Math.abs(bal);
    }

    const totalLiabilities = outstandingLoans + outstandingEMIs + ledgerPayable;

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
    const cashBalance = (accountBalances.cashBalance || 0) +
                        (accountBalances.upiBalance || 0) +
                        (accountBalances.debitCardBalance || 0) +
                        (accountBalances.netBankingBalance || 0);

    res.json({
      success: true,
      totalAssets,
      outstandingLoans,
      outstandingEMIs,
      totalLiabilities,
      cashBalance,
      ledgerReceivable,
      ledgerPayable,
      netWorth: totalAssets + cashBalance + ledgerReceivable - totalLiabilities,
      cashInHand: accountBalances.cashBalance || breakdown.inHand,
      bankBalance: (accountBalances.debitCardBalance + accountBalances.netBankingBalance) || breakdown.bank,
      walletBalance: accountBalances.upiBalance,
      totalBalance: accountBalances.totalBalance,
      creditCardDue: accountBalances.creditCardDue,
      investmentBalance: breakdown.investment,
      assets,
      liabilities: mappedLiabilities,
    });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
};


module.exports = { getAssets, createAsset, updateAsset, deleteAsset, getLiabilities, createLiability, updateLiability, deleteLiability, getNetWorth };
