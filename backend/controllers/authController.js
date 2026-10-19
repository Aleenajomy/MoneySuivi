const bcrypt = require('bcrypt');
const prisma = require('../lib/prisma');
const { signToken } = require('../middleware/auth');
const passwordResetService = require('../services/passwordResetService');
const { BCRYPT_ROUNDS } = passwordResetService;
const { handleError } = require('../utils/http');
const logger = require('../utils/logger');

// Compared against when no account exists so login takes the same time either way.
const DUMMY_HASH = bcrypt.hashSync('timing-equaliser-not-a-real-password', BCRYPT_ROUNDS);

const INVALID_CREDENTIALS = { success: false, code: 'INVALID_CREDENTIALS', message: 'Invalid email or password.' };
const RESET_REQUESTED_MESSAGE = 'If an account exists for that email, a password reset link has been sent.';

const toUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  budgetLimit: user.budgetLimit,
  currency: user.currency,
  createdAt: user.createdAt,
});

const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });
    if (existingUser) {
      return res.status(409).json({ success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await prisma.user.create({ data: { name, email, password: hashedPassword } });

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    if (error?.code === 'P2002') {
      return res.status(409).json({ success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
    }
    handleError(res, error, 'auth.register');
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findFirst({ where: { email: { equals: email, mode: 'insensitive' } } });

    const isMatch = await bcrypt.compare(password, user?.password || DUMMY_HASH).catch(() => false);
    if (!user || !isMatch) return res.status(401).json(INVALID_CREDENTIALS);

    return res.json({
      success: true,
      message: 'Login successful',
      token: signToken(user),
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    handleError(res, error, 'auth.login');
  }
};

const getMe = async (req, res) => {
  res.json({ success: true, user: toUserResponse(req.user) });
};

const updateProfile = async (req, res) => {
  try {
    const { name, budgetLimit, currency, currentPassword, password } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (budgetLimit !== undefined) data.budgetLimit = budgetLimit;
    if (currency !== undefined) data.currency = currency;

    if (password) {
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required' });
      const isMatch = await bcrypt.compare(currentPassword, req.user.password);
      if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      data.password = await bcrypt.hash(password, BCRYPT_ROUNDS);
      data.tokenVersion = { increment: 1 };
    }

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    // A password change revokes old sessions, so hand this device a fresh token.
    res.json({ success: true, message: 'Profile updated', user: toUserResponse(user), ...(password && { token: signToken(user) }) });
  } catch (error) {
    handleError(res, error, 'auth.updateProfile');
  }
};

// Deletes the user's financial data but keeps the account, its sessions and device registrations.
const resetAllData = async (req, res) => {
  try {
    const isMatch = await bcrypt.compare(req.body.password, req.user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Password is incorrect' });

    const userId = req.user.id;
    await prisma.$transaction([
      prisma.ledgerEntry.deleteMany({ where: { userId } }),
      prisma.ledgerContact.deleteMany({ where: { userId } }),
      prisma.eMIPayment.deleteMany({ where: { emi: { userId } } }),
      prisma.eMI.deleteMany({ where: { userId } }),
      prisma.expense.deleteMany({ where: { userId } }),
      prisma.budget.deleteMany({ where: { userId } }),
      prisma.asset.deleteMany({ where: { userId } }),
      prisma.liability.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
      prisma.user.update({ where: { id: userId }, data: { budgetLimit: 0 } }),
    ]);
    res.json({ success: true, message: 'All data reset successfully' });
  } catch (error) {
    handleError(res, error, 'auth.resetAllData');
  }
};

const forgotPassword = async (req, res) => {
  try {
    // Not awaited: the response must not take longer when the account exists.
    passwordResetService.requestReset(req.body.email)
      .catch(err => logger.error('[PasswordReset] Request failed', { error: err.message }));
    res.json({ success: true, message: RESET_REQUESTED_MESSAGE });
  } catch (error) {
    handleError(res, error, 'auth.forgotPassword');
  }
};

const resetPassword = async (req, res) => {
  try {
    const ok = await passwordResetService.resetPassword(req.body.token, req.body.password);
    if (!ok) {
      return res.status(400).json({ success: false, code: 'INVALID_RESET_TOKEN', message: 'This reset link is invalid or has expired. Please request a new one.' });
    }
    res.json({ success: true, message: 'Password reset successfully. Please sign in.' });
  } catch (error) {
    handleError(res, error, 'auth.resetPassword');
  }
};

module.exports = { register, login, getMe, updateProfile, resetAllData, forgotPassword, resetPassword };
