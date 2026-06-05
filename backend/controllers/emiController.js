const prisma = require('../lib/prisma');

const calcNextDue = (start, paid) => {
  const d = new Date(start);
  d.setMonth(d.getMonth() + paid + 1);
  return d;
};

const getEMIs = async (req, res) => {
  try {
    const emis = await prisma.eMI.findMany({
      where: { userId: req.user.id },
      orderBy: { nextDueDate: 'asc' },
    });
    res.json({ success: true, emis });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const createEMI = async (req, res) => {
  try {
    const { title, totalAmount, emiAmount, totalInstallments, startDate, note } = req.body;
    const start = new Date(startDate);
    const emi = await prisma.eMI.create({
      data: {
        title, note: note || null,
        totalAmount: Number(totalAmount),
        emiAmount: Number(emiAmount),
        totalInstallments: Number(totalInstallments),
        paidInstallments: 0,
        startDate: start,
        nextDueDate: calcNextDue(start, 0),
        userId: req.user.id,
      },
    });
    res.status(201).json({ success: true, emi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const payInstallment = async (req, res) => {
  try {
    const existing = await prisma.eMI.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'EMI not found' });
    const paid = existing.paidInstallments + 1;
    const done = paid >= existing.totalInstallments;
    const emi = await prisma.eMI.update({
      where: { id: existing.id },
      data: {
        paidInstallments: paid,
        active: !done,
        nextDueDate: done ? existing.nextDueDate : calcNextDue(existing.startDate, paid),
      },
    });
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

module.exports = { getEMIs, createEMI, payInstallment, deleteEMI };
