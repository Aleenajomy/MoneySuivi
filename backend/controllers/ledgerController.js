const prisma = require('../lib/prisma');

// ─── Helpers ────────────────────────────────────────────────────────────────

/**
 * Compute the net balance for a contact from their entries.
 * Positive  → user is owed money (lent out more than received back)
 * Negative  → user owes money   (borrowed more than paid back)
 */
function computeBalance(entries) {
  let balance = 0;
  for (const e of entries) {
    const amt = Number(e.amount);
    if (e.type === 'LENT')               balance += amt;  // money went out
    if (e.type === 'REPAYMENT_RECEIVED') balance -= amt;  // money came back
    if (e.type === 'BORROWED')           balance -= amt;  // money came in
    if (e.type === 'REPAYMENT_MADE')     balance += amt;  // money went out
  }
  return balance;
}

/** Add running balance to an ordered list of entries */
function withRunningBalance(entries) {
  let running = 0;
  return entries.map(e => {
    const amt = Number(e.amount);
    if (e.type === 'LENT')               running += amt;
    if (e.type === 'REPAYMENT_RECEIVED') running -= amt;
    if (e.type === 'BORROWED')           running -= amt;
    if (e.type === 'REPAYMENT_MADE')     running += amt;
    return { ...e, runningBalance: running };
  });
}

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
    res.status(500).json({ success: false, message: e.message });
  }
};

const createContact = async (req, res) => {
  try {
    const { name, phone, note } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, message: 'Name is required' });
    }
    const contact = await prisma.ledgerContact.create({
      data: { name: name.trim(), phone: phone?.trim() || null, note: note?.trim() || null, userId: req.user.id },
    });
    res.status(201).json({ success: true, contact: { ...contact, balance: 0, entryCount: 0 } });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
        name: name?.trim() || existing.name,
        phone: phone?.trim() || null,
        note: note?.trim() || null,
      },
    });
    res.json({ success: true, contact });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
    res.status(500).json({ success: false, message: e.message });
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
    res.status(500).json({ success: false, message: e.message });
  }
};

const createEntry = async (req, res) => {
  try {
    const contact = await prisma.ledgerContact.findFirst({
      where: { id: req.params.contactId, userId: req.user.id },
    });
    if (!contact) return res.status(404).json({ success: false, message: 'Contact not found' });

    const { type, amount, date, note } = req.body;
    const validTypes = ['LENT', 'BORROWED', 'REPAYMENT_RECEIVED', 'REPAYMENT_MADE'];
    if (!validTypes.includes(type)) {
      return res.status(400).json({ success: false, message: 'Invalid entry type' });
    }
    if (!amount || Number(amount) <= 0) {
      return res.status(400).json({ success: false, message: 'Amount must be positive' });
    }

    const entry = await prisma.ledgerEntry.create({
      data: {
        type,
        amount: Number(amount),
        date: date ? new Date(date) : new Date(),
        note: note?.trim() || null,
        settled: false,
        userId: req.user.id,
        contactId: contact.id,
      },
    });
    res.status(201).json({ success: true, entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
        ...(amount && { amount: Number(amount) }),
        ...(date && { date: new Date(date) }),
        ...(note !== undefined && { note: note?.trim() || null }),
        ...(settled !== undefined && { settled: Boolean(settled) }),
      },
    });
    res.json({ success: true, entry });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
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
    res.status(500).json({ success: false, message: e.message });
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

    res.json({ success: true, totalLentOut, totalBorrowed, netBalance: totalLentOut - totalBorrowed });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
};

module.exports = {
  getContacts, createContact, updateContact, deleteContact,
  getEntries, createEntry, updateEntry, deleteEntry,
  getLedgerSummary,
};
