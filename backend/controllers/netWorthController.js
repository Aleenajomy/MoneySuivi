const prisma = require('../lib/prisma');
const { getAccountBalances } = require('../services/balanceService');
const { getLoanDetails } = require('../utils/loanUtils');
const { computeContactBalance } = require('../utils/ledger');
const { roundMoney } = require('../utils/money');
const { handleError } = require('../utils/http');

// Explicit allow-list: spreading req.body into an update would let a client rewrite userId
// and move the record into another account.
const pickItemFields = ({ name, type, value, note }) => ({
  ...(name !== undefined && { name }),
  ...(type !== undefined && { type }),
  ...(value !== undefined && { value: roundMoney(value) }),
  ...(note !== undefined && { note: note || null }),
});

// ── Assets ──────────────────────────────────────────────
const getAssets = async (req, res) => {
  try {
    const assets = await prisma.asset.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, assets });
  } catch (e) { handleError(res, e, 'networth.getAssets'); }
};

const createAsset = async (req, res) => {
  try {
    const { name, type, value, note } = req.body;
    const asset = await prisma.asset.create({ data: { name, type, value: roundMoney(value), note: note || null, userId: req.user.id } });
    res.status(201).json({ success: true, asset });
  } catch (e) { handleError(res, e, 'networth.createAsset'); }
};

const updateAsset = async (req, res) => {
  try {
    const existing = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found' });
    const asset = await prisma.asset.update({ where: { id: existing.id }, data: pickItemFields(req.body) });
    res.json({ success: true, asset });
  } catch (e) { handleError(res, e, 'networth.updateAsset'); }
};

const deleteAsset = async (req, res) => {
  try {
    const existing = await prisma.asset.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Asset not found' });
    await prisma.asset.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) { handleError(res, e, 'networth.deleteAsset'); }
};

// ── Liabilities ──────────────────────────────────────────
const getLiabilities = async (req, res) => {
  try {
    const liabilities = await prisma.liability.findMany({ where: { userId: req.user.id }, orderBy: { createdAt: 'desc' } });
    res.json({ success: true, liabilities });
  } catch (e) { handleError(res, e, 'networth.getLiabilities'); }
};

const createLiability = async (req, res) => {
  try {
    const { name, type, value, note } = req.body;
    const liability = await prisma.liability.create({ data: { name, type, value: roundMoney(value), note: note || null, userId: req.user.id } });
    res.status(201).json({ success: true, liability });
  } catch (e) { handleError(res, e, 'networth.createLiability'); }
};

const updateLiability = async (req, res) => {
  try {
    const existing = await prisma.liability.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Liability not found' });
    const liability = await prisma.liability.update({ where: { id: existing.id }, data: pickItemFields(req.body) });
    res.json({ success: true, liability });
  } catch (e) { handleError(res, e, 'networth.updateLiability'); }
};

const deleteLiability = async (req, res) => {
  try {
    const existing = await prisma.liability.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'Liability not found' });
    await prisma.liability.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) { handleError(res, e, 'networth.deleteLiability'); }
};

// ── Helper for Loan/EMI outstanding balance ──────────────────
// getLoanDetails imported from ../utils/loanUtils

// ── Net Worth ────────────────────────────────────────────
const getNetWorth = async (req, res) => {
  try {
    const [assets, activeEmis, accountBalances, ledgerContacts] = await Promise.all([
      prisma.asset.findMany({ where: { userId: req.user.id } }),
      prisma.eMI.findMany({
        where: { userId: req.user.id, active: true },
        include: { payments: true },
      }),
      getAccountBalances(req.user.id),
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
        value: roundMoney(remainingBalance),
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
      const bal = computeContactBalance(c.entries);
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

    const liquidBalance = accountBalances.totalBalance;

    res.json({
      success: true,
      totalAssets: roundMoney(totalAssets),
      outstandingLoans: roundMoney(outstandingLoans),
      outstandingEMIs: roundMoney(outstandingEMIs),
      totalLiabilities: roundMoney(totalLiabilities),
      cashBalance: roundMoney(liquidBalance),
      ledgerReceivable: roundMoney(ledgerReceivable),
      ledgerPayable: roundMoney(ledgerPayable),
      netWorth: roundMoney(totalAssets + liquidBalance + ledgerReceivable - totalLiabilities),
      cashInHand: roundMoney(accountBalances.cashBalance),
      bankBalance: roundMoney(accountBalances.bankBalance),
      walletBalance: roundMoney(accountBalances.upiBalance),
      totalBalance: roundMoney(accountBalances.totalBalance),
      creditCardDue: accountBalances.creditCardBalance < 0 ? roundMoney(Math.abs(accountBalances.creditCardBalance)) : 0,
      investmentBalance: roundMoney(breakdown.investment),
      assets,
      liabilities: mappedLiabilities,
    });
  } catch (e) { handleError(res, e, 'networth.getNetWorth'); }
};


module.exports = { getAssets, createAsset, updateAsset, deleteAsset, getLiabilities, createLiability, updateLiability, deleteLiability, getNetWorth };
