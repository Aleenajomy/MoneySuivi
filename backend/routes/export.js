const express = require('express');
const router = express.Router();
const { exportPDF } = require('../controllers/exportController');
const { protect } = require('../middleware/auth');

router.use(protect);
router.get('/pdf', exportPDF);

module.exports = router;
