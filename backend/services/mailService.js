const nodemailer = require('nodemailer');

const sendEmail = async ({ to, replyTo, subject, text, html }) => {
  const host = process.env.EMAIL_HOST || 'smtp.gmail.com';
  const port = parseInt(process.env.EMAIL_PORT || '587', 10);
  const user = process.env.EMAIL_USER;
  const pass = process.env.EMAIL_PASS;

  if (!user || !pass) {
    console.warn('⚠️ SMTP credentials (EMAIL_USER / EMAIL_PASS) not configured in .env. Email was not sent.');
    return { success: false, error: 'SMTP credentials not configured' };
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // true for 465, false for other ports
    auth: {
      user,
      pass,
    },
    tls: {
      rejectUnauthorized: false
    }
  });

  const mailOptions = {
    from: `"SmartExpense Support" <${user}>`,
    to: to || process.env.EMAIL_TO || 'aleenallu34@gmail.com',
    replyTo: replyTo || user,
    subject,
    text,
    html,
  };

  try {
    const info = await transporter.sendMail(mailOptions);
    console.log('✉️ Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('❌ Error sending email via Nodemailer:', error.message);
    throw error;
  }
};

module.exports = { sendEmail };
