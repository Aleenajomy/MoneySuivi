const router = require('express').Router();
const { protect } = require('../middleware/auth');
const { getEMIs, createEMI, updateEMI, payInstallment, deleteEMI, deletePayment } = require('../controllers/emiController');

router.use(protect);
router.get('/', getEMIs);
router.post('/', createEMI);
router.put('/:id', updateEMI);
router.patch('/:id/pay', payInstallment);
router.delete('/:id', deleteEMI);
router.delete('/payments/:paymentId', deletePayment);

module.exports = router;
