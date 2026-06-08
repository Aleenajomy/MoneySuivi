const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getAnalytics,
  getAnalyticsDebug,
  getBalances,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const expenseRules = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('category').notEmpty().withMessage('Category is required'),
  body('expenseDate').notEmpty().withMessage('Date is required'),
  body('type').optional().isIn(['expense', 'income']).withMessage('Type must be expense or income'),
  body('accountType').optional().isIn(['Cash', 'Bank', 'UPI', 'Credit Card', 'Wallet']).withMessage('Invalid account type'),
  body('recurring').optional().isBoolean().withMessage('Recurring must be true or false'),
  body('recurringType').custom((value, { req }) => {
    if (req.body.recurring === true || req.body.recurring === 'true') {
      return ['weekly', 'monthly'].includes(value);
    }
    return true;
  }).withMessage('Recurring type must be weekly or monthly'),
];

router.use(protect); // All expense routes are protected

router.get('/analytics', getAnalytics);
router.get('/analytics-debug', getAnalyticsDebug);
router.get('/balances', getBalances);
router.get('/', getExpenses);
router.get('/:id', getExpense);
router.post('/', expenseRules, validate, createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
