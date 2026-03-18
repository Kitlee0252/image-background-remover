CREATE TABLE IF NOT EXISTS credits (
  user_id TEXT PRIMARY KEY REFERENCES user(id),
  balance INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES user(id),
  type TEXT NOT NULL,
  amount_usd REAL NOT NULL,
  credits_added INTEGER,
  plan TEXT,
  paypal_transaction_id TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_transactions_user_date ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_transactions_paypal_id ON transactions(paypal_transaction_id);

ALTER TABLE user ADD COLUMN plan_expires_at INTEGER;
ALTER TABLE user ADD COLUMN paypal_email TEXT;
ALTER TABLE user ADD COLUMN paypal_subscription_id TEXT;
