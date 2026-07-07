const crypto = require("crypto");
const db = require("./index");

const upsertGoogleStmt = db.prepare(`
  INSERT INTO users (id, google_id, email, name, picture, last_login_at, updated_at)
  VALUES (@id, @google_id, @email, @name, @picture, datetime('now'), datetime('now'))
  ON CONFLICT(google_id) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    last_login_at = datetime('now'),
    updated_at = datetime('now')
`);

const upsertXStmt = db.prepare(`
  INSERT INTO users (id, x_id, email, name, picture, last_login_at, updated_at)
  VALUES (@id, @x_id, @email, @name, @picture, datetime('now'), datetime('now'))
  ON CONFLICT(x_id) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    last_login_at = datetime('now'),
    updated_at = datetime('now')
`);

const upsertTelegramStmt = db.prepare(`
  INSERT INTO users (id, telegram_id, email, name, picture, last_login_at, updated_at)
  VALUES (@id, @telegram_id, @email, @name, @picture, datetime('now'), datetime('now'))
  ON CONFLICT(telegram_id) DO UPDATE SET
    email = excluded.email,
    name = excluded.name,
    picture = excluded.picture,
    last_login_at = datetime('now'),
    updated_at = datetime('now')
`);

const findByIdStmt = db.prepare(`
  SELECT id, google_id, x_id, telegram_id, email, name, picture, created_at, updated_at, last_login_at
  FROM users
  WHERE id = ?
`);

const findByEmailStmt = db.prepare(`
  SELECT id, google_id, x_id, telegram_id, email, name, picture, created_at, updated_at, last_login_at
  FROM users
  WHERE email = ?
`);

const updateLastLoginStmt = db.prepare(`
  UPDATE users
  SET last_login_at = datetime('now'), updated_at = datetime('now')
  WHERE id = ?
`);

const insertEmailUserStmt = db.prepare(`
  INSERT INTO users (id, email, name, picture, last_login_at, updated_at)
  VALUES (@id, @email, @name, @picture, datetime('now'), datetime('now'))
`);

function upsertGoogleUser({ googleId, email, name, picture }) {
  const existing = db
    .prepare("SELECT id FROM users WHERE google_id = ?")
    .get(googleId);

  const id = existing?.id ?? crypto.randomUUID();

  upsertGoogleStmt.run({
    id,
    google_id: googleId,
    email,
    name,
    picture,
  });

  return findByIdStmt.get(id);
}

function upsertXUser({ xId, email, name, picture }) {
  const existing = db.prepare("SELECT id FROM users WHERE x_id = ?").get(xId);

  const id = existing?.id ?? crypto.randomUUID();

  upsertXStmt.run({
    id,
    x_id: xId,
    email,
    name,
    picture,
  });

  return findByIdStmt.get(id);
}

function upsertTelegramUser({ telegramId, email, name, picture }) {
  const existing = db
    .prepare("SELECT id FROM users WHERE telegram_id = ?")
    .get(telegramId);

  const id = existing?.id ?? crypto.randomUUID();

  upsertTelegramStmt.run({
    id,
    telegram_id: telegramId,
    email,
    name,
    picture,
  });

  return findByIdStmt.get(id);
}

function findById(id) {
  return findByIdStmt.get(id) ?? null;
}

function findByEmail(email) {
  return findByEmailStmt.get(email) ?? null;
}

function upsertEmailUser({ email }) {
  const normalizedEmail = email.trim().toLowerCase();
  const existing = findByEmail(normalizedEmail);

  if (existing) {
    updateLastLoginStmt.run(existing.id);
    return findById(existing.id);
  }

  const id = crypto.randomUUID();
  const name = normalizedEmail.split("@")[0];

  insertEmailUserStmt.run({
    id,
    email: normalizedEmail,
    name,
    picture: "",
  });

  return findById(id);
}

module.exports = {
  upsertGoogleUser,
  upsertTelegramUser,
  upsertXUser,
  upsertEmailUser,
  findByEmail,
  findById,
};
