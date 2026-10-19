const router = require('express').Router();
const { body } = require('express-validator');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');
const { getEMIs, createEMI, updateEMI, payInstallment, deleteEMI, deletePayment } = require('../controllers/emiController');

const isFixed = (req) => (req.body.type || 'FIXED') !== 'FLEXIBLE';
const whenFixed = (chain) => chain.if((value, { req }) => isFixed(req));

const emiRules = [
  v.text('title', { max: 100, required: true }),
  v.oneOf('type', ['FIXED', 'FLEXIBLE']),
  v.amount('totalAmount'),
  v.date('startDate'),
  v.text('note', { max: 500 }),
  body('interestRate').optional({ values: 'falsy' }).isFloat({ min: 0, max: 100 }).withMessage('interestRate must be between 0 and 100').toFloat(),
  whenFixed(body('emiAmount')).exists({ values: 'falsy' }).withMessage('emiAmount is required for fixed EMIs').bail()
    .isFloat({ min: 0.01, max: v.MAX_AMOUNT }).withMessage('emiAmount must be positive').toFloat(),
  whenFixed(body('totalInstallments')).isInt({ min: 1, max: 1200 }).withMessage('totalInstallments must be between 1 and 1200').toInt(),
  body('paidInstallments').optional({ values: 'null' }).isInt({ min: 0, max: 1200 }).withMessage('paidInstallments must be a whole number').toInt(),
  v.amount('paidAmount', { optional: true, allowZero: true }),
  v.date('nextDueDate', { optional: true }),
];

const paymentRules = [
  v.amount('amount', { optional: true }),
  v.date('paidAt', { optional: true }),
  v.text('note', { max: 500 }),
];

router.use(protect);
router.get('/', getEMIs);
router.post('/', emiRules, validate, createEMI);
router.put('/:id', v.uuidParam(), emiRules, validate, updateEMI);
router.patch('/:id/pay', v.uuidParam(), paymentRules, validate, payInstallment);
router.delete('/:id', v.uuidParam(), validate, deleteEMI);
router.delete('/payments/:paymentId', v.uuidParam('paymentId'), validate, deletePayment);

module.exports = router;
