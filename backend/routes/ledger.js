const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getContacts, createContact, updateContact, deleteContact,
  getEntries, createEntry, updateEntry, deleteEntry,
  getLedgerSummary,
} = require('../controllers/ledgerController');

router.use(protect);

router.get('/summary', getLedgerSummary);

router.get('/contacts', getContacts);
router.post('/contacts', createContact);
router.put('/contacts/:id', updateContact);
router.delete('/contacts/:id', deleteContact);

router.get('/contacts/:contactId/entries', getEntries);
router.post('/contacts/:contactId/entries', createEntry);

router.put('/entries/:id', updateEntry);
router.delete('/entries/:id', deleteEntry);

module.exports = router;
