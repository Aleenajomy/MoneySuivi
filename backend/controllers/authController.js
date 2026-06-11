const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const prisma = require('../lib/prisma');

const toUserResponse = (user) => ({
  id: user.id,
  name: user.name,
  email: user.email,
  budgetLimit: user.budgetLimit,
  currency: user.currency,
  createdAt: user.createdAt,
});

// Generate JWT Token
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, { expiresIn: process.env.JWT_EXPIRE });
};

// @desc    Register user
// @route   POST /api/auth/register
// @access  Public
const register = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      // 409 Conflict — email already taken
      return res.status(409).json({ success: false, code: 'EMAIL_EXISTS', message: 'An account with this email already exists.' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Account created successfully.',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Registration failed. Please try again.' });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // Step 1: check if the account exists
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) {
      // 404 — no account with that email
      return res.status(404).json({ success: false, code: 'USER_NOT_FOUND', message: 'No account found with this email address. Please create an account first.' });
    }

    // Step 2: verify the password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      // 401 — account exists but password is wrong
      return res.status(401).json({ success: false, code: 'WRONG_PASSWORD', message: 'Incorrect password. Please try again.' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
};

// @desc    Get current user profile
// @route   GET /api/auth/me
// @access  Private
const getMe = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    res.json({
      success: true,
      user: toUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Update user profile
// @route   PUT /api/auth/profile
// @access  Private
const updateProfile = async (req, res) => {
  try {
    const { name, budgetLimit, currency, currentPassword, password } = req.body;
    const data = {};
    if (name !== undefined) data.name = name;
    if (budgetLimit !== undefined) data.budgetLimit = Number(budgetLimit);
    if (currency !== undefined) data.currency = currency;

    if (password) {
      const user = await prisma.user.findUnique({ where: { id: req.user.id } });
      if (!currentPassword) return res.status(400).json({ success: false, message: 'Current password is required' });
      const isMatch = await bcrypt.compare(currentPassword, user.password);
      if (!isMatch) return res.status(400).json({ success: false, message: 'Current password is incorrect' });
      data.password = await bcrypt.hash(password, 12);
    }

    const user = await prisma.user.update({ where: { id: req.user.id }, data });
    res.json({ success: true, message: 'Profile updated', user: toUserResponse(user) });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const resetAllData = async (req, res) => {
  try {
    const userId = req.user.id;
    await Promise.all([
      prisma.expense.deleteMany({ where: { userId } }),
      prisma.budget.deleteMany({ where: { userId } }),
      prisma.eMI.deleteMany({ where: { userId } }),
      prisma.asset.deleteMany({ where: { userId } }),
      prisma.liability.deleteMany({ where: { userId } }),
      prisma.notification.deleteMany({ where: { userId } }),
    ]);
    res.json({ success: true, message: 'All data reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

const forgotPassword = async (req, res) => {
  try {
    const { email, newPassword } = req.body;
    if (!email || !newPassword) return res.status(400).json({ success: false, message: 'Email and new password are required' });
    if (newPassword.length < 6) return res.status(400).json({ success: false, message: 'Password must be at least 6 characters' });
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(404).json({ success: false, message: 'No account found with this email' });
    const hashed = await bcrypt.hash(newPassword, 12);
    await prisma.user.update({ where: { email }, data: { password: hashed } });
    res.json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

module.exports = { register, login, getMe, updateProfile, resetAllData, forgotPassword };
