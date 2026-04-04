-- Add note column to transactions for admin adjustment reasons
ALTER TABLE transactions ADD COLUMN note TEXT;
