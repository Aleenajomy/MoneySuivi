const express = require('express');
const router = express.Router();
const mailService = require('../services/mailService');
const { protect } = require('../middleware/auth');
const { validate } = require('../middleware/validate');
const { supportLimiter } = require('../middleware/rateLimit');
const { config } = require('../config/env');
const { escapeHtml, sanitizeHeader } = require('../utils/html');
const logger = require('../utils/logger');
const v = require('../validators/common');

const ticketRules = [
  v.text('subject', { max: 150, required: true }),
  v.text('message', { max: 5000, required: true }),
];

router.post('/ticket', protect, supportLimiter, ticketRules, validate, async (req, res) => {
  if (!config.supportEmailTo) {
    return res.status(503).json({ success: false, message: 'Support is temporarily unavailable. Please try again later.' });
  }

  const subject = sanitizeHeader(req.body.subject);
  const { message } = req.body;
  const { name, email } = req.user;

  const html = `
    <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
      <h2 style="color: #4f46e5; margin-top: 0;">New Support Ticket</h2>
      <p><strong>From:</strong> ${escapeHtml(name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(email)}</p>
      <p><strong>Subject:</strong> ${escapeHtml(subject)}</p>
      <div style="background-color: #f8fafc; padding: 15px; border-left: 4px solid #4f46e5; white-space: pre-wrap;">${escapeHtml(message)}</div>
    </div>`;
  const text = `Support Ticket\nFrom: ${name} (${email})\nSubject: ${subject}\n\n${message}`;

  try {
    const result = await mailService.sendEmail({
      to: config.supportEmailTo,
      replyTo: email,
      subject: `[Support Ticket] ${subject}`,
      text,
      html,
    });
    if (!result?.success) {
      return res.status(503).json({ success: false, message: 'Support is temporarily unavailable. Please try again later.' });
    }
    res.json({ success: true, message: 'Support ticket sent successfully' });
  } catch (error) {
    logger.error('[Support] Failed to send ticket email', { userId: req.user.id, error: error.message });
    res.status(502).json({ success: false, message: 'We could not send your ticket right now. Please try again later.' });
  }
});

module.exports = router;
