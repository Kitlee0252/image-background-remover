-- Add subscription_status to track active/cancelled/suspended state
ALTER TABLE user ADD COLUMN subscription_status TEXT DEFAULT 'none';

-- Add UNIQUE constraint on paypal_transaction_id for idempotent webhook processing
-- NULL values are excluded (SQLite allows multiple NULLs in UNIQUE columns)
CREATE UNIQUE INDEX IF NOT EXISTS idx_transactions_paypal_id_unique
  ON transactions(paypal_transaction_id) WHERE paypal_transaction_id IS NOT NULL;

-- Drop the old non-unique index
DROP INDEX IF EXISTS idx_transactions_paypal_id;
