# ThinkMart Firebase to TursoDB Migration Report (Repo-Grounded Audit)

## 1. Executive Summary

ThinkMart currently uses Firebase as a **full backend platform**, not only a database.

- Firestore is used for product/user/order/wallet/withdrawal/task/review/admin data.
- Firebase Storage is used for profile images, KYC files, and product images (product image writes are server-mediated).
- Firebase Auth is used for email/password login, registration, password reset, and client auth state.
- Firebase Cloud Functions contain critical business logic (orders, wallet mutations, withdrawals, admin actions, tasks, notifications, search sync, scheduled jobs).
- Firestore/Storage Rules enforce a large part of the current authorization and data write boundaries.
- Realtime UI behavior depends on Firestore listeners (`onSnapshot`) in several user-facing flows.

**Migration recommendation:** **Proceed with constraints**.

✅ Must-do
- Treat this as a **platform migration** (DB + auth + storage + functions + rules behavior), not a “Firestore swap”.
- Build a **server/service layer first** and move clients to API calls before changing the backing datastore.
- Preserve financial consistency guarantees (wallets/orders/withdrawals/stock) with SQL transactions + idempotency.
- Recreate Firebase Rules protections as explicit backend authorization tests.

⚠️ Risk
- A big-bang migration is high risk for this codebase.
- Security will regress if client-side checks remain authoritative.
- Realtime UX can regress if listener replacement is not planned per screen.

---

## 2. Current State: Firebase Dependency Map

### Firestore: collections/paths and operations + where used (file references)

### Firebase initialization (Firestore + related services)
- `lib/firebase/config.ts` initializes:
  - `initializeApp`
  - `getAuth`
  - `getFirestore`
  - `getFunctions`
  - `getStorage`
- `lib/firebase/config.ts` defaults functions region to `us-central1`.
- `firebase.json` configures Firestore rules/indexes, Storage rules, Functions source, Hosting, and emulators.

### Direct frontend Firestore usage (reads/writes/queries/listeners)
- Auth/profile realtime:
  - `hooks/useAuth.ts` uses `onAuthStateChanged` + `onSnapshot(doc(db, 'users', uid))`.
  - `app/providers.tsx` uses `onAuthStateChanged` to initialize listeners.
- Global app state realtime:
  - `store/useStore.ts` uses realtime listeners on `users/{uid}` and `wallets/{uid}`.
- Wallet/recent activity:
  - `hooks/useWallet.ts` listens to `wallets/{uid}` and queries `transactions`, `withdrawals`.
- Orders/withdrawals realtime UI:
  - `app/dashboard/user/orders/page.tsx`
  - `app/dashboard/user/orders/[id]/page.tsx`
  - `app/dashboard/user/withdraw/page.tsx`
  - `app/dashboard/partner/withdrawals/page.tsx`
- Registration/login direct Firestore:
  - `app/auth/register/page.tsx` creates `users/{uid}` with `setDoc`.
  - `app/auth/login/page.tsx` reads `users/{uid}` for role redirect.
- Direct client profile/KYC/payment/address writes:
  - `app/dashboard/user/settings/page.tsx` updates `users/{uid}` (`updateDoc`).
  - `app/dashboard/user/kyc/page.tsx` updates `users/{uid}` (`kycStatus`, `kycData`, timestamps).
  - `app/dashboard/user/checkout/page.tsx` updates `users/{uid}.savedAddresses` using `arrayUnion`.
- Direct client wishlist CRUD:
  - `services/wishlist.service.ts` uses `getDocs`, `getDoc`, `setDoc`, `deleteDoc` on `wishlists`.
- Direct Firestore reads in services/hooks:
  - `services/product.service.ts`, `services/review.service.ts`, `hooks/useReferral.ts`, `hooks/useTasks.ts`, `hooks/usePublicSettings.ts`, `services/wallet.service.ts`, `services/withdrawal.service.ts`, `services/user.service.ts`, `services/referral.service.ts`.

### Firestore query patterns discovered (important for Turso indexes)
Observed across app/services/functions:
- `where(...)`
- `orderBy(...)`
- `limit(...)`
- `startAfter(...)`
- `array-contains`
- `array-contains-any`
- `in`
- counts (`.count().get()` in Admin SDK functions)
- cursor pagination patterns with `orderBy(createdAt) + orderBy(documentId)`

### Realtime listeners (`onSnapshot`) discovered
Realtime listeners are actively used in app state and user dashboards.

Evidence (active app tree):
- `hooks/useAuth.ts`
- `hooks/useWallet.ts`
- `store/useStore.ts`
- `app/dashboard/user/orders/page.tsx`
- `app/dashboard/user/orders/[id]/page.tsx`
- `app/dashboard/user/withdraw/page.tsx`
- `app/dashboard/partner/withdrawals/page.tsx`

### Firestore collections/paths observed in code and rules
Core commerce/accounting:
- `users`
- `wallets`
- `transactions`
- `orders`
- `withdrawals`
- `products`

User features:
- `wishlists`
- `reviews`
- `review_stats`
- `review_helpful`
- `notifications`

Tasks/gamification:
- `tasks`
- `task_completions`
- `task_sessions`
- `task_starts`
- `cooldowns`
- `user_badges`
- `leaderboards`
- `leaderboard_archives`
- `game_limits`
- `game_configs`

Admin/config/ops:
- `admin_settings`
- `public_settings`
- `audit_logs`
- `admin_permissions`
- `idempotency_keys`
- `admin_metrics`
- `feature_flags`
- `rate_limits`
- `city_stats`

Partner/vendor/org/commission:
- `partner_wallets`
- `partner_commission_logs`
- `org_commission_logs`
- `withdrawal_logs`
- `commission_logs`

Coupons/search support:
- `coupons`
- `coupon_usage`

Legacy or ambiguous references:
- `withdraw_requests`
- `kyc_submissions`
- `system/leaderboard` (rule path)

### Firestore indexes / query complexity evidence
- `firestore.indexes.json` exists and is large (461 lines).
- Composite indexes span many business collections (`users`, `orders`, `withdrawals`, `transactions`, `reviews`, `wishlists`, `audit_logs`, `partner_commission_logs`, `org_commission_logs`, etc.).
- `firestore.indexes.json` shows many `collectionGroup` entries (30 occurrences), indicating non-trivial query/index maintenance today.

### Firestore Rules dependencies (behavior to replicate)
`firestore.rules` is a major source of security and business boundary behavior.

Key rule characteristics:
- Role helpers defined: `admin`, `sub_admin`, `vendor`, `partner`, `organization`.
- User self-update restrictions block many sensitive fields (`role`, `membership`, referral chain fields, KYC verification fields, etc.).
- Special KYC submission update path allowed on `users/{uid}`.
- Sensitive collections are server-only writes from clients:
  - `wallets` update/delete denied
  - `transactions` write denied
  - `withdrawals` create/update/delete denied
  - `orders` create/update/delete denied
- Product writes are allowed for admin/sub-admin and scoped vendor ownership.
- Wishlist client writes are allowed with strict ownership/id format checks.
- Default deny at end of rules file.

Evidence:
- `firestore.rules`
- `tests/firestore.rules.test.ts` validates role/ownership scenarios using Firebase emulator

---

### Storage: path conventions and operations + where used

### Storage SDK usage in frontend
- `lib/firebase/storage.ts` wraps:
  - `uploadBytes`
  - `getDownloadURL`
  - `deleteObject`
- Direct usage in app:
  - `app/dashboard/user/kyc/page.tsx`: uploads KYC docs directly to Firebase Storage.
  - `app/dashboard/user/settings/page.tsx`: profile image upload via utility wrapper.

### Storage path conventions discovered
- Profile assets:
  - `users/{uid}/profile_{timestamp}`
- KYC documents:
  - `kyc_documents/{uid}/{docType}_{timestamp}.{ext}`
- Product images (server-side callable):
  - `products/{productId}/{position}_{timestamp}.{ext}`

### Server-side Storage usage (Admin SDK in Functions)
- `functions/src/admin/uploadProductImage.ts`
  - role checks (`admin`, `sub_admin`, `vendor`)
  - rate limiting
  - content type validation (`jpeg/png/webp`)
  - size limit (5MB)
  - ownership validation for vendor uploads
  - Firestore product document update (`images`, `image`, `imageUrl`)
  - audit log entries
  - delete flow also present (`deleteProductImage`)

### Storage Rules dependencies
`storage.rules` encodes path-based authorization and file constraints.

Key rule behavior:
- `users/{uid}/**`
  - owner/admin read
  - owner write only
  - image-only upload
  - size < 5MB
- `products/**`
  - public read
  - no client writes
- `kyc_documents/{uid}/**`
  - owner/admin read
  - owner create/update only
  - image/pdf only
  - size < 10MB
- legacy `kyc/{uid}/**` path retained with same semantics

Evidence:
- `storage.rules`
- `tests/storage.rules.test.ts` validates KYC/profile/product-image rules

---

### Auth: flows + where used

### Firebase Auth usage discovered
- `lib/firebase/auth.ts` wraps:
  - `createUserWithEmailAndPassword`
  - `signInWithEmailAndPassword`
  - `sendPasswordResetEmail`
  - `signOut`
  - `onAuthStateChanged`
  - `setPersistence(browserLocalPersistence)`
- Registration flow:
  - `app/auth/register/page.tsx`
  - Creates Firebase Auth user
  - Updates auth profile display name
  - Writes Firestore `users/{uid}` profile directly
- Login flow:
  - `app/auth/login/page.tsx`
  - Signs in with email/password
  - Reads Firestore user doc to route by role
- Password reset flow:
  - `app/auth/forgot-password/page.tsx`
- Password change flow:
  - `app/dashboard/user/settings/page.tsx`
  - Uses `reauthenticateWithCredential` + `updatePassword`

### Session persistence and route protection state
- Auth persistence is browser-local (`browserLocalPersistence`) via `lib/firebase/auth.ts`.
- Client cookie helper (`tm_session`) exists in `lib/auth/sessionCookie.ts`, but it is **client-written** and not cryptographically authoritative.
- `middleware.ts` explicitly does **not** enforce dashboard auth server-side.
- `app/dashboard/layout.tsx` enforces auth and role redirect **client-side** using `useAuth()` and `checkRoleAccess`.

⚠️ Risk
- Current server-side route protection posture is weak (client-state-centric).
- Migration should improve this, not preserve the gap.

---

### Realtime/offline usage (if any)

Realtime:
- Firestore `onSnapshot` is used in active user flows (profile, wallet, user orders, user withdrawals, partner withdrawals).
- `hooks/useAuth.ts` comments describe realtime profile updates as “critical” for membership/MLM updates.

Offline:
- No explicit Firestore offline persistence setup found (no `enableIndexedDbPersistence`, no persistent local cache APIs).
- **Ambiguous**: product team reliance on incidental browser cache behavior was not observable from code alone.

---

### Any Functions/admin tooling

### Cloud Functions shape
- `functions/src/index.ts` exports a large set of modules:
  - orders, withdrawals, admin dashboards/management, vendor/partner/org flows, tasks, gamification, reviews, notifications, search, triggers
- Functions are callable-heavy (`functions.https.onCall`) plus trigger/scheduled jobs.

### Critical business logic in Functions (server-side source of truth today)
Examples:
- `functions/src/orders/createOrderMultiItem.ts`
  - wallet debit
  - stock decrement
  - order creation
  - transaction log
  - partner commission dispatch
  - transaction-based atomicity
- `functions/src/orders/cancelOrder.ts`
  - ownership/admin checks
  - refund wallet balances
  - stock restoration
  - refund transaction log
- `functions/src/orders/updateOrderStatus.ts`
  - admin-only state machine transitions
  - refund-on-cancel behavior
- `functions/src/withdrawals/requestWithdrawal.ts`
  - KYC requirement
  - cooldown and monthly limits
  - pending request check
  - transactional wallet debit
  - risk flags
- `functions/src/withdrawals/requestWithdrawal.ts` (`processWithdrawalSecure`)
  - admin-only processing
  - approve/reject path
  - refund on reject
  - logs + partner commission dispatch
- `functions/src/admin/helpers.ts`
  - admin/sub-admin RBAC permissions
  - audit logging
  - idempotency key handling
- `functions/src/lib/rateLimit.ts`
  - Firestore-backed distributed rate limiting
- `functions/src/tasks/rewardTask.ts`
  - task completion validation
  - idempotency
  - wallet credit + transaction log
- `functions/src/search/productSearch.ts`
  - Typesense sync via product write trigger
- `functions/src/notifications/orderNotifications.ts`
  - order/wallet triggers + FCM push + in-app notifications

### Trigger/scheduler footprint (must be replaced)
Observed patterns:
- Firestore document triggers (`onCreate`, `onUpdate`, `onWrite`, `onDelete`)
- Scheduled jobs (`pubsub.schedule(...).onRun(...)`)
- FCM notifications (Admin SDK messaging)
- Search sync trigger to Typesense

### Callable transport/proxy layer in app
- `lib/firebase/callable.ts`
  - proxy-first callable transport
  - fallback between proxy and SDK
  - ID token forwarding
- `app/api/callable/[name]/route.ts`
  - proxy route forwards to `https://${region}-${projectId}.cloudfunctions.net/{function}`

### Rules testing and emulators
- Firestore/Storage rules tests exist and use emulator test environment:
  - `tests/firestore.rules.test.ts`
  - `tests/storage.rules.test.ts`
- `firebase.json` configures emulators for auth/functions/firestore.

---

## 3. Why Migrate: Benefits for ThinkMart

Only repo-applicable benefits are listed.

- **Centralized backend authority**
  - Today business and security logic is split across client code, Rules, and Functions.
  - A dedicated API layer simplifies reasoning, testing, and auditing.
- **Improved reliability vs callable/CORS path**
  - The repo already has a callable proxy/fallback system (`lib/firebase/callable.ts`) and a documented production issue list in `Plans/BUGS.md`.
  - Moving to first-party API endpoints removes Cloud Functions callable transport quirks and region/domain coupling.
- **Better fit for transactional commerce/accounting**
  - Orders, withdrawals, wallet debits/credits, refunds, and stock changes are transactional and relational.
  - Turso/libSQL fits ledger and state transition modeling well if designed carefully.
- **Reduced Firebase Rules lock-in**
  - Rules are powerful but hard to evolve/debug at scale; explicit API authorization code + tests is easier to version and review.
- **Operational observability**
  - API services can provide structured logs, traces, metrics, and replay/reconciliation tooling beyond current mixed setup.
- **Storage flexibility**
  - KYC and product image workflows can move to S3-compatible storage with clearer upload/access controls.

✅ Must-do
- Preserve what Firebase currently does well (guardrails and atomicity) while migrating.

---

## 4. Trade-offs, Risks, and Hidden Costs

### Security model shift (Rules → API auth)
- Firebase Rules currently enforce many ownership and server-only write constraints.
- After migration, the API becomes the sole enforcement point.
- This increases implementation responsibility and testing burden.

⚠️ Risk
- Missing one ownership check in API code can expose sensitive data or allow unauthorized writes.

### Realtime replacement complexity
- Firestore listeners currently power wallet/profile/order/withdraw screens.
- Replacing them with SSE/WebSockets/polling requires endpoint design, client hooks, and load planning.

### Operational burden (hosting, scaling, backups, on-call)
Firebase currently bundles a lot of ops.
A new stack must explicitly handle:
- API deployment and autoscaling
- Turso backups and restore processes
- job/worker scheduling and retries
- object storage lifecycle policies
- monitoring, alerting, incident response
- secret management and rotation

### Auth migration complexity
- Firebase Auth stores current credentials/session identity.
- Migrating to first-party auth requires a bridge strategy (accept Firebase tokens initially, or staged re-auth/password reset migration).

### Hidden cost: legacy drift and inconsistent paths
Evidence of drift/compat support in code:
- `withdraw_requests` and `withdrawals` both queried in admin stats (`functions/src/admin/getAdminStats.ts`)
- `kyc_submissions` referenced in rules and queue health
- legacy helper wrappers in `lib/firebase/functions.ts`
- unexported/legacy function module `functions/src/withdrawals/processWithdrawal.ts`

### Existing production fragility (repo evidence)
- `Plans/BUGS.md` documents callable/CORS failures from `thinkmart.in`.
- `functions/src/admin/getAdminStats.ts` exports `getRevenueSummary` in `us-east1`, while frontend defaults to `us-central1`.
- This reinforces the need for a clean, explicit API routing model during migration.

✅ Must-do
- Fix region/config ambiguity as part of migration prep, not after cutover.

---

## 5. Target Architecture (TursoDB + Service Layer)

### Proposed backend stack with justification

**Recommended stack**
- Node.js 20 + TypeScript
- Fastify (REST API)
- Zod for validation
- Turso/libSQL as primary database
- Drizzle ORM (or Kysely) for schema/query layer
- Redis + BullMQ for background jobs/queues
- S3-compatible object storage (Cloudflare R2 / AWS S3 / MinIO)
- Typesense retained for product search
- OpenTelemetry + structured logging + metrics stack

**Why this fits ThinkMart**
- Existing Cloud Functions are already TypeScript modules with explicit business logic.
- Fastify + Zod mirrors current callable-handler style and supports incremental porting.
- Turso/libSQL supports transactions and relational modeling needed by wallets/orders/refunds.
- Redis/BullMQ replaces trigger/scheduler responsibilities with retryable jobs.
- S3-compatible storage is better than DB blobs for product/KYC documents.
- Turso “GridFS” is not applicable (GridFS is Mongo-specific); object storage is the right choice here.

### API style: REST vs GraphQL
**Recommendation: REST**
- Current frontend is action/callable-oriented, not graph-driven.
- Easier 1:1 migration from callable names to endpoint routes.
- Clearer authz and rate-limit boundaries per route.
- Lower migration risk than introducing GraphQL and resolvers mid-platform migration.

Example endpoint mapping:
- `createOrderMultiItem` → `POST /v1/orders`
- `cancelOrder` → `POST /v1/orders/{id}/cancel`
- `requestWithdrawalSecure` → `POST /v1/withdrawals`
- `approveWithdrawal` → `POST /v1/admin/withdrawals/{id}/approve`
- `getAdminUsersPage` → `GET /v1/admin/users`

### Auth approach
**Phase 1 (bridge)**
- API accepts Firebase ID tokens (server verifies token).
- API resolves roles/scopes from Turso (or transitional Firestore read if needed).
- Frontend keeps Firebase Auth login initially, but all business API calls move to new backend.

**Phase 2 (target auth)**
- First-party auth with:
  - Argon2id password hashing
  - short-lived access token
  - rotating refresh token
  - HttpOnly Secure SameSite cookies for web
- Email verification and password reset:
  - signed one-time tokens stored/hashed in DB
- Session management:
  - refresh token family tracking
  - revocation on logout/password change
  - device/session metadata for admin/security audit

### Role model and authorization design
Roles observed in repo and retained:
- `user`
- `vendor`
- `partner`
- `organization`
- `sub_admin`
- `admin`

Sub-admin permissions (repo-grounded, from `functions/src/admin/helpers.ts`):
- `users.read`, `users.write`
- `kyc.read`, `kyc.approve`
- `withdrawals.read`, `withdrawals.approve`
- `wallet.adjust`
- `marketplace.moderate`
- `orders.manage`
- `vendors.manage`
- `tasks.manage`
- `games.configure`
- `partners.manage`
- `orgs.manage`
- `commissions.configure`
- `settings.manage`
- `featureflags.manage`
- `notifications.send`
- `auditlogs.read`
- `analytics.read`

**Authorization model**
- RBAC + ownership checks (default)
- ABAC only where needed (city-scope, vendor ownership, org scope)
- Enforce in service layer, not frontend
- Deny by default for all admin endpoints

Consistency rules to prevent privilege escalation:
- Ignore client-supplied role/scope in requests.
- Resolve actor role/permissions from DB/session.
- Enforce immutable fields on self-profile update (mirror Firestore Rules behavior).
- Restrict KYC user updates to submission-safe fields only (pending state path).
- Require idempotency keys on high-impact admin/financial actions.

✅ Must-do
- Port Firestore Rules field-level restrictions into backend validators/policy layer.

### Data consistency (transactions, idempotency)
Use SQL transactions for all multi-entity mutations:
- Order create:
  - validate products/stock
  - debit wallet
  - decrement stock
  - insert order + items + status history
  - insert ledger row
- Order cancel / admin status cancel:
  - validate state transition
  - refund wallet
  - restore stock
  - append status history
  - insert refund ledger row
- Withdrawal request:
  - validate KYC/cooldown/monthly limits/pending status
  - debit wallet
  - insert withdrawal row
  - insert ledger row
- Withdrawal reject:
  - refund wallet
  - update withdrawal
  - insert refund ledger row
- Task reward:
  - validate completion idempotency/session timing
  - credit wallet
  - insert completion row
  - insert ledger row

Idempotency:
- Preserve `idempotency_keys` concept from `functions/src/admin/helpers.ts`
- Required for:
  - wallet adjust
  - approve/reject withdrawal
  - admin product moderation actions
  - order status actions (if user/client retries possible)
  - any payment webhook / external callback

### Realtime design (if needed)
Repo currently needs realtime for:
- wallet balance
- profile updates (membership/MLM propagation)
- order status
- withdrawal status

**Recommended replacement**
- SSE (Server-Sent Events) first:
  - simpler than WebSockets for server→client updates
  - works well for dashboards/status streams
- Polling fallback with ETag/If-None-Match for low-priority views
- Optional WebSockets later only if bidirectional interactivity is added

Suggested channels/endpoints:
- `GET /v1/stream/wallet`
- `GET /v1/stream/orders`
- `GET /v1/stream/withdrawals`
- `GET /v1/stream/profile`

### Background jobs / scheduled work
Current Firebase triggers/schedules cover:
- referral stats maintenance
- leaderboard calculations/resets
- order/wallet notifications
- Typesense product index sync
- periodic recalculation jobs

**Replacement**
- Worker + queue (BullMQ + Redis)
- Cron scheduler (platform cron / worker cron)
- Outbox table pattern for reliable side effects (notifications/search sync)

Job examples:
- `recalc_referral_stats_weekly`
- `sync_product_to_typesense`
- `send_order_status_notification`
- `send_wallet_credit_notification`
- `rebuild_leaderboard_daily/weekly`

### File storage design
Use S3-compatible object storage.

**Upload flow**
- Profile/KYC:
  - client requests upload intent from API
  - API validates actor/path/type/size
  - API returns presigned URL
  - client uploads directly to object storage
  - client/worker finalizes metadata row in DB
- Product images:
  - admin/vendor API endpoint validates role + product ownership
  - use presigned flow or streaming upload through API (presigned preferred)
  - update `product_images` and product primary image pointer
  - audit log entry

**Access model**
- Product images: public
- KYC docs: private + signed URLs only
- Profile images: public or protected depending on policy (current app appears public-ish usage, but verify product requirement)

### Observability, rate limits, abuse protection
Observability:
- Structured logs with request IDs/correlation IDs
- Tracing (OpenTelemetry)
- Metrics:
  - API latency/error rate
  - DB query latency
  - queue lag/retries
  - SSE connection counts
  - financial reconciliation deltas

Rate limiting (repo-grounded replacement for `functions/src/lib/rateLimit.ts`):
- Auth endpoints
- Upload endpoints
- Financial operations
- Admin endpoints
- Game/task reward endpoints

Abuse/security protection:
- WAF/CDN rate controls
- IP/user/device throttling
- anomaly alerts for:
  - repeated withdrawal requests
  - wallet adjust spikes
  - negative balance attempts
  - unusual admin activity

---

## 6. TursoDB Schema & Index Plan

Note: Turso/libSQL is relational SQL, so “collection” below is mapped to **SQL tables**.

### Core entities (derived from repo usage)

### `users` (from `users/{uid}`)
Key fields (observed in app/functions/rules/types):
- `id` (UID, PK)
- `email`
- `name`
- `phone`
- `photo_url`
- `role`
- `state`
- `city`
- `own_referral_code`
- `referral_code` (entered code)
- `referred_by_user_id`
- `membership_active`
- `membership_date`
- `is_active`
- `is_banned`
- `kyc_status`
- `kyc_submitted_at`
- `kyc_verified_at`
- `kyc_rejection_reason`
- `created_at`
- `updated_at`

JSON fields (pragmatic for parity):
- `upline_path_json`
- `kyc_data_json`
- `saved_addresses_json`
- `payment_methods_json`
- `partner_config_json`
- `vendor_config_json`
- `org_config_json`
- `sub_admin_permissions_json`

Indexes:
- `users(role, created_at DESC)`
- `users(city, created_at DESC)`
- `users(kyc_status, kyc_submitted_at DESC)`
- `users(own_referral_code)`
- `users(referral_code, created_at DESC)`
- `users(created_at DESC)`

### `wallets` (from `wallets/{uid}`)
Fields:
- `user_id` (PK/FK to `users.id`)
- `coin_balance`
- `cash_balance`
- `total_earnings`
- `total_withdrawals`
- `updated_at`

Indexes:
- PK only is enough for common reads
- optional index `wallets(updated_at DESC)` for admin diagnostics

### `ledger_transactions` (from `transactions/{id}`)
Fields (normalize inconsistent Firestore naming):
- `id` (PK)
- `user_id`
- `type`
- `category`
- `currency`
- `amount`
- `coin_amount` (nullable)
- `status`
- `description`
- `order_id` (nullable)
- `withdrawal_id` (nullable)
- `task_id` (nullable)
- `reference_id` (nullable)
- `source_completion_id` (nullable)
- `created_at`
- `metadata_json`

Indexes:
- `ledger_transactions(user_id, created_at DESC)`
- `ledger_transactions(user_id, type, created_at DESC)`
- `ledger_transactions(withdrawal_id)`
- `ledger_transactions(order_id)`
- `ledger_transactions(created_at DESC)`

### `orders` + `order_items` + `order_status_history` (from `orders/{id}`)
`orders` fields:
- `id`
- `user_id`
- `user_email_snapshot`
- `user_name_snapshot`
- `subtotal`
- `cash_paid`
- `coins_redeemed`
- `coin_value`
- `city`
- `shipping_address_json`
- `status`
- `cancel_reason`
- `refund_reason`
- `cancelled_at`
- `refunded_at`
- `created_at`
- `updated_at`

`order_items` fields:
- `id`
- `order_id`
- `product_id`
- `product_name_snapshot`
- `product_image_snapshot`
- `quantity`
- `unit_price`
- `coin_price`
- `vendor_id`

`order_status_history` fields:
- `id`
- `order_id`
- `status`
- `changed_at`
- `changed_by_user_id`
- `note`

Indexes:
- `orders(user_id, created_at DESC)`
- `orders(status, created_at DESC)`
- `orders(created_at DESC, id DESC)` (cursor pagination parity)
- `order_items(order_id)`
- `order_items(vendor_id, order_id)` (vendor order filtering)
- `order_status_history(order_id, changed_at ASC)`

### `withdrawals` + `withdrawal_logs` (from `withdrawals/{id}`, `withdrawal_logs/{id}`)
`withdrawals` fields:
- `id`
- `user_id`
- `amount`
- `method`
- `details_json`
- `status`
- `user_city`
- `kyc_status_snapshot`
- `wallet_balance_at_request`
- `risk_flags_json`
- `admin_notes`
- `processed_by_user_id`
- `processed_by_name_snapshot`
- `processed_at`
- `created_at`

`withdrawal_logs` fields:
- `id`
- `withdrawal_id`
- `action`
- `admin_id`
- `admin_name_snapshot`
- `reason`
- `created_at`

Indexes:
- `withdrawals(user_id, created_at DESC)`
- `withdrawals(status, created_at DESC)`
- `withdrawals(user_city, created_at DESC)`
- `withdrawals(processed_at DESC)`
- `withdrawal_logs(withdrawal_id, created_at DESC)`

### `products` + `product_images` (from `products/{id}` and Storage product paths)
`products` fields:
- `id`
- `name`
- `description`
- `category`
- `brand`
- `price`
- `coin_price`
- `commission`
- `in_stock`
- `stock`
- `status` (moderation)
- `is_deleted`
- `vendor_id`
- `partner_id`
- `vendor_display`
- `coin_only`
- `cash_only`
- `delivery_days`
- `badges_json`
- `created_at`
- `updated_at`

`product_images` fields:
- `id`
- `product_id`
- `position`
- `url`
- `storage_key`
- `mime_type`
- `size_bytes`
- `uploaded_by_user_id`
- `created_at`

Indexes:
- `products(category, in_stock, created_at DESC)`
- `products(vendor_id, created_at DESC)`
- `products(status, created_at DESC)`
- `products(partner_id, created_at DESC)`
- `products(is_deleted, created_at DESC)`
- `product_images(product_id, position ASC)`

### `wishlists` (from `wishlists/{userId}_{productId}`)
Fields:
- `user_id`
- `product_id`
- `product_name_snapshot`
- `product_image_snapshot`
- `product_price_snapshot`
- `product_coin_price_snapshot`
- `notify_on_price_drop`
- `notify_on_back_in_stock`
- `added_at`

Keys/Indexes:
- PK (`user_id`, `product_id`)
- `wishlists(user_id, added_at DESC)`

### `reviews` + `review_stats` + `review_helpful_votes`
`reviews` fields:
- `id`
- `product_id`
- `user_id`
- `order_id`
- `rating`
- `title`
- `content`
- `images_json`
- `user_name_snapshot`
- `user_avatar_snapshot`
- `helpful_count`
- `verified`
- `status`
- `moderation_note`
- `created_at`
- `updated_at`

`review_stats` fields:
- `product_id`
- `total_reviews`
- `average_rating`
- `rating_dist_json`
- `updated_at`

`review_helpful_votes` fields:
- `review_id`
- `user_id`
- `helpful`
- `created_at`

Indexes:
- `reviews(product_id, status, created_at DESC)`
- `reviews(product_id, status, helpful_count DESC)`
- `reviews(product_id, status, rating DESC)`
- `reviews(user_id, created_at DESC)`
- unique `review_helpful_votes(review_id, user_id)`

### Tasks/gamification entities (repo-derived)
Tables:
- `tasks`
- `task_completions`
- `task_sessions`
- `task_starts`
- `cooldowns`
- `user_badges`
- `leaderboards`
- `leaderboard_archives`
- `game_configs`
- `game_limits`

Observed needs:
- daily/once/unlimited completion modes
- session tracking
- cooldowns
- weighted reward configs
- leaderboard snapshots + archives

### Admin/config/ops entities
Tables:
- `admin_settings`
- `public_settings`
- `feature_flags`
- `admin_permissions`
- `audit_logs`
- `idempotency_keys`
- `rate_limits` (or move to Redis)
- `admin_metrics`
- `city_stats`
- `notifications`

### Coupons entities
Tables:
- `coupons`
- `coupon_usage`

---

### Indexes mapped to discovered query patterns (summary)
Repo patterns directly imply these indexes:

- `users(role, created_at DESC)` for admin user/vendor/partner/org listing
- `users(city, created_at DESC)` for partner/admin city-based queries
- `users(kyc_status, kyc_submitted_at DESC)` for KYC queues
- `users(own_referral_code)` and `users(referral_code, created_at DESC)` for referral linkage and org/MLM pages
- `orders(user_id, created_at DESC)` for user orders
- `orders(status, created_at DESC)` for admin queues/moderation
- `orders(created_at DESC, id DESC)` for cursor pagination parity
- `order_items(vendor_id, order_id)` for vendor order lookups
- `withdrawals(user_id, created_at DESC)` for user/partner withdrawal pages
- `withdrawals(status, created_at DESC)` for admin withdrawal queues
- `ledger_transactions(user_id, created_at DESC)` and `(user_id, type, created_at DESC)` for wallet/referral filters
- `products(category, in_stock, created_at DESC)` for related/shop listing
- `products(vendor_id, created_at DESC)` and `products(status, created_at DESC)` for vendor/admin product pages
- `reviews(product_id, status, created_at DESC/helpful_count DESC/rating DESC)` for review sorting
- `partner_commission_logs(partner_id, created_at DESC)`
- `org_commission_logs(org_id, created_at DESC)`
- `audit_logs(created_at DESC)` plus optional filter indexes by `action/actor_id/target_type`

---

### Migration mapping: Firestore → TursoDB

| Firestore path(s) | TursoDB table(s) | Field mapping / notes |
|---|---|---|
| `users/{uid}` | `users` | Flatten core fields; keep role configs / KYC payload / saved addresses as JSON for parity |
| `wallets/{uid}` | `wallets` | 1:1 by `user_id` |
| `transactions/{id}` | `ledger_transactions` | Normalize inconsistent naming (`timestamp` vs `createdAt`) |
| `orders/{id}` | `orders`, `order_items`, `order_status_history` | Split arrays `items[]` and `statusHistory[]` |
| `withdrawals/{id}` | `withdrawals` | Preserve risk flags, payment details, admin processing fields |
| `withdrawal_logs/{id}` | `withdrawal_logs` | Append-only admin action trail |
| `products/{id}` | `products`, `product_images` | Move `images[]` to child rows with `position` |
| `wishlists/{uid_pid}` | `wishlists` | Composite PK (`user_id`, `product_id`) |
| `reviews/{id}` | `reviews` | Preserve moderation and helpful counters |
| `review_stats/{productId}` | `review_stats` | Aggregate cache table |
| `review_helpful/{id}` | `review_helpful_votes` | Unique vote per user/review |
| `tasks/{id}` | `tasks` | Task definitions + reward config JSON |
| `task_completions/{id}` | `task_completions` | Idempotent completion rows |
| `task_sessions/{id}` | `task_sessions` | Session/state for surveys/video/web tasks |
| `task_starts/{id}` | `task_starts` | Legacy timing support / migration bridge |
| `cooldowns/{uid}` | `cooldowns` | User cooldown state |
| `notifications/{id}` | `notifications` | In-app notifications feed |
| `user_badges/{id}` | `user_badges` | Achievement state |
| `leaderboards/{id}` | `leaderboards` | Current standings |
| `leaderboard_archives/{id}` | `leaderboard_archives` | Historical standings |
| `admin_settings/{id}` | `admin_settings` | singleton/global config rows |
| `public_settings/{id}` | `public_settings` | public platform settings |
| `feature_flags/{id}` | `feature_flags` | named flags |
| `admin_permissions/{uid}` | `admin_permissions` | sub-admin permission sets |
| `audit_logs/{id}` | `audit_logs` | immutable append-only audit log |
| `idempotency_keys/{id}` | `idempotency_keys` | dedupe key + result payload |
| `rate_limits/{key}` | `rate_limits` or Redis | prefer Redis for runtime, DB for audit if needed |
| `city_stats/{cityId}` | `city_stats` | aggregated city metrics |
| `partner_wallets/{partnerId}` | `partner_wallets` | partner balance store |
| `partner_commission_logs/{id}` | `partner_commission_logs` | partner commission entries |
| `org_commission_logs/{id}` | `org_commission_logs` | org commission entries |
| `coupons/{id}` | `coupons` | coupon config |
| `coupon_usage/{id}` | `coupon_usage` | coupon redemption history |
| `withdraw_requests/{id}` | `withdrawals` or archived legacy table | **Ambiguous**; confirm canonical source before import |
| `kyc_submissions/{id}` | `kyc_submissions` (legacy) or merge into `users`/`kyc_events` | **Ambiguous** legacy path usage |

---

## 7. Codebase Impact & Refactor Plan

### Frontend changes (replace Firebase SDK calls)
Categories are effort estimates relative to current codebase.

### Category A: Replace Firebase SDK reads/writes with API client (Medium/Large)
Affected examples:
- `hooks/useAuth.ts`
- `hooks/useWallet.ts`
- `hooks/usePublicSettings.ts`
- `hooks/useReferral.ts`
- `hooks/useTasks.ts`
- `store/useStore.ts`
- `services/wishlist.service.ts`
- `services/review.service.ts`
- `services/product.service.ts`
- `services/wallet.service.ts`
- `services/withdrawal.service.ts`
- `services/user.service.ts`
- `services/referral.service.ts`
- `app/auth/register/page.tsx`
- `app/auth/login/page.tsx`
- `app/dashboard/user/settings/page.tsx`
- `app/dashboard/user/kyc/page.tsx`
- `app/dashboard/user/checkout/page.tsx`
- multiple `app/dashboard/**` pages importing `firebase/firestore`

Work:
- Introduce `lib/api/client.ts` + domain services (`api.orders`, `api.withdrawals`, etc.)
- Replace direct Firestore reads with API GET endpoints
- Replace direct writes with API POST/PATCH endpoints
- Remove client-side mutation capability for protected domains

### Category B: Replace callable functions with REST endpoints (Large)
Affected examples:
- Many admin/user/vendor/partner pages using `httpsCallable(...)`
- `lib/firebase/callable.ts`
- `app/api/callable/[name]/route.ts`
- `lib/firebase/functions.ts` (legacy helpers)
- `lib/firebase/productImageUpload.ts`

Work:
- Map callable names to REST routes
- Keep request/response DTO compatibility initially
- Remove proxy-first fallback complexity after cutover

### Category C: Rewrite auth flow (Large)
Affected files:
- `lib/firebase/auth.ts`
- `hooks/useAuth.ts`
- `app/auth/*`
- `middleware.ts`
- `lib/auth/sessionCookie.ts`
- `app/dashboard/layout.tsx`

Work:
- Move from client-authoritative auth state to server-verified session
- Implement secure cookie sessions
- Server-side route protection in middleware / SSR checks
- Transitional Firebase ID token verification path

### Category D: Refactor realtime UI (Medium)
Affected files:
- `hooks/useAuth.ts`
- `hooks/useWallet.ts`
- `store/useStore.ts`
- user/partner orders/withdrawals pages

Work:
- Replace `onSnapshot` with SSE hooks or polling
- Add backoff/reconnect logic
- Preserve optimistic UX where needed

### Category E: Replace storage upload UI (Medium)
Affected files:
- `lib/firebase/storage.ts`
- `app/dashboard/user/kyc/page.tsx`
- `app/dashboard/user/settings/page.tsx`
- product image upload flows (`lib/firebase/productImageUpload.ts`, admin/vendor product pages)

Work:
- Presigned upload flow
- Upload intent/finalize endpoints
- Signed URL download for KYC docs
- Metadata rows + audit logging

### Backend additions (new code to build)
- API service modules (auth, users, wallets, ledger, orders, withdrawals, products, reviews, tasks/games, admin modules, partner/vendor/org modules)
- Worker modules (notifications, search sync, leaderboard, referral stats)
- Shared DTO/validation schemas (Zod)
- SQL migration files and seeds
- Observability middleware and rate-limit middleware

### Shared types/DTOs and validation
Recommended:
- Keep current domain types as starting point (`types/user.ts`, `types/order.ts`, `types/wallet.ts`, `types/product.ts`, `types/review.ts`, `types/task.ts`)
- Create API DTOs separated from persistence models
- Use Zod schemas for request/response validation
- Keep server-side field immutability rules (mirror current Firestore Rules restrictions)

### High-risk areas (behavioral regression risk)
- Payments/membership purchase flows:
  - `services/payment.service.ts`
  - `functions/src/user/upgradeMembership.ts`
- Wallet balances and ledger integrity:
  - `hooks/useWallet.ts`
  - `functions/src/wallet/*`
  - `functions/src/orders/*`
  - `functions/src/withdrawals/*`
  - `functions/src/tasks/rewardTask.ts`
- Inventory/stock correctness:
  - `functions/src/orders/createOrderMultiItem.ts`
  - `functions/src/orders/cancelOrder.ts`
- Admin actions:
  - role changes, wallet adjust, KYC approvals, order/withdrawal processing
  - `functions/src/admin/*`
- Vendor/partner/org scoping:
  - `functions/src/vendor/*`
  - `functions/src/partner/*`
  - `functions/src/organization/*`

### Performance/scalability implications for ThinkMart access patterns
- Firestore listener load shifts to API SSE/polling load
- Admin list pages currently rely on indexed Firestore queries; SQL indexes must be tuned for filters/sorting/cursor pagination
- Some Firestore scans/fallbacks in current Functions can be improved with normalized SQL design
- Queue-backed async side effects (search sync/notifications) can reduce request latency and improve resilience

✅ Must-do
- Migrate financial writes first to API, even before full read migration.

---

## 8. Migration Execution Plan (Phased)

### Phase 1: Preparation & instrumentation (audit, logging, metrics, backup)
Tasks:
- Freeze feature/schema drift during migration design window.
- Inventory all Firebase touchpoints (completed in this audit; maintain as checklist).
- Add structured logs around current critical callables (orders, withdrawals, admin actions).
- Define invariants and reconciliation metrics:
  - no negative wallet balances
  - no stock underflow
  - every wallet mutation has a ledger row
  - withdrawal final states are consistent
- Back up Firestore and Storage.
- Rotate/redact secrets found in local env/debug logs before sharing artifacts.

Acceptance criteria:
- [ ] Firestore export + restore drill tested
- [ ] Storage export strategy documented and tested
- [ ] Invariant dashboard/reporting defined
- [ ] Migration scope frozen (canonical collections confirmed)

### Phase 2: Build new backend in parallel (feature parity targets)
Tasks:
- Create API service skeleton + auth middleware + RBAC policy layer.
- Implement Turso schema and migrations.
- Implement parity endpoints for critical flows:
  - auth bridge verify
  - users/profile
  - wallet + ledger reads
  - orders create/cancel/status
  - withdrawals request/approve/reject
  - product CRUD/moderation
  - KYC approval flows
- Implement idempotency table and middleware.
- Implement S3-compatible file storage abstraction.
- Implement outbox + worker foundation.

Acceptance criteria:
- [ ] Critical endpoints pass integration tests
- [ ] RBAC/ownership matrix tests pass
- [ ] SQL migrations reproducible in CI
- [ ] API observability (logs/metrics/tracing) live in staging

### Phase 3: Dual-write / read-through strategy (only where needed)
Recommended usage:
- **Dual-write only for high-risk mutable domains**, not every collection.

Dual-write candidates:
- `wallets` / `ledger_transactions`
- `orders` / `order_items` / `order_status_history`
- `withdrawals` / `withdrawal_logs`
- task rewards affecting wallet balances

Non-dual-write candidates (prefer direct cutover after parity):
- `public_settings`
- `feature_flags` (if coordinated)
- read-only or cache-like aggregates (can rebuild)

Tasks:
- Route critical writes through new API.
- API writes to Turso and (temporarily) Firebase for parity.
- Add reconciliation jobs and dashboards.
- Log per-write compare failures with alerting.

Acceptance criteria:
- [ ] Dual-write success rate > 99.9%
- [ ] Reconciliation deltas for balances/orders/withdrawals == 0 (or documented exceptions)
- [ ] Retry/idempotency prevents duplicate side effects

⚠️ Risk
- Dual-write without idempotency will create duplicates or divergent balances.

### Phase 4: Data migration plan (export, transform, import, verify)
Tasks:
- Export Firestore collections in dependency-aware order:
  - `users` → `wallets` → `products` → `orders/withdrawals/transactions` → secondary entities
- Export Storage object list + metadata (KYC/profile/product assets)
- Transform:
  - split arrays (`orders.items`, `statusHistory`)
  - normalize timestamps/enum casing inconsistencies
  - map legacy collections (`withdraw_requests`, `kyc_submissions`) based on confirmed canonical rules
- Import into Turso in batches with checkpointing
- Run integrity checks and sample parity verification

Acceptance criteria:
- [ ] Row counts match expected source counts (per collection/table)
- [ ] Referential integrity checks pass
- [ ] Financial reconciliation checks pass
- [ ] Migration scripts are idempotent/re-runnable

### Phase 5: Gradual rollout (feature flags, canary)
Tasks:
- Add feature flags per domain (read and write switches separately):
  - profile
  - products
  - orders
  - withdrawals
  - admin pages
  - realtime streams
- Canary rollout to internal/admin users first
- Expand to small production cohort
- Monitor:
  - errors
  - latency
  - reconciliation
  - authz failures
  - support tickets

Acceptance criteria:
- [ ] Canary error rate within baseline thresholds
- [ ] No critical authz regressions
- [ ] No financial discrepancies during canary period
- [ ] Rollback tested during canary

### Phase 6: Cutover + rollback plan
Cutover tasks:
- Freeze Firebase writes for migrated domains (or disable client code paths first)
- Final sync/reconciliation
- Switch read traffic to Turso-backed API
- Switch realtime UI to SSE/polling endpoints
- Disable obsolete callable endpoints incrementally after stabilization
- Retain Firebase auth bridge temporarily if first-party auth not fully rolled out yet

Rollback plan:
- Keep domain-level feature flags for read/write source selection.
- If critical issue occurs:
  - switch writes back to Firebase for affected domain
  - queue failed API-side effects for replay
  - run reconciliation before reattempting cutover
- Maintain rollback window through a stabilization period (e.g., 7–14 days).

Downtime expectations:
- Target **low/zero downtime** with phased cutover and domain-level feature flags.
- Full downtime should not be required if dual-write + reconciliation is implemented for financial domains.

✅ Must-do
- Practice rollback in staging with production-like data volume before real cutover.

---

## 9. Test & Validation Plan

### Unit tests
Test domain logic in isolation:
- Order state transitions
- Wallet debit/credit arithmetic and validations
- Withdrawal cooldown/monthly limit logic
- Idempotency key lifecycle
- RBAC permission checks
- Field immutability rules on user self-update and KYC submission

Acceptance:
- [ ] Core domain modules have deterministic unit coverage
- [ ] Edge cases (retry, duplicate action, invalid transitions) covered

### Integration tests
API + Turso + worker integration:
- Concurrent order creation against same stock
- Duplicate withdrawal request retries
- Admin approve/reject withdrawal with same idempotency key
- Vendor ownership enforcement on product CRUD/images
- Partner/org scoped reads
- KYC workflow approvals/rejections
- Search sync outbox -> Typesense worker

Acceptance:
- [ ] Transactional invariants preserved under concurrency tests
- [ ] Authz matrix passes positive + negative cases
- [ ] Worker retries are idempotent

### E2E tests
User flows:
- register/login
- profile update with image upload
- KYC submission
- checkout -> order create
- order cancel/refund
- withdrawal request

Admin flows:
- admin login/session
- user list/detail/role/status
- wallet adjust
- KYC approve/reject
- withdrawals approve/reject
- order status updates
- product moderation
- feature flags/settings

Vendor/partner/org flows:
- vendor product CRUD + image upload
- vendor orders visibility
- partner city analytics/users/products scope
- org member/earnings views

Acceptance:
- [ ] Top user and admin flows succeed in staging on Turso-backed API
- [ ] No direct Firebase SDK business writes remain in active routes

### Data verification steps
Before cutover:
- count compare per entity
- nullability/enum sanity checks
- sample field parity checks

After cutover:
- daily reconciliation reports for:
  - wallet balances
  - ledger sums
  - orders and status counts
  - withdrawal state totals
  - product stock snapshots

Examples of reconciliation checks:
- `wallet.cash_balance >= 0`
- `wallet.coin_balance >= 0`
- every withdrawal approve/reject has corresponding admin log / audit row
- order cancellations restore stock exactly once
- one user/product wishlist row max

### Security testing (authorization matrix, negative tests)
Required negative tests:
- User reads another user’s withdrawal/order/KYC doc
- Vendor modifies another vendor’s product or images
- Partner reads non-assigned city data
- Sub-admin performs action without permission
- User mutates server-only financial fields
- Replay of idempotent financial/admin requests

Required session/security tests:
- expired access token
- revoked refresh token
- logout invalidation
- password change revokes existing refresh tokens
- CSRF protection for cookie-auth POST endpoints (if cookie-based auth is used)

✅ Must-do
- Convert current Rules-test mindset into API authorization integration tests before production cutover.

---

## 10. Open Questions / Ambiguities

### Ambiguous: Canonical withdrawal collection
- Evidence:
  - `functions/src/admin/getAdminStats.ts` queries both `withdraw_requests` and `withdrawals`.
  - `firestore.rules` still defines `match /withdraw_requests/{requestId}`.
- Missing confirmation:
  - Which collection is authoritative in production?
  - Is `withdraw_requests` legacy-only or still partially active?

### Ambiguous: `kyc_submissions` actual production usage
- Evidence:
  - `firestore.rules` includes `match /kyc_submissions/{submissionId}`.
  - `functions/src/admin/queueHealth.ts` queries `kyc_submissions`.
  - User KYC submission UI writes KYC fields onto `users/{uid}` (`app/dashboard/user/kyc/page.tsx`), not `kyc_submissions`.
- Missing confirmation:
  - Is `kyc_submissions` a deprecated path or still written by another client/app/admin process?

### Ambiguous: Region strategy inconsistency
- Evidence:
  - `lib/firebase/config.ts` defaults functions region to `us-central1`.
  - `functions/src/admin/getAdminStats.ts` exports `getRevenueSummary` in `us-east1`.
  - `Plans/BUGS.md` shows callable failures targeting `us-central1`.
- Missing confirmation:
  - Intended multi-region deployment strategy vs accidental mismatch.

### Ambiguous: Dead/legacy callable wrappers and modules
- Evidence:
  - `lib/firebase/functions.ts` includes helpers for `processWithdrawal` and `completeTask`.
  - `functions/src/withdrawals/processWithdrawal.ts` exists but appears not exported from `functions/src/index.ts`.
- Missing confirmation:
  - Which wrappers/modules are still referenced by any deployed frontend/mobile client.

### Ambiguous: `_cleanpush` directory status
- Evidence:
  - Duplicate Firebase imports and duplicate app files under `_cleanpush/`.
  - `tsconfig.json` excludes `_cleanpush`.
- Missing confirmation:
  - Should `_cleanpush` be ignored/archived, or does it represent a pending code path to migrate?

### Ambiguous: Auth migration timeline
- Evidence:
  - Strong Firebase Auth coupling in current frontend.
  - Middleware currently not server-enforced.
- Missing confirmation:
  - Whether first-party auth must be introduced in same cutover, or Firebase-token bridge is acceptable for an interim period.

---

## 11. Appendix

### Evidence list (file paths searched, key snippets, dependency list)

### A. Repository search procedure executed (repo-wide Firebase audit)
Patterns searched (as requested) and findings recorded:
- Firebase init/config:
  - `initializeApp`, `getFirestore`, `getAuth`, `getStorage`, `getFunctions`
  - Found in `lib/firebase/config.ts`
- Firestore operations:
  - `collection(`, `doc(`, `getDoc`, `getDocs`, `setDoc`, `updateDoc`, `deleteDoc`
  - `query`, `where`, `orderBy`, `limit`, `startAfter`, `onSnapshot`
  - found across `app/`, `hooks/`, `services/`, `store/`, `functions/src/`
- Storage operations:
  - `ref(`, `uploadBytes`, `getDownloadURL`, `deleteObject`
  - found in `app/dashboard/user/kyc/page.tsx`, `lib/firebase/storage.ts`
  - server-side product image upload in `functions/src/admin/uploadProductImage.ts`
- Auth operations:
  - `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `onAuthStateChanged`, `signOut`
  - found in `lib/firebase/auth.ts`, `hooks/useAuth.ts`, `app/providers.tsx`, auth pages
- Cloud Functions/Admin SDK:
  - `firebase-admin`, `functions.https.onCall`, Firestore triggers/schedules
  - found extensively in `functions/src/*`
- Rules/roles logic:
  - `role`, `permissions`, `vendorId`, `orgId`, `partnerId`, ownership checks
  - found in `firestore.rules`, `lib/guards/roleGuard.ts`, `functions/src/admin/helpers.ts`, domain modules

### B. Key evidence snippets (small excerpts only)
- Firebase init exports all services:
  - `lib/firebase/config.ts` exports `auth`, `db`, `functions`, `storage`.
- Callable proxy URL:
  - `app/api/callable/[name]/route.ts` forwards to `https://${region}-${projectId}.cloudfunctions.net/${functionName}`.
- Proxy fallback logic:
  - `lib/firebase/callable.ts` implements proxy-first and SDK fallback with ID token forwarding.
- Client-only dashboard auth enforcement:
  - `middleware.ts` explicitly avoids auth redirects; `app/dashboard/layout.tsx` enforces auth/role in client.
- Transactional order creation:
  - `functions/src/orders/createOrderMultiItem.ts` debits wallet, decrements stock, creates order + ledger in Firestore transaction.
- Withdrawal security checks:
  - `functions/src/withdrawals/requestWithdrawal.ts` enforces KYC, cooldown, pending-withdrawal, monthly limits, balance check.
- Admin RBAC + idempotency:
  - `functions/src/admin/helpers.ts` defines permission model and `idempotency_keys`.
- Storage product upload security:
  - `functions/src/admin/uploadProductImage.ts` validates role, ownership, MIME/size, rate limits.
- Firestore server-only write boundaries:
  - `firestore.rules` denies client writes to `wallets`, `transactions`, `withdrawals`, `orders`.
- Storage path constraints:
  - `storage.rules` restricts KYC/profile uploads by owner, type, and size.

### C. Dependency list (relevant)
Root `package.json`:
- `firebase` (web SDK)
- `typesense`
- `next`, `react`, `zustand`, etc.

`functions/package.json`:
- `firebase-admin`
- `firebase-functions`
- `typesense`
- `zod`

### D. Rules and index assets inspected
- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `tests/firestore.rules.test.ts`
- `tests/storage.rules.test.ts`

### E. Additional project context inspected
- `firebase.json`
- `.env.example`
- `Plans/BUGS.md`
- `tsconfig.json`
- `lib/types/roles.ts`
- `lib/guards/roleGuard.ts`
- domain types in `types/*.ts`

### F. Secret handling note
- Sensitive values appear to exist in local env/debug artifacts (e.g., `.env`, `.env.local`, debug logs).
- Secrets are intentionally not reproduced here.
- Migration prep should include:
  - credential rotation
  - log hygiene
  - secret scanning in CI

✅ Must-do
- Redact and rotate any exposed credentials before sharing migration scripts, exports, or logs.


