const prisma = require('../lib/prisma');

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
      orderBy: { createdAt: 'desc' },
    });
    res.json({ success: true, emis });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const createEMI = async (req, res) => {
  try {
    const { title, totalAmount, emiAmount, totalInstallments, startDate, paidInstallments, note } = req.body;
    const start = new Date(startDate);
    const total = Number(totalInstallments);
    const paid = Math.min(Number(paidInstallments) || 0, total);
    const active = paid < total;
    const emi = await prisma.eMI.create({
      data: {
        title,
        note: note || null,
        totalAmount: Number(totalAmount),
        emiAmount: Number(emiAmount),
        totalInstallments: total,
        paidInstallments: paid,
        startDate: start,
        nextDueDate: calcNextDue(start, paid),
        active,
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
    if (!existing.active) return res.status(400).json({ success: false, message: 'EMI already completed' });

    const paid = existing.paidInstallments + 1;
    const done = paid >= existing.totalInstallments;
    const emi = await prisma.eMI.update({
      where: { id: existing.id },
      data: {
        paidInstallments: paid,
        active: !done,
        nextDueDate: calcNextDue(existing.startDate, paid),
      },
    });
    res.json({ success: true, emi });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

const updateEMI = async (req, res) => {
  try {
    const existing = await prisma.eMI.findFirst({ where: { id: req.params.id, userId: req.user.id } });
    if (!existing) return res.status(404).json({ success: false, message: 'EMI not found' });

    const { title, totalAmount, emiAmount, totalInstallments, startDate, paidInstallments, note } = req.body;
    const start = new Date(startDate);
    const total = Number(totalInstallments);
    const paid = Math.min(Number(paidInstallments) || existing.paidInstallments, total);
    const active = paid < total;
    const emi = await prisma.eMI.update({
      where: { id: existing.id },
      data: {
        title,
        note: note || null,
        totalAmount: Number(totalAmount),
        emiAmount: Number(emiAmount),
        totalInstallments: total,
        paidInstallments: paid,
        startDate: start,
        active,
        nextDueDate: calcNextDue(start, paid),
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

module.exports = { getEMIs, createEMI, updateEMI, payInstallment, deleteEMI };
