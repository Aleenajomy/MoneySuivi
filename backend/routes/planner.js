const router = require('express').Router();
const { body, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');
const { GROUPS, INCOME_KINDS, MAX_PLANNER_AMOUNT } = require('../utils/plannerCalculations');
const income = require('../controllers/plannerIncomeController');
const budget = require('../controllers/plannerBudgetController');

const PAYMENT_METHODS = ['UPI', 'Cash', 'Credit Card', 'Debit Card', 'Net Banking', 'Other'];
const YEAR = { min: 2000, max: 2100 };

const yearMonthQuery = [
  query('year').exists().withMessage('year is required').bail().isInt(YEAR).withMessage('year must be between 2000 and 2100').toInt(),
  query('month').exists().withMessage('month is required').bail().isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12').toInt(),
];
const yearMonthBody = [
  body('year').exists().withMessage('year is required').bail().isInt(YEAR).withMessage('year must be between 2000 and 2100').toInt(),
  body('month').exists().withMessage('month is required').bail().isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12').toInt(),
];

// Planned and expected amounts may be 0 (a placeholder line); received amounts must be positive.
const money = (field, { optional = false, allowZero = true, when } = {}) => {
  const min = allowZero ? 0 : 0.01;
  const start = when ? body(field).if(when) : body(field);
  const base = optional ? start.optional({ values: 'null' }) : start.exists({ values: 'null' }).withMessage(`${field} is required`).bail();
  return base
    .isFloat({ min, max: MAX_PLANNER_AMOUNT }).withMessage(`${field} must be a number between ${min} and ${MAX_PLANNER_AMOUNT}`).bail()
    .custom(value => /^\d+(\.\d{1,2})?$/.test(String(value).trim())).withMessage(`${field} can have at most 2 decimal places`);
};

const payDay = body('payDay').optional({ values: 'null' }).isInt({ min: 1, max: 31 }).withMessage('payDay must be between 1 and 31').toInt();

const sourceRules = (optional) => [
  v.text('name', { max: 50, required: !optional }),
  v.oneOf('kind', INCOME_KINDS),
  money('expectedAmount', { optional }),
  payDay,
];

const allocationRules = (prefix, optional) => [
  optional ? body(`${prefix}group`).optional().isIn(GROUPS).withMessage(`group must be one of: ${GROUPS.join(', ')}`)
    : body(`${prefix}group`).isIn(GROUPS).withMessage(`group must be one of: ${GROUPS.join(', ')}`),
  (optional ? body(`${prefix}name`).optional() : body(`${prefix}name`).exists({ values: 'null' }).withMessage('name is required').bail())
    .isString().withMessage('name must be text').bail().trim().notEmpty().withMessage('name is required').bail()
    .isLength({ max: 50 }).withMessage('name must be at most 50 characters'),
  money(`${prefix}plannedAmount`, { optional }),
  body(`${prefix}matchCategories`).optional().isArray({ max: 20 }).withMessage('matchCategories must be a list of at most 20 categories'),
  body(`${prefix}matchCategories.*`).isString().withMessage('Each category must be text').bail().trim()
    .isLength({ min: 1, max: 50 }).withMessage('Each category must be 1-50 characters'),
  body(`${prefix}recurring`).optional().isBoolean({ strict: true }).withMessage('recurring must be true or false'),
  body(`${prefix}sortOrder`).optional().isInt({ min: 0, max: 10000 }).withMessage('sortOrder must be a whole number').toInt(),
];

const receiveRules = [
  body('mode').isIn(['create', 'link']).withMessage('mode must be create or link'),
  body('expenseId').if(body('mode').equals('link')).isUUID().withMessage('expenseId is required to link a transaction'),
  money('receivedAmount', { allowZero: false, when: body('mode').equals('create') }),
  body('receivedAt').if(body('mode').equals('create')).exists({ values: 'falsy' }).withMessage('receivedAt is required').bail()
    .isISO8601().withMessage('receivedAt must be a valid date'),
  body('paymentMethod').optional({ values: 'null' }).isIn(PAYMENT_METHODS).withMessage(`paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`),
  v.text('note', { max: 500 }),
];

router.use(protect);

router.get('/overview', yearMonthQuery, validate, budget.getOverview);

router.get('/income-sources', income.listIncomeSources);
router.post('/income-sources', sourceRules(false), validate, income.createIncomeSource);
router.put('/income-sources/:id', v.uuidParam(), sourceRules(true), validate, income.updateIncomeSource);
router.patch('/income-sources/:id/active', v.uuidParam(), body('active').isBoolean({ strict: true }).withMessage('active must be true or false'), validate, income.setIncomeSourceActive);
router.delete('/income-sources/:id', v.uuidParam(), validate, income.deleteIncomeSource);

router.get('/salaries', yearMonthQuery, validate, income.getSalaries);
router.get('/salaries/history', [
  query('months').optional().isInt({ min: 1, max: 36 }).withMessage('months must be between 1 and 36').toInt(),
  query('year').optional().isInt(YEAR).toInt(),
  query('month').if(query('year').exists()).exists().withMessage('month is required with year').bail().isInt({ min: 1, max: 12 }).toInt(),
], validate, income.getSalaryHistory);
router.post('/salaries/initialize', yearMonthBody, validate, income.initializeSalaries);
router.post('/salaries', [...yearMonthBody, v.text('label', { max: 50, required: true }), v.oneOf('kind', INCOME_KINDS), money('expectedAmount')], validate, income.createSalary);
router.put('/salaries/:id', v.uuidParam(), [money('expectedAmount', { optional: true }), v.text('label', { max: 50 })], validate, income.updateSalary);
router.get('/salaries/:id/candidates', v.uuidParam(), validate, income.getLinkCandidates);
router.post('/salaries/:id/receive', v.uuidParam(), receiveRules, validate, income.receiveSalary);
router.post('/salaries/:id/undo', v.uuidParam(), body('deleteTransaction').optional().isBoolean({ strict: true }).withMessage('deleteTransaction must be true or false'), validate, income.undoReceived);
router.delete('/salaries/:id', v.uuidParam(), validate, income.deleteSalary);

router.get('/budgets', yearMonthQuery, validate, budget.getBudget);
router.post('/budgets', yearMonthBody, validate, budget.createBudget);
router.put('/budgets/allocations/:allocationId', v.uuidParam('allocationId'), allocationRules('', true), validate, budget.updateAllocation);
router.delete('/budgets/allocations/:allocationId', v.uuidParam('allocationId'), validate, budget.deleteAllocation);
router.post('/budgets/:id/copy-recurring', v.uuidParam(), validate, budget.copyRecurring);
router.post('/budgets/:id/allocations', v.uuidParam(), allocationRules('', false), validate, budget.addAllocation);
router.put('/budgets/:id', v.uuidParam(), [
  v.text('note', { max: 500 }),
  body('allocations').optional().isArray({ max: 100 }).withMessage('allocations must be a list of at most 100 items'),
  body('allocations.*.id').isUUID().withMessage('Each allocation needs a valid id'),
  ...allocationRules('allocations.*.', true),
], validate, budget.updateBudget);

module.exports = router;
