const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');
const {
  getAssets, createAsset, updateAsset, deleteAsset,
  getLiabilities, createLiability, updateLiability, deleteLiability,
  getNetWorth,
} = require('../controllers/netWorthController');

// Type is a free-form label (legacy rows hold values outside the current UI list), so it is
// length-checked rather than enum-checked to keep existing records editable.
const itemRules = (optional) => [
  v.text('name', { max: 100, required: !optional }),
  v.text('type', { max: 50, required: !optional }),
  v.amount('value', { optional, allowZero: true }),
  v.text('note', { max: 500 }),
];

router.use(protect);
router.get('/summary', getNetWorth);
router.get('/assets', getAssets);
router.post('/assets', itemRules(false), validate, createAsset);
router.put('/assets/:id', v.uuidParam(), itemRules(true), validate, updateAsset);
router.delete('/assets/:id', v.uuidParam(), validate, deleteAsset);
router.get('/liabilities', getLiabilities);
router.post('/liabilities', itemRules(false), validate, createLiability);
router.put('/liabilities/:id', v.uuidParam(), itemRules(true), validate, updateLiability);
router.delete('/liabilities/:id', v.uuidParam(), validate, deleteLiability);

module.exports = router;
