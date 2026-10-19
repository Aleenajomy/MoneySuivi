const isProduction = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const DEFAULT_ORIGINS = [
  'https://smartexpencetracker-frontend.onrender.com',
  'https://smartexpencetracker.onrender.com',
];
const DEV_ORIGINS = ['http://localhost:3000', 'http://localhost:5173', 'http://localhost:4173'];

const list = (value) => String(value || '').split(',').map(s => s.trim()).filter(Boolean);

const config = {
  isProduction,
  isTest,
  port: Number(process.env.PORT) || 5000,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpire: process.env.JWT_EXPIRE || '7d',
  appUrl: (process.env.APP_URL || DEFAULT_ORIGINS[0]).replace(/\/+$/, ''),
  supportEmailTo: process.env.SUPPORT_EMAIL_TO || process.env.EMAIL_TO || null,
  timezone: process.env.APP_TIMEZONE || 'Asia/Kolkata',
  cronEnabled: process.env.CRON_ENABLED !== 'false' && !isTest,
  rateLimitEnabled: process.env.RATE_LIMIT_ENABLED !== 'false',
  passwordResetTtlMinutes: Number(process.env.PASSWORD_RESET_TTL_MINUTES) || 30,
  allowedOrigins: [...DEFAULT_ORIGINS, ...(isProduction ? [] : DEV_ORIGINS), ...list(process.env.CORS_ORIGINS)],
};

// Fail fast: a missing or weak JWT secret would let anyone forge sessions.
const validateEnv = () => {
  const problems = [];
  if (!process.env.DATABASE_URL) problems.push('DATABASE_URL is required');
  if (!config.jwtSecret) problems.push('JWT_SECRET is required');
  else if (isProduction && config.jwtSecret.length < 32) problems.push('JWT_SECRET must be at least 32 characters in production');
  if (isProduction && !process.env.APP_URL) problems.push('APP_URL is required in production (used in password reset links)');
  if (problems.length) {
    throw new Error(`Invalid environment configuration:\n - ${problems.join('\n - ')}`);
  }
  if (!config.supportEmailTo) console.warn('[Config] SUPPORT_EMAIL_TO not set; support tickets will be rejected');
  if (!process.env.EMAIL_USER || !process.env.EMAIL_PASS) console.warn('[Config] SMTP not configured; password reset and support emails will not be delivered');
};

module.exports = { config, validateEnv };
