Paste the following into `Plans/remain.md`:

# ThinkMart Firebase to TursoDB Migration Audit (Repo-Grounded)

## 1. Executive Summary
- ThinkMart is deeply coupled to Firebase across Firestore, Storage, Auth, Cloud Functions, and Security Rules.
- Firestore is used for both direct client reads/writes and server-side transactional business logic.
- Firebase Cloud Functions currently protect critical flows like order creation, refunds, withdrawals, wallet adjustments, KYC processing, and admin actions.
- Firebase Rules enforce a large portion of authorization and ownership guarantees today.
- Recommendation: **Proceed with constraints**.
- ✅ Must-do: Build a new API/service layer first and migrate clients to API calls before removing Firebase.
- ✅ Must-do: Preserve transactional/idempotency guarantees for orders, wallets, withdrawals, and stock.
- ⚠️ Risk: Realtime dependencies (`onSnapshot`) and Rules parity are major migration risks.
- ⚠️ Risk: Security will regress if Rules logic is not explicitly reimplemented in backend authorization.

## 2. Current State: Firebase Dependency Map

### Firestore
- Firebase init exports Firestore client:
  - `lib/firebase/config.ts:34` (`export const db = getFirestore(app);`)
- Direct client reads and listeners are widespread:
  - Profile realtime: `hooks/useAuth.ts:37`
  - Wallet realtime: `hooks/useWallet.ts:26`
  - Orders realtime list/detail: `app/dashboard/user/orders/page.tsx:47`, `app/dashboard/user/orders/[id]/page.tsx:68`
  - Withdrawals realtime list: `app/dashboard/user/withdraw/page.tsx:93`, `app/dashboard/partner/withdrawals/page.tsx:60`
- Direct client writes still exist:
  - Registration profile create: `app/auth/register/page.tsx:147`
  - User settings update: `app/dashboard/user/settings/page.tsx:88`, `app/dashboard/user/settings/page.tsx:141`
  - KYC write to `users` doc: `app/dashboard/user/kyc/page.tsx:140`
  - Saved address write: `app/dashboard/user/checkout/page.tsx:161`
  - Wishlist CRUD: `services/wishlist.service.ts:124`, `services/wishlist.service.ts:141`, `services/wishlist.service.ts:176`
- Server-side transactional writes (Cloud Functions):
  - `functions/src/orders/createOrderMultiItem.ts`
  - `functions/src/orders/cancelOrder.ts`
  - `functions/src/orders/updateOrderStatus.ts`
  - `functions/src/withdrawals/requestWithdrawal.ts`
  - `functions/src/tasks/rewardTask.ts`
  - `functions/src/gamification/games.ts`
- Trigger/scheduler usage:
  - Firestore triggers: `functions/src/triggers/user.ts`, `functions/src/triggers/transactions.ts`, `functions/src/triggers/referralStats.ts`, `functions/src/search/productSearch.ts`, `functions/src/notifications/orderNotifications.ts`
  - Schedules: `functions/src/triggers/referralStats.ts:147`, `functions/src/gamification/leaderboard.ts:170`

### Collections and Paths in Active Use
- Core: `users`, `wallets`, `transactions`, `orders`, `withdrawals`, `products`
- Tasks/gamification: `tasks`, `task_completions`, `task_sessions`, `task_starts`, `cooldowns`, `user_badges`, `leaderboards`, `leaderboard_archives`
- Commerce/support: `reviews`, `review_stats`, `review_helpful`, `wishlists`, `coupons`, `coupon_usage`
- Admin/ops: `audit_logs`, `admin_settings`, `public_settings`, `feature_flags`, `admin_permissions`, `idempotency_keys`, `rate_limits`, `admin_metrics`, `city_stats`
- Partner/org: `partner_wallets`, `partner_commission_logs`, `org_commission_logs`, `withdrawal_logs`
- Ambiguous/legacy indicators: `withdraw_requests`, `kyc_submissions`

### Storage
- Client-side user uploads:
  - Profile image upload: `app/dashboard/user/settings/page.tsx:77`
  - KYC file upload path: `app/dashboard/user/kyc/page.tsx:17`
- Storage utility methods:
  - `lib/firebase/storage.ts` (`uploadBytes`, `getDownloadURL`, `deleteObject`)
- Server-side product image upload:
  - `functions/src/admin/uploadProductImage.ts` (role check, rate limit, validation, audit log)

### Auth
- Email/password auth only:
  - `lib/firebase/auth.ts` uses `createUserWithEmailAndPassword`, `signInWithEmailAndPassword`, `sendPasswordResetEmail`, `onAuthStateChanged`, `signOut`
- Register/login/reset pages:
  - `app/auth/register/page.tsx`
  - `app/auth/login/page.tsx`
  - `app/auth/forgot-password/page.tsx`
- Session handling:
  - Client cookie helper: `lib/auth/sessionCookie.ts`
  - Middleware does not enforce auth server-side: `middleware.ts`
  - Dashboard auth/role check is client-side: `app/dashboard/layout.tsx`, `lib/guards/roleGuard.ts`

### Realtime and Offline
- Realtime usage is significant in wallet/order/withdraw flows.
- Offline persistence API usage not found (`enableIndexedDbPersistence`/`persistentLocalCache` absent).

### Functions and Admin SDK
- Functions entrypoint exports large callable/trigger surface:
  - `functions/src/index.ts`
- Callable proxy layer for web transport fallback:
  - `lib/firebase/callable.ts`
  - `app/api/callable/[name]/route.ts`
- Rules and tests:
  - `firestore.rules`, `storage.rules`
  - `tests/firestore.rules.test.ts`, `tests/storage.rules.test.ts`

## 3. Why Migrate: Benefits for ThinkMart
- ThinkMart has many relational/transactional workflows (wallet, order, withdrawal, refund, stock) that fit SQL strongly.
- Admin analytics currently use fallback/dual-source logic (`withdraw_requests` vs `withdrawals`), indicating schema/query complexity that benefits from normalized SQL.
- API-first architecture reduces Firebase lock-in and improves backend testability.
- Replacing mixed auth enforcement (Rules + client checks + function checks) with centralized API authorization improves auditability.
- Typesense integration can move from trigger-coupled sync to explicit outbox/event-driven sync from the service layer.

## 4. Trade-offs, Risks, and Hidden Costs
- ⚠️ Risk: Security Rules parity is expensive.
- ⚠️ Risk: Realtime UX regression if listener replacement is not planned endpoint-by-endpoint.
- ⚠️ Risk: Operational overhead increases (DB migrations, API SLOs, backups, incident response).
- ⚠️ Risk: Trigger/scheduler replacement requires job infrastructure.
- ⚠️ Risk: Existing data model drift (legacy collections, stale functions) can cause migration ambiguity.
- Hidden cost: migration is not only DB swap; it is auth, authorization, API contract, storage, and ops redesign.

## 5. Target Architecture (TursoDB + Service Layer)

### Proposed Stack
- Backend service: Node.js + Fastify + TypeScript.
- Validation: Zod on all request/response boundaries.
- DB: Turso (libSQL) with SQL migrations.
- Query layer: Drizzle or Kysely.
- API style: REST (recommended for current codebase migration path).

### Auth and Sessions
- Password auth with `argon2id`.
- Email verification and password reset token flows.
- Session model: HTTP-only secure cookies for web.
- Refresh token rotation with revocation table.
- Optional bridge phase: accept Firebase ID token temporarily in API while first-party auth rolls out.

### Authorization
- RBAC roles: `user`, `vendor`, `partner`, `organization`, `sub_admin`, `admin`.
- Explicit permission table for sub-admin actions (mirror `functions/src/admin/helpers.ts` semantics).
- Resource ownership checks:
  - User owns profile/orders/withdrawals/wishlist.
  - Vendor owns vendor products.
  - Partner city-scoped access.
  - Organization referral-scope access.
- Anti-escalation rule: never trust client role/scope fields.

### Data Consistency
- SQL transactions for:
  - Order create/cancel/update.
  - Wallet debits/credits.
  - Withdrawal request/approval/rejection.
  - Stock reserve/restore.
- Idempotency required for all financial/mutating endpoints via `idempotency_keys`.

### Realtime
- Preferred: SSE for wallet/order/withdraw status streams.
- Fallback: polling with ETag/If-None-Match.
- Keep per-feature rollout (wallet first, then orders, then withdrawals).

### Background Jobs
- Add queue/worker (BullMQ + Redis recommended) for:
  - Leaderboard updates.
  - Referral stats recalculation.
  - Notification fanout.
  - Search indexing.
- Use outbox table for reliable side-effect delivery.

### File Storage
- Use S3-compatible object storage (R2/S3/MinIO), not DB blobs.
- Presigned upload strategy:
  - User profile/KYC uploads with strict MIME/size limits.
  - Product uploads gated by admin/vendor authorization.
- Private signed URL access for KYC docs.
- Public read for product images only.

### Observability and Abuse Protection
- Structured logs + request correlation IDs.
- Metrics for latency/error/queue lag/financial failures.
- Rate limits by user + IP + route.
- Security hardening:
  - WAF
  - brute-force protection
  - anomaly alerts on withdrawals and wallet adjustments

## 6. TursoDB Schema & Index Plan

### Core Tables
- `users`
- `wallets`
- `ledger_transactions`
- `orders`
- `order_items`
- `order_status_history`
- `withdrawals`
- `withdrawal_logs`
- `products`
- `product_images`
- `wishlists`
- `reviews`
- `review_stats`
- `review_helpful_votes`
- `tasks`
- `task_sessions`
- `task_completions`
- `task_starts`
- `cooldowns`
- `partner_wallets`
- `partner_commission_logs`
- `org_commission_logs`
- `notifications`
- `feature_flags`
- `admin_settings`
- `public_settings`
- `admin_permissions`
- `audit_logs`
- `idempotency_keys`
- `rate_limits`
- `city_stats`
- `user_badges`
- `leaderboards`
- `leaderboard_archives`
- `coupons`
- `coupon_usage`
- `game_configs`
- `commission_logs`

### Example Indexes Mapped to Existing Query Patterns
- `users(role, created_at desc)`
- `users(city, created_at desc)`
- `users(kyc_status, created_at desc)`
- `users(referral_code, created_at desc)`
- `orders(user_id, created_at desc)`
- `orders(status, created_at desc)`
- `withdrawals(user_id, created_at desc)`
- `withdrawals(status, created_at desc)`
- `ledger_transactions(user_id, created_at desc)`
- `ledger_transactions(user_id, type, created_at desc)`
- `reviews(product_id, status, created_at desc)`
- `reviews(product_id, status, helpful_count desc)`
- `wishlists(user_id, added_at desc)`
- `partner_commission_logs(partner_id, created_at desc)`
- `org_commission_logs(org_id, created_at desc)`

### Firestore to Turso Mapping
| Firestore path | Turso table(s) | Notes |
|---|---|---|
| `users/{uid}` | `users` | Keep role/config fields; nested configs can be JSON or split |
| `wallets/{uid}` | `wallets` | 1:1 by `user_id` |
| `transactions/{id}` | `ledger_transactions` | Normalize amount/currency fields |
| `orders/{id}` | `orders`, `order_items`, `order_status_history` | Split arrays into child tables |
| `withdrawals/{id}` | `withdrawals`, `withdrawal_logs` | Keep risk/admin metadata |
| `products/{id}` | `products`, `product_images` | Store image list relationally |
| `wishlists/{uid_pid}` | `wishlists` | Composite PK `(user_id, product_id)` |
| `reviews/{id}` | `reviews` | Include moderation fields |
| `review_stats/{productId}` | `review_stats` | Aggregate table |
| `review_helpful/{id}` | `review_helpful_votes` | Unique vote per user/review |
| `task_*` collections | `tasks`, `task_sessions`, `task_completions`, `task_starts` | Direct mapping |
| `cooldowns/{uid}` | `cooldowns` | User cooldown state |
| `partner_wallets/*` | `partner_wallets` | 1:1 partner wallet |
| `partner_commission_logs/*` | `partner_commission_logs` | Keep source linkage |
| `org_commission_logs/*` | `org_commission_logs` | Keep source linkage |
| `notifications/*` | `notifications` | User feed with read status |
| `feature_flags/*` | `feature_flags` | Direct mapping |
| `admin_settings/*` | `admin_settings` | Singleton/global row model |
| `public_settings/*` | `public_settings` | Singleton/global row model |
| `audit_logs/*` | `audit_logs` | Append-only |
| `idempotency_keys/*` | `idempotency_keys` | Unique key and result payload |
| `rate_limits/*` | `rate_limits` | Windowed counters |
| `coupons/*` | `coupons` | Direct mapping |
| `coupon_usage/*` | `coupon_usage` | FK to coupon/user/order |
| `leaderboards/*` | `leaderboards` | Current standings |
| `leaderboard_archives/*` | `leaderboard_archives` | Historical standings |

## 7. Codebase Impact & Refactor Plan

### Frontend Impact
- Replace Firebase SDK reads/writes with API client calls in:
  - `app/auth/*`
  - `app/dashboard/user/*`
  - `app/dashboard/partner/*`
  - `app/dashboard/vendor/*`
  - `app/dashboard/organization/*`
  - `hooks/useAuth.ts`
  - `hooks/useWallet.ts`
  - `hooks/useReferral.ts`
  - `hooks/usePublicSettings.ts`
  - `services/*.service.ts`
- Replace callable invocations (`httpsCallable` and `callCallable`) with REST endpoints.
- Replace realtime `onSnapshot` with SSE/polling client adapters.

### Backend Additions
- New service modules:
  - auth
  - user/profile
  - wallet/ledger
  - orders
  - withdrawals
  - products
  - reviews
  - tasks/gamification
  - partner/org
  - admin
  - notifications
  - search-sync
- Add strict DTO validation with shared schemas.
- Add migration scripts and reconciliation tooling.

### High-Risk Areas
- Payments/wallet balance integrity.
- Order lifecycle and stock consistency.
- Withdrawal approval/rejection and refund logic.
- Admin privilege boundaries and sub-admin permissions.
- KYC and document access control.

## 8. Migration Execution Plan (Phased)

### Phase 1: Preparation and Instrumentation
- [ ] Lock migration scope and endpoint inventory.
- [ ] Baseline metrics and logs.
- [ ] Snapshot Firestore and storage metadata.
- [ ] Define security parity matrix from `firestore.rules` and `storage.rules`.
- Acceptance:
  - Endpoint inventory approved.
  - Data export dry-run successful.
  - Baseline dashboards available.

### Phase 2: Build New Backend in Parallel
- [ ] Create API service and Turso schema migrations.
- [ ] Implement auth/session and RBAC/ownership middleware.
- [ ] Implement read APIs first for low-risk paths.
- [ ] Implement transactional write APIs for high-risk paths.
- Acceptance:
  - Unit and integration tests pass.
  - Security matrix tests pass on core resources.

### Phase 3: Dual-Run Strategy
- [ ] Read-through canary for selected views.
- [ ] Controlled dual-write for critical mutations with reconciliation logs.
- [ ] Keep Firebase fallback.
- Acceptance:
  - Zero financial divergence in reconciliation.
  - Non-financial divergence under agreed threshold.

### Phase 4: Data Migration
- [ ] Export Firestore collections.
- [ ] Transform and normalize schema.
- [ ] Import to Turso in deterministic batches.
- [ ] Validate row counts and ledger invariants.
- Acceptance:
  - Row count parity for in-scope entities.
  - Wallet/order/withdraw invariants pass.

### Phase 5: Gradual Rollout
- [ ] Feature flags by domain and role.
- [ ] Canary internal/admin users.
- [ ] Expand to user-facing write flows gradually.
- Acceptance:
  - No critical auth regressions.
  - Error/latency within SLO.

### Phase 6: Cutover and Rollback
- [ ] Switch clients to new API as source of truth.
- [ ] Disable direct Firebase client data access.
- [ ] Monitor and keep rollback path warm.
- Rollback:
  - Route traffic back to Firebase path.
  - Replay captured cutover-window writes.
- Downtime:
  - Target low/near-zero downtime with phased cutover.
  - Schedule brief maintenance window only if final consistency freeze is required.

## 9. Test & Validation Plan

### Unit Tests
- Authorization guards and permission checks.
- Transactional service methods.
- Idempotency handling and retries.

### Integration Tests
- API + Turso transactions.
- Object storage upload/authorization.
- Worker jobs and event/outbox processing.

### E2E Tests
- Register/login/reset.
- Order create/cancel/refund.
- KYC submit and admin approve/reject.
- Withdrawal request/approve/reject.
- Vendor/partner/org/admin role workflows.

### Data Verification
- Row count reconciliation per entity.
- Wallet balance re-derivation from ledger.
- Order subtotal consistency against order items.
- Withdrawal state transitions and corresponding ledger entries exactly once.

### Security Testing
- Authorization negative matrix:
  - user-to-user cross access denial
  - vendor non-owner product mutation denial
  - partner out-of-city data denial
  - sub-admin missing-permission denial
- Abuse tests:
  - auth brute-force
  - withdrawal spam
  - upload abuse
  - idempotency replay

## 10. Open Questions / Ambiguities
- **Ambiguous**: `withdraw_requests` vs `withdrawals` canonical source.
  - Evidence: `firestore.rules:541`, `functions/src/admin/getAdminStats.ts:76`, `functions/src/withdrawals/requestWithdrawal.ts`.
- **Ambiguous**: KYC data model split (`users.kycData` vs dedicated KYC collections).
  - Evidence: `app/dashboard/user/kyc/page.tsx:140`, `firestore.rules` KYC matches, `functions/src/admin/queueHealth.ts`.
- **Ambiguous**: Stale/unexported functions.
  - Evidence: `functions/src/withdrawals/processWithdrawal.ts`, `functions/src/admin/banUser.ts` not exported in `functions/src/index.ts`.
- **Ambiguous**: Region mismatch.
  - Evidence: `functions/src/admin/getAdminStats.ts:199` uses `us-east1` while defaults are `us-central1`.
- **Ambiguous**: Custom claims source.
  - Evidence: permissions read from `context.auth.token` in `functions/src/admin/helpers.ts`, but no claims-writer found in repo.
- **Ambiguous**: API docs drift.
  - Evidence: `api-spec.md` includes contracts that do not exactly match current exported callable set.

## 11. Appendix

### Evidence List (Key Files Searched)
- Firebase client setup:
  - `lib/firebase/config.ts`
  - `lib/firebase/auth.ts`
  - `lib/firebase/callable.ts`
  - `lib/firebase/storage.ts`
- Auth/session/middleware:
  - `app/auth/register/page.tsx`
  - `app/auth/login/page.tsx`
  - `app/auth/forgot-password/page.tsx`
  - `hooks/useAuth.ts`
  - `lib/auth/sessionCookie.ts`
  - `middleware.ts`
- Realtime and direct Firestore usage:
  - `hooks/useWallet.ts`
  - `store/useStore.ts`
  - `app/dashboard/user/orders/page.tsx`
  - `app/dashboard/user/orders/[id]/page.tsx`
  - `app/dashboard/user/withdraw/page.tsx`
  - `app/dashboard/partner/withdrawals/page.tsx`
  - `services/wishlist.service.ts`
  - `services/review.service.ts`
  - `services/product.service.ts`
- Cloud Functions:
  - `functions/src/index.ts`
  - `functions/src/orders/createOrderMultiItem.ts`
  - `functions/src/orders/cancelOrder.ts`
  - `functions/src/orders/updateOrderStatus.ts`
  - `functions/src/withdrawals/requestWithdrawal.ts`
  - `functions/src/admin/helpers.ts`
  - `functions/src/lib/rateLimit.ts`
  - `functions/src/triggers/user.ts`
  - `functions/src/triggers/transactions.ts`
  - `functions/src/triggers/referralStats.ts`
  - `functions/src/notifications/orderNotifications.ts`
  - `functions/src/search/productSearch.ts`
  - `functions/src/admin/getAdminStats.ts`
  - `functions/src/admin/uploadProductImage.ts`
- Rules and tests:
  - `firestore.rules`
  - `storage.rules`
  - `tests/firestore.rules.test.ts`
  - `tests/storage.rules.test.ts`
  - `firestore.indexes.json`
  - `firebase.json`
- Dependency files:
  - `package.json`
  - `functions/package.json`
  - `.env.example`

### Key Snippets (Redacted-Safe)
- Firestore init: `lib/firebase/config.ts:34` -> `getFirestore(app)`
- Middleware bypass: `middleware.ts` -> returns `NextResponse.next()` for dashboard routes
- Callable proxy target: `app/api/callable/[name]/route.ts` -> forwards to Cloud Functions URL
- Transactional order flow: `functions/src/orders/createOrderMultiItem.ts` -> `db.runTransaction(...)`
- Transactional withdrawal flow: `functions/src/withdrawals/requestWithdrawal.ts` -> `db.runTransaction(...)`
- Storage policy: `storage.rules` product path is server-write-only

### Dependency Summary
- Frontend Firebase SDK present: `firebase` in root `package.json`
- Functions runtime uses `firebase-admin` and `firebase-functions`
- Typesense integrated in both frontend and functions packages