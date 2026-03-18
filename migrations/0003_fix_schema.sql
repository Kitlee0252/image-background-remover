-- Prerequisite: fix existing schema issues before billing
-- App is pre-launch, no production data — safe to drop+recreate

-- 1. Recreate usage table with correct column names
DROP TABLE IF EXISTS usage;
CREATE TABLE usage (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT NOT NULL,
  quality TEXT,
  created_at INTEGER NOT NULL
);

-- 2. Add plan column to user table
ALTER TABLE user ADD COLUMN plan TEXT DEFAULT 'free';
