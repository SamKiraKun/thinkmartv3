-- File: server/src/db/migrations/001_core_schema.sql
-- ThinkMart Core Schema Migration
-- Creates all primary tables for the hybrid migration.
-- 
-- Naming conventions:
--   - snake_case for all table and column names
--   - Timestamps as ISO 8601 TEXT (SQLite/libSQL standard)
--   - Boolean as INTEGER (0/1)
--   - JSON stored as TEXT
--   - Foreign keys for referential integrity

-- ============================================================================
-- USERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS users (
  uid TEXT PRIMARY KEY,                 -- Firebase Auth UID
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  role TEXT NOT NULL DEFAULT 'user'
    CHECK (role IN ('user', 'admin', 'sub_admin', 'vendor', 'partner', 'organization')),

  -- Location
  state TEXT,
  city TEXT,

  -- MLM / Referral
  own_referral_code TEXT NOT NULL UNIQUE,
  referral_code TEXT,                   -- The upline's code they used
  referred_by TEXT,                     -- UID of the upline
  upline_path TEXT,                     -- JSON array of UIDs for 6-level calc
  referral_processed INTEGER NOT NULL DEFAULT 0,

  -- Membership
  membership_active INTEGER NOT NULL DEFAULT 0,
  membership_date TEXT,

  -- Status
  is_active INTEGER NOT NULL DEFAULT 1,
  is_banned INTEGER NOT NULL DEFAULT 0,

  -- KYC
  kyc_status TEXT NOT NULL DEFAULT 'not_submitted'
    CHECK (kyc_status IN ('not_submitted', 'pending', 'verified', 'rejected')),
  kyc_data TEXT,                        -- JSON blob
  kyc_submitted_at TEXT,
  kyc_verified_at TEXT,
  kyc_rejection_reason TEXT,

  -- Saved Addresses
  saved_addresses TEXT,                 -- JSON array

  -- Partner Config (for role = 'partner')
  partner_config TEXT,                  -- JSON blob

  -- Vendor Config (for role = 'vendor')
  vendor_config TEXT,                   -- JSON blob

  -- Sub-Admin Permissions (for role = 'sub_admin')
  sub_admin_permissions TEXT,           -- JSON array

  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- User indexes
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_users_city ON users(city);
CREATE INDEX IF NOT EXISTS idx_users_state ON users(state);
CREATE INDEX IF NOT EXISTS idx_users_own_referral_code ON users(own_referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referral_code ON users(referral_code);
CREATE INDEX IF NOT EXISTS idx_users_referred_by ON users(referred_by);
CREATE INDEX IF NOT EXISTS idx_users_role_city ON users(role, city);
CREATE INDEX IF NOT EXISTS idx_users_kyc_status ON users(kyc_status);
CREATE INDEX IF NOT EXISTS idx_users_created_at ON users(created_at);

-- ============================================================================
-- WALLETS
-- ============================================================================

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  coin_balance REAL NOT NULL DEFAULT 0,
  cash_balance REAL NOT NULL DEFAULT 0,
  total_earnings REAL NOT NULL DEFAULT 0,
  total_withdrawals REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- ============================================================================
-- TRANSACTIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN (
      'TASK_REWARD', 'REFERRAL_BONUS', 'TEAM_INCOME', 
      'WITHDRAWAL', 'PURCHASE', 'MEMBERSHIP_FEE', 'PARTNER_COMMISSION'
    )),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'CASH'
    CHECK (currency IN ('COIN', 'INR', 'CASH')),
  status TEXT NOT NULL DEFAULT 'PENDING'
    CHECK (status IN ('PENDING', 'COMPLETED', 'FAILED')),
  description TEXT NOT NULL DEFAULT '',

  -- Context fields
  related_user_id TEXT,
  task_id TEXT,
  task_type TEXT,
  level INTEGER,
  source_txn_id TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Transaction indexes
CREATE INDEX IF NOT EXISTS idx_txn_user_id ON transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_txn_type ON transactions(type);
CREATE INDEX IF NOT EXISTS idx_txn_status ON transactions(status);
CREATE INDEX IF NOT EXISTS idx_txn_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_txn_user_type ON transactions(user_id, type);

-- ============================================================================
-- PRODUCTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  price REAL NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  image TEXT,                           -- Legacy single image URL
  images TEXT,                          -- JSON array of image URLs
  commission REAL NOT NULL DEFAULT 0,
  coin_price REAL,
  in_stock INTEGER NOT NULL DEFAULT 1,
  stock INTEGER,
  badges TEXT,                          -- JSON array
  coin_only INTEGER NOT NULL DEFAULT 0,
  cash_only INTEGER NOT NULL DEFAULT 0,
  delivery_days INTEGER,
  vendor TEXT,                          -- Vendor ID or name
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Product indexes
CREATE INDEX IF NOT EXISTS idx_products_category ON products(category);
CREATE INDEX IF NOT EXISTS idx_products_vendor ON products(vendor);
CREATE INDEX IF NOT EXISTS idx_products_in_stock ON products(in_stock);
CREATE INDEX IF NOT EXISTS idx_products_created_at ON products(created_at DESC);

-- ============================================================================
-- ORDERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  user_email TEXT,
  user_name TEXT,

  -- Items (JSON array of OrderItem)
  items TEXT NOT NULL,

  -- Pricing
  subtotal REAL NOT NULL DEFAULT 0,
  cash_paid REAL NOT NULL DEFAULT 0,
  coins_redeemed REAL NOT NULL DEFAULT 0,
  coin_value REAL NOT NULL DEFAULT 0,

  -- Shipping (JSON blob)
  shipping_address TEXT,

  -- Status
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded')),
  status_history TEXT,                  -- JSON array of OrderStatusEntry

  -- Metadata
  city TEXT,
  refund_reason TEXT,
  refunded_at TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Order indexes
CREATE INDEX IF NOT EXISTS idx_orders_user_id ON orders(user_id);
CREATE INDEX IF NOT EXISTS idx_orders_status ON orders(status);
CREATE INDEX IF NOT EXISTS idx_orders_city ON orders(city);
CREATE INDEX IF NOT EXISTS idx_orders_created_at ON orders(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_orders_user_status ON orders(user_id, status);

-- ============================================================================
-- WITHDRAWALS
-- ============================================================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  amount REAL NOT NULL,
  method TEXT NOT NULL DEFAULT 'bank'
    CHECK (method IN ('bank', 'wallet')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'completed')),
  requested_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT,
  bank_details TEXT,                    -- JSON blob
  rejection_reason TEXT,

  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- Withdrawal indexes
CREATE INDEX IF NOT EXISTS idx_withdrawals_user_id ON withdrawals(user_id);
CREATE INDEX IF NOT EXISTS idx_withdrawals_status ON withdrawals(status);
CREATE INDEX IF NOT EXISTS idx_withdrawals_requested_at ON withdrawals(requested_at DESC);

-- ============================================================================
-- REVIEWS
-- ============================================================================

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,

  rating INTEGER NOT NULL CHECK (rating >= 1 AND rating <= 5),
  title TEXT,
  content TEXT NOT NULL,
  images TEXT,                          -- JSON array of URLs

  -- Denormalized user info
  user_name TEXT NOT NULL,
  user_avatar TEXT,

  helpful INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 0,

  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'flagged')),
  moderation_note TEXT,

  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT,

  FOREIGN KEY (user_id) REFERENCES users(uid),
  FOREIGN KEY (product_id) REFERENCES products(id),
  FOREIGN KEY (order_id) REFERENCES orders(id)
);

-- Review indexes
CREATE INDEX IF NOT EXISTS idx_reviews_product_id ON reviews(product_id);
CREATE INDEX IF NOT EXISTS idx_reviews_user_id ON reviews(user_id);
CREATE INDEX IF NOT EXISTS idx_reviews_status ON reviews(status);
CREATE INDEX IF NOT EXISTS idx_reviews_product_status ON reviews(product_id, status);

-- ============================================================================
-- REVIEW STATS (Materialized aggregates)
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_stats (
  product_id TEXT PRIMARY KEY,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  average_rating REAL NOT NULL DEFAULT 0,
  rating_distribution TEXT NOT NULL DEFAULT '{"1":0,"2":0,"3":0,"4":0,"5":0}',
  last_updated TEXT NOT NULL DEFAULT (datetime('now')),

  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- ============================================================================
-- REVIEW HELPFUL (User votes on reviews)
-- ============================================================================

CREATE TABLE IF NOT EXISTS review_helpful (
  review_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  helpful INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),

  PRIMARY KEY (review_id, user_id),
  FOREIGN KEY (review_id) REFERENCES reviews(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

-- ============================================================================
-- WISHLISTS
-- ============================================================================

CREATE TABLE IF NOT EXISTS wishlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,

  -- Product snapshot
  product_name TEXT NOT NULL,
  product_image TEXT NOT NULL DEFAULT '',
  product_price REAL NOT NULL DEFAULT 0,
  product_coin_price REAL,

  notify_on_price_drop INTEGER NOT NULL DEFAULT 0,
  notify_on_back_in_stock INTEGER NOT NULL DEFAULT 0,

  added_at TEXT NOT NULL DEFAULT (datetime('now')),

  UNIQUE (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(uid),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Wishlist indexes
CREATE INDEX IF NOT EXISTS idx_wishlists_user_id ON wishlists(user_id);
CREATE INDEX IF NOT EXISTS idx_wishlists_product_id ON wishlists(product_id);

-- ============================================================================
-- TASKS
-- ============================================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  type TEXT NOT NULL
    CHECK (type IN ('SURVEY', 'SPIN', 'LUCKY_BOX', 'VIDEO', 'WEBSITE', 'WATCH_VIDEO')),
  reward REAL NOT NULL DEFAULT 0,
  reward_type TEXT NOT NULL DEFAULT 'COIN'
    CHECK (reward_type IN ('COIN', 'CASH')),
  frequency TEXT DEFAULT 'ONCE'
    CHECK (frequency IN ('DAILY', 'ONCE', 'UNLIMITED')),
  min_duration INTEGER,                 -- Seconds
  cooldown_hours INTEGER,
  max_completions_per_day INTEGER,
  possible_rewards TEXT,                -- JSON array
  questions TEXT,                        -- JSON array (for surveys)
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_tasks_is_active ON tasks(is_active);
CREATE INDEX IF NOT EXISTS idx_tasks_type ON tasks(type);

-- ============================================================================
-- USER TASK COMPLETIONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_task_completions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  completed_at TEXT NOT NULL DEFAULT (datetime('now')),
  reward REAL NOT NULL DEFAULT 0,

  FOREIGN KEY (user_id) REFERENCES users(uid),
  FOREIGN KEY (task_id) REFERENCES tasks(id)
);

CREATE INDEX IF NOT EXISTS idx_utc_user_id ON user_task_completions(user_id);
CREATE INDEX IF NOT EXISTS idx_utc_task_id ON user_task_completions(task_id);
CREATE INDEX IF NOT EXISTS idx_utc_user_task ON user_task_completions(user_id, task_id);
CREATE INDEX IF NOT EXISTS idx_utc_completed_at ON user_task_completions(completed_at DESC);

-- ============================================================================
-- BADGES (Definitions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS badge_definitions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  icon TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL
    CHECK (category IN ('referral', 'shopping', 'earning', 'activity', 'special')),
  rarity TEXT NOT NULL DEFAULT 'common'
    CHECK (rarity IN ('common', 'rare', 'epic', 'legendary')),
  criteria_type TEXT NOT NULL,
  criteria_threshold INTEGER NOT NULL DEFAULT 0,
  coin_reward REAL NOT NULL DEFAULT 0,
  cash_reward REAL,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_hidden INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1
);

-- ============================================================================
-- USER BADGES (Earned badges)
-- ============================================================================

CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  badge_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  badge_name TEXT NOT NULL,
  badge_icon TEXT NOT NULL DEFAULT '',
  badge_rarity TEXT NOT NULL DEFAULT 'common',
  earned_at TEXT NOT NULL DEFAULT (datetime('now')),
  progress REAL,
  rewards_claimed INTEGER NOT NULL DEFAULT 0,
  claimed_at TEXT,

  UNIQUE (badge_id, user_id),
  FOREIGN KEY (badge_id) REFERENCES badge_definitions(id),
  FOREIGN KEY (user_id) REFERENCES users(uid)
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_id ON user_badges(user_id);
CREATE INDEX IF NOT EXISTS idx_user_badges_badge_id ON user_badges(badge_id);

-- ============================================================================
-- AUDIT LOGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  actor_uid TEXT NOT NULL,              -- Who performed the action
  action TEXT NOT NULL,                 -- e.g., 'user.ban', 'order.refund', 'withdrawal.approve'
  target_type TEXT NOT NULL,            -- e.g., 'user', 'order', 'withdrawal'
  target_id TEXT NOT NULL,              -- ID of the affected entity
  details TEXT,                         -- JSON blob with before/after or context
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_uid);
CREATE INDEX IF NOT EXISTS idx_audit_target ON audit_logs(target_type, target_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_created_at ON audit_logs(created_at DESC);

-- ============================================================================
-- IDEMPOTENCY KEYS
-- ============================================================================

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  request_path TEXT NOT NULL,
  request_fingerprint TEXT,
  response_status INTEGER NOT NULL,
  response_body TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  expires_at TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_idemp_user_id ON idempotency_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_idemp_expires ON idempotency_keys(expires_at);

-- ============================================================================
-- PUBLIC SETTINGS
-- ============================================================================

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_by TEXT                       -- Admin UID
);

-- ============================================================================
-- CATEGORIES / BRANDS / BANNERS
-- ============================================================================

CREATE TABLE IF NOT EXISTS categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  image TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  parent_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS brands (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT UNIQUE NOT NULL,
  logo TEXT,
  is_active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS banners (
  id TEXT PRIMARY KEY,
  title TEXT,
  image TEXT NOT NULL,
  link TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ============================================================================
-- COUPONS
-- ============================================================================

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  description TEXT,
  discount_type TEXT NOT NULL DEFAULT 'percentage'
    CHECK (discount_type IN ('percentage', 'fixed')),
  discount_value REAL NOT NULL DEFAULT 0,
  min_order_amount REAL,
  max_discount REAL,
  usage_limit INTEGER,
  used_count INTEGER NOT NULL DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1,
  start_date TEXT,
  end_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_coupons_code ON coupons(code);
CREATE INDEX IF NOT EXISTS idx_coupons_is_active ON coupons(is_active);

-- ============================================================================
-- SCHEMA VERSION TRACKING
-- ============================================================================

CREATE TABLE IF NOT EXISTS schema_migrations (
  version TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Record this migration
INSERT OR IGNORE INTO schema_migrations (version) VALUES ('001_core_schema');
