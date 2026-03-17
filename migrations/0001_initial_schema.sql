-- Auth.js required tables for D1 (SQLite)
-- Reference: https://authjs.dev/getting-started/adapters/drizzle

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY NOT NULL,
  name TEXT,
  email TEXT UNIQUE,
  emailVerified INTEGER,
  image TEXT
);

CREATE TABLE IF NOT EXISTS accounts (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  type TEXT NOT NULL,
  provider TEXT NOT NULL,
  providerAccountId TEXT NOT NULL,
  refresh_token TEXT,
  access_token TEXT,
  expires_at INTEGER,
  token_type TEXT,
  scope TEXT,
  id_token TEXT,
  session_state TEXT,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS accounts_provider_providerAccountId
  ON accounts(provider, providerAccountId);

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY NOT NULL,
  sessionToken TEXT UNIQUE NOT NULL,
  userId TEXT NOT NULL,
  expires INTEGER NOT NULL,
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS verification_tokens (
  identifier TEXT NOT NULL,
  token TEXT NOT NULL,
  expires INTEGER NOT NULL,
  PRIMARY KEY (identifier, token)
);

-- Application-specific: per-user daily usage tracking
CREATE TABLE IF NOT EXISTS usage (
  id TEXT PRIMARY KEY NOT NULL,
  userId TEXT NOT NULL,
  date TEXT NOT NULL,           -- ISO date string, e.g. "2026-03-17"
  callCount INTEGER NOT NULL DEFAULT 0,
  createdAt INTEGER NOT NULL DEFAULT (unixepoch()),
  updatedAt INTEGER NOT NULL DEFAULT (unixepoch()),
  FOREIGN KEY (userId) REFERENCES users(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS usage_userId_date
  ON usage(userId, date);
