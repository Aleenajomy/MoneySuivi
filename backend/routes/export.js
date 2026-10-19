const express = require('express');
const router = express.Router();
const { query } = require('express-validator');
const { exportPDF, exportCSV } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');

const filterRules = [
  query('startDate').optional({ values: 'falsy' }).isDate({ format: 'YYYY-MM-DD', strictMode: true }),
  query('endDate').optional({ values: 'falsy' }).isDate({ format: 'YYYY-MM-DD', strictMode: true }),
  query('type').optional().isIn(['expense', 'income', 'transfer', 'All']),
  query('category').optional().isString().isLength({ max: 50 }),
  query('search').optional().isString().isLength({ max: 100 }),
];

router.use(protect);
router.get('/pdf', filterRules, validate, exportPDF);
router.get('/csv', filterRules, validate, exportCSV);

module.exports = router;
