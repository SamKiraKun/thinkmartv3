## ThinkMart Admin Dashboard Expansion — Production-Grade Agent Prompt

**Target stack:** Firestore + Cloud Functions + RBAC (+ Firestore Rules)
**Audience:** Code-focused LLM / autonomous engineering agent
**Goal:** Generate correct, secure, maintainable code on the first pass with minimal ambiguity.

---

# 0) Operating Instructions for the Agent

You are a **repository-aware engineering agent**. You will **read the existing codebase first**, then implement changes that **extend** the current system safely.

### You must follow this execution order (non-negotiable)

1. **Repository discovery** (map what exists, don’t guess)
2. **Design + contract definition** (routes, schemas, endpoints, RBAC)
3. **Security model alignment** (backend guards + Firestore rules + tests)
4. **Implement Phase 1** end-to-end with tests and safe migrations
5. **Only after Phase 1 passes**, proceed to Phase 2, then Phase 3
6. if a feature already exists, propose safe enhancements

### Output rules (how you must respond)

Your response must include **all sections listed in “11) Required Output Format”**, with **concrete shapes** (types, schemas, request/response examples) and **explicit file/module targets** (where to implement).

If any detail depends on the repo (e.g., existing collections or auth claims), you must:

* **show evidence pointers** (file paths + symbols/function names), and
* adapt your plan to what’s actually there.

If something is missing, propose a **minimal additive implementation** (no rewrites).

---

# 1) Mission & Desired Outcomes

## 1.1 Business objective

Upgrade the ThinkMart Admin Dashboard into a **production-grade control panel** for:

* **Real-time analytics & reporting**
* **User + KYC operations**
* **Financial operations** (withdrawals, wallet adjustments, commission logs)
* **Marketplace moderation** (products/vendors/orders)
* **Tasks & gamification configs**
* **Partners & organizations management**
* **Global settings**
* **Audit logs, feature flags, notifications** (Phase 3)

## 1.2 Definition of “production-grade”

The system must be:

* **Secure by default** (server-side auth + rules, least privilege)
* **Safe for money flows** (idempotent, transactional where possible, ledger-backed)
* **Observable** (audit logs + structured logs + failure modes documented)
* **Performant** (server-side pagination/filtering; avoid full scans)
* **Tested** (unit/integration + Firestore rules tests; critical financial invariants)

---

# 2) Hard Constraints

## 2.1 Firestore schema safety (no destructive changes)

* Do **not** rename, delete, or reshape existing collections/fields.
* You may add **new collections** and **optional fields**.
* Any new field added to existing docs must be:

  * optional,
  * default-safe,
  * backward compatible,
  * never required for old code paths.

## 2.2 Money flows must not break

Any operation touching:

* wallet balances
* withdrawals
* commissions/payouts
  must be:
* **idempotent**
* **audited**
* **safe under concurrency**
* **ledger-backed** (append-only record of value movement)

## 2.3 Server-side authorization is mandatory

* UI visibility is **not security**.
* Every privileged action must enforce:

  1. **Cloud Function guard** (RBAC + permission checks), and
  2. **Firestore Rules** denying direct client writes for privileged resources.

## 2.4 Evidence-based integration

* If functionality exists, **reuse + enhance** it.
* You must locate the current implementation and integrate **minimally**.

---

# 3) Security Model: Roles, Permissions, and How Enforcement Works

## 3.1 Roles

* `USER`
* `PARTNER`
* `VENDOR`
* `ADMIN`
* `SUB_ADMIN`

Admin dashboard access:

* `ADMIN`: full access
* `SUB_ADMIN`: **permission-scoped** access only

## 3.2 Sub-admin permission model (required)

Implement permissions as **explicit strings** stored in a trusted location (e.g., custom claims, `adminUsers/{uid}`, or both). Minimum set:

* `users.read`, `users.write`
* `kyc.read`, `kyc.approve`
* `withdrawals.read`, `withdrawals.approve`
* `wallet.adjust`
* `marketplace.moderate`, `orders.manage`, `vendors.manage`
* `tasks.manage`, `games.configure`
* `partners.manage`, `orgs.manage`, `commissions.configure`
* `settings.manage`, `featureflags.manage`, `notifications.send`
* `auditlogs.read`

**Rule:** Every admin action must check the specific permission.
**No permission ⇒ hard deny** (HTTP 403 / function error).

## 3.3 Enforcement layers (must implement both)

1. **Backend Guard (Cloud Functions middleware)**

   * verifies Firebase Auth token
   * loads role + permissions (trusted source)
   * checks required permission for the operation
2. **Firestore Security Rules**

   * deny client writes to privileged collections
   * allow client reads only where appropriate
   * ensure vendors/partners can only access their own data

---

# 4) Architecture Requirements

## 4.1 Thin controller / function pattern (required)

Structure all admin operations as:

* **UI** → calls callable HTTPS function / HTTP endpoint
* **Function handler**:

  * parses + validates request
  * checks RBAC + permission
  * calls service layer
* **Service layer**:

  * business rules (status transitions, caps, validations)
  * transactional writes / idempotency enforcement
* **Repository/DB layer**:

  * Firestore reads/writes with consistent helpers

**Why:** Prevent duplicated logic, reduce privilege leakage, simplify audits and tests.

## 4.2 Sensitive operations: transactional + idempotent (required)

For withdrawals, wallet adjustments, commission payouts:

* Use Firestore **transactions** where feasible.
* Require **idempotency key** / request ID for write operations.
* Write immutable **ledger entries** for every balance movement.

### Standard idempotency pattern (must adopt)

For each sensitive action request:

* client sends `requestId` (UUID)
* backend writes `idempotencyKeys/{requestId}` with:

  * `actionType`, `createdAt`, `actorUid`, `targetRef`, `status`, `resultRef`
* transaction checks:

  * if key exists with success ⇒ return stored result (no duplicate effect)
  * else proceed + mark success with result reference

---

# 5) Admin UI Route / Page Map (must implement)

**Requirement:** All lists are **server-driven** (filtering + pagination done by API).
**Requirement:** All pages include loading, empty, and error states.
**Requirement:** All irreversible actions require confirm dialogs + reason fields where required.

### Phase 1 routes (ship-blocking)

* `/admin/overview`
* `/admin/analytics`
* `/admin/users`
* `/admin/users/:uid`
* `/admin/kyc`
* `/admin/finance`
* `/admin/partners-orgs`
* `/admin/settings`

### Phase 2 routes (ops excellence)

* `/admin/marketplace`
* `/admin/audit-logs`

### Phase 3 routes (polish + growth)

* `/admin/feature-flags`
* `/admin/notifications`
* enhancements to analytics (charts, trends)
* tasks analytics + leaderboard controls

### UI functional requirements

* Search, filtering, pagination everywhere
* Sorting where meaningful (date/status/amount)
* Form validation at UI + backend
* Consistent admin layout shell with navigation
* Permission-aware UI (disable/hide actions) **but still enforce backend**

---

# 6) Firestore Collections Usage Map (schema-safe)

You must produce a “collection usage map” that clearly separates:

* **Existing in repo** (with evidence pointers)
* **Newly added** (only if missing)
* Admin-only writable vs user-writable
* Index requirements (conceptual)

## 6.1 Minimum logical entities (adapt to existing repo names)

* `users` (profile, role, city, status)
* `wallets` or wallet fields inside `users`
* `ledger` (append-only money movements)
* `withdrawals`
* `kycSubmissions`
* `partners`
* `organizations`
* `vendorProfiles`
* `products`
* `orders`
* `tasks`
* `gameConfigs`
* `adminSettings`
* `auditLogs` (immutable)
* `featureFlags` (Phase 3)
* `idempotencyKeys` (required for safe money ops)

## 6.2 Immutable logging rule (critical)

* `ledger` and `auditLogs` must be **append-only**
* Corrections happen via **compensating entries**, never edits

### Ledger entry minimum fields (must specify in implementation)

* `id` (doc id)
* `createdAt`
* `type` (e.g., `WALLET_ADJUST`, `WITHDRAWAL_APPROVE`, `REFUND`, `COMMISSION_PAYOUT`)
* `amount` (signed integer/decimal in smallest currency unit)
* `currency`
* `actorUid` (admin/service)
* `targetUid` (user/vendor/partner)
* `reference` (withdrawalId/orderId/etc.)
* `reason` (required for manual adjustments)
* `beforeBalance`, `afterBalance` (if wallet model supports it)
* `metadata` (structured object)

---

# 7) API / Cloud Functions Specification (precise contracts)

## 7.1 Function style requirement

Choose one consistent style:

* **Callable functions** (`onCall`) OR
* **HTTPS functions** with an express router
  …and document why, based on repo patterns.

All endpoints must define:

* auth requirement (role + permission)
* request schema + validation rules
* response schema
* error codes/messages
* idempotency strategy (if sensitive)

## 7.2 Phase 1 endpoint/function list (must implement)

### Analytics

1. `GET /admin/stats/realtime`

* Auth: `ADMIN` or `SUB_ADMIN` with `analytics.read` (add if missing) OR reuse `auditlogs.read` if repo lacks analytics perms (but document decision).
* Returns:

  * `totalUsers`
  * `activeToday`
  * `dailySignups`
  * `totalRevenue`
  * `pendingKycCount`
  * `pendingWithdrawalsCount`
* Performance requirement: **no full collection scans**; use counters/aggregates or cached docs.

2. `GET /admin/revenue/summary?range=day|week|month`

* Returns: totals for gross, fees, commissions, withdrawals processed, net (define formula).

3. `GET /admin/cities/summary?range=...`

* Returns per-city: users/orders/revenue + partner payouts summary.

### Users

4. `GET /admin/users?search=&role=&city=&status=&page=&limit=`

* Server-side filtering and pagination.
* Must define query strategy (prefix search, index rules, etc.)

5. `GET /admin/users/:uid`

* Returns user profile + wallet + recent ledger/withdrawals/orders references (paginated subqueries)

6. `POST /admin/users/:uid/role`

* Requires permission: `users.write`
* Body: `{ role: "USER"|"VENDOR"|"PARTNER"|"ADMIN"|"SUB_ADMIN", requestId }`
* Must write `auditLogs`

7. `POST /admin/users/:uid/status`

* Permission: `users.write`
* Body: `{ status: "active"|"suspended"|"banned", reason, requestId }`
* Must audit log

8. `POST /admin/users/:uid/wallet-adjust`

* Permission: `wallet.adjust`
* Body: `{ deltaAmount, currency, reason, referenceId, requestId }`
* Must:

  * validate bounds
  * transactionally update wallet
  * append ledger entry
  * write audit log
  * enforce idempotency via `requestId`

### KYC

9. `GET /admin/kyc?status=&page=&limit=`

* Permission: `kyc.read`

10. `POST /admin/kyc/:submissionId/approve`

* Permission: `kyc.approve`
* Body: `{ requestId, note? }`
* Must append decision history immutably + audit log

11. `POST /admin/kyc/:submissionId/reject`

* Permission: `kyc.approve`
* Body: `{ requestId, reason }`
* Must append decision history immutably + audit log

### Withdrawals

12. `GET /admin/withdrawals?...filters...`

* Permission: `withdrawals.read`

13. `POST /admin/withdrawals/:withdrawalId/approve`

* Permission: `withdrawals.approve`
* Body: `{ requestId, processorRef? }`
* Must:

  * validate state transition
  * idempotent
  * transactionally mark withdrawal approved/processed
  * update wallet/ledger safely (depending on current withdrawal model)
  * write audit log

14. `POST /admin/withdrawals/:withdrawalId/reject`

* Permission: `withdrawals.approve`
* Body: `{ requestId, reason }`
* Must:

  * validate transition
  * handle wallet reversals if funds were reserved
  * ledger-backed
  * audit logged

### Partners + Commissions

15. `GET /admin/partners?city=&page=&limit=`

* Permission: `partners.manage`

16. `POST /admin/partners/:partnerId/assign-city`

* Permission: `partners.manage`
* Body: `{ cityId, requestId }`

17. `POST /admin/partners/:partnerId/set-share`

* Permission: `commissions.configure`
* Body: `{ sharePercent, requestId }`
* Must enforce cap rules (see §8)

18. `GET /admin/commissions?type=&city=&uid=&from=&to=&page=&limit=`

* Permission: `auditlogs.read` or `commissions.configure` (document final choice)
* Data source: existing commission records or propose a non-breaking log strategy

### Settings

19. `GET /admin/settings`

* Permission: `settings.manage`

20. `POST /admin/settings`

* Permission: `settings.manage`
* Body: `{ patch: {...}, requestId }`
* Must validate each field + audit log
* Must support forward-compatible settings structure

## 7.3 Phase 2 endpoints/functions (must define now, implement later)

* Product moderation actions (approve/reject/hide)
* Vendor verify/suspend
* Orders list + status transitions + disputes/refunds (ledger-backed if money involved)
* Audit logs viewer endpoint with filtering/pagination

## 7.4 Phase 3 endpoints/functions (define now, optional later)

* Feature flags CRUD
* Notification broadcast with segmentation
* Deep analytics (time-series) without scanning huge collections

---

# 8) Feature-Specific “Done” Criteria (implementation details)

## 8.1 Analytics & Overview

* Use **aggregated counters** (preferred) or **cached computed metrics** (with TTL) if counters don’t exist.
* Must not scan full collections for realtime metrics.
* Must define exactly where aggregates live (e.g., `adminMetrics/realtime`, `adminMetrics/daily/{YYYY-MM-DD}`).

## 8.2 User Management

* List/detail views paginated.
* Role/status changes always emit audit logs.
* Wallet adjustments:

  * require `reason` + `referenceId`
  * ledger entry mandatory
  * idempotent by `requestId`
  * hard bounds (e.g., prevent absurd deltas) and currency validation.

## 8.3 KYC Verification

* Review queue with immutable decision history:

  * do not overwrite decisions; append to `history[]` or subcollection `kycSubmissions/{id}/events`.
* Secure doc access:

  * if using Cloud Storage, provide rule + signed URL approach based on repo patterns.

## 8.4 Financial Operations

### Withdrawals

* Approve/reject must validate state machine:

  * `PENDING → APPROVED|REJECTED`
  * `APPROVED → PROCESSED` (if multi-step exists)
* Must prevent double approval with idempotency.
* Must define whether funds are reserved at request time or deducted at approval time (repo-dependent; document clearly).

## 8.5 Marketplace (Phase 2)

* Moderation is logged.
* Vendor actions are permission-gated.
* Order transitions validated; refunds ledger-backed.

## 8.6 Tasks & Gamification (Phase 2/3)

* CRUD with archive instead of delete.
* Game probabilities/caps validated server-side.

## 8.7 Partners & Orgs

### City share cap enforcement (must implement Phase 1)

You must determine business rule from repo evidence:

* Rule A: total share per city ≤ 20%
* Rule B: each partner ≤ 20%
* Or both
  Implement the rule(s) that match the existing business logic; if unclear, implement **the safer superset** (both), but do not break existing data—only enforce on new updates.

All configuration changes must be audit logged.

---

# 9) Implementation Phases + Acceptance Criteria

## Phase 1 — Ship-Blocking

Includes:

* Real-time stats
* User list + detail
* KYC queue
* Withdrawal queue (approve/reject)
* Partner city assignment
* Commission rate config
* Global settings management
* Audit logs emission for all admin actions

**Acceptance criteria**

* `/admin/*` routes + APIs are restricted to `ADMIN`/`SUB_ADMIN` with permission checks.
* Every list is paginated + server-filtered.
* Withdrawal approval is idempotent (cannot apply twice).
* Wallet adjustments require reason + referenceId + ledger entry.
* All admin actions produce audit logs (append-only).
* No destructive schema changes.

## Phase 2 — Operational Excellence

Includes:

* Marketplace moderation
* Vendor verification/suspension
* Orders management
* Commission logs viewer/reconciliation surfaces
* Audit log viewer UI + endpoint

**Acceptance criteria**

* All moderation actions are permission-gated + audited.
* Order state transitions validated.
* Commission logs can reconcile with payouts/withdrawals where applicable.

## Phase 3 — Growth & Polish

Includes:

* Advanced analytics charts (time-series aggregates)
* Notification center with segmentation
* Feature flags
* Task analytics + leaderboard controls

**Acceptance criteria**

* Feature flags toggle without redeploy and do not weaken security boundaries.
* Notifications respect RBAC + segmentation rules.
* Analytics avoids large scans.

---

# 10) “Already Implemented” Enhancement Requirement

Before writing new modules, you must:

1. List which features already exist with **evidence pointers** (file path + symbol).
2. For each existing feature, propose safe enhancements:

   * validation improvements
   * stricter RBAC
   * pagination/perf fixes
   * audit log coverage gaps
   * transactional safety/idempotency additions
3. Reuse existing modules and refactor minimally.

---

# 11) Required Output Format (your response must follow this)

## 11.1 Repo Findings Summary

* Existing admin UI routes/pages:
* Existing Cloud Functions/endpoints:
* Existing Firestore access patterns:
* Existing RBAC/permissions model:
* Existing collections used and where referenced:
* Gaps vs required Phase 1:

## 11.2 Admin UI Route/Page Map (phase-tagged)

* Route → page component → key child components → required permission(s)

## 11.3 Firestore Collections Usage Map

For each collection:

* Existing/New
* Document shape (high-level fields)
* Read/write actors (user/vendor/partner/admin)
* Index needs (conceptual)
* Notes for backward compatibility

## 11.4 Endpoint/Function Specifications (phase-tagged)

For each endpoint:

* Name/path
* Auth requirements (role + permission)
* Request schema + validations
* Response schema
* Error codes
* Idempotency behavior (if any)
* Audit log event emitted

## 11.5 Security Rules Plan + Test Matrix

* Explicit rule strategy per collection
* Test scenarios (pass/fail) for:

  * user cannot update role
  * user cannot modify wallet
  * vendor cannot modify others’ products
  * partner cannot read other city partner data
  * sub-admin blocked without permission

## 11.6 Step-by-Step Implementation Plan

Ordered checklist including:

* file/module creation targets
* exact refactors (minimal)
* migration steps (if adding optional fields/collections)
* roll-out safety notes

## 11.7 Acceptance Criteria Checklist Per Phase

A tick-box list.

## 11.8 Testing Strategy

* Unit tests (service logic)
* Integration tests (functions)
* Firestore rules tests
* Concurrency/idempotency tests (withdrawal + wallet adjust)
* Suggested CI commands

---

# 12) Begin Execution Instructions (what to do first)

Start by scanning the repository to identify:

* admin UI entry points and routing
* existing Cloud Functions handlers
* Firestore collections and access wrappers
* existing RBAC implementation (custom claims, roles in users doc, etc.)
* any existing ledger/transaction patterns for money flows

Then produce the deliverables in the **Required Output Format** and implement **Phase 1** with tests.

---

## Implementation Notes You Must Respect

* Prefer **additive** design.
* Avoid “rewrite the dashboard” changes.
* Any financial mutation must go through the **service layer** and be **idempotent + audited**.
* All admin-only writes must be blocked at the client rules level and only allowed via backend.
