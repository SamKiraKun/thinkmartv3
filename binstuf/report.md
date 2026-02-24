I could not create `Plans/report.md` in this session because filesystem writes are blocked by policy (read-only sandbox).  
Below is the exact report content intended for `Plans/report.md`.

---

# ThinkMart Firebase to MongoDB Migration Audit Report

## 1. Executive Summary
ThinkMart currently uses Firebase as a full backend platform, not just a database.

- Firestore is used heavily from frontend and Cloud Functions.
- Firebase Auth is the active login/session identity source.
- Firebase Storage is used for profile and KYC uploads, and product images via callable Functions.
- Cloud Functions contain critical business logic for orders, wallets, withdrawals, tasks/games, reviews, admin workflows, search indexing, notifications, and scheduled jobs.
- Firestore/Storage Rules implement important authorization logic and server-only write boundaries.
- Realtime listeners (`onSnapshot`) are used in multiple user-facing flows (wallet/profile/orders/withdrawals).

✅ Must-do: Treat this as a **platform migration** (Auth + DB + storage + rules logic + trigger logic), not only “swap Firestore with MongoDB.”

⚠️ Risk: Financial correctness (wallet/order/withdrawal consistency) will regress if migration bypasses current transaction/idempotency patterns in Functions.

**Recommendation:** **Proceed with constraints**.  
Proceed only with a phased, parallel backend rollout, strict parity tests, and controlled cutover for financial writes.

---

## 2. Current State: Firebase Dependency Map

### 2.1 Firebase initialization and environment
Evidence:
- `lib/firebase/config.ts` uses `initializeApp`, `getAuth`, `getFirestore`, `getFunctions`, `getStorage`.
- `.env.example` defines `NEXT_PUBLIC_FIREBASE_*`, region, callable transport mode.
- `app/api/callable/[name]/route.ts` proxies callable requests to Cloud Functions URL.
- `lib/firebase/callable.ts` uses proxy-first transport and falls back to SDK.

Key observed behavior:
- Mixed callable invocation paths exist.
- Some pages use proxy wrapper (`callCallable`), many use direct `httpsCallable`.

### 2.2 Firestore usage (collections/paths, operations, where)
Firestore is used in both frontend and Functions.

**Direct frontend Firestore reads/writes/listeners**
Evidence (non-exhaustive high-impact):
- `hooks/useAuth.ts`: `onSnapshot(doc(db,'users', uid))`.
- `hooks/useWallet.ts`: wallet listener + transaction/withdrawal queries.
- `store/useStore.ts`: realtime listeners on `users/{uid}` and `wallets/{uid}`.
- `app/auth/register/page.tsx`: `setDoc(users/{uid})`.
- `app/auth/login/page.tsx`: `getDoc(users/{uid})`.
- `app/dashboard/user/settings/page.tsx`: `updateDoc(users/{uid})`.
- `app/dashboard/user/kyc/page.tsx`: `updateDoc(users/{uid})`.
- `app/dashboard/user/checkout/page.tsx`: `arrayUnion` update on `users.savedAddresses`.
- `app/dashboard/user/orders/page.tsx`: `onSnapshot` query on `orders`.
- `app/dashboard/user/orders/[id]/page.tsx`: `onSnapshot` order doc.
- `app/dashboard/user/withdraw/page.tsx`: `onSnapshot(withdrawals where userId)`.
- `app/dashboard/partner/withdrawals/page.tsx`: `onSnapshot(withdrawals where userId)`.
- `services/wishlist.service.ts`: direct CRUD on `wishlists`.
- `services/review.service.ts`: direct review/order reads + callable writes.
- `components/mlm/TreeNode.tsx`: referral/upline user queries.
- `app/dashboard/organization/*`: direct user/org commission reads.

**Cloud Functions Firestore usage (source-of-truth business logic)**
Evidence:
- `functions/src/index.ts` exports triggers + large callable surface.
- `functions/src/orders/createOrderMultiItem.ts`: transactional order creation, wallet debit, stock decrement, transaction log.
- `functions/src/orders/cancelOrder.ts`: transactional cancellation, wallet refund, stock restoration.
- `functions/src/withdrawals/requestWithdrawal.ts`: KYC checks, cooldowns, monthly limits, transactional debit.
- `functions/src/tasks/rewardTask.ts`: idempotent completion + transactional wallet credit.
- `functions/src/admin/helpers.ts`: admin RBAC, permission checks, audit logging, idempotency keys.
- `functions/src/search/productSearch.ts`: Typesense sync via product trigger.
- `functions/src/notifications/orderNotifications.ts`: order/wallet triggers + notifications.
- `functions/src/triggers/user.ts`: wallet initialization, referral linking/rewarding.
- `functions/src/triggers/referralStats.ts`: referral counters + weekly scheduled recalculation.

**Collections in active rules/functions**
Core:
- `users`, `wallets`, `transactions`, `withdrawals`, `orders`, `products`, `wishlists`, `reviews`, `review_stats`, `review_helpful`.

Gamification/tasks:
- `tasks`, `task_completions`, `task_sessions`, `task_starts`, `cooldowns`, `game_limits`, `leaderboards`, `leaderboard_archives`, `user_badges`, `notifications`.

Admin/config/moderation:
- `admin_settings`, `public_settings`, `audit_logs`, `admin_permissions`, `idempotency_keys`, `admin_metrics`, `feature_flags`, `product_categories`, `product_brands`, `banners`, `game_configs`, `commission_logs`, `rate_limits`.

Partner/vendor/org/KYC:
- `partner_wallets`, `partner_commission_logs`, `org_commission_logs`, `withdrawal_logs`, `city_stats`, `kyc_documents`.

Coupons/search support:
- `coupons`, `coupon_usage`.

Legacy/dual-source references:
- `withdraw_requests`, `kyc_submissions`, `system/leaderboard` (legacy cache doc).

### 2.3 Storage usage (paths and operations)
Evidence:
- `lib/firebase/storage.ts`: `uploadBytes`, `getDownloadURL`, `deleteObject`.
- `app/dashboard/user/settings/page.tsx`: profile image upload path `users/{uid}/profile_*`.
- `app/dashboard/user/kyc/page.tsx`: KYC path `kyc_documents/{uid}/...`.
- `functions/src/admin/uploadProductImage.ts`: product image uploads to `products/{productId}/...` using Admin SDK.

Storage Rules (`storage.rules`):
- `users/{uid}/**`: owner/admin read, owner write with image constraints.
- `products/**`: public read, client write denied.
- `kyc_documents/{uid}/**` and legacy `kyc/{uid}/**`: owner/admin read, owner create/update with MIME+size limits.

### 2.4 Auth usage
Evidence:
- `lib/firebase/auth.ts`: email/password register/login/reset/logout + local persistence.
- `app/auth/register/page.tsx`: Firebase Auth user creation + Firestore profile creation.
- `app/auth/login/page.tsx`: email/password login + role-based dashboard redirect.
- `app/auth/forgot-password/page.tsx`: password reset email.
- `hooks/useAuth.ts`: `onAuthStateChanged`.
- `lib/auth/sessionCookie.ts`: client-written `tm_session` cookie.
- `middleware.ts`: no server token/session validation; passes through.

⚠️ Risk: Server-side route protection is currently client-state-centric; migration must close this gap with API-level auth enforcement.

### 2.5 Realtime/offline usage
Realtime:
- `onSnapshot` in `hooks/useAuth.ts`, `hooks/useWallet.ts`, `store/useStore.ts`, orders pages, withdrawal pages.

Offline:
- No explicit Firestore offline persistence setup found (no `enableIndexedDbPersistence`).

Ambiguous:
- Whether any implicit offline behavior is relied upon by product owners.

### 2.6 Cloud Functions/admin tooling/triggers
Observed:
- Callable-heavy backend (admin + user + vendor + partner + org + tasks + reviews + games + coupons + search).
- Firestore triggers: user creation, transaction creation, referral stat maintenance, product search sync, order/wallet notification triggers.
- Scheduled jobs: leaderboard updates/resets, referral stats recalculation.
- Admin permission model in `functions/src/admin/helpers.ts` with fine-grained permissions and idempotency key support.
- Firestore and Storage rules tests exist:
  - `tests/firestore.rules.test.ts`
  - `tests/storage.rules.test.ts`

### 2.7 Security Rules dependencies
`firestore.rules` encodes a major part of current security posture:
- Role model: `admin`, `sub_admin`, `vendor`, `partner`, `organization`, `user`.
- Ownership checks: user-scoped docs, vendor order/product access, partner/org scoped logs.
- Server-only write enforcement for sensitive collections (`wallets`, `transactions`, `withdrawals`, `orders`, etc.).
- Strong default deny.

✅ Must-do: Rebuild this rules matrix in API authorization tests before cutover.

---

## 3. Why Migrate: Benefits for ThinkMart

Benefits that directly apply to this repo:

- Consolidates split backend logic:
  - Today logic is spread across Rules + Functions + direct client Firestore writes.
  - Migration centralizes policy and domain logic in one service layer.
- Solves callable transport fragility:
  - Repo already contains proxy/fallback complexity and CORS issues in `Plans/BUGS.md`.
  - First-party API removes Cloud Functions domain/CORS coupling.
- Improves maintainability for complex domains:
  - Orders, wallet, withdrawals, task rewards, admin actions are easier to reason about in one backend codebase.
- Reduces Firebase Rules lock-in:
  - Authorization becomes explicit TypeScript policies and tests.
- Enhances observability:
  - Better structured logs, traces, metrics, and incident forensics than current mixed model.
- Flexible storage/runtime choices:
  - S3-compatible storage and queue workers can fit current product image + KYC + scheduled jobs needs.

---

## 4. Trade-offs, Risks, and Hidden Costs

- Security model shift:
  - Firestore Rules currently enforce many constraints.
  - API migration must recreate role/ownership constraints exactly.
- Realtime replacement work:
  - `onSnapshot` flows need SSE/WebSocket/polling equivalents.
- Operational burden increases:
  - Need to run API, MongoDB, Redis/queue, storage, monitoring, backups, alerting.
- Auth migration complexity:
  - Existing users are in Firebase Auth; migrating credentials and sessions safely is non-trivial.
- Financial flow correctness:
  - Wallet/order/withdrawal logic currently uses Firestore transactions and idempotency patterns.
  - Cross-system dual-write introduces consistency hazards.
- Legacy drift in codebase:
  - Mixed field conventions and legacy collection fallbacks increase migration validation scope.

⚠️ Risk: “Big-bang” switch is unsafe for this codebase.

✅ Must-do: Use phased migration with parity tests and controlled financial-write cutover.

---

## 5. Target Architecture (MongoDB + Service Layer)

### 5.1 Proposed backend stack
- Runtime: Node.js 20 + TypeScript.
- API framework: Fastify (REST-first, schema-friendly, high throughput).
- Validation: Zod (reuse existing validation style from Functions).
- DB: MongoDB Atlas replica set (transactions + change streams).
- Queue/jobs: BullMQ + Redis.
- Object storage: S3-compatible (AWS S3 / Cloudflare R2 / MinIO).
- Search: keep Typesense (already integrated) and reindex from Mongo events.
- Observability: OpenTelemetry + structured logging + metrics.

Justification:
- Closest migration path from current callable-module design.
- Supports transactional domain boundaries and background processing needed by this repo.

### 5.2 API style
- Use REST (default).
- Map callable names to REST endpoints gradually.
- Keep action-style endpoints for transactional operations (e.g. `/orders/create`, `/withdrawals/request`).

### 5.3 Auth design
Target:
- JWT access token (short TTL) + refresh token rotation.
- HttpOnly secure cookies for web.
- Refresh tokens hashed in DB (`auth_refresh_tokens`).
- Password hashing: Argon2id.
- Email verification and password reset tokens via signed one-time tokens.

Low-risk transition:
- Phase A: accept Firebase ID tokens at API gateway (temporary bridge).
- Phase B: migrate to native auth after data/API parity is stable.

### 5.4 Authorization design
Implement RBAC + ownership/attribute checks:
- Roles: `user`, `partner`, `vendor`, `organization`, `admin`, `sub_admin`.
- Sub-admin permissions from current matrix in `functions/src/admin/helpers.ts`.
- Attribute checks:
  - vendor owns product/order line items.
  - partner scoped by assigned city.
  - org scoped by referral-based member set.
  - user scoped to own documents.

### 5.5 Data consistency and idempotency
Use Mongo transactions for:
- order create/cancel/refund,
- withdrawal request/process,
- wallet adjustments,
- reward claims.

Use idempotency keys for:
- admin actions,
- financial actions,
- external callbacks.

Port existing `idempotency_keys` semantics and enforce unique key constraints.

### 5.6 Realtime strategy
- Use SSE for wallet/order/withdrawal/profile updates.
- Build SSE events from Mongo change streams (replica set required).
- Polling fallback with ETag/`updatedAt` for degraded mode.

### 5.7 Background jobs and triggers
Replace Firebase triggers/schedules with queue workers:
- Event-driven jobs:
  - referral stats updates,
  - search indexing,
  - notifications,
  - review stats recomputation.
- Scheduled jobs:
  - leaderboard refresh/reset,
  - referral reconciliation,
  - health summaries.

### 5.8 Storage design
Use S3-compatible buckets with existing path conventions:
- `users/{uid}/...` private.
- `kyc_documents/{uid}/...` private.
- `products/{productId}/...` public-read through CDN.

Upload flow:
- profile/KYC via presigned upload URLs (size/type restrictions in API).
- product images via authenticated API endpoint (server-side validation), mirroring current callable model.

### 5.9 Observability, limits, abuse protection
- Structured audit logs for admin actions.
- Request IDs propagated end-to-end.
- Metrics:
  - auth failures,
  - order/withdrawal error rates,
  - queue lag,
  - SSE connection counts.
- Rate limiting (Redis):
  - auth endpoints,
  - financial endpoints,
  - upload endpoints.

---

## 6. MongoDB Schema & Index Plan

### 6.1 Core collections (proposed)
Use string `_id` values for migrated docs to preserve existing IDs and reduce risk.

| Mongo Collection | Key Fields (shape) | Indexes |
|---|---|---|
| `users` | `_id(uid)`, `email`, `role`, `state`, `city`, `ownReferralCode`, `referralCode`, `referredBy`, `uplinePath[]`, `membershipActive`, `kycStatus`, `kycData`, `partnerConfig`, `vendorConfig`, timestamps | unique `email`; unique `ownReferralCode`; `{referralCode:1,createdAt:-1}`; `{role:1,createdAt:-1}`; `{city:1,role:1,createdAt:-1}`; `{kycStatus:1,kycSubmittedAt:-1}` |
| `wallets` | `_id(userId)`, `cashBalance`, `coinBalance`, `totalEarnings`, `totalWithdrawals`, timestamps | `{totalEarnings:-1}` |
| `orders` | `_id`, `userId`, `items[]`, `vendorIds[]`, `subtotal`, `cashPaid`, `coinsRedeemed`, `status`, `statusHistory[]`, `shippingAddress`, timestamps | `{userId:1,createdAt:-1}`; `{status:1,createdAt:-1}`; `{vendorIds:1,createdAt:-1}`; `{vendorIds:1,status:1,createdAt:-1}` |
| `transactions` | `_id`, `userId`, `type`, `category`, `amount`, `coinAmount`, `currency`, `orderId`, `withdrawalId`, timestamps | `{userId:1,createdAt:-1}`; `{userId:1,type:1,createdAt:-1}`; `{withdrawalId:1}`; `{orderId:1}` |
| `withdrawals` | `_id`, `userId`, `amount`, `method`, `details`, `status`, `riskFlags[]`, `processedBy`, timestamps | `{userId:1,createdAt:-1}`; `{status:1,createdAt:-1}`; `{userId:1,status:1,processedAt:-1}`; `{userCity:1,status:1,createdAt:-1}` |
| `products` | `_id`, `name`, `description`, `price`, `coinPrice`, `category`, `status`, `isActive`, `inStock`, `stock`, `vendorId`, images, timestamps | `{vendorId:1,isActive:1,createdAt:-1}`; `{status:1,createdAt:-1}`; `{category:1,inStock:1,createdAt:-1}`; `{price:1,createdAt:-1}` |
| `wishlists` | `_id`, `userId`, `productId`, `addedAt`, flags | unique `{userId:1,productId:1}`; `{userId:1,addedAt:-1}` |
| `reviews` | `_id`, `productId`, `userId`, `orderId`, `rating`, `status`, `helpful`, content, timestamps | `{productId:1,status:1,createdAt:-1}`; `{productId:1,status:1,helpful:-1}`; `{productId:1,status:1,rating:-1}`; `{userId:1,createdAt:-1}`; unique `{userId:1,orderId:1,productId:1}` |
| `review_stats` | `_id(productId)`, aggregate fields | `_id` only |
| `task_definitions` (from `tasks`) | `_id`, type, reward, frequency, minDuration, isActive, questions | `{isActive:1,createdAt:-1}` |
| `task_sessions` | `_id`, `userId`, `taskId`, `status`, `currentStep`, `answers`, timestamps | `{userId:1,createdAt:-1}`; `{taskId:1,userId:1}` |
| `task_completions` | `_id`, `userId`, `taskId`, `reward`, `completedAt` | `{userId:1,completedAt:-1}`; `{userId:1,taskId:1,completedAt:-1}` |
| `cooldowns` | `_id(userId)`, `spin`, `luckyBox`, `tasks`, `taskStart` maps | `_id` only |

### 6.2 Secondary/admin collections (present in code)
- `partner_wallets`
- `partner_commission_logs`
- `org_commission_logs`
- `withdrawal_logs`
- `audit_logs`
- `admin_permissions`
- `idempotency_keys`
- `admin_metrics`
- `feature_flags`
- `admin_settings`
- `public_settings`
- `city_stats`
- `notifications`
- `user_badges`
- `leaderboards`
- `leaderboard_archives`
- `game_configs`
- `commission_logs`
- `coupons`
- `coupon_usage`
- `rate_limits`
- `product_categories`
- `product_brands`
- `banners`

✅ Must-do: Keep these collections in initial migration scope to preserve admin dashboards and scheduled jobs.

### 6.3 Firestore → Mongo mapping table

| Firestore Path | Mongo Collection | Mapping Notes |
|---|---|---|
| `users/{uid}` | `users` | `_id=uid`; preserve role/referral/kyc fields |
| `wallets/{uid}` | `wallets` | `_id=uid`; retain cash/coin totals |
| `orders/{orderId}` | `orders` | preserve embedded `items` snapshot |
| `transactions/{txnId}` | `transactions` | normalize mixed type/category casing |
| `withdrawals/{id}` | `withdrawals` | include risk/admin processing fields |
| `products/{productId}` | `products` | retain status/moderation/vendor fields |
| `wishlists/{uid_product}` | `wishlists` | keep compound uniqueness |
| `reviews/{reviewId}` | `reviews` | preserve moderation + helpful counters |
| `review_stats/{productId}` | `review_stats` | materialized aggregate |
| `tasks/{taskId}` | `task_definitions` | renamed for clarity (optional) |
| `task_sessions/{sessionId}` | `task_sessions` | preserve state machine fields |
| `task_completions/{id}` | `task_completions` | preserve idempotent IDs |
| `cooldowns/{uid}` | `cooldowns` | keep nested action cooldowns |
| `partner_wallets/{partnerId}` | `partner_wallets` | same ID strategy |
| `partner_commission_logs/{id}` | `partner_commission_logs` | same schema |
| `org_commission_logs/{id}` | `org_commission_logs` | same schema |
| `audit_logs/{id}` | `audit_logs` | append-only |
| `admin_permissions/{uid}` | `admin_permissions` | sub-admin permission data |
| `idempotency_keys/{key}` | `idempotency_keys` | strict uniqueness |
| `public_settings/{id}` | `public_settings` | preserve global docs |
| `admin_settings/{id}` | `admin_settings` | preserve global docs |
| `feature_flags/{id}` | `feature_flags` | preserve targeting rules |
| `leaderboards/{id}` | `leaderboards` | same |
| `leaderboard_archives/{id}` | `leaderboard_archives` | same |
| `coupons/{id}` | `coupons` | same |
| `coupon_usage/{id}` | `coupon_usage` | same |
| `system/leaderboard` | `leaderboards_legacy` or `system_docs` | legacy compatibility |
| `withdraw_requests/{id}` | `withdraw_requests_legacy` | migrate for backward stats continuity |
| Storage: `users/{uid}/...` | `object_keys` in `users` | keep URL/key references |
| Storage: `kyc_documents/{uid}/...` | `object_keys` in `users.kycData` or `kyc_files` | private object policy |
| Storage: `products/{productId}/...` | `products.images[]` keys/URLs | public CDN objects |

---

## 7. Codebase Impact & Refactor Plan

### 7.1 Frontend impact (replace Firebase SDK with API client)

High-impact file groups:
- Firebase setup/wrappers:
  - `lib/firebase/config.ts`
  - `lib/firebase/auth.ts`
  - `lib/firebase/callable.ts`
  - `lib/firebase/firestore.ts`
  - `lib/firebase/storage.ts`
- Auth/session hooks/stores:
  - `hooks/useAuth.ts`
  - `store/auth.store.ts`
  - `app/auth/register/page.tsx`
  - `app/auth/login/page.tsx`
  - `app/auth/forgot-password/page.tsx`
  - `middleware.ts`
- Realtime-dependent views:
  - `store/useStore.ts`
  - `hooks/useWallet.ts`
  - `app/dashboard/user/orders/page.tsx`
  - `app/dashboard/user/orders/[id]/page.tsx`
  - `app/dashboard/user/withdraw/page.tsx`
  - `app/dashboard/partner/withdrawals/page.tsx`
- Direct Firestore CRUD pages/services:
  - `app/dashboard/user/settings/page.tsx`
  - `app/dashboard/user/kyc/page.tsx`
  - `app/dashboard/user/checkout/page.tsx`
  - `services/wishlist.service.ts`
  - `services/review.service.ts`
  - `services/product.service.ts`
  - `hooks/usePublicSettings.ts`
  - `hooks/useReferral.ts`
  - `components/mlm/TreeNode.tsx`
  - `app/dashboard/organization/page.tsx`
  - `app/dashboard/organization/members/page.tsx`
  - `app/dashboard/organization/earnings/page.tsx`

### 7.2 Backend impact (new API + worker replacement)
Port/replace current Functions modules:
- Orders, withdrawals, wallets, user membership.
- Tasks/games/daily checkin.
- Reviews.
- Admin modules (users/KYC/orders/withdrawals/transactions/settings/feature flags/audit logs/marketplace/partners-orgs).
- Vendor/partner/organization endpoints.
- Search indexing and key issuance.
- Notifications/event handlers.
- Trigger/scheduled jobs into queue workers.

### 7.3 Shared DTO/types/validation
- Consolidate `types/*.ts` and function schemas into shared package.
- Normalize legacy field drift (`coinBalance/cashBalance` vs legacy `coins/balance`).
- Use runtime validation on all write endpoints (Zod).

### 7.4 High-risk areas
- `functions/src/orders/createOrderMultiItem.ts`
- `functions/src/orders/cancelOrder.ts`
- `functions/src/withdrawals/requestWithdrawal.ts`
- `functions/src/tasks/rewardTask.ts`
- `functions/src/admin/userManagement.ts` (wallet adjustments)
- `functions/src/partner/partner.ts` (commission distribution)

⚠️ Risk: These flows mutate money-like balances and inventory; require transactional parity tests before cutover.

---

## 8. Migration Execution Plan (Phased)

### Phase 1: Preparation & instrumentation
- [ ] Freeze schema catalog and collection inventory.
- [ ] Add request/operation IDs in all critical function paths.
- [ ] Define invariants (wallet/order/withdrawal/transaction).
- [ ] Capture baseline metrics and error rates.
- [ ] Backup Firestore and Storage metadata snapshots.

Acceptance criteria:
- [ ] Baseline reports generated.
- [ ] Invariants documented and testable.
- [ ] Backup restore drill completed in non-prod.

Rollback:
- [ ] Not applicable (no traffic shift yet).

### Phase 2: Build Mongo backend in parallel
- [ ] Stand up Fastify API + Mongo + Redis + S3-compatible storage.
- [ ] Implement auth bridge (accept Firebase ID tokens temporarily).
- [ ] Port critical read endpoints first.
- [ ] Port write endpoints for orders/withdrawals/tasks with Mongo transactions.
- [ ] Port admin RBAC permission matrix.

Acceptance criteria:
- [ ] API parity for top user/admin endpoints.
- [ ] Contract tests pass against existing UI expectations.
- [ ] RBAC matrix tests green.

Rollback:
- [ ] Keep frontend on Firebase by default feature flag.

### Phase 3: Dual-run strategy
- [ ] Route selected traffic to new read API behind flags.
- [ ] Keep Firebase as write authority initially.
- [ ] Add reconciliation jobs comparing Firebase vs Mongo projections.
- [ ] Enable canary cohort.

Acceptance criteria:
- [ ] Data drift under threshold for 7 consecutive days.
- [ ] No severity-1 regressions in canary.

Rollback:
- [ ] Flip feature flag back to Firebase reads immediately.

### Phase 4: Data migration execution
- [ ] Export Firestore collections + transform.
- [ ] Import into Mongo preserving IDs.
- [ ] Migrate storage object metadata references.
- [ ] Verify counts, checksums, and financial invariants.
- [ ] Rebuild indexes before broad traffic.

Acceptance criteria:
- [ ] Collection counts match expected ranges.
- [ ] Financial invariants pass.
- [ ] Query latency SLO met with production-like load.

Rollback:
- [ ] Discard migrated snapshot and rerun import (pre-cutover).

### Phase 5: Gradual write cutover
- [ ] Move low-risk writes first (profile/wishlist/reviews).
- [ ] Move high-risk writes last (orders/withdrawals/rewards/wallet adjust).
- [ ] Maintain shadow logging and anomaly alerts.
- [ ] Switch realtime streams to SSE endpoints.

Acceptance criteria:
- [ ] No write-data loss.
- [ ] Error budget within threshold.
- [ ] Reconciliation reports stable.

Rollback:
- [ ] Per-domain rollback flags (orders, withdrawals, tasks separately).

### Phase 6: Final cutover + decommission
- [ ] Disable Firebase write paths.
- [ ] Keep read-only Firebase fallback for fixed observation window.
- [ ] Decommission unused Functions and SDK paths after stability window.
- [ ] Archive rules/tests as historical controls.

Acceptance criteria:
- [ ] 14-day stable production window.
- [ ] Zero unreconciled financial records.
- [ ] Runbooks updated.

Rollback:
- [ ] Emergency fallback to Firebase read/write for critical domains if within observation window.

**Downtime expectation**
- Target near-zero downtime for browsing and auth.
- Low-downtime window likely needed for high-risk financial write cutover (recommended: brief maintenance mode for order/withdrawal writes during final delta sync).

---

## 9. Test & Validation Plan

### 9.1 Unit and integration tests
- Unit tests:
  - auth/token rotation,
  - RBAC policy guards,
  - validators,
  - domain services (orders/withdrawals/tasks/reviews).
- Integration tests:
  - Mongo transaction behavior for financial flows.
  - Idempotency key enforcement.
  - S3 upload policy validations.
- Preserve and adapt rules intent:
  - translate `tests/firestore.rules.test.ts` security cases into API authorization matrix tests.
  - translate `tests/storage.rules.test.ts` into storage policy tests.

### 9.2 End-to-end tests
- User flows:
  - register/login/logout/reset,
  - place/cancel order,
  - request/process withdrawal,
  - task reward claim with cooldown,
  - profile + KYC upload.
- Admin flows:
  - user role/status updates,
  - KYC moderation,
  - order moderation/refund,
  - withdrawal approval/reject,
  - feature flag CRUD.

### 9.3 Data verification and reconciliation
- Count checks per collection.
- Random document sampling with field-level diff.
- Financial invariants:
  - wallet balance vs transaction ledger deltas.
  - order cancellation/refund consistency.
  - withdrawal request debit/refund parity.
- Time-based checks:
  - leaderboard/cooldown correctness.

### 9.4 Security tests
- Full authorization matrix by role.
- Negative tests:
  - privilege escalation attempts,
  - cross-user reads/writes,
  - vendor access to non-owned products/orders,
  - partner city scope violations,
  - sub-admin permission overreach.
- Rate-limit abuse tests for auth, uploads, financial endpoints.

✅ Must-do: Block production cutover unless security matrix and financial invariants are fully green.

---

## 10. Open Questions / Ambiguities

1. Ambiguous: Is `_cleanpush` active deployment code or archival snapshot?
- Evidence: `_cleanpush/functions/src/*`, `_cleanpush/app/*`.
- Needed confirmation: deployment source-of-truth beyond `functions/src`.

2. Ambiguous: Legacy callable wrapper references non-exported functions.
- Evidence: `lib/firebase/functions.ts` references `processWithdrawal`, `completeTask`, `creditCoins`.
- Needed confirmation: can these be removed safely.

3. Ambiguous: Mixed withdrawal sources (`withdraw_requests` and `withdrawals`).
- Evidence: `functions/src/admin/getAdminStats.ts`.
- Needed confirmation: canonical historical source and retention policy.

4. Ambiguous: Wallet field naming drift (`coinBalance/cashBalance` vs `coins/balance`).
- Evidence: `functions/src/wallet/creditCoins.ts`.
- Needed confirmation: whether legacy fields exist in production data.

5. Ambiguous: Vendor identity fields are inconsistent (`vendorId`, `vendorUid`, `vendor`, name aliases).
- Evidence: `functions/src/vendor/vendor.ts`, `functions/src/vendor/vendorAnalytics.ts`.
- Needed confirmation: canonical vendor key strategy.

6. Ambiguous: Notification UX completeness.
- Evidence: notifications are created in Functions (`functions/src/notifications/orderNotifications.ts`), no clear frontend collection consumer found.
- Needed confirmation: required behavior for notification center and push registration lifecycle.

7. Ambiguous: App Check posture.
- Evidence: proxy forwards app-check header in `app/api/callable/[name]/route.ts`, no client initialization found.
- Needed confirmation: whether App Check is required in production security policy.

8. Ambiguous: Auth migration path for existing Firebase Auth accounts.
- Evidence: current auth fully Firebase-based (`lib/firebase/auth.ts`).
- Needed confirmation: acceptable migration method for credentials and user session continuity.

9. Ambiguous: Currency/format consistency across domains.
- Evidence: mixed legacy strings and conversion semantics in several functions.
- Needed confirmation: canonical monetary units and rounding policy.

10. Ambiguous: Search strategy target.
- Evidence: Typesense integration in `functions/src/search/productSearch.ts`, `services/search.service.ts`.
- Needed confirmation: keep Typesense or move to Mongo Atlas Search.

---

## 11. Appendix

### A. Key evidence snippets
- `lib/firebase/config.ts`: `initializeApp(...)`, `getFirestore(app)`, `getFunctions(app, region)`, `getStorage(app)`.
- `hooks/useAuth.ts`: `onSnapshot(doc(db, 'users', firebaseUser.uid), ...)`.
- `store/useStore.ts`: realtime listeners on `users/{uid}` and `wallets/{uid}`.
- `app/auth/register/page.tsx`: `setDoc(doc(db, 'users', user.uid), ...)`.
- `app/dashboard/user/kyc/page.tsx`: uploads to `kyc_documents/{uid}/...` + `updateDoc(users/{uid})`.
- `functions/src/orders/createOrderMultiItem.ts`: `db.runTransaction(...)` with wallet/stock/order/transaction mutation.
- `functions/src/withdrawals/requestWithdrawal.ts`: KYC + cooldown + monthly limit checks, transactional debit.
- `functions/src/tasks/rewardTask.ts`: idempotent completion and wallet credit.
- `functions/src/admin/helpers.ts`: `requireAdminRole`, `requirePermission`, `checkIdempotency`, `writeAuditLog`.
- `firestore.rules`: explicit role helpers and server-only write boundaries.
- `storage.rules`: strict path-based upload permissions and MIME/size constraints.
- `tests/firestore.rules.test.ts`: broad authorization matrix coverage.
- `tests/storage.rules.test.ts`: storage permission coverage.

### B. Files searched (primary)
Platform config:
- `firebase.json`
- `.firebaserc`
- `.env.example`
- `firestore.rules`
- `storage.rules`
- `firestore.indexes.json`
- `package.json`
- `functions/package.json`

Frontend Firebase usage:
- `app/**/*`
- `components/**/*`
- `hooks/**/*`
- `services/**/*`
- `store/**/*`
- `lib/firebase/**/*`
- `middleware.ts`

Functions backend:
- `functions/src/index.ts`
- `functions/src/admin/**/*`
- `functions/src/orders/**/*`
- `functions/src/withdrawals/**/*`
- `functions/src/tasks/**/*`
- `functions/src/gamification/**/*`
- `functions/src/partner/**/*`
- `functions/src/vendor/**/*`
- `functions/src/organization/**/*`
- `functions/src/reviews/**/*`
- `functions/src/search/**/*`
- `functions/src/notifications/**/*`
- `functions/src/triggers/**/*`
- `functions/src/lib/**/*`

Tests/scripts:
- `tests/firestore.rules.test.ts`
- `tests/storage.rules.test.ts`
- `scripts/run-rules-tests.js`
- `scripts/run-e2e-smoke.js`
- `scripts/check-deprecated-callables.js`

### C. Dependency evidence
Frontend deps:
- `firebase`, `typesense`, `next`, `react`, `zustand`, test/rules tools.

Functions deps:
- `firebase-admin`, `firebase-functions`, `typesense`, `zod`.

### D. Notable repo hygiene observations (migration-relevant)
- `_cleanpush` mirrors large parts of codebase and may cause confusion.
- Legacy wrappers and mixed schema conventions exist.
- This increases migration test scope and requires explicit deprecation cleanup plan.

✅ Must-do: Treat de-duplication/legacy cleanup as part of migration hardening, not a separate afterthought.

---

Completion summary:
- Intended report path: `Plans/report.md` (write blocked in this environment).
- Audited Firebase init, env wiring, callable proxy/fallback, and dependency manifests.
- Mapped Firestore usage across frontend hooks/services/pages and Cloud Functions modules.
- Confirmed Storage usage paths/rules for profile, KYC, and product images.
- Confirmed Firebase Auth flow and identified current client-centric session guarding risks.
- Cataloged trigger/scheduled workloads and admin permission/idempotency patterns.
- Derived Mongo schema/index plan from observed query patterns and rules/index files.
- Produced phased migration plan with acceptance criteria, reconciliation checks, and rollback controls.
- Flagged ambiguities requiring confirmation before implementation (legacy paths, schema drift, auth migration path).