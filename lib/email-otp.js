const crypto = require('crypto');

const OTP_LENGTH = 6;
const OTP_EXPIRES_MS = 5 * 60 * 1000;
const OTP_SEND_COOLDOWN_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function normalizeEmail(email) {
  return email.trim().toLowerCase();
}

function isValidEmail(email) {
  return EMAIL_REGEX.test(normalizeEmail(email));
}

function generateCode() {
  const max = 10 ** OTP_LENGTH;
  const value = crypto.randomInt(0, max);
  return String(value).padStart(OTP_LENGTH, '0');
}

function hashCode(code, email) {
  const secret = process.env.JWT_SECRET || 'email-otp-fallback-secret';
  return crypto
    .createHash('sha256')
    .update(`${code}:${normalizeEmail(email)}:${secret}`)
    .digest('hex');
}

function getOtpExpiresAt() {
  return new Date(Date.now() + OTP_EXPIRES_MS);
}

module.exports = {
  OTP_LENGTH,
  OTP_EXPIRES_MS,
  OTP_SEND_COOLDOWN_MS,
  MAX_ATTEMPTS,
  normalizeEmail,
  isValidEmail,
  generateCode,
  hashCode,
  getOtpExpiresAt,
};
