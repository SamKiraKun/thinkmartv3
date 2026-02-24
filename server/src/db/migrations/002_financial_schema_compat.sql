-- File: server/src/db/migrations/002_financial_schema_compat.sql
-- Aligns schema with implemented financial/admin routes.

-- ============================================================================
-- ORDERS: add columns used by route handlers
-- ============================================================================

ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_code TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS coupon_discount REAL NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS tracking_number TEXT;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS admin_notes TEXT;

-- ============================================================================
-- TRANSACTIONS: extend type CHECK to include ADMIN_CREDIT
-- SQLite/libSQL cannot alter CHECK constraints in-place, so rebuild table.
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'TASK_REWARD', 'REFERRAL_BONUS', 'TEAM_INCOME',
      'WITHDRAWAL', 'PURCHASE', 'MEMBERSHIP_FEE', 'PARTNER_COMMISSION',
      'ADMIN_CREDIT'
    )),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CASH'
    CHECK (currency IN ('COIN', 'INR', 'CASH')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  description TEXT NOT NULL DEFAULT '',
  related_user_id TEXT,
  task_id TEXT,
  task_type TEXT,
  level INTEGER,
  source_txn_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

INSERT INTO transactions_new (
  id, user_id, type, amount, currency, status, description,
  related_user_id, task_id, task_type, level, source_txn_id, created_at
)
SELECT
  id, user_id, type, amount, currency, status, description,
  related_user_id, task_id, task_type, level, source_txn_id, created_at
FROM transactions;

DROP TABLE transactions;
ALTER TABLE transactions_new RENAME TO transactions;

CREATE INDEX IF NOT EXISTS idx_txn_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_user_type ON transactions(user_id, type);

-- ============================================================================
-- WITHDRAWALS: add columns and extend method CHECK to include upi
-- ============================================================================

CREATE TABLE IF NOT EXISTS withdrawals_new (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank'
    CHECK (method IN ('bank', 'wallet', 'upi')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  bank_details TEXT,
  upi_id TEXT,
  rejection_reason TEXT,
  admin_notes TEXT,
  processed_by TEXT,
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

INSERT INTO withdrawals_new (
  id, user_id, amount, method, status, requested_at,
  processed_at, bank_details, rejection_reason
)
SELECT
  id, user_id, amount, method, status, requested_at,
  processed_at, bank_details, rejection_reason
FROM withdrawals;

DROP TABLE withdrawals;
ALTER TABLE withdrawals_new RENAME TO withdrawals;

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_at ON withdrawals(requested_at DESC);
