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
} = require('../controllers/expenseController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const expenseRules = [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be greater than 0'),
  body('category').notEmpty().withMessage('Category is required'),
  body('expenseDate').notEmpty().withMessage('Date is required'),
];

router.use(protect); // All expense routes are protected

router.get('/analytics', getAnalytics);
router.get('/', getExpenses);
router.get('/:id', getExpense);
router.post('/', expenseRules, validate, createExpense);
router.put('/:id', updateExpense);
router.delete('/:id', deleteExpense);

module.exports = router;
