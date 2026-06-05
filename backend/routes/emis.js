const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getEMIs, createEMI, payInstallment, deleteEMI } = require('../controllers/emiController');

router.use(protect);
router.get('/', getEMIs);
router.post('/', createEMI);
router.patch('/:id/pay', payInstallment);
router.delete('/:id', deleteEMI);

module.exports = router;
