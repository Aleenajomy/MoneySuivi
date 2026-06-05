const express = require('express');
const router = express.Router();
const { exportCSV, exportPDF } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/csv', exportCSV);
router.get('/pdf', exportPDF);

module.exports = router;
