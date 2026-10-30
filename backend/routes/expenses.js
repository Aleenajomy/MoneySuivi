const express = require('express');
const router = express.Router();
const { body, query } = require('express-validator');
const {
  getExpenses,
  getExpense,
  createExpense,
  updateExpense,
  deleteExpense,
  getAnalytics,
  getBalances,
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { ACCOUNT_TYPES } = require('../utils/accountBalances');
const v = require('../validators/common');

const TYPES = ['expense', 'income', 'transfer'];
const PAYMENT_METHODS = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Net Banking', 'Bank', 'Bank Transfer', 'Wallet', 'Transfer', 'Other'];
const RECURRING_TYPES = ['weekly', 'monthly'];

const recurringTypeRule = body('recurringType').custom((value, { req }) => {
  if (req.body.recurring === true || req.body.recurring === 'true') return RECURRING_TYPES.includes(value);
  return value === undefined || value === null || value === '' || RECURRING_TYPES.includes(value);
}).withMessage('Recurring type must be weekly or monthly');

const transferRule = body('toAccountType').custom((to, { req }) => {
  if (req.body.type !== 'transfer') return true;
  const from = req.body.fromAccountType;
  if (!from || !to) throw new Error('Transfers need both a from and a to account');
  if (from === to) throw new Error('Cannot transfer to the same account');
  return true;
});

const sharedRules = (optional) => [
  v.text('title', { max: 100, required: !optional }),
  v.amount('amount', { optional }),
  v.text('category', { max: 50 }),
  v.oneOf('type', TYPES),
  v.oneOf('accountType', ACCOUNT_TYPES),
  v.oneOf('fromAccountType', ACCOUNT_TYPES),
  v.oneOf('toAccountType', ACCOUNT_TYPES),
  v.oneOf('paymentMethod', PAYMENT_METHODS),
  v.text('note', { max: 500 }),
  v.date('expenseDate', { optional }),
  body('recurring').optional().isBoolean().withMessage('Recurring must be true or false').toBoolean(),
  recurringTypeRule,
  transferRule,
];

const listRules = [
  query('page').optional().isInt({ min: 1, max: 100000 }).toInt(),
  query('limit').optional().isInt({ min: 1, max: 100 }).withMessage('limit must be between 1 and 100').toInt(),
  query('type').optional().isIn([...TYPES, 'All']),
  query('category').optional().isString().isLength({ max: 50 }),
  query('search').optional().isString().isLength({ max: 100 }),
  query('recurring').optional().isBoolean().withMessage('recurring must be true or false').toBoolean(),
  query('startDate').optional({ values: 'falsy' }).isISO8601(),
  query('endDate').optional({ values: 'falsy' }).isISO8601(),
];

router.use(protect);

router.get('/analytics', [query('period').optional().isIn(['this_month', 'last_month', 'this_year', 'all_time'])], validate, getAnalytics);
router.get('/balances', getBalances);
router.get('/', listRules, validate, getExpenses);
router.get('/:id', v.uuidParam(), validate, getExpense);
router.post('/', sharedRules(false), validate, createExpense);
router.put('/:id', v.uuidParam(), sharedRules(true), validate, updateExpense);
router.delete('/:id', v.uuidParam(), validate, deleteExpense);

module.exports = router;
