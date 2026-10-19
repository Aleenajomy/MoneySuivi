const prisma = require('../lib/prisma');
const { computeContactBalance: computeBalance, withRunningBalance } = require('../utils/ledger');
const { roundMoney } = require('../utils/money');
const { handleError } = require('../utils/http');

// ─── Contacts ───────────────────────────────────────────────────────────────

const getContacts = async (req, res) => {
  try {
    const contacts = await prisma.ledgerContact.findMany({
      where: { userId: req.user.id },
      include: { entries: { orderBy: { date: 'asc' } } },
      orderBy: { createdAt: 'desc' },
    });

    const result = contacts.map(c => ({
      id: c.id,
      name: c.name,
      phone: c.phone,
      note: c.note,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      balance: computeBalance(c.entries),
      entryCount: c.entries.length,
    }));

    res.json({ success: true, contacts: result });
  } catch (e) {
    handleError(res, e, 'ledger.getContacts');
  }
};

const createContact = async (req, res) => {
  try {
    const { name, phone, note } = req.body;
    const contact = await prisma.ledgerContact.create({
      data: { name: name.trim(), phone: phone?.trim() || null, note: note?.trim() || null, userId: req.user.id },
    });
    res.status(201).json({ success: true, contact: { ...contact, balance: 0, entryCount: 0 } });
  } catch (e) {
    handleError(res, e, 'ledger.createContact');
  }
};

const updateContact = async (req, res) => {
  try {
    const existing = await prisma.ledgerContact.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Contact not found' });

    const { name, phone, note } = req.body;
    const contact = await prisma.ledgerContact.update({
      where: { id: existing.id },
      data: {
        name: name || existing.name,
        ...(phone !== undefined && { phone: phone || null }),
        ...(note !== undefined && { note: note || null }),
      },
    });
    res.json({ success: true, contact });
  } catch (e) {
    handleError(res, e, 'ledger.updateContact');
  }
};

const deleteContact = async (req, res) => {
  try {
    const existing = await prisma.ledgerContact.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Contact not found' });
    await prisma.ledgerContact.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) {
    handleError(res, e, 'ledger.deleteContact');
  }
};

// ─── Entries ─────────────────────────────────────────────────────────────────

const getEntries = async (req, res) => {
  try {
    // Verify contact belongs to user
    const contact = await prisma.ledgerContact.findFirst({
      where: { id: req.params.contactId, userId: req.user.id },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const entries = await prisma.ledgerEntry.findMany({
      where: { contactId: req.params.contactId, userId: req.user.id },
      orderBy: { date: 'asc' },
    });

    const enriched = withRunningBalance(entries);
    const balance = enriched.length ? enriched[enriched.length - 1].runningBalance : 0;

    res.json({ success: true, contact, entries: enriched, balance });
  } catch (e) {
    handleError(res, e, 'ledger.getEntries');
  }
};

const createEntry = async (req, res) => {
  try {
    const contact = await prisma.ledgerContact.findFirst({
      where: { id: req.params.contactId, userId: req.user.id },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const { type, amount, date, note } = req.body;

    const entry = await prisma.ledgerEntry.create({
      data: {
        type,
        amount: roundMoney(amount),
        date: date ? new Date(date) : new Date(),
        note: note?.trim() || null,
        settled: false,
        userId: req.user.id,
        contactId: contact.id,
      },
    });
    res.status(201).json({ success: true, entry });
  } catch (e) {
    handleError(res, e, 'ledger.createEntry');
  }
};

const updateEntry = async (req, res) => {
  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Entry not found' });

    const { type, amount, date, note, settled } = req.body;
    const entry = await prisma.ledgerEntry.update({
      where: { id: existing.id },
      data: {
        ...(type && { type }),
        ...(amount !== undefined && { amount: roundMoney(amount) }),
        ...(date && { date: new Date(date) }),
        ...(note !== undefined && { note: note?.trim() || null }),
        ...(settled !== undefined && { settled: Boolean(settled) }),
      },
    });
    res.json({ success: true, entry });
  } catch (e) {
    handleError(res, e, 'ledger.updateEntry');
  }
};

const deleteEntry = async (req, res) => {
  try {
    const existing = await prisma.ledgerEntry.findFirst({
      where: { id: req.params.id, userId: req.user.id },
    });
    if (!existing) return res.status(404).json({ success: false, message: 'Entry not found' });
    await prisma.ledgerEntry.delete({ where: { id: existing.id } });
    res.json({ success: true });
  } catch (e) {
    handleError(res, e, 'ledger.deleteEntry');
  }
};

// ─── Summary ──────────────────────────────────────────────────────────────────

const getLedgerSummary = async (req, res) => {
  try {
    const contacts = await prisma.ledgerContact.findMany({
      where: { userId: req.user.id },
      include: { entries: true },
    });

    let totalLentOut = 0;   // net receivable (others owe you)
    let totalBorrowed = 0;  // net payable (you owe others)

    for (const c of contacts) {
      const bal = computeBalance(c.entries);
      if (bal > 0) totalLentOut  += bal;
      else         totalBorrowed += Math.abs(bal);
    }

    res.json({ success: true, totalLentOut: roundMoney(totalLentOut), totalBorrowed: roundMoney(totalBorrowed), netBalance: roundMoney(totalLentOut - totalBorrowed) });
  } catch (e) {
    handleError(res, e, 'ledger.getLedgerSummary');
  }
};

module.exports = {
  getContacts, createContact, updateContact, deleteContact,
  getEntries, createEntry, updateEntry, deleteEntry,
  getLedgerSummary,
};
