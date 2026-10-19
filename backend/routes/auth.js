const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const { register, login, getMe, updateProfile, resetAllData, forgotPassword, resetPassword } = require('../controllers/authController');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const limits = require('../middleware/rateLimit');
const v = require('../validators/common');

const registerRules = [
  v.text('name', { max: 50, required: true }),
  v.email(),
  v.password('password'),
];

const loginRules = [
  v.email(),
  // No length policy here: accounts created under the old 6-character rule must still sign in.
  body('password').isString().notEmpty().withMessage('Password is required').isLength({ max: 1024 }),
];

const profileRules = [
  v.text('name', { max: 50 }).notEmpty().withMessage('Name cannot be empty'),
  v.amount('budgetLimit', { optional: true, allowZero: true }),
  body('currency').optional().isString().matches(/^[A-Z]{3}$/).withMessage('Currency must be a 3-letter ISO code'),
  body('currentPassword').optional().isString().isLength({ max: 1024 }),
  body('password').optional({ values: 'falsy' }).isString().isLength({ min: v.PASSWORD_MIN, max: v.PASSWORD_MAX })
    .withMessage(`Password must be ${v.PASSWORD_MIN}-${v.PASSWORD_MAX} characters`),
];

const resetPasswordRules = [
  body('token').isString().isLength({ min: 20, max: 200 }).withMessage('Invalid reset token'),
  v.password('password'),
];

router.post('/register', limits.registerLimiter, registerRules, validate, register);
router.post('/login', limits.loginLimiter, loginRules, validate, limits.loginAccountLimiter, login);
router.get('/me', protect, getMe);
router.put('/profile', protect, profileRules, validate, updateProfile);
router.post('/forgot-password', limits.forgotPasswordLimiter, [v.email()], validate, limits.forgotPasswordAccountLimiter, forgotPassword);
router.post('/reset-password', limits.resetPasswordLimiter, resetPasswordRules, validate, resetPassword);
router.delete('/reset', protect, [body('password').isString().notEmpty().withMessage('Password is required to reset data')], validate, resetAllData);

module.exports = router;
