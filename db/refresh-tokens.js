const crypto = require("crypto");
const db = require("./index");

const insertStmt = db.prepare(`
  INSERT INTO refresh_tokens (id, user_id, token_hash, expires_at)
  VALUES (@id, @user_id, @token_hash, @expires_at)
`);

const findValidStmt = db.prepare(`
  SELECT id, user_id, expires_at
  FROM refresh_tokens
  WHERE token_hash = ? AND revoked_at IS NULL AND expires_at > datetime('now')
`);

const revokeStmt = db.prepare(`
  UPDATE refresh_tokens
  SET revoked_at = datetime('now')
  WHERE id = ?
`);

const revokeAllForUserStmt = db.prepare(`
  UPDATE refresh_tokens
  SET revoked_at = datetime('now')
  WHERE user_id = ? AND revoked_at IS NULL
`);

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function createRefreshToken(userId, expiresAt) {
  const token = crypto.randomBytes(48).toString("base64url");
  const id = crypto.randomUUID();

  insertStmt.run({
    id,
    user_id: userId,
    token_hash: hashToken(token),
    expires_at: expiresAt.toISOString(),
  });

  return { id, token };
}

function findValidToken(token) {
  return findValidStmt.get(hashToken(token)) ?? null;
}

function revokeToken(id) {
  revokeStmt.run(id);
}

function revokeAllForUser(userId) {
  revokeAllForUserStmt.run(userId);
}

module.exports = {
  createRefreshToken,
  findValidToken,
  revokeToken,
  revokeAllForUser,
};
