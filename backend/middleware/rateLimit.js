const { rateLimit } = require('express-rate-limit');
const { config } = require('../config/env');

// In-memory counters are per process. That is adequate for the current single Render instance;
// running several instances would need a shared store (see docs/PRODUCTION.md).
const limiter = ({ windowMs, limit, keyGenerator, message }) => rateLimit({
  windowMs,
  limit,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: () => !config.rateLimitEnabled,
  ...(keyGenerator && { keyGenerator }),
  handler: (req, res) => res.status(429).json({
    success: false,
    code: 'RATE_LIMITED',
    message: message || 'Too many attempts. Please wait a few minutes and try again.',
  }),
});

const normalizedEmail = (req) => String(req.body?.email || '').trim().toLowerCase();

const MINUTE = 60 * 1000;

// Per-IP limits are deliberately generous: Indian mobile carriers put many users behind one
// carrier-grade NAT address. The per-account limits are the tighter control.

module.exports = {
  loginLimiter: limiter({ windowMs: 15 * MINUTE, limit: 50 }),
  // Per-account limit stops slow distributed guessing against one email from many IPs.
  loginAccountLimiter: limiter({ windowMs: 15 * MINUTE, limit: 10, keyGenerator: (req) => `login:${normalizedEmail(req)}` }),
  registerLimiter: limiter({ windowMs: 60 * MINUTE, limit: 20 }),
  forgotPasswordLimiter: limiter({ windowMs: 15 * MINUTE, limit: 10 }),
  forgotPasswordAccountLimiter: limiter({ windowMs: 60 * MINUTE, limit: 3, keyGenerator: (req) => `forgot:${normalizedEmail(req)}` }),
  resetPasswordLimiter: limiter({ windowMs: 15 * MINUTE, limit: 20 }),
  supportLimiter: limiter({ windowMs: 60 * MINUTE, limit: 5, message: 'Too many support requests. Please try again later.' }),
  apiLimiter: limiter({ windowMs: MINUTE, limit: 600 }),
};
