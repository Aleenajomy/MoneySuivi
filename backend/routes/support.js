const express = require('express');
const router = express.Router();
const { sendEmail } = require('../services/mailService');
const { protect } = require('../middleware/auth');

router.post('/ticket', protect, async (req, res) => {
  try {
    const { subject, message } = req.body;
    const userName = req.user.name || 'Anonymous User';
    const userEmail = req.user.email || 'No email provided';

    if (!subject || !message) {
      return res.status(400).json({ success: false, message: 'Subject and message are required' });
    }

    const emailSubject = `[Support Ticket] ${subject}`;
    const emailBody = `
      <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #4f46e5; border-bottom: 2px solid #eef2f6; padding-bottom: 10px; margin-top: 0;">New Support Ticket</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr>
            <td style="padding: 6px 0; font-weight: bold; width: 100px; color: #475569;">From:</td>
            <td style="padding: 6px 0; color: #1e293b;">${userName}</td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #475569;">Email:</td>
            <td style="padding: 6px 0; color: #1e293b;"><a href="mailto:${userEmail}" style="color: #4f46e5; text-decoration: none;">${userEmail}</a></td>
          </tr>
          <tr>
            <td style="padding: 6px 0; font-weight: bold; color: #475569;">Subject:</td>
            <td style="padding: 6px 0; color: #1e293b; font-style: italic;">${subject}</td>
          </tr>
        </table>
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; border-left: 4px solid #4f46e5; margin-bottom: 20px;">
          <p style="margin: 0; white-space: pre-wrap; color: #334155; line-height: 1.5;">${message}</p>
        </div>
        <hr style="border: 0; border-top: 1px solid #eef2f6; margin-bottom: 15px;" />
        <p style="font-size: 11px; color: #94a3b8; margin: 0; text-align: center;">This ticket was submitted from SmartExpense Tracker.</p>
      </div>
    `;

    const textBody = `Support Ticket:\nFrom: ${userName} (${userEmail})\nSubject: ${subject}\n\nMessage:\n${message}`;

    await sendEmail({
      to: process.env.EMAIL_TO || 'aleenallu34@gmail.com',
      replyTo: userEmail,
      subject: emailSubject,
      text: textBody,
      html: emailBody
    });

    res.json({ success: true, message: 'Support ticket sent successfully' });
  } catch (error) {
    console.error('Failed to send support email:', error);
    res.status(500).json({ success: false, message: 'Failed to send support ticket' });
  }
});

module.exports = router;
