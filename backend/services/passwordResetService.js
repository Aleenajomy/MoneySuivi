const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const prisma = require('../lib/prisma');
const { config } = require('../config/env');
const mailService = require('./mailService');
const logger = require('../utils/logger');
const { escapeHtml } = require('../utils/html');

const BCRYPT_ROUNDS = 12;

// Only the SHA-256 of a token is stored, so a database leak cannot be replayed as reset links.
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

const findUserByEmail = (email) => prisma.user.findFirst({
  where: { email: { equals: email, mode: 'insensitive' } },
});

const buildResetEmail = (name, link, ttlMinutes) => ({
  subject: 'Reset your MoneySuivi password',
  text: `Hi ${name},\n\nUse this link to reset your MoneySuivi password. It expires in ${ttlMinutes} minutes and can be used once:\n\n${link}\n\nIf you did not request this, you can ignore this email; your password will not change.`,
  html: `<p>Hi ${escapeHtml(name)},</p>
<p>Use the link below to reset your MoneySuivi password. It expires in ${ttlMinutes} minutes and can be used once.</p>
<p><a href="${escapeHtml(link)}">Reset password</a></p>
<p>If you did not request this, you can ignore this email; your password will not change.</p>`,
});

/**
 * Issues a reset token for the account if one exists. Callers must respond identically
 * whether or not the account exists, so this never reports the outcome.
 */
const requestReset = async (email) => {
  const user = await findUserByEmail(email);
  if (!user) return;

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = new Date(Date.now() + config.passwordResetTtlMinutes * 60 * 1000);

  await prisma.$transaction([
    // A new request supersedes older links so only the latest email works.
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    prisma.passwordResetToken.create({ data: { userId: user.id, tokenHash: hashToken(token), expiresAt } }),
  ]);

  const link = `${config.appUrl}/#/reset-password?token=${encodeURIComponent(token)}`;
  const message = buildResetEmail(user.name, link, config.passwordResetTtlMinutes);
  try {
    const result = await mailService.sendEmail({ to: user.email, ...message });
    if (!result?.success) logger.warn('[PasswordReset] Reset email not delivered: SMTP not configured', { userId: user.id });
  } catch (err) {
    logger.error('[PasswordReset] Failed to send reset email', { userId: user.id, error: err.message });
  }
};

/**
 * Consumes a token and sets the new password. Returns false for unknown, expired or used tokens.
 * The conditional updateMany makes consumption atomic: of two concurrent requests with the same
 * token, only one can flip usedAt from null.
 */
const resetPassword = async (token, newPassword) => {
  const tokenHash = hashToken(token);
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);

  return prisma.$transaction(async (tx) => {
    const record = await tx.passwordResetToken.findUnique({ where: { tokenHash } });
    if (!record) return false;

    const claimed = await tx.passwordResetToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) return false;

    // Bumping tokenVersion revokes every JWT issued before the reset.
    await tx.user.update({
      where: { id: record.userId },
      data: { password: passwordHash, tokenVersion: { increment: 1 } },
    });
    await tx.passwordResetToken.deleteMany({ where: { userId: record.userId, id: { not: record.id } } });
    return true;
  });
};

module.exports = { requestReset, resetPassword, hashToken, BCRYPT_ROUNDS };
