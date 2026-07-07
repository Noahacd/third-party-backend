const crypto = require('crypto');
const db = require('./index');

const insertOtpStmt = db.prepare(`
  INSERT INTO email_otps (id, email, code_hash, expires_at)
  VALUES (@id, @email, @code_hash, @expires_at)
`);

const findLatestOtpStmt = db.prepare(`
  SELECT id, email, code_hash, expires_at, attempts, used_at
  FROM email_otps
  WHERE email = ?
    AND used_at IS NULL
  ORDER BY created_at DESC
  LIMIT 1
`);

const getLastSentAtStmt = db.prepare(`
  SELECT created_at
  FROM email_otps
  WHERE email = ?
  ORDER BY created_at DESC
  LIMIT 1
`);

const incrementAttemptsStmt = db.prepare(`
  UPDATE email_otps
  SET attempts = attempts + 1
  WHERE id = ?
`);

const markUsedStmt = db.prepare(`
  UPDATE email_otps
  SET used_at = datetime('now')
  WHERE id = ?
`);

function createOtp(email, codeHash, expiresAt) {
  const id = crypto.randomUUID();
  insertOtpStmt.run({
    id,
    email,
    code_hash: codeHash,
    expires_at: expiresAt.toISOString(),
  });
  return id;
}

function findLatestValidOtp(email) {
  return findLatestOtpStmt.get(email) ?? null;
}

function parseSqliteDatetime(value) {
  return new Date(`${value.replace(' ', 'T')}Z`);
}

function getLastSentAt(email) {
  const row = getLastSentAtStmt.get(email);
  return row?.created_at ? parseSqliteDatetime(row.created_at) : null;
}

function incrementAttempts(id) {
  incrementAttemptsStmt.run(id);
}

function markUsed(id) {
  markUsedStmt.run(id);
}

module.exports = {
  createOtp,
  findLatestValidOtp,
  getLastSentAt,
  incrementAttempts,
  markUsed,
};
