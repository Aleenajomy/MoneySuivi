const express = require('express');
const router = express.Router();
const { getBudgets, createBudget, updateBudget, deleteBudget } = require('../controllers/budgetController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');

router.use(protect);
router.get('/', getBudgets);
router.post('/', [v.text('category', { max: 50, required: true }), v.amount('monthlyLimit', { min: 1 })], validate, createBudget);
router.put('/:id', v.uuidParam(), [v.amount('monthlyLimit', { min: 1 })], validate, updateBudget);
router.delete('/:id', v.uuidParam(), validate, deleteBudget);

module.exports = router;
