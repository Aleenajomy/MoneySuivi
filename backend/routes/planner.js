const router = require('express').Router();
const { body, query } = require('express-validator');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const v = require('../validators/common');
const { GROUPS, INCOME_KINDS, MAX_PLANNER_AMOUNT } = require('../utils/plannerCalculations');
const income = require('../controllers/plannerIncomeController');
const budget = require('../controllers/plannerBudgetController');
const goals = require('../controllers/plannerGoalController');
const investments = require('../controllers/plannerInvestmentController');
const bills = require('../controllers/plannerBillsController');
const report = require('../controllers/plannerReportController');

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
  // Optional means "may be left out"; an explicit null is an error, never a silent ₹0.
  const base = optional ? start.optional() : start.exists({ values: 'null' }).withMessage(`${field} is required`).bail();
  return base
    .isFloat({ min, max: MAX_PLANNER_AMOUNT }).withMessage(`${field} must be a number between ${min} and ${MAX_PLANNER_AMOUNT}`).bail()
    .custom(value => /^\d+(\.\d{1,2})?$/.test(String(value).trim())).withMessage(`${field} can have at most 2 decimal places`);
};

// Trimmed and required to be non-empty whenever it is sent, on create and on update alike.
const name = (field, { required = false } = {}) => (required
  ? body(field).exists({ values: 'null' }).withMessage(`${field} is required`).bail()
  : body(field).optional())
  .isString().withMessage(`${field} must be text`).bail()
  .trim()
  .notEmpty().withMessage(`${field} cannot be empty`).bail()
  .isLength({ max: 50 }).withMessage(`${field} must be at most 50 characters`);

const kind = body('kind').optional().isIn(INCOME_KINDS).withMessage(`kind must be one of: ${INCOME_KINDS.join(', ')}`);

// A goal or investment id to link, or null to unlink.
const linkId = (field) => body(field).optional()
  .custom(value => value === null || (typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value)))
  .withMessage(`${field} must be a valid id or null`);

// Strict calendar day, so an impossible date such as 2026-02-30 is rejected, not rolled over.
const strictDate = (field, { optional = false, nullable = false } = {}) => {
  let chain = body(field);
  if (optional) chain = chain.optional();
  else chain = chain.exists({ values: 'falsy' }).withMessage(`${field} is required`).bail();
  if (nullable) chain = chain.if(value => value !== null);
  return chain
    .isString().withMessage(`${field} must be a date like 2026-11-01`).bail()
    .matches(/^\d{4}-\d{2}-\d{2}/).withMessage(`${field} must be a date like 2026-11-01`).bail()
    .isISO8601({ strict: true, strictSeparator: true }).withMessage(`${field} must be a valid date`).bail()
    .custom(value => value.slice(0, 4) >= '2000' && value.slice(0, 4) <= '2100').withMessage(`${field} must be between 2000 and 2100`);
};

const INVESTMENT_CATEGORIES = ['GOLD', 'GOLD_ETF', 'MUTUAL_FUND', 'INDEX_FUND', 'STOCK', 'OTHER'];

const goalRules = (optional) => [
  name('name', { required: !optional }),
  // A target of 0 would make progress meaningless; the database enforces the same.
  money('targetAmount', { optional, allowZero: false }),
  money('initialAmount', { optional: true }),
  body('monthlyContribution').optional().if(value => value !== null)
    .isFloat({ min: 0, max: MAX_PLANNER_AMOUNT }).withMessage(`monthlyContribution must be a number between 0 and ${MAX_PLANNER_AMOUNT}`).bail()
    .custom(value => /^\d+(\.\d{1,2})?$/.test(String(value).trim())).withMessage('monthlyContribution can have at most 2 decimal places'),
  strictDate('targetDate', { optional: true, nullable: true }),
  v.text('note', { max: 500 }),
];

const contributionRules = [
  body('type').isIn(['CONTRIBUTION', 'WITHDRAWAL']).withMessage('type must be CONTRIBUTION or WITHDRAWAL'),
  money('amount', { allowZero: false }),
  strictDate('date'),
  v.text('note', { max: 300 }),
];

const investmentRules = (optional) => [
  name('name', { required: !optional }),
  (optional ? body('category').optional() : body('category'))
    .isIn(INVESTMENT_CATEGORIES).withMessage(`category must be one of: ${INVESTMENT_CATEGORIES.join(', ')}`),
  money('monthlyPlannedAmount', { optional: true }),
  v.text('note', { max: 500 }),
];

const investmentTxRules = [
  body('type').isIn(['BUY', 'REDEEM']).withMessage('type must be BUY or REDEEM'),
  money('amount', { allowZero: false }),
  strictDate('date'),
  body('paymentMethod').optional({ values: 'null' }).isIn(PAYMENT_METHODS).withMessage(`paymentMethod must be one of: ${PAYMENT_METHODS.join(', ')}`),
  v.text('note', { max: 300 }),
];

const optionalPeriodQuery = [
  query('year').optional().isInt(YEAR).withMessage('year must be between 2000 and 2100').toInt(),
  query('month').if(query('year').exists()).exists().withMessage('month is required with year').bail()
    .isInt({ min: 1, max: 12 }).withMessage('month must be between 1 and 12').toInt(),
];

const payDay = body('payDay').optional({ values: 'null' }).isInt({ min: 1, max: 31 }).withMessage('payDay must be between 1 and 31').toInt();

const sourceRules = (optional) => [
  name('name', { required: !optional }),
  kind,
  money('expectedAmount', { optional }),
  payDay,
];

const allocationRules = (prefix, optional) => [
  optional ? body(`${prefix}group`).optional().isIn(GROUPS).withMessage(`group must be one of: ${GROUPS.join(', ')}`)
    : body(`${prefix}group`).isIn(GROUPS).withMessage(`group must be one of: ${GROUPS.join(', ')}`),
  name(`${prefix}name`, { required: !optional }),
  money(`${prefix}plannedAmount`, { optional }),
  body(`${prefix}matchCategories`).optional().isArray({ max: 20 }).withMessage('matchCategories must be a list of at most 20 categories'),
  body(`${prefix}matchCategories.*`).isString().withMessage('Each category must be text').bail().trim()
    .isLength({ min: 1, max: 50 }).withMessage('Each category must be 1-50 characters'),
  body(`${prefix}recurring`).optional().isBoolean({ strict: true }).withMessage('recurring must be true or false'),
  body(`${prefix}sortOrder`).optional().isInt({ min: 0, max: 10000 }).withMessage('sortOrder must be a whole number').toInt(),
  linkId(`${prefix}savingsGoalId`),
  linkId(`${prefix}investmentPlanId`),
];

const receiveRules = [
  body('mode').isIn(['create', 'link']).withMessage('mode must be create or link'),
  body('expenseId').if(body('mode').equals('link')).isUUID().withMessage('expenseId is required to link a transaction'),
  money('receivedAmount', { allowZero: false, when: body('mode').equals('create') }),
  body('receivedAt').if(body('mode').equals('create')).exists({ values: 'falsy' }).withMessage('receivedAt is required').bail()
    // Strict: an impossible day such as 2026-02-30 is rejected rather than rolled into March.
    .matches(/^\d{4}-\d{2}-\d{2}/).withMessage('receivedAt must be a date like 2026-11-01').bail()
    .isISO8601({ strict: true, strictSeparator: true }).withMessage('receivedAt must be a valid date'),
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
router.post('/salaries', [...yearMonthBody, name('label', { required: true }), kind, money('expectedAmount')], validate, income.createSalary);
router.put('/salaries/:id', v.uuidParam(), [money('expectedAmount', { optional: true }), name('label')], validate, income.updateSalary);
router.get('/salaries/:id/candidates', v.uuidParam(), validate, income.getLinkCandidates);
router.post('/salaries/:id/receive', v.uuidParam(), receiveRules, validate, income.receiveSalary);
router.post('/salaries/:id/undo', v.uuidParam(), body('deleteTransaction').optional().isBoolean({ strict: true }).withMessage('deleteTransaction must be true or false'), validate, income.undoReceived);
router.delete('/salaries/:id', v.uuidParam(), validate, income.deleteSalary);

router.get('/budgets', yearMonthQuery, validate, budget.getBudget);
router.get('/budgets/spending', yearMonthQuery, validate, budget.getSpending);
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

router.put('/transactions/:expenseId/assignment', v.uuidParam('expenseId'),
  body('allocationId').isUUID().withMessage('allocationId must be a valid id'), validate, budget.assignTransaction);
router.delete('/transactions/:expenseId/assignment', v.uuidParam('expenseId'), validate, budget.clearAssignment);

router.get('/bills', optionalPeriodQuery, validate, bills.getBills);
router.get('/report', [
  ...optionalPeriodQuery,
  query('months').optional().isInt({ min: 2, max: 12 }).withMessage('months must be between 2 and 12').toInt(),
], validate, report.getReport);

router.get('/goals', optionalPeriodQuery, validate, goals.listGoals);
router.post('/goals', goalRules(false), validate, goals.createGoal);
router.put('/goals/:id', v.uuidParam(), goalRules(true), validate, goals.updateGoal);
router.patch('/goals/:id/archive', v.uuidParam(), body('archived').isBoolean({ strict: true }).withMessage('archived must be true or false'), validate, goals.setGoalArchived);
router.delete('/goals/contributions/:contributionId', v.uuidParam('contributionId'), validate, goals.deleteContribution);
router.delete('/goals/:id', v.uuidParam(), validate, goals.deleteGoal);
router.get('/goals/:id/contributions', v.uuidParam(), validate, goals.listContributions);
router.post('/goals/:id/contributions', v.uuidParam(), contributionRules, validate, goals.addContribution);

router.get('/investments', optionalPeriodQuery, validate, investments.listInvestments);
router.post('/investments', investmentRules(false), validate, investments.createInvestment);
router.delete('/investments/transactions/:txId', v.uuidParam('txId'), validate, investments.deleteTransaction);
router.put('/investments/:id', v.uuidParam(), investmentRules(true), validate, investments.updateInvestment);
router.patch('/investments/:id/active', v.uuidParam(), body('active').isBoolean({ strict: true }).withMessage('active must be true or false'), validate, investments.setInvestmentActive);
router.delete('/investments/:id', v.uuidParam(), query('deleteTransactions').optional().isIn(['true', 'false']), validate, investments.deleteInvestment);
router.get('/investments/:id/transactions', v.uuidParam(), validate, investments.listTransactions);
router.post('/investments/:id/transactions', v.uuidParam(), investmentTxRules, validate, investments.addTransaction);

module.exports = router;
