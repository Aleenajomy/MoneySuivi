const prisma = require('../lib/prisma');
const { getLoanDetails } = require('../utils/loanUtils');

// nextDueDate = startDate + (paidInstallments + 1) months
const calcNextDue = (startDate, paidInstallments) => {
  const d = new Date(startDate);
  d.setMonth(d.getMonth() + paidInstallments + 1);
  return d;
};

const getEMIs = async (req, res) => {
  try {
    const emis = await prisma.eMI.findMany({
      where: { userId: req.user.id },
      include: { payments: { orderBy: { paidAt: 'desc' } } },
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, emis });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const createEMI = async (req, res) => {
  try {
    console.log('CREATE EMI BODY:', req.body);
    const { title, totalAmount, emiAmount, totalInstallments, startDate, paidInstallments, note, type, nextDueDate, paidAmount, interestRate } = req.body;
    const start = new Date(startDate);
    const resolvedType = type || 'FIXED';
    const parsedInterestRate = interestRate !== undefined && interestRate !== '' ? Number(interestRate) : null;
    
    let emi;
    if (resolvedType === 'FLEXIBLE') {
      const total = Number(totalAmount);
      const paid = Number(paidAmount) || 0;
      const tempEmi = {
        type: resolvedType,
        totalAmount: total,
        interestRate: parsedInterestRate,
        paidAmount: paid,
        startDate: start,
        payments: [],
        active: true
      };
      const details = getLoanDetails(tempEmi);
      const active = details.remainingBalance > 0;
      
      emi = await prisma.eMI.create({
        data: {
          title,
          note: note || null,
          totalAmount: total,
          emiAmount: emiAmount ? Number(emiAmount) : null,
          totalInstallments: totalInstallments ? Number(totalInstallments) : null,
          paidInstallments: 0,
          paidAmount: paid,
          startDate: start,
          nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
          active,
          type: resolvedType,
          interestRate: parsedInterestRate,
          userId: req.user.id,
        },
      });
    } else {
      const totalInst = Number(totalInstallments);
      const paidInst = Math.min(Number(paidInstallments) || 0, totalInst);
      const emiAmt = Number(emiAmount);
      const active = paidInst < totalInst;
      
      emi = await prisma.eMI.create({
        data: {
          title,
          note: note || null,
          totalAmount: Number(totalAmount),
          emiAmount: emiAmt,
          totalInstallments: totalInst,
          paidInstallments: paidInst,
          paidAmount: paidInst * emiAmt,
          startDate: start,
          nextDueDate: calcNextDue(start, paidInst),
          active,
          type: resolvedType,
          interestRate: parsedInterestRate,
          userId: req.user.id,
        },
      });
    }
    res.status(201).json({ success: true, emi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const payInstallment = async (req, res) => {
  try {
    const existing = await prisma.eMI.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'EMI not found' });
    if (!existing.active) return res.status(400).json({ success: false, message: 'EMI already completed' });

    let emi;
    if (existing.type === 'FLEXIBLE') {
      const { amount, note, paidAt } = req.body;
      const payAmount = Number(amount);
      if (isNaN(payAmount) || payAmount <= 0) {
        return res.status(400).json({ success: false, message: 'Invalid payment amount' });
      }
      
      const dbPayments = await prisma.eMIPayment.findMany({
        where: { emiId: existing.id }
      });
      const newPayment = {
        amount: payAmount,
        paidAt: paidAt ? new Date(paidAt) : new Date(),
      };
      const newPaidAmount = existing.paidAmount + payAmount;
      const tempEmi = {
        ...existing,
        interestRate: existing.interestRate,
        paidAmount: newPaidAmount,
        payments: [...dbPayments, newPayment],
        active: true
      };
      const details = getLoanDetails(tempEmi);
      const done = details.remainingBalance <= 0;
      
      emi = await prisma.$transaction(async (tx) => {
        await tx.eMIPayment.create({
          data: {
            emiId: existing.id,
            amount: payAmount,
            paidAt: paidAt ? new Date(paidAt) : new Date(),
            note: note || null,
          },
        });
        
        return await tx.eMI.update({
          where: { id: existing.id },
          data: {
            paidAmount: newPaidAmount,
            active: !done,
          },
        });
      });
    } else {
      const { note, paidAt } = req.body;
      const payAmount = existing.emiAmount;
      const paid = existing.paidInstallments + 1;
      const done = paid >= existing.totalInstallments;
      const newPaidAmount = existing.paidAmount + payAmount;
      
      emi = await prisma.$transaction(async (tx) => {
        await tx.eMIPayment.create({
          data: {
            emiId: existing.id,
            amount: payAmount,
            paidAt: paidAt ? new Date(paidAt) : new Date(),
            note: note || null,
          },
        });
        
        return await tx.eMI.update({
          where: { id: existing.id },
          data: {
            paidInstallments: paid,
            paidAmount: newPaidAmount,
            active: !done,
            nextDueDate: calcNextDue(existing.startDate, paid),
          },
        });
      });
    }
    
    res.json({ success: true, emi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const updateEMI = async (req, res) => {
  try {
    console.log('UPDATE EMI BODY:', req.body);
    const existing = await prisma.eMI.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'EMI not found' });

    const { title, totalAmount, emiAmount, totalInstallments, startDate, note, type, nextDueDate, paidAmount, interestRate } = req.body;
    const resolvedType = type || existing.type;
    const start = new Date(startDate);
    const parsedInterestRate = interestRate !== undefined ? (interestRate === '' ? null : Number(interestRate)) : existing.interestRate;
    
    let emi;
    if (resolvedType === 'FLEXIBLE') {
      const total = Number(totalAmount);
      const paid = paidAmount !== undefined && paidAmount !== '' ? Number(paidAmount) : existing.paidAmount;
      const dbPayments = await prisma.eMIPayment.findMany({
        where: { emiId: existing.id }
      });
      const tempEmi = {
        type: resolvedType,
        totalAmount: total,
        interestRate: parsedInterestRate,
        paidAmount: paid,
        startDate: start,
        payments: dbPayments,
        active: true
      };
      const details = getLoanDetails(tempEmi);
      const active = details.remainingBalance > 0;
      
      emi = await prisma.eMI.update({
        where: { id: existing.id },
        data: {
          title,
          note: note || null,
          totalAmount: total,
          emiAmount: emiAmount ? Number(emiAmount) : null,
          totalInstallments: totalInstallments ? Number(totalInstallments) : null,
          paidAmount: paid,
          startDate: start,
          nextDueDate: nextDueDate ? new Date(nextDueDate) : null,
          active,
          type: resolvedType,
          interestRate: parsedInterestRate,
        },
      });
    } else {
      const total = Number(totalInstallments);
      const paidInstallments = req.body.paidInstallments;
      const paid = paidInstallments !== undefined && paidInstallments !== '' 
        ? Math.min(Number(paidInstallments), total) 
        : existing.paidInstallments;
      const emiAmt = Number(emiAmount);
      const active = paid < total;
      
      emi = await prisma.eMI.update({
        where: { id: existing.id },
        data: {
          title,
          note: note || null,
          totalAmount: Number(totalAmount),
          emiAmount: emiAmt,
          totalInstallments: total,
          paidInstallments: paid,
          paidAmount: paid * emiAmt,
          startDate: start,
          active,
          nextDueDate: calcNextDue(start, paid),
          type: resolvedType,
          interestRate: parsedInterestRate,
        },
      });
    }
    res.json({ success: true, emi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deleteEMI = async (req, res) => {
  try {
    const existing = await prisma.eMI.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'EMI not found' });
    await prisma.eMI.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const deletePayment = async (req, res) => {
  try {
    const payment = await prisma.eMIPayment.findUnique({
      where: { id: req.params.paymentId },
      include: { emi: { include: { payments: true } } },
    });
    if (!payment || payment.emi.userId !== req.user.id) {
      return res.status(404).json({ success: false, message: 'Payment not found' });
    }

    const { emi } = payment;
    const newPaidAmount = Math.max(0, emi.paidAmount - payment.amount);
    
    let updatedEmi;
    if (emi.type === 'FIXED') {
      const newPaidInstallments = Math.max(0, emi.paidInstallments - 1);
      const active = newPaidInstallments < emi.totalInstallments;
      
      updatedEmi = await prisma.$transaction(async (tx) => {
        await tx.eMIPayment.delete({ where: { id: payment.id } });
        return await tx.eMI.update({
          where: { id: emi.id },
          data: {
            paidAmount: newPaidAmount,
            paidInstallments: newPaidInstallments,
            active,
            nextDueDate: calcNextDue(emi.startDate, newPaidInstallments),
          },
        });
      });
    } else {
      const remainingPayments = emi.payments.filter(p => p.id !== payment.id);
      const tempEmi = {
        ...emi,
        paidAmount: newPaidAmount,
        payments: remainingPayments,
        active: true
      };
      const details = getLoanDetails(tempEmi);
      const active = details.remainingBalance > 0;
      
      updatedEmi = await prisma.$transaction(async (tx) => {
        await tx.eMIPayment.delete({ where: { id: payment.id } });
        return await tx.eMI.update({
          where: { id: emi.id },
          data: {
            paidAmount: newPaidAmount,
            active,
          },
        });
      });
    }
    
    res.json({ success: true, emi: updatedEmi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = { getEMIs, createEMI, updateEMI, payInstallment, deleteEMI, deletePayment };
