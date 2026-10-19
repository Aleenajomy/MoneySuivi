const router = require('express').Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');
const { LEDGER_TYPES } = require('../utils/ledger');
const {
  getContacts, createContact, updateContact, deleteContact,
  getEntries, createEntry, updateEntry, deleteEntry,
  getLedgerSummary,
} = require('../controllers/ledgerController');

const contactRules = (optional) => [
  v.text('name', { max: 50, required: !optional }),
  v.text('phone', { max: 20 }),
  v.text('note', { max: 300 }),
];

const entryRules = (optional) => [
  v.oneOf('type', LEDGER_TYPES, { optional }),
  v.amount('amount', { optional }),
  v.date('date', { optional: true }),
  v.text('note', { max: 500 }),
  body('settled').optional().isBoolean().toBoolean(),
];

router.use(protect);

router.get('/summary', getLedgerSummary);

router.get('/contacts', getContacts);
router.post('/contacts', contactRules(false), validate, createContact);
router.put('/contacts/:id', v.uuidParam(), contactRules(true), validate, updateContact);
router.delete('/contacts/:id', v.uuidParam(), validate, deleteContact);

router.get('/contacts/:contactId/entries', v.uuidParam('contactId'), validate, getEntries);
router.post('/contacts/:contactId/entries', v.uuidParam('contactId'), entryRules(false), validate, createEntry);

router.put('/entries/:id', v.uuidParam(), entryRules(true), validate, updateEntry);
router.delete('/entries/:id', v.uuidParam(), validate, deleteEntry);

module.exports = router;
