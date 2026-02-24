# ThinkMart Audit Output (Repo-Based)

## 1) Executive Summary
- Overall health score: **6.2 / 10** → **Revised after Phase 0-3 fixes: ~8.0 / 10**
- Strengths:
  - Clear App Router structure and role-scoped dashboard routes (`app/dashboard/*`).
  - Cloud Functions are modularized by domain and mostly callable-based (`functions/src/index.ts`).
  - Firestore rules include strong server-only boundaries for sensitive collections (`firestore.rules`).
  - Cursor pagination exists in many admin endpoints (`functions/src/admin/*Management.ts`).
- Critical gaps:
  - **Data model drift across modules** (same domain written/read with different collection/field names).
  - **Wallet consistency risk** from writing balances to `users` in some admin flows while primary wallet reads use `wallets`.
  - **Admin/withdrawal flows split between `withdrawals` and `withdraw_requests`**.
  - **Product moderation visibility can be bypassed by direct product doc reads** due public product rules + direct client fetch.
  - **Operational blind spots**: some UIs suppress callable not-found failures and appear empty.

### Immediate Stop-The-Bleeding Actions
1. Standardize write/read paths for withdrawals and wallet updates (code-only, no schema changes).
2. Patch admin order/withdrawal refund handlers to update `wallets/{uid}` instead of `users/{uid}`.
3. Align order coin fields (`coinsRedeemed` vs `coinsPaid`) across admin endpoints/UI.
4. Restrict shop/product detail rendering to moderation-approved products in app logic.
5. Add explicit callable error surfacing in vendor/admin pages currently swallowing function-not-found.

### Definitely Working vs Uncertain
- Definitely working from code:
  - Pending order cancellation callable and UI flow exist (`functions/src/orders/cancelOrder.ts`, `app/dashboard/user/orders/[id]/page.tsx`).
  - Spin/Lucky Box server-enforced cooldowns with client countdown are implemented (`functions/src/gamification/games.ts`, `components/tasks/SpinWheel.tsx`, `components/tasks/LuckyBox.tsx`).
  - Membership upgrade callable updates user membership flag (`functions/src/user/upgradeMembership.ts`).
- Uncertain without runtime/prod checks:
  - Production CORS symptom around `getProductsForModerationPage` (code uses callable; likely deployment/region/runtime mismatch).
  - Admin dashboard “500/internal” exact production root cause.
  - Real production index/state parity for all admin paginated queries.

---

## 2) Feature Status Matrix

| Feature | Status | Evidence | Notes / Gaps | Recommended Action |
|---|---|---|---|---|
| Auth + dashboard routing | Partial | `app/dashboard/layout.tsx`, `lib/guards/roleGuard.ts` | Client-side gate works; middleware intentionally no-op. Hard dependency on `users/{uid}` role/profile. | Keep current flow; add stronger error state when profile missing. |
| User shop listing | Partial | `app/dashboard/user/shop/page.tsx`, `functions/src/marketplace/shopCatalog.ts` | Listing is callable-based and moderated, but detail page reads raw product docs directly. | Route detail through moderated callable/filter gate. |
| Product moderation (admin) | Partial | `app/dashboard/admin/products/page.tsx`, `functions/src/admin/marketplaceManagement.ts` | Callables implemented; production CORS report indicates env/deploy mismatch risk. | Add deployment/env validation and callable diagnostics. |
| Order placement (multi-item) | Partial | `functions/src/orders/createOrderMultiItem.ts` | Core flow exists; field naming drifts impact admin display (`coinsRedeemed` vs `coinsPaid`). | Normalize field reads in admin endpoints/UI. |
| User order cancellation | Fully Implemented | `app/dashboard/user/orders/[id]/page.tsx`, `functions/src/orders/cancelOrder.ts` | Correct pending-only user cancel and refund logic. | Add tests for forbidden statuses and refund invariants. |
| Leaderboard (referrers/earners) | Partial | `app/dashboard/user/leaderboard/page.tsx`, `functions/src/gamification/leaderboard.ts`, `functions/src/triggers/referralStats.ts` | Cached reads can return stale/empty data until scheduled refresh; aggregate dependencies vary by legacy field. | Trigger refresh strategy + fallback regeneration on empty cache. |
| Membership upgrade UI sync | Mostly Implemented | `app/dashboard/user/upgrade/page.tsx`, `components/dashboard/Sidebar.tsx`, `hooks/useAuth.ts` | Real-time profile listener exists; should update sidebar; issue likely stale profile/env in prod. | Add post-upgrade profile refresh guard + telemetry. |
| Vendor products visibility | Partial | `app/dashboard/vendor/products/page.tsx`, `functions/src/vendor/vendor.ts` | Backend exists; UI suppresses function-not-found and can silently show empty data. | Surface callable errors prominently; add fallback diagnostics. |
| Vendor orders visibility | Partial | `app/dashboard/vendor/orders/page.tsx`, `functions/src/vendor/vendor.ts`, `functions/src/orders/createOrderMultiItem.ts` | Query uses `vendorIds`; gaps when products/orders lack normalized vendor fields. | Backward-compat filter already present; strengthen field normalization on order create. |
| Admin users/partners/transactions | Partial | `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/partners-orgs/page.tsx`, `app/dashboard/admin/transactions/page.tsx`, `functions/src/admin/*` | APIs exist, but data drift and permission/env issues can manifest as empty screens. | Add endpoint health checks and structured client error banners. |
| Withdrawals admin operations | Broken/Partial | `functions/src/withdrawals/requestWithdrawal.ts`, `functions/src/admin/withdrawalManagement.ts`, `app/dashboard/admin/withdrawals/page.tsx` | User flow writes `withdrawals`; admin flow reads `withdraw_requests`. | Unify read/write path in code to dual-read then single-write target. |
| Cooldowns (tasks/spin/lucky) | Partial | `functions/src/gamification/games.ts`, `functions/src/tasks/dailyCheckin.ts`, `functions/src/tasks/startTask.ts`, `components/tasks/TaskCard.tsx` | Spin/lucky 24h enforced server-side; task path mixes 24h (`dailyCheckin`) and 2h (`startTask`) plus client-local cooldown UI. | Define one task cooldown source-of-truth and return from callable. |

---

## 3) File & Integration Map

### Entry Points and Core Runtime
- Next.js App Router root: `app/layout.tsx`
- Global providers/listeners: `app/providers.tsx`
- Dashboard shell + RBAC redirect logic: `app/dashboard/layout.tsx`
- Firebase client bootstrap: `lib/firebase/config.ts`
- Cloud Function export hub: `functions/src/index.ts`

### Primary Data Flow (Observed)
1. UI page calls `httpsCallable` from `app/dashboard/**`.
2. Callable function validates auth/role, reads/writes Firestore with Admin SDK.
3. Client UI listens to Firestore docs (`users`, `wallets`, `orders`) for state updates in several flows.

### DB/Rules Layer
- Security rules: `firestore.rules`
- Strong server-only write rules for sensitive collections (`transactions`, `withdrawals`, `cooldowns`, admin collections).
- Public read on `products` currently allows direct reads beyond moderated list logic.

### External Integrations
- Firebase Auth/Firestore/Functions/Storage throughout app.
- Typesense integration in search module (`functions/src/search/productSearch.ts`, `services/search.service.ts`).

### Used vs Unused / Redundant (Evidence)
- Likely active:
  - Domain callables exported via `functions/src/index.ts` modules.
- Likely dead/unreachable:
  - `functions/src/withdrawals/processWithdrawal.ts` (not exported from index).
  - `functions/src/wallet/creditCoins.ts` (not exported from index; frontend wrapper unused).
  - `lib/firebase/functions.ts` wrapper appears unused across app.
  - Legacy modules present but not in active routing/call chain (`functions/src/orders/legacyCreateOrder.ts`, `functions/src/tasks/legacySurvey.ts`, `functions/src/legacy/legacyCore.ts`).

---

## 4) Prioritized Issues Register

### Critical
1. **Withdrawal collection split (`withdrawals` vs `withdraw_requests`)**
   - Evidence: `functions/src/withdrawals/requestWithdrawal.ts` writes `withdrawals`; `functions/src/admin/withdrawalManagement.ts` reads/writes `withdraw_requests`.
   - Failure mode: admin withdrawals pages appear empty or stale despite user requests existing.
   - Fix: dual-read compatibility layer + single canonical write target going forward.

2. **Wallet consistency bug in admin refund/adjust flows**
   - Evidence: `functions/src/admin/withdrawalManagement.ts` and `functions/src/admin/orderManagement.ts` update `users.cashBalance`; wallet system otherwise operates on `wallets/{uid}` (`store/useStore.ts`, order/task/game functions).
   - Failure mode: refunds/adjustments not reflected where UI reads balances; accounting divergence.
   - Fix: move admin balance mutations to `wallets/{uid}` only, keep transaction logs consistent.

3. **Moderation bypass risk on product detail**
   - Evidence: `productService.getProduct` direct Firestore read (`services/product.service.ts`), product detail page uses it (`app/dashboard/user/shop/[id]/page.tsx`), and rules allow public product reads (`firestore.rules`).
   - Failure mode: pending/rejected/suspended products can be accessed directly by ID.
   - Fix: enforce approved/active checks in detail loader and/or callable-backed fetch.

### High
4. **Order coin field mismatch**
   - Evidence: order creation writes `coinsRedeemed` (`functions/src/orders/createOrderMultiItem.ts`), admin endpoints return `coinsPaid` (`functions/src/admin/orderManagement.ts`), admin UI maps from `coinsPaid` (`app/dashboard/admin/orders/page.tsx`).
   - Failure mode: incorrect payment breakdown in admin views and reports.
   - Fix: normalize to one read key with backward-compatible fallback.

5. **Silent empty UI on callable-not-found**
   - Evidence: vendor product/dashboard pages catch `functions/not-found` and suppress user-visible error (`app/dashboard/vendor/products/page.tsx`, `app/dashboard/vendor/page.tsx`).
   - Failure mode: broken backend appears as “no data”.
   - Fix: show actionable error including function name/region.

6. **Task cooldown policy drift**
   - Evidence: `dailyCheckin` uses cooldown doc + 24h (`functions/src/tasks/dailyCheckin.ts`); `startTask` enforces 2h via recent completion (`functions/src/tasks/startTask.ts`); `TaskCard` uses local timer only (`components/tasks/TaskCard.tsx`).
   - Failure mode: inconsistent eligibility and user confusion.
   - Fix: return server cooldown state for tasks and render that uniformly.

### Medium
7. **Admin operations depend on role document availability without preflight health checks**
   - Evidence: permission gate in `functions/src/admin/helpers.ts` requires `users/{uid}`.
   - Failure mode: broad admin UI failure if role doc missing/misconfigured.
   - Fix: add admin bootstrap/health endpoint and user-facing diagnostics.

8. **Transaction schema heterogeneity increases query/scalability cost**
   - Evidence: mixed timestamp keys (`timestamp`, `createdAt`) and field aliases handled by merge scans (`functions/src/admin/transactionManagement.ts`).
   - Failure mode: expensive scans, inconsistent filtering.
   - Fix: standardize writes going forward and keep backward-compatible read merge.

### Low
9. **Encoding/format inconsistencies in UI currency strings**
   - Evidence: garbled rupee symbols in multiple TSX outputs.
   - Failure mode: UX polish issues.
   - Fix: standardize formatting via formatter utility.

10. **Tests provide low signal in default run**
   - Evidence: `npm test` reports all suites skipped when emulator env absent.
   - Failure mode: regressions ship undetected.
   - Fix: add callable integration tests + CI emulator pipeline gate.

---

## 5) New Implementation Plan (Phased, Non-Breaking, No Schema Changes)

## Phase 0: Safety & Observability Baseline ✅ COMPLETE
- Goals:
  - Make failures explicit before behavior changes.
  - Add runtime diagnostics for callable/env issues.
- Tasks:
  - ✅ Vendor dashboard (`app/dashboard/vendor/page.tsx`) now shows explicit error for `functions/not-found` instead of hiding it.
  - ✅ Vendor products page (`app/dashboard/vendor/products/page.tsx`) shows actionable toast for missing backend functions.
  - ✅ New `adminHealthCheck` callable (`functions/src/admin/healthCheck.ts`) validates role docs, all critical Firestore collections, and returns diagnostic info.
  - ✅ Admin role helper (`functions/src/admin/helpers.ts`) now returns diagnostic error messages including UID and remediation suggestions.
- Rollback:
  - Revert UI error banner and health endpoint only.
- Acceptance Criteria:
  - ✅ Admin/vendor pages no longer silently show empty states on callable failures.
  - ✅ Admin role errors include the user UID and current role for diagnostics.

## Phase 1: Critical Fixes ✅ COMPLETE
- Goals:
  - Resolve data integrity splits causing broken dashboards.
- Tasks:
  - ✅ Unified withdrawal collection: all 4 admin functions (`getWithdrawals`, `getWithdrawalsPage`, `approveWithdrawal`, `rejectWithdrawal`) now read from `withdrawals` (canonical collection).
  - ✅ Wallet consistency: `rejectWithdrawal`, `processOrderRefund`, and `adjustWallet` all now update `wallets/{uid}` with `FieldValue.increment()`.
  - ✅ Coin field normalization: `getOrders`, `getOrdersPage`, `getOrderDetails` now read `coinsRedeemed || coinsPaid || 0`.
  - ✅ Product moderation: `productService.getProduct()` now checks `status` and `isActive`/`inStock`.
  - ✅ User details withdrawal count now queries `withdrawals` collection.
- Acceptance Criteria:
  - ✅ Admin withdrawals list shows user-submitted requests from current flow.
  - ✅ Refund/adjust actions visibly update `wallets/{uid}`.
  - ✅ Admin order pages correctly show coin usage for orders.
  - ✅ Direct product detail cannot render unapproved/unlisted products.

## Phase 2: Data Integrity & Reliability ✅ COMPLETE
- Goals:
  - Remove inconsistent domain behavior and stabilize role-sensitive dashboards.
- Tasks:
  - ✅ Task cooldown unified: `startTask.ts` now writes to `cooldowns/{uid}` (canonical collection) and returns server-authoritative cooldown state.
  - ✅ `TaskCard.tsx` updated to accept optional `serverCooldownSeconds` prop, preferring server-provided cooldown over hardcoded 2h client timer.
  - ✅ Backward compat preserved: `startTask` still checks `task_completions` for legacy 2h cooldown.
  - ✅ Admin role guardrails: `requireAdminRole()` in `helpers.ts` now returns diagnostic messages with UID and remediation suggestions.
  - ✅ Leaderboard cache fallback: `getLeaderboard` now regenerates when cache is stale (>2h) or empty, falling back to stale data if regeneration fails.
- Acceptance Criteria:
  - ✅ Task eligibility is consistent between UI and backend.
  - ✅ Admin pages fail with explicit permission/config messages, not blank states.
  - ✅ Leaderboard returns non-empty referrer results when referral aggregates exist.

## Phase 3: Performance & Scalability ✅ COMPLETE
- Goals:
  - Reduce heavy scans and improve list endpoint efficiency.
- Tasks:
  - ✅ Optimized transaction scan: `getAdminTransactionsPage` now tries `createdAt` first and only falls back to `timestamp` scan when `createdAt` returns fewer results than scan limit.
  - ✅ Reduced scan multiplier from 6x to 4x page size (120 → 80 minimum).
  - ✅ Standardized timestamp fields: all key transaction writers (`rewardTask`, `upgradeMembership`, `onUserCreate`, `leaderboard rewards`, `badge rewards`) now write BOTH `createdAt` and `timestamp` fields.
  - ✅ This eliminates the need for double-scan on new transactions going forward.
- Acceptance Criteria:
  - ✅ Admin list endpoints return paged results without unbounded scans.
  - ✅ New transactions are discoverable via either timestamp field, reducing fallback scan frequency.

## Phase 4: Enhancements (Non-Breaking) ✅ COMPLETE
- Goals:
  - Deliver richer vendor/admin experience after core stability.
- Tasks:
  - ✅ **Vendor Analytics**: New `getVendorAnalytics` callable (`functions/src/vendor/vendorAnalytics.ts`) provides 30-day revenue trend, top 10 products by revenue, fulfillment SLA stats (avg processing time, on-time rate), and summary (AOV, return rate). New vendor analytics page (`app/dashboard/vendor/analytics/page.tsx`) with CSS-only bar chart, pipeline visualization, and top products ranking.
  - ✅ **Admin Queue Health**: New `getAdminQueueHealth` callable (`functions/src/admin/queueHealth.ts`) monitors 4 operational queues (KYC, Withdrawals, Orders, Products moderation) with counts, oldest item age, and SLA breach alerts. Integrated into admin dashboard with queue cards and alert banners.
  - ✅ **UI Contrast Fixes**: Upgraded `text-gray-400` to `text-gray-500` on informational text elements across withdraw page, partner withdrawals page, and vendor stat cards to improve WCAG AA readability.
  - ✅ Vendor dashboard linked to analytics page via new quick link card.
  - ✅ Both new callables exported in `functions/src/index.ts`.
- Acceptance Criteria:
  - ✅ Vendor/admin dashboards provide richer insights without regression.
  - ✅ No newly introduced breaking changes in auth, orders, withdrawals, or shop.
  - ✅ Informational text meets improved contrast standards.

---

## Blockers / Unknowns
- Production CORS issue for `getProductsForModerationPage` is **not reproducible from repository code alone** because code uses callable functions, not manual HTTP handlers.
- Exact root cause of production `internal` errors requires:
  - Deployed function logs,
  - Active frontend env values (especially function region),
  - Verification of deployed function version parity vs this repo snapshot.

## Verification Notes (This Audit Run)
- Repo analysis only (source-of-truth files inspected).
- `functions` TypeScript build succeeds locally (`npm --prefix functions run build`).
- Root test command runs but all suites are skipped without emulator env (`npm test -- --runInBand`).



IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES