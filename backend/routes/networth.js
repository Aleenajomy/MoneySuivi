const router = require('express').Router();
const { protect } = require('../middleware/auth');
const {
  getAssets, createAsset, updateAsset, deleteAsset,
  getLiabilities, createLiability, updateLiability, deleteLiability,
  getNetWorth,
} = require('../controllers/netWorthController');

router.use(protect);
router.get('/summary', getNetWorth);
router.get('/assets', getAssets);
router.post('/assets', createAsset);
router.put('/assets/:id', updateAsset);
router.delete('/assets/:id', deleteAsset);
router.get('/liabilities', getLiabilities);
router.post('/liabilities', createLiability);
router.put('/liabilities/:id', updateLiability);
router.delete('/liabilities/:id', deleteLiability);

module.exports = router;
