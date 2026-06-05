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
      return res.status(400).json({ success: false, message: 'Email already registered' });
    }

    const hashedPassword = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { name, email, password: hashedPassword },
    });
    const token = generateToken(user.id);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    Login user
// @route   POST /api/auth/login
// @access  Public
const login = async (req, res) => {
  try {
    const { email, password } = req.body;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user || !(await bcrypt.compare(password, user.password))) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    const token = generateToken(user.id);

    res.json({
      success: true,
      message: 'Login successful',
      token,
      user: { id: user.id, name: user.name, email: user.email },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
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

module.exports = { register, login, getMe, updateProfile, resetAllData };
