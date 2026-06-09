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

// ── Helper for Loan/EMI outstanding balance ──────────────────
const getLoanDetails = (emi) => {
  const isFixed = emi.type !== 'FLEXIBLE';
  const hasInterest = emi.interestRate !== null && emi.interestRate !== undefined && emi.interestRate !== '';
  
  if (!hasInterest) {
    const amountPaid = isFixed
      ? (Number(emi.paidAmount) || (Number(emi.paidInstallments) * Number(emi.emiAmount)))
      : Number(emi.paidAmount);
    const remainingBalance = Math.max(0, Number(emi.totalAmount) - amountPaid);
    return {
      remainingBalance,
      amountPaid
    };
  }
  
  const R = Number(emi.interestRate);
  const P = Number(emi.totalAmount);
  
  if (isFixed) {
    const r = R / 12 / 100;
    const E = Number(emi.emiAmount);
    const N = Number(emi.totalInstallments);
    const m = Number(emi.paidInstallments);

    let remainingPrincipal = P;
    let interestPaid = 0;
    let principalPaid = 0;
    let accruedInterest = 0;

    const start = new Date(emi.startDate);
    const today = new Date();
    const elapsedMonths = Math.max(0, (today.getFullYear() - start.getFullYear()) * 12 + (today.getMonth() - start.getMonth()));

    for (let k = 1; k <= N; k++) {
      if (remainingPrincipal <= 0) break;

      const monthlyInterest = remainingPrincipal * r;
      
      if (k <= m) {
        const instInterestPaid = Math.min(monthlyInterest, E);
        const instPrincipalPaid = Math.min(E - instInterestPaid, remainingPrincipal);

        interestPaid += instInterestPaid;
        principalPaid += instPrincipalPaid;
        accruedInterest += monthlyInterest;
        remainingPrincipal -= instPrincipalPaid;
      } else {
        if (k <= elapsedMonths) {
          accruedInterest += monthlyInterest;
        }
      }
    }

    if (elapsedMonths > N && remainingPrincipal > 0) {
      const overdueMonths = elapsedMonths - N;
      const monthlyInterest = remainingPrincipal * r;
      accruedInterest += overdueMonths * monthlyInterest;
    }

    const totalPaid = m * E;
    const totalPayableAmount = P + accruedInterest;
    const remainingBalance = Math.max(0, totalPayableAmount - totalPaid);

    return {
      remainingBalance,
      amountPaid: totalPaid
    };
  } else {
    const dbPayments = emi.payments || [];
    const dbPaymentsTotal = dbPayments.reduce((sum, p) => sum + Number(p.amount), 0);
    const initialPaymentAmount = Number(emi.paidAmount) - dbPaymentsTotal;
    
    const allPayments = [...dbPayments];
    if (initialPaymentAmount > 0) {
      allPayments.push({
        id: 'initial',
        amount: initialPaymentAmount,
        paidAt: emi.startDate,
        note: 'Initial payment'
      });
    }
    
    const sortedPayments = allPayments.sort((a, b) => new Date(a.paidAt) - new Date(b.paidAt));
    
    let outstandingPrincipal = P;
    let totalInterestAccrued = 0;
    let totalInterestPaid = 0;
    let totalPrincipalPaid = 0;
    
    let currentDate = new Date(emi.startDate);
    
    for (const p of sortedPayments) {
      const payDate = new Date(p.paidAt);
      const timeDiff = payDate - currentDate;
      const days = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
      
      if (days > 0 && outstandingPrincipal > 0) {
        const dailyInterest = (outstandingPrincipal * R / 100) / 365;
        const interestAccrued = dailyInterest * days;
        totalInterestAccrued += interestAccrued;
      }
      
      const payAmount = Number(p.amount);
      const unpaidInterest = totalInterestAccrued - totalInterestPaid;
      const interestPayment = Math.min(payAmount, unpaidInterest);
      const principalPayment = Math.min(payAmount - interestPayment, outstandingPrincipal);
      
      totalInterestPaid += interestPayment;
      totalPrincipalPaid += principalPayment;
      outstandingPrincipal -= principalPayment;
      
      currentDate = payDate;
    }
    
    if (emi.active && outstandingPrincipal > 0) {
      const today = new Date();
      const timeDiff = today - currentDate;
      const days = Math.max(0, Math.floor(timeDiff / (1000 * 60 * 60 * 24)));
      
      if (days > 0) {
        const dailyInterest = (outstandingPrincipal * R / 100) / 365;
        const interestAccrued = dailyInterest * days;
        totalInterestAccrued += interestAccrued;
      }
    }
    
    const totalPaid = Number(emi.paidAmount);
    const totalPayableAmount = P + totalInterestAccrued;
    const remainingBalance = Math.max(0, totalPayableAmount - totalPaid);
    
    return {
      remainingBalance,
      amountPaid: totalPaid
    };
  }
};

// ── Net Worth ────────────────────────────────────────────
const getNetWorth = async (req, res) => {
  try {
    const [assets, activeEmis, transactions] = await Promise.all([
      prisma.asset.findMany({ where: { userId: req.user.id } }),
      prisma.eMI.findMany({
        where: { userId: req.user.id, active: true },
        include: { payments: true },
      }),
      prisma.expense.findMany({
        where: { userId: req.user.id },
        select: { amount: true, type: true, accountType: true, paymentMethod: true, fromAccountType: true, toAccountType: true },
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

    const totalLiabilities = outstandingLoans + outstandingEMIs;

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
      netWorth: totalAssets + cashBalance - totalLiabilities,
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
