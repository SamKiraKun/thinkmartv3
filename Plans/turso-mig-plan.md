# ThinkMart: Firebase → TursoDB Migration Plan

> **Document Version**: 1.0
> **Generated**: 2026-02-21
> **Scope**: Full production migration from Firebase (Auth + Firestore + Storage + Cloud Functions) to TursoDB + custom backend
> **Methodology**: Derived from direct repository inspection of `thinkmartv3`

---

## 1. Executive Summary

### What ThinkMart Uses Firebase For (Repo Evidence)

ThinkMart is a **Next.js 14 e-commerce + MLM/referral platform** (India-focused, INR currency) that uses **all four pillars** of Firebase:

| Firebase Service | Usage Intensity | Evidence |
|:-----------------|:---------------|:---------|
| **Firebase Auth** | Heavy | Email/password sign-up, sign-in, password reset, `onAuthStateChanged` listeners, session cookies (`lib/firebase/auth.ts`, `hooks/useAuth.ts`, `app/auth/login/page.tsx`, `app/auth/register/page.tsx`) |
| **Firestore** | Critical | 30+ collections, real-time `onSnapshot` listeners for wallets/users/orders/withdrawals, complex security rules (574 lines), 28 composite indexes (`firestore.rules`, `firestore.indexes.json`) |
| **Firebase Storage** | Moderate | User profile images, KYC document uploads (ID/address proof), product images via Cloud Functions (`lib/firebase/storage.ts`, `app/dashboard/user/kyc/page.tsx`, `storage.rules`) |
| **Cloud Functions** | Heavy | 50+ callable/HTTP/trigger functions covering orders, withdrawals, tasks, gamification, reviews, MLM income distribution, admin management, search, notifications (`functions/src/index.ts`) |

### Migration Recommendation

**✅ Proceed with constraints**

TursoDB migration is viable and beneficial for ThinkMart, but requires careful phasing due to:
1. **Heavy real-time dependency** — 6+ `onSnapshot` listeners power core UX (wallet balances, order tracking, withdrawal history)
2. **Complex Cloud Functions** — 50+ functions with transactional business logic (wallet debits, MLM distribution, idempotency)
3. **Multi-role authorization** — 6 roles (user, admin, sub_admin, vendor, partner, organization) with intricate access rules

**Estimated timeline**: 12–16 weeks for full migration with 2–3 senior engineers.

---

## 2. Current State: Firebase Dependency Map

### 2.1 Firestore Collections (30+ discovered)

#### Core App Collections

| Collection | Doc ID Pattern | Key Fields | Client Access | Server Access |
|:-----------|:--------------|:-----------|:-------------|:-------------|
| `users` | `{uid}` | uid, email, name, role, city, state, ownReferralCode, referralCode, referredBy, uplinePath, membershipActive, kycStatus, kycData, vendorConfig, partnerConfig, orgConfig | Read (own + referral-scoped), Create (self), Update (self-safe + KYC) | Full CRUD |
| `wallets` | `{uid}` | userId, cashBalance, coinBalance, totalEarnings, totalWithdrawals | Read-only (own) | Full (Cloud Functions only) |
| `transactions` | auto | userId, type, amount, currency, status, description, createdAt | Read-only (own) | Write (Cloud Functions only) |
| `orders` | auto | userId, items[], subtotal, cashPaid, coinsRedeemed, status, statusHistory, shippingAddress, vendorIds[] | Read-only (own + vendor-scoped) | Write (Cloud Functions only) |
| `products` | auto | name, price, coinPrice, category, image, images[], inStock, stock, vendorId, commission, badges[] | Public read, Vendor/Admin write | Full CRUD |
| `withdrawals` | auto | userId, amount, method, status, details, createdAt, processedAt | Read-only (own) | Write (Cloud Functions only) |
| `tasks` | auto | title, type, reward, rewardType, frequency, isActive | Read (authenticated) | Admin write |
| `task_completions` | auto | userId, taskId, completedAt, reward | Read-only (own) | Write (Cloud Functions) |
| `task_sessions` | auto | userId | Read-only (own) | Write (Cloud Functions) |
| `wishlists` | `{uid}_{productId}` | userId, productId, productName, productPrice, addedAt | Full CRUD (own) | — |
| `reviews` | auto | productId, userId, orderId, rating, content, status, helpful | Read (approved or own), Update (own fields), Delete (own) | Full (Cloud Functions) |
| `review_stats` | `{productId}` | totalReviews, averageRating, ratingDistribution | Public read | Write (Cloud Functions) |
| `review_helpful` | auto | reviewId, userId, helpful | Public read | Write (Cloud Functions) |
| `surveys` | auto | — | Read (authenticated) | Admin write |
| `survey_responses` | auto | userId | Read (own), Create (own) | — |
| `cooldowns` | `{uid}` | — | Read (own) | Write (Cloud Functions) |
| `teams` | `{uid}` | — | Read (own) | Write (Cloud Functions) |
| `notifications` | auto | userId | Read (own) | Write (Cloud Functions) |

#### Admin/Moderation Collections

| Collection | Access | Purpose |
|:-----------|:-------|:--------|
| `admin_settings` | Admin read/write | Platform configuration |
| `public_settings` | Public read, Admin write | Maintenance mode, signups enabled, withdrawals enabled |
| `audit_logs` | Admin read | Action audit trail |
| `admin_permissions` | Admin read | Sub-admin permission sets |
| `admin_metrics` | Admin read | Dashboard metrics |
| `feature_flags` | Admin read | Feature toggles |
| `product_categories` | Public read, Admin write | Product taxonomy |
| `product_brands` | Public read, Admin write | Brand catalog |
| `banners` | Public read, Admin write | Marketing banners |
| `idempotency_keys` | Denied to all clients | Server-side idempotency |
| `rate_limits` | Denied to all clients | Server-side rate limiting |

#### Partner/Org/KYC Collections

| Collection | Access |
|:-----------|:-------|
| `partner_wallets` | Own + Admin read |
| `partner_commission_logs` | Own + Admin read |
| `org_commission_logs` | Own + Admin read |
| `withdrawal_logs` | Admin read |
| `city_stats` | Admin + Partner read |
| `kyc_documents` | Own + Admin read, Own create |
| `kyc_submissions` | Admin read |
| `game_limits` | Own + Admin read |
| `commission_logs` | Admin read |
| `withdraw_requests` | Admin read |
| `coupons` | Admin read |
| `coupon_usage` | Admin read |

#### Gamification Collections

| Collection | Access |
|:-----------|:-------|
| `user_badges` | Own + Admin read |
| `leaderboards` | Public read |
| `leaderboard_archives` | Public read |
| `game_configs` | Admin read |
| `system/leaderboard` | Public read |

### 2.2 Real-Time Listeners (onSnapshot)

| Location | Collection | Scope | Purpose |
|:---------|:-----------|:------|:--------|
| `hooks/useAuth.ts:37` | `users/{uid}` | Single doc | Profile sync (membership, role changes) |
| `hooks/useWallet.ts:26` | `wallets/{uid}` | Single doc | Live wallet balance |
| `store/useStore.ts:25,30` | `users/{uid}`, `wallets/{uid}` | Single docs | Global Zustand store sync |
| `app/providers.tsx:16` | Auth state | — | Auth state initialization |
| `app/dashboard/user/orders/page.tsx:53` | `orders` (userId filter) | Collection query | Live order list |
| `app/dashboard/user/orders/[id]/page.tsx:75` | `orders/{id}` | Single doc | Order detail tracking |
| `app/dashboard/user/withdraw/page.tsx:104` | `withdrawals` (userId filter) | Collection query | Withdrawal history |
| `app/dashboard/partner/withdrawals/page.tsx:60` | `withdrawals` (partner filter) | Collection query | Partner withdrawal view |

> ⚠️ **Risk**: 8 active real-time listeners must be replaced. These are critical UX features.

### 2.3 Storage Usage

| Path Pattern | Upload Source | Access | Size Limit |
|:-------------|:------------|:-------|:-----------|
| `users/{uid}/**` | Client (profile images) | Own + Admin | 5 MB, images only |
| `products/**` | Server only (Admin SDK) | Public read | No client write |
| `kyc_documents/{uid}/**` | Client (KYC docs) | Own + Admin | 10 MB, images + PDF |
| `kyc/{uid}/**` | Legacy client path | Own + Admin | 10 MB, images + PDF |

**Files involved**: `lib/firebase/storage.ts`, `lib/firebase/productImageUpload.ts`, `app/dashboard/user/kyc/page.tsx`

### 2.4 Auth Usage

- **Provider**: Email/password only (no OAuth/social)
- **Flows**: Register (`app/auth/register/page.tsx`), Login (`app/auth/login/page.tsx`), Forgot Password (`app/auth/forgot-password/`)
- **Persistence**: `browserLocalPersistence` via `lib/firebase/auth.ts`
- **Session**: Client-side cookie `tm_session` for dashboard guard (`lib/auth/sessionCookie.ts`)
- **Token usage**: `getIdToken()` for callable proxy auth (`lib/firebase/callable.ts:147`)
- **Roles in Firestore**: `user`, `admin`, `sub_admin`, `vendor`, `partner`, `organization`

### 2.5 Cloud Functions (50+)

**Grouped by domain:**

| Domain | Functions | Key Examples |
|:-------|:---------|:-------------|
| **Triggers** | 3 | `onUserCreate`, `onTransactionCreate`, `referralStats` |
| **Tasks** | 4 | `rewardTask`, `startTask`, `submitSurveyAnswer`, `dailyCheckin` |
| **Wallet** | 2 | `convertCoinsToBalance`, `creditCoins` |
| **Withdrawals** | 2 | `requestWithdrawalSecure`, `processWithdrawal`/`approveWithdrawal` |
| **Orders** | 3 | `createOrderMultiItem`, `cancelOrder`, `updateOrderStatus` |
| **Admin** | 18+ | `getAdminStats`, `userManagement`, `kycManagement`, `withdrawalManagement`, `transactionManagement`, `marketplaceManagement`, `orderManagement`, `partnerOrgManagement`, `featureFlags`, `auditLogViewer`, `healthCheck`, `queueHealth`, `settingsManagement`, `taskManagement`, `uploadProductImage`, `bulkImport` |
| **User** | 1 | `upgradeMembership` (payment/membership) |
| **Partner/Vendor/Org** | 4 | `partner`, `vendor`, `vendorAnalytics`, `organization` |
| **Reviews** | 1 module | `submitReview`, `updateReview`, `deleteReview`, `markReviewHelpful` |
| **Gamification** | 3 | `leaderboard`, `badges`, `games` (spin wheel, lucky box) |
| **Coupons** | 1 | `couponFunctions` |
| **Search** | 1 | `productSearch` (Typesense integration) |
| **Marketplace** | 1 | `shopCatalog` (paginated listing) |
| **Notifications** | 1 | `orderNotifications` (FCM) |
| **MLM** | 1 | `distributeIncome` |
| **Audit** | 1 | `auditLog` |

**Dependencies**: `firebase-admin ^12.0.0`, `firebase-functions ^4.5.0`, `typesense ^3.0.1`, `zod ^3.23.0`

### 2.6 Security Rules Summary

- **574 lines** of Firestore rules with 13 helper functions
- **Roles enforced**: admin, sub_admin, vendor, partner, organization, user
- **Key patterns**: ownership checks (`request.auth.uid == userId`), referral-scoped reads, safe-create/safe-update field whitelists, KYC submission guards
- **Write-denied collections**: wallets, transactions, withdrawals, orders (client writes blocked; server-only via Cloud Functions)
- **Storage rules**: 100 lines, image/PDF type checks, size limits

---

## 3. Why Migrate: Benefits for ThinkMart

| Benefit | ThinkMart-Specific Impact |
|:--------|:------------------------|
| **SQL queries** | Complex admin dashboards (user filtering by city+role+date, transaction aggregation, commission calculations) currently require Cloud Functions; SQL handles natively |
| **Cost predictability** | Firebase costs scale with reads/writes; ThinkMart's `onSnapshot` listeners + 50+ functions = unpredictable billing. TursoDB has flat pricing |
| **Vendor lock-in reduction** | Currently 100% dependent on Firebase; migration enables multi-cloud deployment |
| **Stronger data integrity** | Firestore lacks foreign keys and JOINs; wallet/order consistency relies entirely on Cloud Function transaction logic. SQL provides ACID guarantees |
| **Better authorization model** | 574 lines of Firestore rules are hard to test and reason about; API-layer auth is more debuggable |
| **Full-text search** | Already using Typesense separately; TursoDB can integrate with search or reduce dependency |
| **Offline/edge reads** | TursoDB's libSQL embedded replicas enable edge-cached reads for product catalog |

---

## 4. Trade-offs, Risks, and Hidden Costs

### ⚠️ High Risk Items

| Risk | Details | Mitigation |
|:-----|:--------|:-----------|
| **Real-time replacement** | 8 `onSnapshot` listeners power core UX; WebSocket/SSE adds complexity | Phase real-time last; use polling initially for non-critical views |
| **Auth migration** | Firebase Auth handles password hashing, token rotation, rate limiting out of the box | Use battle-tested library (better-auth, lucia-auth, or custom JWT with argon2) |
| **Financial data integrity** | Wallet balances, order payments, withdrawal processing are transactional | Use TursoDB transactions with idempotency keys; extensive reconciliation testing |
| **MLM income distribution** | 6-level upline calculation with atomic multi-wallet updates | Implement as database transaction with row-level locking |
| **Data migration** | 30+ collections with Firestore Timestamps, nested objects, arrays | Write custom ETL scripts; validate row counts and checksums |

### Operational Burden Increase

| Concern | Firebase (Current) | TursoDB (Target) |
|:--------|:------------------|:----------------|
| **Hosting** | Managed | Self-managed Node.js server (or serverless) |
| **Auth** | Managed | Self-managed password hashing, token rotation, rate limiting |
| **Backups** | Automatic | Must configure (TursoDB has built-in point-in-time recovery) |
| **Scaling** | Automatic | Must configure replicas/auto-scaling |
| **Monitoring** | Firebase console | Must set up (e.g., Grafana, Datadog) |
| **Incident recovery** | Firebase support | Self-managed runbooks |

---

## 5. Target Architecture (TursoDB + Service Layer)

### 5.1 Proposed Stack

```
┌─────────────────────────────────────────────────┐
│  Next.js 14 Frontend (existing)                 │
│  - Replace Firebase SDK calls with API client   │
│  - Keep TailwindCSS, Zustand, React Hot Toast   │
└──────────────────┬──────────────────────────────┘
                   │ REST API (fetch)
┌──────────────────▼──────────────────────────────┐
│  Node.js API Server (Fastify)                   │
│  - JWT auth middleware                          │
│  - RBAC + ownership authorization               │
│  - Input validation (zod)                       │
│  - Rate limiting (in-memory + DB)               │
│  - WebSocket server (Socket.io) for real-time   │
└──────────────────┬──────────────────────────────┘
                   │
        ┌──────────┼──────────────┐
        ▼          ▼              ▼
┌──────────┐ ┌──────────┐ ┌──────────────┐
│ TursoDB  │ │ S3/R2    │ │ Redis        │
│ (Primary)│ │ (Files)  │ │ (Sessions,   │
│          │ │          │ │  Rate Limits, │
│          │ │          │ │  BullMQ Jobs) │
└──────────┘ └──────────┘ └──────────────┘
```

**Justification**:
- **Fastify** over Express: Better performance, built-in validation, TypeScript-first. Over Nest: ThinkMart doesn't need DI/module complexity.
- **REST** over GraphQL: Current codebase uses simple CRUD patterns with `httpsCallable`; REST is a natural 1:1 replacement. No evidence of complex nested queries that would benefit from GraphQL.

### 5.2 Auth Design

| Component | Choice | Rationale |
|:----------|:-------|:----------|
| Password hashing | **argon2id** | Memory-hard, recommended by OWASP; superior to bcrypt |
| Access token | **JWT** (RS256, 15 min TTL) | Stateless verification at API layer |
| Refresh token | **Opaque token** in DB (30 day TTL) | Revocable, stored in `refresh_tokens` table |
| Transport | **httpOnly secure cookie** (refresh) + **Authorization header** (access) | CSRF protection + SPA compatibility |
| Email verification | Custom flow with signed token | Replace Firebase's built-in email verification |
| Password reset | Time-limited signed URL (1 hour) | Replace `sendPasswordResetEmail` |

**Role model** (preserved from current):
```
user → base role (shop, earn, refer)
vendor → user + product management + order fulfillment
partner → user + city-scoped commission viewing
organization → user + org member management
sub_admin → admin-lite with granular permissions
admin → full access
```

### 5.3 Authorization Design

- **RBAC** enforced at API middleware layer (replaces Firestore rules)
- **Resource ownership** checks via SQL `WHERE user_id = :currentUserId`
- **Vendor scoping**: Products/orders filtered by `vendor_id`
- **Partner scoping**: Commissions/users filtered by `assigned_city`
- **Referral scoping**: Downline access via `upline_path` array contains check
- **Privilege escalation prevention**: Role changes only via admin endpoints; self-update blocks role/balance/membership fields (mirrors current `isSafeUserSelfUpdate`)

### 5.4 Storage Design

| Current Firebase Path | New Storage | Access Pattern |
|:---------------------|:-----------|:---------------|
| `users/{uid}/*` | **Cloudflare R2** `users/{uid}/` | Presigned upload URL from API; CDN for reads |
| `products/*` | **Cloudflare R2** `products/` | Server-side upload (admin); public CDN reads |
| `kyc_documents/{uid}/*` | **Cloudflare R2** `kyc/{uid}/` | Presigned upload URL; private (signed URL for admin review) |

**Upload flow**: Client requests presigned URL → uploads directly to R2 → notifies API with object key → API validates and stores reference in DB.

### 5.5 Real-Time Design

| Current Listener | Replacement | Justification |
|:----------------|:-----------|:--------------|
| `users/{uid}` profile sync | **WebSocket** (Socket.io room per user) | Critical for membership/role updates |
| `wallets/{uid}` balance | **WebSocket** (same room) | Critical for live balance after earning/spending |
| `orders` (user's list) | **SSE** or **polling with ETag** (30s) | Less critical; order status changes are infrequent |
| `orders/{id}` detail | **WebSocket** (room per order) | Moderate; live tracking updates |
| `withdrawals` history | **Polling** (60s) | Low frequency; status changes are admin-driven |

### 5.6 Background Jobs

| Current Trigger | Replacement |
|:---------------|:-----------|
| Firestore `onCreate` on users | **BullMQ job** triggered after user registration API |
| Firestore `onCreate` on transactions | **BullMQ job** triggered after transaction insert |
| Referral stats recomputation | **BullMQ scheduled job** (every 5 min) or event-driven |
| FCM notifications | **BullMQ job** for push notification delivery |
| Leaderboard recomputation | **BullMQ cron** (daily) |

### 5.7 Observability

- **Logging**: Pino (Fastify default) → structured JSON logs → shipped to Grafana Loki or Datadog
- **Metrics**: Prometheus endpoint via `fastify-metrics` (request latency, error rate, DB query time)
- **Tracing**: OpenTelemetry SDK for distributed tracing
- **Alerts**: Error rate > 1%, p99 latency > 2s, DB connection pool exhaustion, failed withdrawal/order processing
- **Rate limiting**: Redis-backed sliding window (replaces Firestore `rate_limits` collection)
- **Abuse protection**: Request body size limits, file upload type/size validation, account lockout after N failed logins

---

## 6. TursoDB Schema & Index Plan

### 6.1 Core Tables

```sql
-- =========================================================================
-- USERS
-- =========================================================================
CREATE TABLE users (
  id TEXT PRIMARY KEY,                    -- matches auth UID
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  phone TEXT,
  photo_url TEXT,
  password_hash TEXT NOT NULL,            -- argon2id
  role TEXT NOT NULL DEFAULT 'user'
    CHECK(role IN ('user','admin','sub_admin','vendor','partner','organization')),
  state TEXT,
  city TEXT,
  own_referral_code TEXT UNIQUE NOT NULL,
  referral_code TEXT,                     -- upline's code used at registration
  referred_by TEXT,                       -- upline's user ID
  upline_path TEXT,                       -- JSON array of UIDs (up to 6 levels)
  referral_processed INTEGER DEFAULT 0,
  membership_active INTEGER DEFAULT 0,
  membership_date TEXT,                   -- ISO timestamp
  is_active INTEGER DEFAULT 1,
  is_banned INTEGER DEFAULT 0,
  -- KYC
  kyc_status TEXT DEFAULT 'not_submitted'
    CHECK(kyc_status IN ('not_submitted','pending','verified','rejected')),
  kyc_data TEXT,                          -- JSON blob
  kyc_submitted_at TEXT,
  kyc_verified_at TEXT,
  kyc_rejection_reason TEXT,
  -- Shopping
  saved_addresses TEXT,                   -- JSON array
  -- Config (role-specific)
  partner_config TEXT,                    -- JSON (assignedCity, commissionPercentage, etc.)
  vendor_config TEXT,                     -- JSON (vendorId, businessName, verified, etc.)
  org_config TEXT,                        -- JSON (orgName, orgType, etc.)
  sub_admin_permissions TEXT,             -- JSON array
  -- Timestamps
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role_created ON users(role, created_at DESC);
CREATE INDEX idx_users_referral_code ON users(referral_code, created_at DESC);
CREATE INDEX idx_users_own_referral_code ON users(own_referral_code);
CREATE INDEX idx_users_city_role ON users(city, role, created_at DESC);
CREATE INDEX idx_users_kyc_status ON users(kyc_status, kyc_submitted_at);

-- =========================================================================
-- WALLETS
-- =========================================================================
CREATE TABLE wallets (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  cash_balance REAL NOT NULL DEFAULT 0
    CHECK(cash_balance >= 0),
  coin_balance REAL NOT NULL DEFAULT 0
    CHECK(coin_balance >= 0),
  total_earnings REAL NOT NULL DEFAULT 0,
  total_withdrawals REAL NOT NULL DEFAULT 0,
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- =========================================================================
-- TRANSACTIONS
-- =========================================================================
CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL
    CHECK(type IN ('TASK_REWARD','REFERRAL_BONUS','TEAM_INCOME',
                   'WITHDRAWAL','PURCHASE','MEMBERSHIP_FEE','PARTNER_COMMISSION')),
  amount REAL NOT NULL,
  currency TEXT NOT NULL DEFAULT 'INR'
    CHECK(currency IN ('COIN','INR','CASH')),
  status TEXT NOT NULL DEFAULT 'COMPLETED'
    CHECK(status IN ('PENDING','COMPLETED','FAILED')),
  description TEXT,
  related_user_id TEXT,
  task_id TEXT,
  task_type TEXT,
  level INTEGER,
  source_txn_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_txn_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_txn_user_type_created ON transactions(user_id, type, created_at DESC);

-- =========================================================================
-- PRODUCTS
-- =========================================================================
CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  price REAL NOT NULL,
  coin_price REAL,
  category TEXT,
  image TEXT,
  images TEXT,                             -- JSON array of URLs
  commission REAL DEFAULT 0,
  in_stock INTEGER DEFAULT 1,
  stock INTEGER,
  badges TEXT,                             -- JSON array
  coin_only INTEGER DEFAULT 0,
  cash_only INTEGER DEFAULT 0,
  delivery_days INTEGER,
  vendor_id TEXT,
  status TEXT DEFAULT 'approved',
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_products_vendor_active ON products(vendor_id, is_active, created_at DESC);
CREATE INDEX idx_products_category ON products(category);
CREATE INDEX idx_products_in_stock ON products(in_stock);

-- =========================================================================
-- ORDERS
-- =========================================================================
CREATE TABLE orders (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_email TEXT,
  user_name TEXT,
  items TEXT NOT NULL,                     -- JSON array of OrderItem
  subtotal REAL NOT NULL,
  cash_paid REAL NOT NULL DEFAULT 0,
  coins_redeemed REAL NOT NULL DEFAULT 0,
  coin_value REAL NOT NULL DEFAULT 0,
  shipping_address TEXT,                   -- JSON
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','confirmed','shipped','delivered','cancelled','refunded')),
  status_history TEXT,                     -- JSON array
  vendor_ids TEXT,                         -- JSON array for multi-vendor
  city TEXT,
  refund_reason TEXT,
  refunded_at TEXT,
  idempotency_key TEXT UNIQUE,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_orders_user_created ON orders(user_id, created_at DESC);
CREATE INDEX idx_orders_status_created ON orders(status, created_at DESC);

-- =========================================================================
-- WITHDRAWALS
-- =========================================================================
CREATE TABLE withdrawals (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  amount REAL NOT NULL,
  method TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','completed')),
  details TEXT,                            -- JSON (bankName, accountNumber, upiId, etc.)
  admin_notes TEXT,
  rejection_reason TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  processed_at TEXT
);

CREATE INDEX idx_withdraw_user_created ON withdrawals(user_id, created_at DESC);
CREATE INDEX idx_withdraw_user_status ON withdrawals(user_id, status);
CREATE INDEX idx_withdraw_status_created ON withdrawals(status, created_at DESC);

-- =========================================================================
-- TASKS & COMPLETIONS
-- =========================================================================
CREATE TABLE tasks (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT,
  type TEXT NOT NULL,
  reward REAL NOT NULL,
  reward_type TEXT NOT NULL DEFAULT 'COIN',
  frequency TEXT,
  min_duration INTEGER,
  cooldown_hours INTEGER,
  max_completions_per_day INTEGER,
  possible_rewards TEXT,                   -- JSON array
  questions TEXT,                           -- JSON array (surveys)
  is_active INTEGER DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE task_completions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  task_id TEXT NOT NULL REFERENCES tasks(id),
  reward REAL,
  reward_type TEXT,
  completed_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_tc_user_task_completed ON task_completions(user_id, task_id, completed_at DESC);
CREATE INDEX idx_tc_user_completed ON task_completions(user_id, completed_at DESC);

-- =========================================================================
-- REVIEWS & STATS
-- =========================================================================
CREATE TABLE reviews (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  rating INTEGER NOT NULL CHECK(rating BETWEEN 1 AND 5),
  title TEXT,
  content TEXT NOT NULL,
  images TEXT,                             -- JSON array
  user_name TEXT,
  user_avatar TEXT,
  helpful INTEGER DEFAULT 0,
  verified INTEGER DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK(status IN ('pending','approved','rejected','flagged')),
  moderation_note TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT
);

CREATE INDEX idx_reviews_product_status ON reviews(product_id, status, created_at DESC);
CREATE INDEX idx_reviews_product_helpful ON reviews(product_id, status, helpful DESC);
CREATE INDEX idx_reviews_user ON reviews(user_id, created_at DESC);

CREATE TABLE review_stats (
  product_id TEXT PRIMARY KEY REFERENCES products(id),
  total_reviews INTEGER DEFAULT 0,
  average_rating REAL DEFAULT 0,
  rating_distribution TEXT,                -- JSON {1:n, 2:n, ...}
  last_updated TEXT
);

CREATE TABLE review_helpful (
  id TEXT PRIMARY KEY,
  review_id TEXT NOT NULL REFERENCES reviews(id),
  user_id TEXT NOT NULL REFERENCES users(id),
  helpful INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(review_id, user_id)
);

-- =========================================================================
-- WISHLISTS
-- =========================================================================
CREATE TABLE wishlists (
  id TEXT PRIMARY KEY,                     -- {userId}_{productId}
  user_id TEXT NOT NULL REFERENCES users(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  product_name TEXT,
  product_image TEXT,
  product_price REAL,
  product_coin_price REAL,
  notify_on_price_drop INTEGER DEFAULT 0,
  notify_on_back_in_stock INTEGER DEFAULT 0,
  added_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_wishlist_user ON wishlists(user_id, added_at DESC);

-- =========================================================================
-- ADDITIONAL TABLES (abbreviated)
-- =========================================================================
-- surveys, survey_responses, task_sessions, cooldowns,
-- partner_wallets, partner_commission_logs, org_commission_logs,
-- withdrawal_logs, city_stats, kyc_documents, game_limits,
-- notifications, user_badges, leaderboards, leaderboard_archives,
-- game_configs, commission_logs, coupons, coupon_usage,
-- admin_settings, public_settings, audit_logs, admin_permissions,
-- admin_metrics, feature_flags, product_categories, product_brands,
-- banners, idempotency_keys, rate_limits, refresh_tokens
-- (All follow same pattern: Firestore doc shape → SQL columns)
```

### 6.2 Migration Mapping Table

| Firestore Path | TursoDB Table | Key Differences |
|:---------------|:-------------|:----------------|
| `users/{uid}` | `users` | Nested objects (kycData, vendorConfig, partnerConfig) stored as JSON TEXT columns |
| `wallets/{uid}` | `wallets` | CHECK constraints enforce non-negative balances |
| `transactions/{id}` | `transactions` | Firestore Timestamps → ISO 8601 strings |
| `orders/{id}` | `orders` | `items[]` and `statusHistory[]` as JSON; `vendorIds[]` as JSON for array-contains equivalent |
| `products/{id}` | `products` | `images[]` and `badges[]` as JSON arrays |
| `withdrawals/{id}` | `withdrawals` | Payment details as JSON column |
| `tasks/{id}` | `tasks` | Survey questions as JSON |
| `task_completions/{id}` | `task_completions` | Direct mapping |
| `wishlists/{id}` | `wishlists` | Composite unique on (user_id, product_id) |
| `reviews/{id}` | `reviews` | `images[]` as JSON |
| `review_stats/{productId}` | `review_stats` | Materialized aggregate |
| `public_settings/{id}` | `public_settings` | Key-value table |

---

## 7. Codebase Impact & Refactor Plan

### 7.1 Frontend Changes

| Category | Files Affected | Effort |
|:---------|:--------------|:-------|
| **Replace Firebase Auth SDK** | `lib/firebase/auth.ts`, `hooks/useAuth.ts`, `app/auth/login/page.tsx`, `app/auth/register/page.tsx`, `app/auth/forgot-password/page.tsx`, `app/providers.tsx`, `store/auth.store.ts` | High |
| **Replace Firestore reads** | `lib/firebase/firestore.ts`, all `services/*.service.ts` (11 files), `hooks/useWallet.ts`, `hooks/useTasks.ts`, `hooks/useReferral.ts`, `hooks/usePublicSettings.ts`, `hooks/useRole.ts`, `store/useStore.ts` | High |
| **Replace onSnapshot listeners** | `hooks/useAuth.ts`, `hooks/useWallet.ts`, `store/useStore.ts`, `app/providers.tsx`, `app/dashboard/user/orders/page.tsx`, `app/dashboard/user/orders/[id]/page.tsx`, `app/dashboard/user/withdraw/page.tsx`, `app/dashboard/partner/withdrawals/page.tsx` | High |
| **Replace httpsCallable** | `lib/firebase/callable.ts`, `lib/firebase/functions.ts`, `lib/firebase/productImageUpload.ts`, `services/order.service.ts`, `services/product.service.ts`, `services/payment.service.ts`, `services/review.service.ts`, `services/search.service.ts` | Medium |
| **Replace Storage uploads** | `lib/firebase/storage.ts`, `app/dashboard/user/kyc/page.tsx` | Low |
| **Remove Firebase config** | `lib/firebase/config.ts`, `lib/firebase/firebase.config.ts`, `.env*` files | Low |

### 7.2 Backend Additions (New)

| Component | Description |
|:----------|:-----------|
| **API server** | Fastify app with route modules mirroring current Cloud Functions |
| **Auth module** | Registration, login, refresh, password reset, email verification |
| **Middleware** | JWT verification, RBAC, rate limiting, request logging |
| **Service layer** | Port all 50+ Cloud Functions to service classes |
| **WebSocket server** | Socket.io for real-time events (wallet, profile, orders) |
| **Job queue** | BullMQ workers for MLM distribution, notifications, badge computation |
| **DB client** | TursoDB client with connection pooling, migrations |
| **Shared types** | Zod schemas for request/response validation (already using zod in functions) |

### 7.3 Shared Types / Validation

All existing `types/*.ts` files (13 files) should be:
1. **Stripped** of `firebase/firestore` `Timestamp` imports → use ISO 8601 strings or `Date`
2. **Augmented** with Zod schemas for API input validation
3. **Shared** between frontend and backend (monorepo `packages/shared` or API client package)

---

## 8. Migration Execution Plan (Phased)

### Phase 0: Preparation (Week 1–2)

- [ ] Set up TursoDB instance (production + staging)
- [ ] Set up Node.js API project with Fastify, TypeScript
- [ ] Set up Redis instance for sessions/queues
- [ ] Set up Cloudflare R2 bucket for file storage
- [ ] Write Firestore export scripts (all collections → JSON)
- [ ] Create DB migration/schema files
- [ ] Set up CI/CD pipeline for new backend
- [ ] Add application-level logging to current Firebase functions (baseline metrics)

**✅ Acceptance**: Infrastructure provisioned, schema applied to staging DB, CI green.

### Phase 1: Auth Migration (Week 3–4)

- [ ] Implement auth endpoints (register, login, refresh, logout, password reset)
- [ ] Implement JWT middleware with role extraction
- [ ] Migrate user registration flow (currently writes to Firebase Auth + Firestore)
- [ ] Build API client module for frontend (`lib/api/client.ts`)
- [ ] Replace `app/auth/login/page.tsx` to use new API
- [ ] Replace `app/auth/register/page.tsx` to use new API
- [ ] Replace `hooks/useAuth.ts` to use new API + JWT storage
- [ ] **Data migration**: Export Firebase Auth users → import to `users` table with hashed passwords (use Firebase Admin SDK to export; re-hash with argon2)

**✅ Acceptance**: Users can register, login, and see their profile. Old Firebase Auth still works in parallel. E2E test: register → login → view dashboard.

> ⚠️ **Risk**: Firebase Auth doesn't expose raw passwords. Users will need password reset on first login to new system, OR use Firebase Admin SDK `listUsers` + import hashed passwords with Firebase's scrypt configuration.

### Phase 2: Read-Path Migration (Week 5–7)

- [ ] Implement GET endpoints for all read operations (products, orders, transactions, tasks, withdrawals, reviews, wishlists, etc.)
- [ ] Replace all `services/*.service.ts` read methods to call API instead of Firestore
- [ ] Replace `hooks/useWallet.ts` transaction fetches with API calls
- [ ] Replace `hooks/useTasks.ts` with API calls
- [ ] Replace `hooks/useReferral.ts` with API calls
- [ ] Replace `hooks/usePublicSettings.ts` with API call
- [ ] **Data migration**: Export all Firestore collections → transform → import to TursoDB
- [ ] **Dual-read validation**: Run both paths in staging, compare results

**✅ Acceptance**: All dashboard pages render correctly with data from TursoDB. Automated comparison of Firestore vs TursoDB query results for 100 sample users.

### Phase 3: Write-Path Migration (Week 8–10)

- [ ] Port all Cloud Functions to API endpoints:
  - Order creation (`createOrderMultiItem` → `POST /api/orders`)
  - Withdrawal request/processing → `POST /api/withdrawals`
  - Task reward/start/survey → `POST /api/tasks/*/complete`
  - Review CRUD → `POST/PUT/DELETE /api/reviews`
  - Product CRUD (admin) → `POST/PUT/DELETE /api/admin/products`
  - Membership purchase → `POST /api/membership/purchase`
  - All admin management endpoints
- [ ] Implement idempotency key checking (replaces `idempotency_keys` collection)
- [ ] Implement MLM income distribution as transactional service
- [ ] Replace `lib/firebase/callable.ts` with direct API calls
- [ ] Replace all `httpsCallable` usage in services

**✅ Acceptance**: All write operations work end-to-end. Order → wallet debit → transaction log verified. Withdrawal → balance check → status update verified.

### Phase 4: Real-Time & Storage Migration (Week 11–12)

- [ ] Implement WebSocket server with Socket.io
- [ ] Replace `onSnapshot` for wallets/users with WebSocket subscriptions
- [ ] Replace order tracking listener with WebSocket/SSE
- [ ] Replace withdrawal history listener with polling
- [ ] Implement R2 presigned URL upload flow
- [ ] Replace KYC document upload to use R2
- [ ] Replace product image upload to use R2
- [ ] Migrate existing Storage files to R2

**✅ Acceptance**: Real-time wallet balance updates work. KYC upload flow works. Product image upload works.

### Phase 5: Background Jobs & Triggers (Week 13–14)

- [ ] Set up BullMQ workers
- [ ] Port Firestore triggers (onUserCreate, onTransactionCreate, referralStats)
- [ ] Port notification system (FCM or alternative push service)
- [ ] Port leaderboard/badge computation
- [ ] Port scheduled jobs (if any cron-based functions exist)

**✅ Acceptance**: New user registration triggers referral processing. Badge/leaderboard updates work.

### Phase 6: Cutover & Cleanup (Week 15–16)

- [ ] Final data sync (delta export from Firestore → TursoDB)
- [ ] DNS/routing switch: frontend points to new API
- [ ] Remove all Firebase SDK imports from frontend
- [ ] Remove `firebase` and `@firebase/rules-unit-testing` from `package.json`
- [ ] Remove `functions/` directory (or archive)
- [ ] Remove `firestore.rules`, `storage.rules`, `firebase.json`, `.firebaserc`
- [ ] Update environment variables
- [ ] Remove Firebase project billing (after 30-day monitoring period)

**✅ Acceptance**: Zero Firebase API calls in production logs for 7 consecutive days.

### Rollback Strategy

- **Phase 1–3**: Firebase remains primary; new system is secondary. Rollback = revert frontend to Firebase SDK calls.
- **Phase 4–5**: Feature flags control which system handles real-time and uploads. Rollback = disable flags.
- **Phase 6**: After cutover, keep Firebase project active for 30 days. Rollback = re-enable Firebase SDK calls via feature flag and restore DNS.

---

## 9. Test & Validation Plan

### Unit Tests
- [ ] Auth service: registration, login, token refresh, password reset
- [ ] Wallet service: balance operations, concurrent debit safety
- [ ] Order service: creation, cancellation, refund, idempotency
- [ ] MLM service: 6-level income distribution accuracy
- [ ] Authorization middleware: role checks, ownership verification

### Integration Tests
- [ ] Full order flow: browse → cart → checkout → order created → wallet debited → transaction logged
- [ ] Full withdrawal flow: request → admin approve → balance updated → status completed
- [ ] Full referral flow: register with code → upline linked → referral bonus distributed
- [ ] KYC flow: submit → admin review → approve/reject → withdrawal eligibility

### E2E Tests
- [ ] User journey: register → complete task → earn coins → convert → shop → order → review
- [ ] Admin journey: login → view dashboard → manage users → approve KYC → process withdrawal
- [ ] Vendor journey: login → add product → receive order → update status

### Data Validation
- [ ] Row count comparison: Firestore collection sizes vs TursoDB table counts
- [ ] Wallet balance reconciliation: sum of all transactions per user == wallet balance
- [ ] Order total verification: sum of item prices matches order subtotal
- [ ] Referral tree integrity: uplinePath arrays form valid tree structure

### Security Testing
- [ ] Authorization matrix: verify each role can only access permitted endpoints
- [ ] Negative tests: attempt privilege escalation (user → admin), cross-user data access
- [ ] Rate limit testing: verify limits on order creation, withdrawal requests
- [ ] Input validation: SQL injection, XSS, oversized payloads
- [ ] Token security: expired tokens rejected, refresh rotation works

---

## 10. Open Questions / Ambiguities

| # | Question | Location | What Needs Confirmation |
|:--|:---------|:---------|:-----------------------|
| 1 | **FCM push notifications**: Are they actively used in production? | `functions/src/notifications/orderNotifications.ts` | Need to verify if FCM tokens are collected and push notifications are sent. If yes, need to choose replacement (Firebase Cloud Messaging can be used independently). |
| 2 | **Typesense hosting**: Where is Typesense hosted? | `services/search.service.ts`, `functions/src/search/productSearch.ts` | API key is fetched via Cloud Function. Need to know if Typesense Cloud or self-hosted. Migration may not affect Typesense if self-hosted. |
| 3 | **Payment gateway integration**: Is there a real payment gateway? | `services/payment.service.ts:23` | Current code has `await new Promise(resolve => setTimeout(resolve, 2000))` — simulated payment. Need to confirm if Razorpay/Stripe is integrated elsewhere. |
| 4 | **Vendor order fulfillment flow**: How do vendors currently process orders? | `app/dashboard/vendor/orders/page.tsx` | Uses `onSnapshot` for vendor's orders. Need to verify full vendor workflow including shipping updates. |
| 5 | **Firebase Hosting**: Is the app deployed via Firebase Hosting? | `firebase.json:26-36` (hosting config with `frameworksBackend`) | Need to plan alternative hosting (Vercel, Cloudflare Pages, etc.) |
| 6 | **Offline behavior**: Does the app use Firestore offline persistence? | No `enableIndexedDbPersistence` found | **Likely not used** — no evidence in code, but should be confirmed. |
| 7 | **`_cleanpush` directory**: What is this? | `_cleanpush/` (279 children) | Appears to be a copy/backup of the codebase. Should be excluded from migration scope. |
| 8 | **Password migration**: Can Firebase Auth password hashes be exported? | Firebase Admin SDK | Firebase uses scrypt for password hashing. Export via Admin SDK `listUsers()` includes passwordHash and passwordSalt in some configurations. Need to verify if this project's Firebase plan supports hash export. |
| 9 | **Ad network webhooks**: Are these active? | `api-spec.md:389-400` | Webhook endpoint for ad network postbacks is documented but may not be implemented yet. |
| 10 | **Game configs (spin wheel, lucky box)**: How complex is the game logic? | `functions/src/gamification/games.ts` | Need to inspect implementation complexity before estimating port effort. |

---

## 11. Appendix

### A. Files Searched

| Category | Files/Patterns Inspected |
|:---------|:------------------------|
| Firebase config | `lib/firebase/config.ts`, `.env.example`, `firebase.json`, `.firebaserc` |
| Firestore usage | All `*.ts`/`*.tsx` files searched for `collection(`, `doc(`, `getDoc`, `getDocs`, `setDoc`, `addDoc`, `updateDoc`, `deleteDoc`, `query`, `where`, `orderBy`, `limit`, `startAfter`, `onSnapshot`, `collectionGroup` |
| Storage usage | All files searched for `uploadBytes`, `uploadBytesResumable`, `getDownloadURL`, `deleteObject`, `listAll`, `getMetadata` |
| Auth usage | All files searched for `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `onAuthStateChanged`, `signOut`, `getIdToken` |
| Cloud Functions | All files searched for `httpsCallable`, `functions.https`, `onCall`, `onRequest` |
| Rules/roles | `firestore.rules` (574 lines), `storage.rules` (100 lines), `firestore.indexes.json` (462 lines) |
| Types | All 13 files in `types/` directory |
| Services | All 11 files in `services/` directory |
| Hooks | All 6 files in `hooks/` directory |
| Store | All 4 files in `store/` directory |
| Cloud Functions source | `functions/src/index.ts` + all subdirectories (21 modules) |
| Dashboard pages | `app/dashboard/` (admin, user, vendor, partner, organization) |
| Auth pages | `app/auth/` (login, register, forgot-password) |

### B. Key Dependencies

**Frontend** (`package.json`):
- `firebase: ^10.7.0` — ✅ Must remove
- `next: ^14.0.0` — Keep
- `react: ^18.2.0` — Keep
- `zustand: ^4.4.0` — Keep
- `typesense: ^3.0.1` — Keep (independent of Firebase)
- `framer-motion`, `lucide-react`, `react-hot-toast`, `recharts` — Keep

**Cloud Functions** (`functions/package.json`):
- `firebase-admin: ^12.0.0` — Replace with TursoDB client
- `firebase-functions: ^4.5.0` — Replace with Fastify routes
- `typesense: ^3.0.1` — Keep
- `zod: ^3.23.0` — Keep and expand

### C. Firestore Indexes (28 composite indexes)

All 28 composite indexes from `firestore.indexes.json` have been mapped to equivalent SQL indexes in Section 6.1. Key compound indexes include:
- `task_completions(userId, taskId, completedAt)`
- `users(referralCode, createdAt)`
- `withdrawals(userId, status, processedAt)`
- `orders(vendorIds, status, createdAt)`
- `transactions(userId, type, createdAt)`
- `reviews(productId, status, createdAt/helpful/rating)`
- `audit_logs(action, timestamp)`

### D. Estimated Effort Summary

| Phase | Effort (person-weeks) | Risk Level |
|:------|:---------------------|:-----------|
| Phase 0: Preparation | 2 | Low |
| Phase 1: Auth | 3 | High |
| Phase 2: Read Path | 4 | Medium |
| Phase 3: Write Path | 5 | High |
| Phase 4: Real-Time & Storage | 3 | Medium |
| Phase 5: Background Jobs | 2 | Medium |
| Phase 6: Cutover | 1 | High |
| **Total** | **20 person-weeks** | — |

With 2 senior engineers: **~10–12 calendar weeks**.
With 3 senior engineers: **~8–10 calendar weeks**.

---

*This migration plan is the source of truth for the Firebase → TursoDB migration. All tasks are assignable and testable. Update this document as ambiguities are resolved.*
