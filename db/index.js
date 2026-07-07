const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');

const defaultDbPath = path.join(__dirname, '..', 'data', 'app.db');

function ensureWritableDbPath(configuredPath) {
  const candidatePath = configuredPath
    ? path.resolve(configuredPath)
    : defaultDbPath;
  const candidateDir = path.dirname(candidatePath);

  try {
    if (!fs.existsSync(candidateDir)) {
      fs.mkdirSync(candidateDir, { recursive: true });
    }
    return candidatePath;
  } catch (err) {
    if (err.code !== 'EACCES' && err.code !== 'EPERM') throw err;

    const fallbackDir = path.dirname(defaultDbPath);
    if (!fs.existsSync(fallbackDir)) {
      fs.mkdirSync(fallbackDir, { recursive: true });
    }
    console.warn(
      `[db] Cannot write to ${candidateDir} (${err.code}), using ${defaultDbPath}`,
    );
    return defaultDbPath;
  }
}

const dbPath = ensureWritableDbPath(process.env.DATABASE_PATH);
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    google_id TEXT UNIQUE,
    x_id TEXT UNIQUE,
    telegram_id TEXT UNIQUE,
    email TEXT NOT NULL UNIQUE,
    name TEXT,
    picture TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    last_login_at TEXT
  );

  CREATE TABLE IF NOT EXISTS refresh_tokens (
    id TEXT PRIMARY KEY,
    user_id TEXT NOT NULL,
    token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    revoked_at TEXT,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_refresh_tokens_user_id ON refresh_tokens(user_id);

  CREATE TABLE IF NOT EXISTS email_otps (
    id TEXT PRIMARY KEY,
    email TEXT NOT NULL,
    code_hash TEXT NOT NULL,
    expires_at TEXT NOT NULL,
    attempts INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    used_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_email_otps_email ON email_otps(email);
`);

const userColumns = db.prepare('PRAGMA table_info(users)').all();
const hasXIdColumn = userColumns.some((column) => column.name === 'x_id');
const hasTelegramIdColumn = userColumns.some(
  (column) => column.name === 'telegram_id'
);

if (!hasXIdColumn) {
  db.exec(`
    CREATE TABLE users_migrated (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      x_id TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    INSERT INTO users_migrated (
      id, google_id, x_id, email, name, picture, created_at, updated_at, last_login_at
    )
    SELECT
      id, google_id, NULL, email, name, picture, created_at, updated_at, last_login_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_migrated RENAME TO users;
  `);
}

if (!hasTelegramIdColumn) {
  db.exec(`
    CREATE TABLE users_migrated (
      id TEXT PRIMARY KEY,
      google_id TEXT UNIQUE,
      x_id TEXT UNIQUE,
      telegram_id TEXT UNIQUE,
      email TEXT NOT NULL UNIQUE,
      name TEXT,
      picture TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      last_login_at TEXT
    );

    INSERT INTO users_migrated (
      id, google_id, x_id, telegram_id, email, name, picture, created_at, updated_at, last_login_at
    )
    SELECT
      id, google_id, x_id, NULL, email, name, picture, created_at, updated_at, last_login_at
    FROM users;

    DROP TABLE users;
    ALTER TABLE users_migrated RENAME TO users;
  `);
}

module.exports = db;
