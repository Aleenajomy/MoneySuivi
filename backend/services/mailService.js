const nodemailer = require('nodemailer');
const { sanitizeHeader } = require('../utils/html');
const logger = require('../utils/logger');

let transporter;
const getTransporter = () => {
  if (transporter) return transporter;
  const user = process.env.EMAIL_USER?.trim();
  const pass = process.env.EMAIL_PASS?.trim();
  if (!user || !pass) return null;

  const host = (process.env.EMAIL_HOST || 'smtp.gmail.com').trim();
  const port = parseInt(String(process.env.EMAIL_PORT || '587').trim(), 10);
  transporter = host.includes('gmail.com')
    ? nodemailer.createTransport({ service: 'gmail', auth: { user, pass } })
    : nodemailer.createTransport({ host, port, secure: port === 465, auth: { user, pass } });
  return transporter;
};

/**
 * Sends an email. Resolves { success: false } when SMTP is not configured so callers can decide
 * how to degrade; throws on delivery errors. A recipient is always required: there is no fallback.
 */
const sendEmail = async ({ to, replyTo, subject, text, html }) => {
  if (!to) throw new Error('Email recipient is required');
  const transport = getTransporter();
  if (!transport) {
    logger.warn('[Mail] SMTP credentials not configured; email not sent');
    return { success: false, error: 'SMTP not configured' };
  }

  const info = await transport.sendMail({
    from: `"MoneySuivi" <${process.env.EMAIL_FROM || process.env.EMAIL_USER.trim()}>`,
    to: sanitizeHeader(to),
    ...(replyTo && { replyTo: sanitizeHeader(replyTo) }),
    subject: sanitizeHeader(subject),
    text,
    html,
  });
  logger.info('[Mail] Email sent', { messageId: info.messageId });
  return { success: true, messageId: info.messageId };
};

module.exports = { sendEmail };
