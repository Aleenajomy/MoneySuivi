const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { getBudgets, createBudget, updateBudget, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const createRules = [
  body('category').trim().notEmpty().withMessage('Category is required'),
  body('monthlyLimit').isFloat({ min: 1 }).withMessage('Monthly limit must be greater than 0'),
];

const updateRules = [
  body('monthlyLimit').isFloat({ min: 1 }).withMessage('Monthly limit must be greater than 0'),
];

router.use(protect);
router.get('/', getBudgets);
router.post('/', createRules, validate, createBudget);
router.put('/:id', updateRules, validate, updateBudget);
router.delete('/:id', deleteBudget);

module.exports = router;
