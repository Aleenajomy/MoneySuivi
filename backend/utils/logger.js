const { config } = require('../config/env');

// Keys whose values must never reach logs, even when an error object carries them.
const REDACT = /pass(word)?|token|secret|authorization|cookie|newPassword|currentPassword/i;

const redact = (value, depth = 0) => {
  if (!value || typeof value !== 'object' || depth > 4) return value;
  if (Array.isArray(value)) return value.map(v => redact(v, depth + 1));
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, REDACT.test(k) ? '[REDACTED]' : redact(v, depth + 1)]));
};

const write = (level, message, meta) => {
  if (config.isTest && process.env.LOG_IN_TESTS !== 'true') return;
  const safeMeta = meta === undefined ? undefined : redact(typeof meta === 'object' && meta !== null ? meta : { detail: meta });
  const line = config.isProduction
    ? JSON.stringify({ time: new Date().toISOString(), level, message, ...safeMeta })
    : `${level.toUpperCase()} ${message}${safeMeta ? ' ' + JSON.stringify(safeMeta) : ''}`;
  (level === 'error' ? console.error : level === 'warn' ? console.warn : console.log)(line);
};

module.exports = {
  info: (msg, meta) => write('info', msg, meta),
  warn: (msg, meta) => write('warn', msg, meta),
  error: (msg, meta) => write('error', msg, meta),
  redact,
};
