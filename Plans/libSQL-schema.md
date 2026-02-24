## Companion 1: Turso SQL DDL (Production-Oriented Starter Schema)

```sql
-- ThinkMart Turso/libSQL schema (starter, repo-grounded)
-- Notes:
-- - SQLite/libSQL booleans are INTEGER (0/1)
-- - Timestamps stored as epoch milliseconds (INTEGER) for sort parity with Firestore queries
-- - JSON-like payloads stored as TEXT (validated in app layer via Zod)
-- - Use explicit transactions + idempotency for all financial mutations

PRAGMA foreign_keys = ON;

-- =========================================================
-- Auth / Identity (target state; bridge can still accept Firebase ID tokens)
-- =========================================================

CREATE TABLE IF NOT EXISTS auth_users (
  user_id TEXT PRIMARY KEY,                     -- maps to users.id
  password_hash TEXT,                           -- null during Firebase-bridge phase
  email_verified INTEGER NOT NULL DEFAULT 0 CHECK (email_verified IN (0,1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS auth_refresh_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  family_id TEXT NOT NULL,
  device_info TEXT,
  ip_addr TEXT,
  user_agent TEXT,
  expires_at_ms INTEGER NOT NULL,
  revoked_at_ms INTEGER,
  replaced_by_token_id TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_user
  ON auth_refresh_tokens(user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_auth_refresh_tokens_family
  ON auth_refresh_tokens(family_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS auth_email_verification_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS auth_password_reset_tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  expires_at_ms INTEGER NOT NULL,
  consumed_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES auth_users(user_id) ON DELETE CASCADE
);

-- =========================================================
-- Users / Profiles / Roles
-- =========================================================

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,                          -- Firebase UID parity
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  role TEXT NOT NULL CHECK (role IN ('user','vendor','partner','organization','sub_admin','admin')),
  state TEXT,
  city TEXT,

  own_referral_code TEXT UNIQUE,
  referral_code TEXT,                           -- code entered at signup
  referred_by_user_id TEXT,                     -- resolved user id
  upline_path_json TEXT,                        -- JSON array of user ids
  referral_processed INTEGER NOT NULL DEFAULT 0 CHECK (referral_processed IN (0,1)),

  membership_active INTEGER NOT NULL DEFAULT 0 CHECK (membership_active IN (0,1)),
  membership_date_ms INTEGER,

  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_banned INTEGER NOT NULL DEFAULT 0 CHECK (is_banned IN (0,1)),

  -- KYC
  kyc_status TEXT CHECK (kyc_status IN ('not_submitted','pending','submitted','verified','rejected')),
  kyc_data_json TEXT,
  kyc_submitted_at_ms INTEGER,
  kyc_verified_at_ms INTEGER,
  kyc_verified_by_user_id TEXT,
  kyc_rejection_reason TEXT,

  -- Config payloads kept in JSON for migration speed/parity
  partner_config_json TEXT,
  vendor_config_json TEXT,
  org_config_json TEXT,
  sub_admin_permissions_json TEXT,

  -- UI data caches
  saved_addresses_json TEXT,
  payment_methods_json TEXT,

  -- Optional counters / aggregates seen in triggers
  direct_referral_count INTEGER NOT NULL DEFAULT 0,
  referral_count INTEGER NOT NULL DEFAULT 0,
  total_downline_count INTEGER NOT NULL DEFAULT 0,
  last_referral_at_ms INTEGER,
  last_active_at_ms INTEGER,

  fcm_token TEXT,
  fcm_token_updated_at_ms INTEGER,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  FOREIGN KEY (referred_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (kyc_verified_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_users_role_created
  ON users(role, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_users_city_created
  ON users(city, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_users_kyc_status_submitted
  ON users(kyc_status, kyc_submitted_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_users_referral_code_created
  ON users(referral_code, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_users_referred_by
  ON users(referred_by_user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_users_created
  ON users(created_at_ms DESC);

-- =========================================================
-- Wallets / Ledger / Idempotency (financial core)
-- =========================================================

CREATE TABLE IF NOT EXISTS wallets (
  user_id TEXT PRIMARY KEY,
  coin_balance INTEGER NOT NULL DEFAULT 0 CHECK (coin_balance >= 0),
  cash_balance_paise INTEGER NOT NULL DEFAULT 0 CHECK (cash_balance_paise >= 0),
  total_earnings_paise INTEGER NOT NULL DEFAULT 0,
  total_withdrawals_paise INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS ledger_transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  type TEXT NOT NULL,                           -- e.g. TASK_REWARD, REFERRAL_BONUS, debit/credit variants
  category TEXT,                                -- purchase, refund, withdrawal_request, membership, etc.
  direction TEXT CHECK (direction IN ('debit','credit')),

  currency TEXT NOT NULL CHECK (currency IN ('COIN','CASH','INR')),
  amount_paise INTEGER,                         -- for cash amounts
  coin_amount INTEGER,                          -- for coin amounts
  status TEXT CHECK (status IN ('pending','completed','failed','PENDING','COMPLETED','FAILED')),

  description TEXT NOT NULL,

  order_id TEXT,
  withdrawal_id TEXT,
  task_id TEXT,
  review_id TEXT,
  coupon_id TEXT,
  source_completion_id TEXT,
  reference_id TEXT,

  admin_id TEXT,
  metadata_json TEXT,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_ledger_user_created
  ON ledger_transactions(user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_user_type_created
  ON ledger_transactions(user_id, type, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_ledger_order
  ON ledger_transactions(order_id);

CREATE INDEX IF NOT EXISTS idx_ledger_withdrawal
  ON ledger_transactions(withdrawal_id);

CREATE INDEX IF NOT EXISTS idx_ledger_created
  ON ledger_transactions(created_at_ms DESC);

CREATE TABLE IF NOT EXISTS idempotency_keys (
  request_id TEXT PRIMARY KEY,
  action_type TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','complete','failed')),
  result_json TEXT,
  error_json TEXT,
  created_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_idempotency_actor_created
  ON idempotency_keys(actor_id, created_at_ms DESC);

-- =========================================================
-- Products / Images / Moderation
-- =========================================================

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  category TEXT NOT NULL,
  brand TEXT,

  price_paise INTEGER NOT NULL CHECK (price_paise >= 0),
  coin_price INTEGER,
  commission_paise INTEGER DEFAULT 0 CHECK (commission_paise >= 0),

  in_stock INTEGER NOT NULL DEFAULT 1 CHECK (in_stock IN (0,1)),
  stock INTEGER CHECK (stock IS NULL OR stock >= 0),

  status TEXT CHECK (status IN ('pending','approved','rejected','suspended')),
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_deleted INTEGER NOT NULL DEFAULT 0 CHECK (is_deleted IN (0,1)),

  vendor_id TEXT,
  partner_id TEXT,
  vendor_display TEXT,

  coin_only INTEGER NOT NULL DEFAULT 0 CHECK (coin_only IN (0,1)),
  cash_only INTEGER NOT NULL DEFAULT 0 CHECK (cash_only IN (0,1)),
  delivery_days INTEGER,
  badges_json TEXT,
  tags_json TEXT,

  primary_image_url TEXT,
  review_count INTEGER NOT NULL DEFAULT 0,
  rating_avg REAL NOT NULL DEFAULT 0.0,

  created_by_user_id TEXT,
  updated_by_user_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_products_category_stock_created
  ON products(category, in_stock, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_products_vendor_created
  ON products(vendor_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_products_status_created
  ON products(status, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_products_partner_created
  ON products(partner_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_products_active_created
  ON products(is_deleted, is_active, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS product_images (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  position INTEGER NOT NULL CHECK (position >= 0),
  url TEXT NOT NULL,
  storage_key TEXT,
  mime_type TEXT,
  size_bytes INTEGER CHECK (size_bytes IS NULL OR size_bytes >= 0),
  uploaded_by_user_id TEXT,
  created_at_ms INTEGER NOT NULL,
  UNIQUE(product_id, position),
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (uploaded_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_product_images_product_position
  ON product_images(product_id, position ASC);

-- =========================================================
-- Orders / Order Items / Status History
-- =========================================================

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  user_email_snapshot TEXT,
  user_name_snapshot TEXT,

  subtotal_paise INTEGER NOT NULL CHECK (subtotal_paise >= 0),
  cash_paid_paise INTEGER NOT NULL DEFAULT 0 CHECK (cash_paid_paise >= 0),
  coins_redeemed INTEGER NOT NULL DEFAULT 0 CHECK (coins_redeemed >= 0),
  coin_value_paise INTEGER NOT NULL DEFAULT 0 CHECK (coin_value_paise >= 0),

  city TEXT,
  shipping_address_json TEXT NOT NULL,

  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','refunded')),
  cancel_reason TEXT,
  refund_reason TEXT,
  cancelled_at_ms INTEGER,
  refunded_at_ms INTEGER,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_orders_user_created
  ON orders(user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_orders_status_created
  ON orders(status, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_orders_city_created
  ON orders(city, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_orders_created_cursor
  ON orders(created_at_ms DESC, id DESC);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  product_id TEXT,
  product_name_snapshot TEXT NOT NULL,
  product_image_snapshot TEXT,
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price_paise INTEGER NOT NULL CHECK (unit_price_paise >= 0),
  coin_price INTEGER,
  vendor_id TEXT,
  partner_id TEXT,
  created_at_ms INTEGER NOT NULL,

  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE SET NULL,
  FOREIGN KEY (vendor_id) REFERENCES users(id) ON DELETE SET NULL,
  FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_items_order
  ON order_items(order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_vendor
  ON order_items(vendor_id, order_id);

CREATE INDEX IF NOT EXISTS idx_order_items_product
  ON order_items(product_id);

CREATE TABLE IF NOT EXISTS order_status_history (
  id TEXT PRIMARY KEY,
  order_id TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','confirmed','shipped','delivered','cancelled','refunded')),
  changed_at_ms INTEGER NOT NULL,
  changed_by_user_id TEXT,
  note TEXT,

  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
  FOREIGN KEY (changed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_order_status_history_order_time
  ON order_status_history(order_id, changed_at_ms ASC);

-- =========================================================
-- Withdrawals / Logs
-- =========================================================

CREATE TABLE IF NOT EXISTS withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,

  amount_paise INTEGER NOT NULL CHECK (amount_paise > 0),
  method TEXT NOT NULL CHECK (method IN ('upi','bank','wallet')),
  details_json TEXT NOT NULL,

  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','completed')),
  user_city TEXT,
  kyc_status_snapshot TEXT,
  wallet_balance_at_request_paise INTEGER,

  risk_flags_json TEXT,
  admin_notes TEXT,
  processed_by_user_id TEXT,
  processed_by_name_snapshot TEXT,
  processed_at_ms INTEGER,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,

  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (processed_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawals_user_created
  ON withdrawals(user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_status_created
  ON withdrawals(status, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_city_created
  ON withdrawals(user_city, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_withdrawals_processed
  ON withdrawals(processed_at_ms DESC);

CREATE TABLE IF NOT EXISTS withdrawal_logs (
  id TEXT PRIMARY KEY,
  withdrawal_id TEXT NOT NULL,
  action TEXT NOT NULL,
  admin_id TEXT,
  admin_name_snapshot TEXT,
  reason TEXT,
  metadata_json TEXT,
  created_at_ms INTEGER NOT NULL,

  FOREIGN KEY (withdrawal_id) REFERENCES withdrawals(id) ON DELETE CASCADE,
  FOREIGN KEY (admin_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_withdrawal_logs_withdrawal_created
  ON withdrawal_logs(withdrawal_id, created_at_ms DESC);

-- =========================================================
-- Wishlist / Reviews
-- =========================================================

CREATE TABLE IF NOT EXISTS wishlists (
  user_id TEXT NOT NULL,
  product_id TEXT NOT NULL,
  product_name_snapshot TEXT,
  product_image_snapshot TEXT,
  product_price_paise_snapshot INTEGER,
  product_coin_price_snapshot INTEGER,
  notify_on_price_drop INTEGER NOT NULL DEFAULT 0 CHECK (notify_on_price_drop IN (0,1)),
  notify_on_back_in_stock INTEGER NOT NULL DEFAULT 0 CHECK (notify_on_back_in_stock IN (0,1)),
  added_at_ms INTEGER NOT NULL,
  PRIMARY KEY (user_id, product_id),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_wishlists_user_added
  ON wishlists(user_id, added_at_ms DESC);

CREATE TABLE IF NOT EXISTS reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT NOT NULL,

  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT NOT NULL,
  images_json TEXT,

  user_name_snapshot TEXT,
  user_avatar_snapshot TEXT,

  helpful_count INTEGER NOT NULL DEFAULT 0,
  verified INTEGER NOT NULL DEFAULT 1 CHECK (verified IN (0,1)),

  status TEXT NOT NULL CHECK (status IN ('pending','approved','rejected','flagged')),
  moderation_note TEXT,

  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER,

  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status_created
  ON reviews(product_id, status, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status_helpful
  ON reviews(product_id, status, helpful_count DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_product_status_rating
  ON reviews(product_id, status, rating DESC);

CREATE INDEX IF NOT EXISTS idx_reviews_user_created
  ON reviews(user_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS review_stats (
  product_id TEXT PRIMARY KEY,
  total_reviews INTEGER NOT NULL DEFAULT 0,
  average_rating REAL NOT NULL DEFAULT 0.0,
  rating_distribution_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS review_helpful_votes (
  review_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  helpful INTEGER NOT NULL CHECK (helpful IN (0,1)),
  created_at_ms INTEGER NOT NULL,
  PRIMARY KEY (review_id, user_id),
  FOREIGN KEY (review_id) REFERENCES reviews(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================
-- Tasks / Gamification
-- =========================================================

CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  reward INTEGER,
  reward_type TEXT CHECK (reward_type IN ('COIN','CASH')),
  frequency TEXT CHECK (frequency IN ('DAILY','ONCE','UNLIMITED')),
  min_duration_seconds INTEGER,
  cooldown_hours INTEGER,
  max_completions_per_day INTEGER,
  possible_rewards_json TEXT,
  questions_json TEXT,
  priority INTEGER DEFAULT 0,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  is_archived INTEGER NOT NULL DEFAULT 0 CHECK (is_archived IN (0,1)),
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_tasks_active_archived_priority
  ON tasks(is_active, is_archived, priority DESC, id DESC);

CREATE TABLE IF NOT EXISTS task_sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  status TEXT NOT NULL,                          -- e.g. ACTIVE / COMPLETED
  started_at_ms INTEGER NOT NULL,
  completed_at_ms INTEGER,
  current_step INTEGER,
  payload_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_sessions_user_task
  ON task_sessions(user_id, task_id, started_at_ms DESC);

CREATE TABLE IF NOT EXISTS task_completions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  task_title_snapshot TEXT,
  reward INTEGER NOT NULL,
  reward_type TEXT CHECK (reward_type IN ('COIN','CASH')),
  session_id TEXT,
  completion_id TEXT,                            -- legacy parity
  completed_at_ms INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
  FOREIGN KEY (session_id) REFERENCES task_sessions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_task_completions_user_completed
  ON task_completions(user_id, completed_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_task_completions_user_task_completed
  ON task_completions(user_id, task_id, completed_at_ms DESC);

CREATE TABLE IF NOT EXISTS task_starts (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  task_id TEXT NOT NULL,
  started_at_ms INTEGER NOT NULL,
  expires_at_ms INTEGER,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_task_starts_user_task
  ON task_starts(user_id, task_id, started_at_ms DESC);

CREATE TABLE IF NOT EXISTS cooldowns (
  user_id TEXT PRIMARY KEY,
  data_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS user_badges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  badge_key TEXT NOT NULL,
  earned_at_ms INTEGER NOT NULL,
  metadata_json TEXT,
  UNIQUE(user_id, badge_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_user_badges_user_earned
  ON user_badges(user_id, earned_at_ms DESC);

CREATE TABLE IF NOT EXISTS leaderboards (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  period TEXT NOT NULL,
  data_json TEXT NOT NULL,
  generated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS leaderboard_archives (
  id TEXT PRIMARY KEY,
  leaderboard_id TEXT,
  type TEXT NOT NULL,
  period TEXT NOT NULL,
  data_json TEXT NOT NULL,
  archived_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS game_configs (
  id TEXT PRIMARY KEY,
  config_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS game_limits (
  id TEXT PRIMARY KEY,
  user_id TEXT,
  limit_key TEXT NOT NULL,
  counter INTEGER NOT NULL DEFAULT 0,
  window_start_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  UNIQUE(user_id, limit_key),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- =========================================================
-- Partner / Vendor / Organization / Commissions
-- =========================================================

CREATE TABLE IF NOT EXISTS partner_wallets (
  partner_id TEXT PRIMARY KEY,
  balance_paise INTEGER NOT NULL DEFAULT 0,
  total_earned_paise INTEGER NOT NULL DEFAULT 0,
  total_withdrawn_paise INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS partner_commission_logs (
  id TEXT PRIMARY KEY,
  partner_id TEXT NOT NULL,
  city TEXT,
  source_type TEXT,                              -- purchase/withdrawal/etc
  source_id TEXT,
  user_id TEXT,
  amount_paise INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (partner_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_partner_commission_partner_created
  ON partner_commission_logs(partner_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS org_commission_logs (
  id TEXT PRIMARY KEY,
  org_id TEXT NOT NULL,
  source_type TEXT,
  source_id TEXT,
  user_id TEXT,
  amount_paise INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (org_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_org_commission_org_created
  ON org_commission_logs(org_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS commission_logs (
  id TEXT PRIMARY KEY,
  type TEXT,
  city TEXT,
  recipient_id TEXT,
  amount_paise INTEGER NOT NULL,
  created_at_ms INTEGER NOT NULL,
  metadata_json TEXT
);

CREATE INDEX IF NOT EXISTS idx_commission_logs_created
  ON commission_logs(created_at_ms DESC);

-- =========================================================
-- Coupons
-- =========================================================

CREATE TABLE IF NOT EXISTS coupons (
  id TEXT PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  is_active INTEGER NOT NULL DEFAULT 1 CHECK (is_active IN (0,1)),
  config_json TEXT NOT NULL,
  created_by_user_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS coupon_usage (
  id TEXT PRIMARY KEY,
  coupon_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  order_id TEXT,
  amount_paise INTEGER,
  created_at_ms INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (coupon_id) REFERENCES coupons(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_coupon_usage_coupon_user
  ON coupon_usage(coupon_id, user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_coupon_usage_user_created
  ON coupon_usage(user_id, created_at_ms DESC);

-- =========================================================
-- Notifications / In-app
-- =========================================================

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  type TEXT NOT NULL,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  data_json TEXT,
  is_read INTEGER NOT NULL DEFAULT 0 CHECK (is_read IN (0,1)),
  read_at_ms INTEGER,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_notifications_user_created
  ON notifications(user_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_user_unread_created
  ON notifications(user_id, is_read, created_at_ms DESC);

-- =========================================================
-- Admin / Feature Flags / Audit / Metrics
-- =========================================================

CREATE TABLE IF NOT EXISTS admin_permissions (
  user_id TEXT PRIMARY KEY,
  permissions_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  actor_id TEXT NOT NULL,
  actor_name_snapshot TEXT,
  target_id TEXT,
  target_type TEXT,
  metadata_json TEXT,
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (actor_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_audit_logs_created
  ON audit_logs(created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created
  ON audit_logs(action, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_actor_created
  ON audit_logs(actor_id, created_at_ms DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_target_created
  ON audit_logs(target_type, target_id, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS feature_flags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  enabled INTEGER NOT NULL CHECK (enabled IN (0,1)),
  rules_json TEXT,
  description TEXT,
  updated_by_user_id TEXT,
  created_at_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_name
  ON feature_flags(name);

CREATE TABLE IF NOT EXISTS admin_settings (
  id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS public_settings (
  id TEXT PRIMARY KEY,
  value_json TEXT NOT NULL,
  updated_by_user_id TEXT,
  updated_at_ms INTEGER NOT NULL,
  FOREIGN KEY (updated_by_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS admin_metrics (
  id TEXT PRIMARY KEY,
  metrics_json TEXT NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS city_stats (
  id TEXT PRIMARY KEY,                           -- normalized city-state key
  city TEXT,
  state TEXT,
  user_count INTEGER NOT NULL DEFAULT 0,
  order_count INTEGER NOT NULL DEFAULT 0,
  revenue_paise INTEGER NOT NULL DEFAULT 0,
  partner_payout_paise INTEGER NOT NULL DEFAULT 0,
  updated_at_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_city_stats_user_count
  ON city_stats(user_count DESC);

-- =========================================================
-- KYC docs / uploaded object metadata (S3-compatible)
-- =========================================================

CREATE TABLE IF NOT EXISTS file_objects (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT,
  domain TEXT NOT NULL CHECK (domain IN ('profile','kyc','product','review','other')),
  storage_provider TEXT NOT NULL,                -- s3/r2/minio
  bucket TEXT NOT NULL,
  object_key TEXT NOT NULL UNIQUE,
  mime_type TEXT NOT NULL,
  size_bytes INTEGER NOT NULL CHECK (size_bytes >= 0),
  is_public INTEGER NOT NULL DEFAULT 0 CHECK (is_public IN (0,1)),
  sha256_hex TEXT,
  status TEXT NOT NULL CHECK (status IN ('pending','uploaded','deleted','failed')),
  metadata_json TEXT,
  created_at_ms INTEGER NOT NULL,
  uploaded_at_ms INTEGER,
  deleted_at_ms INTEGER,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_file_objects_owner_domain_created
  ON file_objects(owner_user_id, domain, created_at_ms DESC);

CREATE TABLE IF NOT EXISTS kyc_documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  doc_type TEXT NOT NULL,
  file_object_id TEXT NOT NULL,
  status TEXT,                                   -- optional review status if split from users.kyc_status
  created_at_ms INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (file_object_id) REFERENCES file_objects(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_kyc_documents_user_created
  ON kyc_documents(user_id, created_at_ms DESC);

-- =========================================================
-- Rate limits / Outbox / Jobs (ops)
-- =========================================================

CREATE TABLE IF NOT EXISTS rate_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  window_start_ms INTEGER NOT NULL,
  updated_at_ms INTEGER NOT NULL
);

-- Prefer Redis for runtime enforcement; keep DB only if parity/diagnostics needed

CREATE TABLE IF NOT EXISTS outbox_events (
  id TEXT PRIMARY KEY,
  topic TEXT NOT NULL,                           -- search.product_sync, notif.order_status, etc.
  aggregate_type TEXT NOT NULL,
  aggregate_id TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('pending','processing','sent','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  available_at_ms INTEGER NOT NULL,
  locked_at_ms INTEGER,
  last_error TEXT,
  created_at_ms INTEGER NOT NULL,
  sent_at_ms INTEGER
);

CREATE INDEX IF NOT EXISTS idx_outbox_status_available
  ON outbox_events(status, available_at_ms ASC);

CREATE TABLE IF NOT EXISTS scheduled_job_runs (
  id TEXT PRIMARY KEY,
  job_name TEXT NOT NULL,
  scheduled_for_ms INTEGER NOT NULL,
  started_at_ms INTEGER,
  finished_at_ms INTEGER,
  status TEXT NOT NULL CHECK (status IN ('pending','running','success','failed')),
  attempts INTEGER NOT NULL DEFAULT 0,
  result_json TEXT,
  error_text TEXT
);

CREATE INDEX IF NOT EXISTS idx_job_runs_name_scheduled
  ON scheduled_job_runs(job_name, scheduled_for_ms DESC);
```

### Turso-specific implementation notes (important)
- Use **`BEGIN IMMEDIATE`** transactions for financial writes to avoid race conditions under concurrency.
- Store money in **paise/cents integers** (`*_paise`) to avoid floating-point drift.
- Keep a strict **ledger-first audit discipline** for wallet changes.
- For high write consistency, route financial writes to Turso’s **primary write region**.
- Use app-level Zod validation to mirror Firestore Rules field restrictions (especially `users` self-update and KYC submission paths).

---

## Companion 2: Callable-to-REST Endpoint Mapping Matrix (Current Functions → New API)

### Conventions
- Prefix all endpoints with `/v1`
- Admin endpoints under `/v1/admin/*`
- Mutating financial/admin endpoints require `Idempotency-Key`
- Auth in bridge phase: `Authorization: Bearer <Firebase ID token>`
- Target auth phase: HttpOnly cookie session + CSRF protection for browser POST/PATCH/DELETE

### A. User / Wallet / Orders / Withdrawals / Membership

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `createOrderMultiItem` | `functions/src/orders/createOrderMultiItem.ts` | `/v1/orders` | `POST` | user | Transactional create; idempotency recommended |
| `cancelOrder` | `functions/src/orders/cancelOrder.ts` | `/v1/orders/{orderId}/cancel` | `POST` | user/admin | Transactional refund + stock restore |
| `updateOrderStatus` | `functions/src/orders/updateOrderStatus.ts` | `/v1/admin/orders/{orderId}/status` | `PATCH` | admin | Legacy admin-only callable; may unify with `adminUpdateOrderStatus` |
| `requestWithdrawalSecure` | `functions/src/withdrawals/requestWithdrawal.ts` | `/v1/withdrawals` | `POST` | user | KYC/cooldown/monthly-limit validation; transactional |
| `processWithdrawalSecure` | `functions/src/withdrawals/requestWithdrawal.ts` | `/v1/admin/withdrawals/{withdrawalId}/process` | `POST` | admin | Approve/reject secure path (legacy style) |
| `convertCoinsToBalance` | `functions/src/wallet/convertCoinsToBalance.ts` | `/v1/wallet/coin-conversions` | `POST` | user | Transactional wallet mutation |
| `upgradeMembership` | `functions/src/user/upgradeMembership.ts` | `/v1/membership/upgrade` | `POST` | user | If gateway pre-verified |
| `purchaseMembership` | `functions/src/user/upgradeMembership.ts` | `/v1/membership/purchases` | `POST` | user | Payment flow entry/finalization |
| `dailyCheckin` | `functions/src/tasks/dailyCheckin.ts` | `/v1/tasks/daily-checkin/claim` | `POST` | user | Wallet reward; idempotent |
| `creditCoins` *(legacy/admin?)* | `functions/src/wallet/creditCoins.ts` | `/v1/admin/wallets/{userId}/credit-coins` | `POST` | admin | Likely internal/legacy; confirm usage |
| `convertCoins` *(legacy)* | `functions/src/wallet/creditCoins.ts` | `/v1/wallet/coin-conversions/legacy` | `POST` | user | Consolidate into one conversion endpoint |

### B. Tasks / Surveys / Games / Badges / Leaderboards

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `startTask` | `functions/src/tasks/startTask.ts` | `/v1/tasks/{taskId}/sessions` | `POST` | user | Creates task session/start state |
| `rewardTask` | `functions/src/tasks/rewardTask.ts` | `/v1/tasks/{taskId}/claim` | `POST` | user | High-risk wallet mutation; idempotent |
| `submitSurveyAnswer` | `functions/src/tasks/submitSurveyAnswer.ts` | `/v1/task-sessions/{sessionId}/answers` | `POST` | user | Session-scoped |
| `spinWheel` | `functions/src/gamification/games.ts` | `/v1/games/spin-wheel/spins` | `POST` | user | Server-side RNG + wallet/ledger |
| `openLuckyBox` | `functions/src/gamification/games.ts` | `/v1/games/lucky-box/open` | `POST` | user | Server-side RNG + wallet/ledger |
| `getActionCooldowns` | `functions/src/gamification/games.ts` | `/v1/games/cooldowns` | `GET` | user | Read cooldown state |
| `getUserBadges` | `functions/src/gamification/badges.ts` | `/v1/badges/me` | `GET` | user | Read user badges |
| `getLeaderboard` | `functions/src/gamification/leaderboard.ts` | `/v1/leaderboards/{type}` | `GET` | user | Query params for period/limit |
| `updateLeaderboard` | `functions/src/gamification/leaderboard.ts` | `/v1/admin/leaderboards/{type}/recompute` | `POST` | admin | Manual refresh trigger |

### C. Reviews / Coupons / Search / Shop Catalog

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `submitReview` | `functions/src/reviews/reviewFunctions.ts` | `/v1/reviews` | `POST` | user | Validates delivered order ownership |
| `updateReview` | `functions/src/reviews/reviewFunctions.ts` | `/v1/reviews/{reviewId}` | `PATCH` | user/admin | Owner/admin restrictions |
| `deleteReview` | `functions/src/reviews/reviewFunctions.ts` | `/v1/reviews/{reviewId}` | `DELETE` | user/admin | |
| `moderateReview` | `functions/src/reviews/reviewFunctions.ts` | `/v1/admin/reviews/{reviewId}/moderation` | `PATCH` | admin/sub_admin | |
| `markReviewHelpful` | `functions/src/reviews/reviewFunctions.ts` | `/v1/reviews/{reviewId}/helpful-votes` | `PUT` | user | Idempotent by `(review_id,user_id)` |
| `validateCoupon` | `functions/src/coupons/couponFunctions.ts` | `/v1/coupons/validate` | `POST` | user | Pre-check during checkout |
| `createCoupon` | `functions/src/coupons/couponFunctions.ts` | `/v1/admin/coupons` | `POST` | admin/sub_admin | |
| `updateCoupon` | `functions/src/coupons/couponFunctions.ts` | `/v1/admin/coupons/{couponId}` | `PATCH` | admin/sub_admin | |
| `deactivateCoupon` | `functions/src/coupons/couponFunctions.ts` | `/v1/admin/coupons/{couponId}/deactivate` | `POST` | admin/sub_admin | |
| `getShopProductsPage` | `functions/src/marketplace/shopCatalog.ts` | `/v1/shop/products` | `GET` | optional | Cursor + filters + sorting |
| `initializeSearchIndex` | `functions/src/search/productSearch.ts` | `/v1/admin/search/products/index:init` | `POST` | admin | Ops endpoint |
| `reindexAllProducts` | `functions/src/search/productSearch.ts` | `/v1/admin/search/products/reindex` | `POST` | admin | Long-running -> enqueue job |
| `getSearchApiKey` | `functions/src/search/productSearch.ts` | `/v1/search/client-key` | `GET` | user | If keeping direct Typesense client access |

### D. Notifications

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `registerFcmToken` | `functions/src/notifications/orderNotifications.ts` | `/v1/notifications/push-tokens` | `PUT` | user | Store/update device token |
| `markNotificationRead` | `functions/src/notifications/orderNotifications.ts` | `/v1/notifications/{notificationId}/read` | `POST` | user | Ownership check |

### E. Vendor APIs

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getVendorDashboardStats` | `functions/src/vendor/vendor.ts` | `/v1/vendor/dashboard/stats` | `GET` | vendor | |
| `getVendorStoreProfile` | `functions/src/vendor/vendor.ts` | `/v1/vendor/store-profile` | `GET` | vendor | |
| `updateVendorStoreProfile` | `functions/src/vendor/vendor.ts` | `/v1/vendor/store-profile` | `PATCH` | vendor | |
| `getVendorProducts` | `functions/src/vendor/vendor.ts` | `/v1/vendor/products` | `GET` | vendor | Cursor/filter support |
| `createVendorProduct` | `functions/src/vendor/vendor.ts` | `/v1/vendor/products` | `POST` | vendor | |
| `updateVendorProduct` | `functions/src/vendor/vendor.ts` | `/v1/vendor/products/{productId}` | `PATCH` | vendor | Ownership check |
| `deleteVendorProduct` | `functions/src/vendor/vendor.ts` | `/v1/vendor/products/{productId}` | `DELETE` | vendor | Soft-delete recommended |
| `getVendorOrders` | `functions/src/vendor/vendor.ts` | `/v1/vendor/orders` | `GET` | vendor | Uses `vendorIds` / fallback logic today |
| `getVendorAnalytics` | `functions/src/vendor/vendorAnalytics.ts` | `/v1/vendor/analytics` | `GET` | vendor | Time-range params |

### F. Partner APIs

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getPartnerDashboardStats` | `functions/src/partner/partner.ts` | `/v1/partner/dashboard/stats` | `GET` | partner | |
| `getCityUsers` | `functions/src/partner/partner.ts` | `/v1/partner/city/users` | `GET` | partner | City-scoped |
| `getPartnerCommissionHistory` | `functions/src/partner/partner.ts` | `/v1/partner/commissions` | `GET` | partner | Cursor pagination |
| `getPartnerAnalytics` | `functions/src/partner/partner.ts` | `/v1/partner/analytics` | `GET` | partner | Date-range params |
| `getPartnerStats` | `functions/src/partner/partner.ts` | `/v1/partner/stats` | `GET` | partner | Consolidate with dashboard if desired |
| `getPartnerUsers` | `functions/src/partner/partner.ts` | `/v1/partner/users` | `GET` | partner | City-scoped list |
| `createPartnerProduct` | `functions/src/partner/partner.ts` | `/v1/partner/products` | `POST` | partner | Partner-tagged product |
| `updatePartnerProduct` | `functions/src/partner/partner.ts` | `/v1/partner/products/{productId}` | `PATCH` | partner | Ownership check |
| `deletePartnerProduct` | `functions/src/partner/partner.ts` | `/v1/partner/products/{productId}` | `DELETE` | partner | |
| `getPartnerProducts` | `functions/src/partner/partner.ts` | `/v1/partner/products` | `GET` | partner | |

### G. Organization APIs

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getOrgDashboardStats` | `functions/src/organization/organization.ts` | `/v1/org/dashboard/stats` | `GET` | organization | |
| `getOrgMembers` | `functions/src/organization/organization.ts` | `/v1/org/members` | `GET` | organization | Cursor pagination |
| `getOrgEarnings` | `functions/src/organization/organization.ts` | `/v1/org/earnings` | `GET` | organization | Cursor/date filters |

### H. Admin: Health / Stats / Analytics / Audit / Queue Health

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `adminHealthCheck` | `functions/src/admin/healthCheck.ts` | `/v1/admin/health` | `GET` | admin/sub_admin | Diagnostics endpoint |
| `getAdminStats` | `functions/src/admin/getAdminStats.ts` | `/v1/admin/stats` | `GET` | admin/sub_admin (`analytics.read`) | Consolidated dashboard stats |
| `getRevenueSummary` | `functions/src/admin/getAdminStats.ts` | `/v1/admin/analytics/revenue-summary` | `GET` | admin/sub_admin | Fix region ambiguity during migration |
| `getCitySummary` | `functions/src/admin/getAdminStats.ts` | `/v1/admin/analytics/city-summary` | `GET` | admin/sub_admin | |
| `getAdminQueueHealth` | `functions/src/admin/queueHealth.ts` | `/v1/admin/queue-health` | `GET` | admin/sub_admin | |
| `getAdminAuditLogs` | `functions/src/admin/auditLogViewer.ts` | `/v1/admin/audit-logs` | `GET` | admin/sub_admin | Filters + cursor |
| `getAuditLogStats` | `functions/src/admin/auditLogViewer.ts` | `/v1/admin/audit-logs/stats` | `GET` | admin/sub_admin | |
| `getAuditActionTypes` | `functions/src/admin/auditLogViewer.ts` | `/v1/admin/audit-logs/action-types` | `GET` | admin/sub_admin | |
| `logAdminAction` | `functions/src/audit/auditLog.ts` | `/v1/admin/audit-logs` | `POST` | admin/sub_admin | Usually internal service call |
| `getAuditLogs` | `functions/src/audit/auditLog.ts` | `/v1/admin/audit-logs/legacy` | `GET` | admin/sub_admin | Consolidate with `getAdminAuditLogs` |

### I. Admin: Users / Roles / Wallet Adjust / Ban / Export

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getAdminUsers` | `functions/src/admin/userManagement.ts` | `/v1/admin/users` | `GET` | admin/sub_admin | Offset-based legacy route |
| `getAdminUsersPage` | `functions/src/admin/userManagement.ts` | `/v1/admin/users/page` | `GET` | admin/sub_admin | Cursor pagination (preferred) |
| `getUserDetails` | `functions/src/admin/userManagement.ts` | `/v1/admin/users/{userId}` | `GET` | admin/sub_admin | |
| `setUserRole` | `functions/src/admin/userManagement.ts` | `/v1/admin/users/{userId}/role` | `PATCH` | admin/sub_admin | Idempotency required |
| `setUserStatus` | `functions/src/admin/userManagement.ts` | `/v1/admin/users/{userId}/status` | `PATCH` | admin/sub_admin | Idempotency required |
| `adjustWallet` | `functions/src/admin/userManagement.ts` | `/v1/admin/users/{userId}/wallet-adjustments` | `POST` | admin/sub_admin | High-risk; idempotency required |
| `banUser` | `functions/src/admin/banUser.ts` | `/v1/admin/users/{userId}/ban` | `POST` | admin | Confirm overlap with `setUserStatus` |
| `exportData` | `functions/src/admin/banUser.ts` | `/v1/admin/exports` | `POST` | admin | Likely async export job |

### J. Admin: KYC / Withdrawals / Transactions / Orders

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getKycRequests` | `functions/src/admin/kycManagement.ts` | `/v1/admin/kyc/requests` | `GET` | admin/sub_admin | Offset-based legacy route |
| `getKycRequestsPage` | `functions/src/admin/kycManagement.ts` | `/v1/admin/kyc/requests/page` | `GET` | admin/sub_admin | Cursor route preferred |
| `approveKyc` | `functions/src/admin/kycManagement.ts` | `/v1/admin/kyc/requests/{userId}/approve` | `POST` | admin/sub_admin | Mutates `users` KYC fields |
| `rejectKyc` | `functions/src/admin/kycManagement.ts` | `/v1/admin/kyc/requests/{userId}/reject` | `POST` | admin/sub_admin | |
| `getWithdrawals` | `functions/src/admin/withdrawalManagement.ts` | `/v1/admin/withdrawals` | `GET` | admin/sub_admin | Offset-based legacy route |
| `getWithdrawalsPage` | `functions/src/admin/withdrawalManagement.ts` | `/v1/admin/withdrawals/page` | `GET` | admin/sub_admin | Cursor route preferred |
| `approveWithdrawal` | `functions/src/admin/withdrawalManagement.ts` | `/v1/admin/withdrawals/{withdrawalId}/approve` | `POST` | admin/sub_admin | Idempotency required |
| `rejectWithdrawal` | `functions/src/admin/withdrawalManagement.ts` | `/v1/admin/withdrawals/{withdrawalId}/reject` | `POST` | admin/sub_admin | Idempotency required + refund |
| `getAdminTransactionsPage` | `functions/src/admin/transactionManagement.ts` | `/v1/admin/transactions` | `GET` | admin/sub_admin | Cursor + filters |
| `getOrders` | `functions/src/admin/orderManagement.ts` | `/v1/admin/orders` | `GET` | admin/sub_admin | Offset-based legacy route |
| `getOrdersPage` | `functions/src/admin/orderManagement.ts` | `/v1/admin/orders/page` | `GET` | admin/sub_admin | Cursor route preferred |
| `getOrderDetails` | `functions/src/admin/orderManagement.ts` | `/v1/admin/orders/{orderId}` | `GET` | admin/sub_admin | |
| `adminUpdateOrderStatus` | `functions/src/admin/orderManagement.ts` | `/v1/admin/orders/{orderId}/status` | `PATCH` | admin/sub_admin | Preferred admin order status endpoint |
| `processOrderRefund` | `functions/src/admin/orderManagement.ts` | `/v1/admin/orders/{orderId}/refund` | `POST` | admin/sub_admin | Idempotency required |

### K. Admin: Marketplace / Vendors / Product Moderation / Uploads / Imports

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getProductsForModeration` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/moderation` | `GET` | admin/sub_admin | Offset-based legacy |
| `getProductsForModerationPage` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/moderation/page` | `GET` | admin/sub_admin | Cursor preferred |
| `approveProduct` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/{productId}/approve` | `POST` | admin/sub_admin | |
| `rejectProduct` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/{productId}/reject` | `POST` | admin/sub_admin | |
| `adminCreateProduct` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products` | `POST` | admin/sub_admin | |
| `adminUpdateProduct` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/{productId}` | `PATCH` | admin/sub_admin | |
| `adminDeleteProduct` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/products/{productId}` | `DELETE` | admin/sub_admin | Soft-delete recommended |
| `getVendors` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/vendors` | `GET` | admin/sub_admin | Offset-based legacy |
| `getVendorsPage` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/vendors/page` | `GET` | admin/sub_admin | Cursor preferred |
| `verifyVendor` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/vendors/{vendorId}/verify` | `POST` | admin/sub_admin | Idempotency required |
| `suspendVendor` | `functions/src/admin/marketplaceManagement.ts` | `/v1/admin/vendors/{vendorId}/suspend` | `POST` | admin/sub_admin | Cascades product status changes |
| `uploadProductImage` | `functions/src/admin/uploadProductImage.ts` | `/v1/products/{productId}/images` | `POST` | admin/sub_admin/vendor | Replace base64 callable with presigned/stream |
| `deleteProductImage` | `functions/src/admin/uploadProductImage.ts` | `/v1/products/{productId}/images/{imageId}` | `DELETE` | admin/sub_admin/vendor | Ownership check |
| `bulkImportProducts` | `functions/src/admin/bulkImport.ts` | `/v1/admin/products/imports` | `POST` | admin/sub_admin | Async job preferred |
| `getBulkImportTemplate` | `functions/src/admin/bulkImport.ts` | `/v1/admin/products/imports/template` | `GET` | admin/sub_admin | |

### L. Admin: Partners / Organizations / Feature Flags / Settings / Tasks / Games

| Current Function | Source File | Proposed REST Endpoint | Method | Auth | Notes |
|---|---|---|---|---|---|
| `getPartners` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/partners` | `GET` | admin/sub_admin | Offset-based legacy |
| `getPartnersPage` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/partners/page` | `GET` | admin/sub_admin | Cursor preferred |
| `updatePartnerConfig` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/partners/{partnerId}/config` | `PATCH` | admin/sub_admin | Idempotency required |
| `getOrganizations` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/organizations` | `GET` | admin/sub_admin | Offset-based legacy |
| `getOrganizationsPage` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/organizations/page` | `GET` | admin/sub_admin | Cursor preferred |
| `updateOrgConfig` | `functions/src/admin/partnerOrgManagement.ts` | `/v1/admin/organizations/{orgId}/config` | `PATCH` | admin/sub_admin | Idempotency required |
| `getFeatureFlags` | `functions/src/admin/featureFlags.ts` | `/v1/admin/feature-flags` | `GET` | admin/sub_admin | |
| `createFeatureFlag` | `functions/src/admin/featureFlags.ts` | `/v1/admin/feature-flags` | `POST` | admin/sub_admin | |
| `updateFeatureFlag` | `functions/src/admin/featureFlags.ts` | `/v1/admin/feature-flags/{flagId}` | `PATCH` | admin/sub_admin | |
| `deleteFeatureFlag` | `functions/src/admin/featureFlags.ts` | `/v1/admin/feature-flags/{flagId}` | `DELETE` | admin/sub_admin | |
| `checkFeatureFlag` | `functions/src/admin/featureFlags.ts` | `/v1/feature-flags/{name}:check` | `GET` | optional/user | Client/runtime flag resolution |
| `getAdminSettings` | `functions/src/admin/settingsManagement.ts` | `/v1/admin/settings` | `GET` | admin/sub_admin | |
| `updateAdminSettings` | `functions/src/admin/settingsManagement.ts` | `/v1/admin/settings` | `PATCH` | admin/sub_admin | |
| `getGameConfigs` | `functions/src/admin/settingsManagement.ts` | `/v1/admin/game-configs` | `GET` | admin/sub_admin | |
| `updateGameConfig` | `functions/src/admin/settingsManagement.ts` | `/v1/admin/game-configs/{configId}` | `PATCH` | admin/sub_admin | |
| `getCommissionLogs` | `functions/src/admin/settingsManagement.ts` | `/v1/admin/commission-logs` | `GET` | admin/sub_admin | |
| `getAdminTasks` | `functions/src/admin/taskManagement.ts` | `/v1/admin/tasks` | `GET` | admin/sub_admin | Offset-style list |
| `getAdminTasksPage` | `functions/src/admin/taskManagement.ts` | `/v1/admin/tasks/page` | `GET` | admin/sub_admin | Cursor page |
| `createTask` | `functions/src/admin/taskManagement.ts` | `/v1/admin/tasks` | `POST` | admin/sub_admin | |
| `updateTask` | `functions/src/admin/taskManagement.ts` | `/v1/admin/tasks/{taskId}` | `PATCH` | admin/sub_admin | |
| `archiveTask` | `functions/src/admin/taskManagement.ts` | `/v1/admin/tasks/{taskId}/archive` | `POST` | admin/sub_admin | |

### M. Legacy / Ambiguous / Not Exported (do not migrate as public endpoints without confirmation)

| Function | Source | Status | Recommendation |
|---|---|---|---|
| `processWithdrawal` | `functions/src/withdrawals/processWithdrawal.ts` | Legacy callable module; not exported in `functions/src/index.ts` | Do not expose; verify if any external client still calls it |
| `approveWithdrawal` (legacy duplicate) | `functions/src/withdrawals/processWithdrawal.ts` | Name collision with admin current function; not exported | Ignore unless legacy client confirmed |
| `dummyFunc` (`onRequest`) | `functions/src/dummy.ts` | Test/dummy endpoint | Remove or keep in non-prod only |
| `lib/firebase/functions.ts` wrappers (`processWithdrawal`, `completeTask`) | `lib/firebase/functions.ts` | Legacy helper file appears unused | Remove after audit confirmation |

### N. Trigger / Scheduled Function Migration Map (Non-REST, worker/event replacements)

| Current Function | Type | Source File | Replacement in New Architecture |
|---|---|---|---|
| `onUserCreate` | Firestore trigger (`users/{userId}` onCreate) | `functions/src/triggers/user.ts` | Domain event/worker on user registration transaction commit |
| `onTransactionCreate` | Firestore trigger (`transactions/{txnId}` onCreate) | `functions/src/triggers/transactions.ts` | Outbox event processor (`ledger.txn.created`) |
| `onUserReferralLinked` | Firestore trigger on user update | `functions/src/triggers/referralStats.ts` | Service-layer update + background recompute hook |
| `onUserCreatedWithReferrer` | Firestore trigger on user create | `functions/src/triggers/referralStats.ts` | Handle in registration service + outbox |
| `onUserDeleted` | Firestore trigger on user delete | `functions/src/triggers/referralStats.ts` | Admin delete workflow + background aggregate update |
| `recalculateReferralStats` | Scheduled job | `functions/src/triggers/referralStats.ts` | Cron worker job |
| `onProductWrite` | Firestore trigger on product write | `functions/src/search/productSearch.ts` | Outbox -> Typesense sync worker |
| `onOrderStatusChange` | Firestore trigger on order update | `functions/src/notifications/orderNotifications.ts` | Order status event -> notifications worker |
| `onWalletUpdate` | Firestore trigger on wallet update | `functions/src/notifications/orderNotifications.ts` | Wallet credit event -> notifications worker |
| leaderboard scheduled jobs | Scheduled jobs | `functions/src/gamification/leaderboard.ts` | Cron worker jobs (daily/weekly/monthly) |
| badge triggers | Firestore triggers | `functions/src/gamification/badges.ts` | Domain event consumers on order/review/user events |

---

## Suggested rollout order for endpoint migration (pragmatic)
1. Read-only endpoints (`public_settings`, product listing, admin analytics read endpoints)
2. Auth bridge + profile reads
3. Product moderation/vendor read APIs
4. Orders (reads first, then writes)
5. Withdrawals (reads first, then writes)
6. Wallet/ledger/task rewards (financial core)
7. Realtime streams (SSE)
8. Notifications/search workers
9. First-party auth cutover (optional later phase)


## Phase-by-Phase Endpoint Parity Checklist (File-by-File Replacement Plan)

This is the `2` follow-up: a practical migration checklist to replace Firebase SDK / callable usage with your new Turso-backed API, in a low-risk order.

### Scope rule (important)
- Migrate **active app tree** first (`app/`, `hooks/`, `services/`, `store/`, `lib/`).
- Ignore `_cleanpush/` initially (it is excluded by `tsconfig.json` and looks like duplicate code).
- Keep Firebase Auth token bridge temporarily while replacing data/function calls.

---

## Phase 0: Foundation (API client + flags + bridge auth)

### Backend parity endpoints (minimum)
- [ ] `GET /v1/health`
- [ ] `GET /v1/public/settings`
- [ ] `POST /v1/auth/bridge/verify-firebase-token` (temporary)
- [ ] `GET /v1/me`
- [ ] `PATCH /v1/me`

### Frontend files to change first
- [ ] `lib/firebase/callable.ts` (freeze new usage; mark deprecated)
- [ ] `app/api/callable/[name]/route.ts` (keep temporarily for fallback)
- [ ] `lib/firebase/firestore.ts` (start deprecating write helpers)
- [ ] `lib/firebase/storage.ts` (prepare replacement abstraction)
- [ ] Add `lib/api/client.ts`
- [ ] Add `lib/api/endpoints.ts`
- [ ] Add `lib/api/types.ts`

### Acceptance criteria
- [ ] API client supports auth headers/cookies, retries, error normalization
- [ ] Feature flags exist for domain routing (`firebase` vs `api`)
- [ ] No new `httpsCallable`/Firestore direct usage added during migration

---

## Phase 1: Public Read-Only + Shop Listing (low risk reads)

### Endpoints to build
- [ ] `GET /v1/public/settings`
- [ ] `GET /v1/shop/products` (cursor pagination, filters, sort)
- [ ] `GET /v1/products/{productId}`
- [ ] `GET /v1/products/{productId}/related` (or handled via `/shop/products`)
- [ ] `GET /v1/search/client-key` (if keeping direct Typesense client)
- [ ] `GET /v1/search/facets` (optional; can proxy Typesense)

### Files to replace (Firebase reads → API)
- [ ] `hooks/usePublicSettings.ts` → replace `getDoc(public_settings/global)` with `GET /v1/public/settings`
- [ ] `services/product.service.ts`
  - `getShopProductsPage` already callable-based; move to REST
  - `getAllProducts`, `getActiveProducts`, `getProduct` should use API
- [ ] `services/search.service.ts` → replace callable `getSearchApiKey` with REST endpoint
- [ ] `app/dashboard/user/shop/[id]/page.tsx`
  - replace direct Firestore related-products query with API (`/related` or filtered `/shop/products`)

### Acceptance criteria
- [ ] Shop pages render with no direct `firebase/firestore` import
- [ ] Product detail + related products parity confirmed
- [ ] Public settings banners still work (`maintenanceMode`, `signupsEnabled`)

---

## Phase 2: Auth/Profile Bridge + Session Hardening (medium risk)

### Endpoints to build
- [ ] `GET /v1/me`
- [ ] `PATCH /v1/me/profile`
- [ ] `PATCH /v1/me/payment-methods`
- [ ] `POST /v1/me/password/change` (bridge-compatible)
- [ ] `POST /v1/auth/logout` (target-state cookie session)
- [ ] `GET /v1/auth/session` (optional session probe)

### Files to replace
- [ ] `hooks/useAuth.ts`
  - replace Firestore `onSnapshot(users/{uid})` with `GET /v1/me` + SSE/polling later
- [ ] `app/providers.tsx`
  - remove listener bootstrapping dependency on Firebase auth state for app data
- [ ] `store/useStore.ts`
  - replace `onSnapshot(users/wallets)` bootstrapping logic
- [ ] `app/auth/login/page.tsx`
  - stop Firestore role lookup after login, use `GET /v1/me`
- [ ] `app/auth/register/page.tsx`
  - stop direct `setDoc(users/{uid})`; call `POST /v1/auth/register-profile` (bridge) or combined register endpoint
- [ ] `app/dashboard/user/settings/page.tsx`
  - replace `updateDoc(users/{uid})` writes with profile/payment endpoints
  - password change via API (or temporary Firebase bridge endpoint)
- [ ] `middleware.ts`
  - move from no-op to server-verified auth checks (once cookie sessions exist)
- [ ] `app/dashboard/layout.tsx`
  - keep UI role guard, but rely on server session/API for truth

### Acceptance criteria
- [ ] Login/register/settings work without direct Firestore profile writes
- [ ] Role redirect uses API response, not Firestore
- [ ] Server-side auth enforcement in `middleware.ts` enabled (target state or bridge-safe variant)

---

## Phase 3: Wallet + Ledger Reads (read-only first, then mutations)

### Endpoints to build
- [ ] `GET /v1/wallet`
- [ ] `GET /v1/wallet/transactions?limit=&type=`
- [ ] `GET /v1/wallet/summary` (optional: recent tx + balances + lifetime withdrawn)
- [ ] `POST /v1/wallet/coin-conversions` (when ready for write migration)

### Files to replace
- [ ] `hooks/useWallet.ts`
  - wallet doc listener → `GET /v1/wallet` (SSE later)
  - transaction queries → `GET /v1/wallet/transactions`
  - lifetime withdrawn query → aggregate API field
- [ ] `services/wallet.service.ts`
  - all Firestore reads → REST
- [ ] `app/dashboard/user/wallet/page.tsx`
  - callable `convertCoinsToBalance` → `POST /v1/wallet/coin-conversions`

### Acceptance criteria
- [ ] Wallet dashboard reads no Firestore directly
- [ ] Transaction filters match current sorting/order
- [ ] Coin conversion mutation remains transactional and idempotent

⚠️ Risk
- Do not migrate wallet writes before ledger + idempotency are implemented.

---

## Phase 4: Orders (read paths first, then create/cancel/status writes)

### Endpoints to build
- [ ] `GET /v1/orders` (user orders list)
- [ ] `GET /v1/orders/{orderId}` (user-owned)
- [ ] `POST /v1/orders` (multi-item create)
- [ ] `POST /v1/orders/{orderId}/cancel`
- [ ] `GET /v1/orders/stream` or `GET /v1/stream/orders` (later realtime phase)

### Files to replace
- [ ] `app/dashboard/user/orders/page.tsx`
  - replace `onSnapshot` query with REST list + later SSE
- [ ] `app/dashboard/user/orders/[id]/page.tsx`
  - replace doc `onSnapshot` + callable cancel with REST detail + cancel
- [ ] `app/dashboard/user/checkout/page.tsx`
  - callable `createOrderMultiItem` → `POST /v1/orders`
  - direct `users.savedAddresses` update → `PATCH /v1/me/addresses`
- [ ] `services/order.service.ts`
  - callable `createOrderMultiItem` → REST `POST /v1/orders`

### Acceptance criteria
- [ ] Order creation parity (wallet debit, stock decrement, order + ledger)
- [ ] Cancel parity (refund + stock restore + status history)
- [ ] User order list/detail auth ownership enforced server-side

✅ Must-do
- Add `Idempotency-Key` on `POST /v1/orders` and cancel endpoints.

---

## Phase 5: KYC + Withdrawals (high-risk financial + compliance flows)

### Endpoints to build
- [ ] `GET /v1/me/kyc`
- [ ] `POST /v1/me/kyc/submissions`
- [ ] `GET /v1/withdrawals` (user-owned)
- [ ] `POST /v1/withdrawals` (request withdrawal)
- [ ] `GET /v1/withdrawals/stream` or `GET /v1/stream/withdrawals`
- [ ] `POST /v1/uploads/kyc/intents` (presigned upload)
- [ ] `POST /v1/uploads/kyc/finalize`

### Files to replace
- [ ] `app/dashboard/user/kyc/page.tsx`
  - replace direct Storage uploads (`uploadBytes/getDownloadURL`) with presigned upload flow
  - replace direct `updateDoc(users/{uid})` KYC submission with API
- [ ] `app/dashboard/user/withdraw/page.tsx`
  - replace Firestore query/listener + callable withdrawal request with REST
- [ ] `app/dashboard/partner/withdrawals/page.tsx`
  - if partner is viewing own withdrawals, same replacement pattern
- [ ] `services/withdrawal.service.ts`
  - Firestore reads → REST
- [ ] `lib/firebase/storage.ts` (KYC usage path)
  - route to new upload client abstraction

### Acceptance criteria
- [ ] KYC submission still enforces file MIME/size and ownership
- [ ] Withdrawal request parity:
  - KYC verified required
  - cooldown enforced
  - monthly limits enforced
  - pending request block enforced
  - transactional wallet debit + ledger entry
- [ ] No direct Firebase Storage/Firestore writes remain in KYC/withdraw user flows

⚠️ Risk
- This phase must not ship before transaction + reconciliation checks are in place.

---

## Phase 6: Reviews + Wishlist + Referral + Tasks Read APIs (mixed risk)

### Endpoints to build
- [ ] `GET /v1/reviews?productId=&sort=&cursor=`
- [ ] `GET /v1/reviews/stats/{productId}`
- [ ] `POST /v1/reviews`
- [ ] `PATCH /v1/reviews/{reviewId}`
- [ ] `DELETE /v1/reviews/{reviewId}`
- [ ] `PUT /v1/reviews/{reviewId}/helpful-vote`
- [ ] `GET /v1/wishlist`
- [ ] `PUT /v1/wishlist/{productId}`
- [ ] `DELETE /v1/wishlist/{productId}`
- [ ] `GET /v1/referrals` (own referral list + earnings summary)
- [ ] `GET /v1/tasks`
- [ ] `GET /v1/tasks/completions`
- [ ] `POST /v1/tasks/{taskId}/sessions`
- [ ] `POST /v1/tasks/{taskId}/claim`
- [ ] `POST /v1/task-sessions/{sessionId}/answers`

### Files to replace
- [ ] `services/review.service.ts` (mix of Firestore reads + callable writes)
- [ ] `services/wishlist.service.ts` (direct Firestore CRUD)
- [ ] `hooks/useReferral.ts` (Firestore user + transaction queries)
- [ ] `hooks/useTasks.ts` (Firestore task/completion reads)
- [ ] `app/dashboard/user/tasks/page.tsx`
- [ ] `app/dashboard/user/tasks/[taskId]/page.tsx`
- [ ] `app/dashboard/user/tasks/video/[taskId]/page.tsx`
- [ ] `components/tasks/DailyCheckin.tsx`
- [ ] `components/tasks/SpinWheel.tsx`
- [ ] `components/tasks/LuckyBox.tsx`
- [ ] `app/dashboard/user/leaderboard/page.tsx`

### Acceptance criteria
- [ ] Wishlist owner-only behavior preserved
- [ ] Review ownership/moderation rules preserved
- [ ] Task reward claims remain idempotent and transactional
- [ ] Referral earnings totals match ledger semantics

---

## Phase 7: Vendor / Partner / Organization dashboards (scoped access)

### Endpoints to build
Vendor:
- [ ] `GET /v1/vendor/dashboard/stats`
- [ ] `GET /v1/vendor/store-profile`
- [ ] `PATCH /v1/vendor/store-profile`
- [ ] `GET /v1/vendor/products`
- [ ] `POST /v1/vendor/products`
- [ ] `PATCH /v1/vendor/products/{productId}`
- [ ] `DELETE /v1/vendor/products/{productId}`
- [ ] `GET /v1/vendor/orders`
- [ ] `GET /v1/vendor/analytics`

Partner:
- [ ] `GET /v1/partner/dashboard/stats`
- [ ] `GET /v1/partner/users`
- [ ] `GET /v1/partner/products`
- [ ] `POST /v1/partner/products`
- [ ] `PATCH /v1/partner/products/{productId}`
- [ ] `DELETE /v1/partner/products/{productId}`
- [ ] `GET /v1/partner/commissions`
- [ ] `GET /v1/partner/analytics`

Organization:
- [ ] `GET /v1/org/dashboard/stats`
- [ ] `GET /v1/org/members`
- [ ] `GET /v1/org/earnings`

### Files to replace
Vendor pages:
- [ ] `app/dashboard/vendor/page.tsx`
- [ ] `app/dashboard/vendor/store/page.tsx`
- [ ] `app/dashboard/vendor/products/page.tsx`
- [ ] `app/dashboard/vendor/orders/page.tsx`
- [ ] `app/dashboard/vendor/analytics/page.tsx`

Partner pages:
- [ ] `app/dashboard/partner/page.tsx`
- [ ] `app/dashboard/partner/users/page.tsx`
- [ ] `app/dashboard/partner/products/page.tsx`
- [ ] `app/dashboard/partner/earnings/page.tsx`
- [ ] `app/dashboard/partner/withdrawals/page.tsx` (if not already completed in Phase 5)

Organization pages:
- [ ] `app/dashboard/organization/page.tsx`
- [ ] `app/dashboard/organization/members/page.tsx`
- [ ] `app/dashboard/organization/earnings/page.tsx`

### Acceptance criteria
- [ ] Vendor ownership checks preserved (including legacy vendor ID alias handling if needed)
- [ ] Partner city-scope access enforced server-side
- [ ] Org member/earnings queries preserved with pagination/sorting parity

⚠️ Risk
- `vendorIds` / legacy fallback logic in vendor order functions needs careful SQL mapping and regression tests.

---

## Phase 8: Admin Read Pages (safer before admin writes)

### Endpoints to build (read-heavy)
- [ ] `GET /v1/admin/health`
- [ ] `GET /v1/admin/stats`
- [ ] `GET /v1/admin/analytics/revenue-summary`
- [ ] `GET /v1/admin/analytics/city-summary`
- [ ] `GET /v1/admin/queue-health`
- [ ] `GET /v1/admin/users/page`
- [ ] `GET /v1/admin/users/{userId}`
- [ ] `GET /v1/admin/kyc/requests/page`
- [ ] `GET /v1/admin/withdrawals/page`
- [ ] `GET /v1/admin/orders/page`
- [ ] `GET /v1/admin/orders/{orderId}`
- [ ] `GET /v1/admin/transactions`
- [ ] `GET /v1/admin/products/moderation/page`
- [ ] `GET /v1/admin/vendors/page`
- [ ] `GET /v1/admin/partners/page`
- [ ] `GET /v1/admin/organizations/page`
- [ ] `GET /v1/admin/feature-flags`
- [ ] `GET /v1/admin/settings`
- [ ] `GET /v1/admin/game-configs`
- [ ] `GET /v1/admin/commission-logs`
- [ ] `GET /v1/admin/audit-logs`
- [ ] `GET /v1/admin/audit-logs/stats`
- [ ] `GET /v1/admin/audit-logs/action-types`
- [ ] `GET /v1/admin/tasks/page`

### Files to replace (admin read pages)
- [ ] `app/dashboard/admin/page.tsx`
- [ ] `app/dashboard/admin/users/page.tsx`
- [ ] `app/dashboard/admin/kyc/page.tsx`
- [ ] `app/dashboard/admin/withdrawals/page.tsx`
- [ ] `app/dashboard/admin/orders/page.tsx`
- [ ] `app/dashboard/admin/transactions/page.tsx`
- [ ] `app/dashboard/admin/products/page.tsx`
- [ ] `app/dashboard/admin/vendors/page.tsx`
- [ ] `app/dashboard/admin/partners/manage/page.tsx`
- [ ] `app/dashboard/admin/partners-orgs/page.tsx`
- [ ] `app/dashboard/admin/feature-flags/page.tsx`
- [ ] `app/dashboard/admin/settings/page.tsx`
- [ ] `app/dashboard/admin/games/page.tsx`
- [ ] `app/dashboard/admin/finance/page.tsx`
- [ ] `app/dashboard/admin/audit-logs/page.tsx`
- [ ] `app/dashboard/admin/tasks/*`
- [ ] `app/dashboard/admin/cms/page.tsx` (uses `callCallable`)

### Acceptance criteria
- [ ] Admin dashboards load from API with same filters/pagination behavior
- [ ] Sub-admin permission gating enforced server-side (`analytics.read`, etc.)
- [ ] Region mismatch issue (`getRevenueSummary`) eliminated in API routing

---

## Phase 9: Admin Writes + Product Images + Moderation (highest operational/admin risk)

### Endpoints to build (mutating admin flows)
- [ ] `PATCH /v1/admin/users/{userId}/role`
- [ ] `PATCH /v1/admin/users/{userId}/status`
- [ ] `POST /v1/admin/users/{userId}/wallet-adjustments`
- [ ] `POST /v1/admin/kyc/requests/{userId}/approve`
- [ ] `POST /v1/admin/kyc/requests/{userId}/reject`
- [ ] `POST /v1/admin/withdrawals/{withdrawalId}/approve`
- [ ] `POST /v1/admin/withdrawals/{withdrawalId}/reject`
- [ ] `PATCH /v1/admin/orders/{orderId}/status`
- [ ] `POST /v1/admin/orders/{orderId}/refund`
- [ ] `POST /v1/admin/products/{productId}/approve`
- [ ] `POST /v1/admin/products/{productId}/reject`
- [ ] `POST /v1/admin/products`
- [ ] `PATCH /v1/admin/products/{productId}`
- [ ] `DELETE /v1/admin/products/{productId}`
- [ ] `POST /v1/admin/vendors/{vendorId}/verify`
- [ ] `POST /v1/admin/vendors/{vendorId}/suspend`
- [ ] `PATCH /v1/admin/partners/{partnerId}/config`
- [ ] `PATCH /v1/admin/organizations/{orgId}/config`
- [ ] `POST /v1/admin/feature-flags`
- [ ] `PATCH /v1/admin/feature-flags/{flagId}`
- [ ] `DELETE /v1/admin/feature-flags/{flagId}`
- [ ] `PATCH /v1/admin/settings`
- [ ] `PATCH /v1/admin/game-configs/{configId}`
- [ ] `POST /v1/admin/tasks`
- [ ] `PATCH /v1/admin/tasks/{taskId}`
- [ ] `POST /v1/admin/tasks/{taskId}/archive`
- [ ] `POST /v1/admin/products/imports` (async job)
- [ ] `GET /v1/admin/products/imports/template`

Product image upload replacement:
- [ ] `POST /v1/products/{productId}/images/intents`
- [ ] `POST /v1/products/{productId}/images/finalize`
- [ ] `DELETE /v1/products/{productId}/images/{imageId}`

### Files to replace (admin mutating pages)
- [ ] `app/dashboard/admin/users/page.tsx`
- [ ] `app/dashboard/admin/kyc/page.tsx`
- [ ] `app/dashboard/admin/withdrawals/page.tsx`
- [ ] `app/dashboard/admin/orders/page.tsx`
- [ ] `app/dashboard/admin/products/page.tsx`
- [ ] `app/dashboard/admin/vendors/page.tsx`
- [ ] `app/dashboard/admin/partners/manage/page.tsx`
- [ ] `app/dashboard/admin/partners-orgs/page.tsx`
- [ ] `app/dashboard/admin/feature-flags/page.tsx`
- [ ] `app/dashboard/admin/settings/page.tsx`
- [ ] `app/dashboard/admin/games/page.tsx`
- [ ] `app/dashboard/admin/tasks/create/page.tsx`
- [ ] `app/dashboard/admin/tasks/create-video/page.tsx`
- [ ] `app/dashboard/admin/cms/page.tsx`
- [ ] `lib/firebase/productImageUpload.ts` (remove base64 callable flow)

### Acceptance criteria
- [ ] All admin writes require server-side RBAC + sub-admin permission checks
- [ ] High-impact admin writes require `Idempotency-Key`
- [ ] Product image upload path preserves vendor ownership + MIME/size validation + audit logs
- [ ] Audit logs generated for admin actions (parity with `functions/src/admin/helpers.ts` + `audit_logs`)

✅ Must-do
- Ship admin write endpoints only after audit logging and idempotency are live.

---

## Phase 10: Realtime Replacement (SSE / polling cutover)

### Endpoints to build
- [ ] `GET /v1/stream/profile`
- [ ] `GET /v1/stream/wallet`
- [ ] `GET /v1/stream/orders`
- [ ] `GET /v1/stream/withdrawals`
- [ ] `GET /v1/notifications` (if polling fallback)
- [ ] `POST /v1/notifications/{id}/read`
- [ ] `PUT /v1/notifications/push-tokens`

### Files to replace
- [ ] `hooks/useAuth.ts` (`onSnapshot` -> SSE/polling)
- [ ] `hooks/useWallet.ts`
- [ ] `store/useStore.ts`
- [ ] `app/dashboard/user/orders/page.tsx`
- [ ] `app/dashboard/user/orders/[id]/page.tsx`
- [ ] `app/dashboard/user/withdraw/page.tsx`
- [ ] `app/dashboard/partner/withdrawals/page.tsx`

### Acceptance criteria
- [ ] Realtime screens function without Firestore listeners
- [ ] Reconnect behavior tested (network drop/recover)
- [ ] Polling fallback works if SSE unavailable

⚠️ Risk
- Don’t tie SSE rollout to all domains at once; cut over wallet/orders first.

---

## Phase 11: Cleanup / Decommission / Hardening

### Cleanup tasks
- [ ] Remove remaining `firebase/firestore` imports from active app code (except bridge-only code if still needed)
- [ ] Remove remaining `firebase/functions` `httpsCallable` usage from active app code
- [ ] Remove `lib/firebase/callable.ts` and `app/api/callable/[name]/route.ts` after full cutover
- [ ] Remove `lib/firebase/functions.ts` legacy helper file
- [ ] Remove/disable unused callable Functions in `functions/src/index.ts` (after rollout confirmation)
- [ ] Archive or delete dead modules (e.g., legacy `functions/src/withdrawals/processWithdrawal.ts`, if confirmed unused)
- [ ] Lock down Firebase Rules/Functions to prevent stale writes during migration transition
- [ ] Decide final fate of `_cleanpush/`

### Validation gates before declaring done
- [ ] No direct Firebase business writes in active frontend
- [ ] All critical financial/admin flows run through new API
- [ ] Reconciliation reports stable for defined window
- [ ] Incident rollback path documented and tested
- [ ] Secret rotation complete for any exposed env/log artifacts

---

## Quick File-by-File Priority (If You Want a Straight Sprint Sequence)

### Sprint 1 (easy wins)
- [ ] `hooks/usePublicSettings.ts`
- [ ] `services/product.service.ts`
- [ ] `app/dashboard/user/shop/[id]/page.tsx`
- [ ] `services/search.service.ts`

### Sprint 2 (auth/profile)
- [ ] `app/auth/login/page.tsx`
- [ ] `app/auth/register/page.tsx`
- [ ] `hooks/useAuth.ts`
- [ ] `app/dashboard/user/settings/page.tsx`
- [ ] `middleware.ts`

### Sprint 3 (orders + checkout)
- [ ] `services/order.service.ts`
- [ ] `app/dashboard/user/checkout/page.tsx`
- [ ] `app/dashboard/user/orders/page.tsx`
- [ ] `app/dashboard/user/orders/[id]/page.tsx`

### Sprint 4 (KYC + withdrawals)
- [ ] `app/dashboard/user/kyc/page.tsx`
- [ ] `services/withdrawal.service.ts`
- [ ] `app/dashboard/user/withdraw/page.tsx`
- [ ] `app/dashboard/partner/withdrawals/page.tsx`

### Sprint 5 (wallet + tasks + wishlist/reviews)
- [ ] `hooks/useWallet.ts`
- [ ] `services/wallet.service.ts`
- [ ] `services/wishlist.service.ts`
- [ ] `services/review.service.ts`
- [ ] `hooks/useTasks.ts`
- [ ] task/game components + pages

### Sprint 6+ (vendor/partner/org/admin)
- [ ] vendor pages
- [ ] partner pages
- [ ] org pages
- [ ] admin read pages
- [ ] admin write pages
- [ ] product image upload flow
- [ ] SSE realtime cutover
- [ ] Firebase callable/firestore cleanup
