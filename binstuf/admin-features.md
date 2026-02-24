## ThinkMart Admin Dashboard Expansion — Agent-Grade Implementation Prompt (Firestore + Cloud Functions + RBAC)

You are a **code-focused autonomous engineering agent** implementing and upgrading the **ThinkMart Admin Dashboard** into a **production-grade, “full control panel”**. You must generate **maintainable code**, **secure APIs**, and **testable behaviors** on the first pass, using the existing repository as the source of truth.

This prompt is intentionally strict to prevent ambiguous output and to ensure safe changes in a live economy system.

---

# 0) Mission & Outcome

## 0.1 Goal

Expand the Admin Dashboard to support:

* **Real-time platform analytics**
* **User + KYC management**
* **Financial operations (withdrawals, wallet adjustments, commission logs)**
* **Marketplace moderation (products, vendors, orders)**
* **Task/gamification controls**
* **Partner + organization management**
* **Global system settings**
* **Audit logs + optional feature flags + notifications**

## 0.2 Required deliverables (must be produced)

You must output:

1. **Admin Panel UI page structure** (routes/pages/components, and why each exists)
2. **Firestore collection usage plan** (schema-safe, non-breaking)
3. **API endpoints + Cloud Functions list** (request/response shapes + auth)
4. **Security enforcement plan** (RBAC + Firestore rules alignment)
5. **Implementation phases** (Phase 1/2/3) with **acceptance criteria**
6. **Enhancement plan for already-implemented features** (identify + improve safely)

---

# 1) Hard Constraints (Non-Negotiable)

## 1.1 Firestore schema safety

* **Do not introduce destructive schema changes.**
* You may add **new collections/documents** if needed, but you must **not** rename/delete/reshape existing collections or fields.
* If you must add new fields to existing documents, they must be **optional**, default-safe, and backward compatible.

## 1.2 Do not break production money flows

Any change touching:

* wallet balances
* withdrawals
* commissions
* partner payouts
  must be **idempotent**, **audited**, and **safe under concurrency**.

## 1.3 Server-side authorization is mandatory

* UI hiding is not security.
* Every admin operation must be protected by:

  * backend RBAC checks (API/Cloud Function guard), AND
  * Firestore security rules (deny direct client writes to privileged collections).

## 1.4 Evidence-based integration

* If a feature appears already implemented, you must **reuse and enhance** it, not rewrite it blindly.
* You must identify existing code locations and explain how your changes integrate.

---

# 2) Role Model & Security Expectations (Authoritative)

Roles:

* USER
* PARTNER
* VENDOR
* ADMIN
* SUB_ADMIN

Admin dashboard is accessible only by:

* ADMIN (full access)
* SUB_ADMIN (limited access via explicit permissions)

### Sub-admin permissions (mandatory)

Implement a permission model such as:

* `users.read`, `users.write`
* `kyc.read`, `kyc.approve`
* `withdrawals.read`, `withdrawals.approve`
* `wallet.adjust`
* `marketplace.moderate`, `orders.manage`, `vendors.manage`
* `tasks.manage`, `games.configure`
* `partners.manage`, `orgs.manage`, `commissions.configure`
* `settings.manage`, `featureflags.manage`, `notifications.send`
* `auditlogs.read`

**Rule:** Every sub-admin action must check permissions explicitly.

---

# 3) Architecture Requirements (How to Build It)

## 3.1 Must use a “thin controller / function” pattern

* UI → calls API/Cloud Function
* API/Function → validates input → checks permissions → calls service
* Service → implements business rules and DB operations
* DB layer → performs Firestore reads/writes using safe patterns

**Why:** Prevent duplicated logic across endpoints and make auditing easier.

## 3.2 Sensitive operations must be transactional or safely idempotent

For withdrawals, wallet adjustments, commission payouts:

* Use Firestore transactions where possible.
* Use idempotency keys / request IDs to prevent double execution.
* Store immutable ledger records (append-only).

---

# 4) Admin Panel UI Page Structure (Required)

Implement the following admin route groups. Names can match your stack (Next.js routes, React Router, etc.), but must remain **separated and discoverable**:

### 4.1 `/admin/overview`

* Real-time stats cards
* Revenue summaries
* Quick links to queues (KYC, withdrawals, moderation)

### 4.2 `/admin/analytics`

* Revenue dashboard (daily/weekly/monthly)
* Growth charts (optional Phase 3)
* City-wise breakdown

### 4.3 `/admin/users`

* User list (search/filter/pagination)
* User detail page: wallet, transactions, referrals, withdrawals, orders

### 4.4 `/admin/kyc`

* KYC queue (pending/approved/rejected)
* Review panel with document viewer + approve/reject + audit trail

### 4.5 `/admin/finance`

* Withdrawal queue + approval workflow
* Withdrawal history filters
* Wallet adjustments tool (reason required)
* Commission logs (partner/org/referral/city distributions)

### 4.6 `/admin/marketplace`

* Product moderation queue
* Vendor management (verify/suspend)
* Orders management + disputes/refunds (if applicable)

### 4.7 `/admin/tasks`

* Task CRUD (create/edit/archive)
* Reward rule editor
* Task analytics (Phase 3)

### 4.8 `/admin/games`

* Spin wheel config
* Lucky box probabilities
* Cooldowns/caps

### 4.9 `/admin/partners-orgs`

* Partners list + city assignments + earnings
* City share configuration (cap enforcement)
* Organizations list + referral members + commissions

### 4.10 `/admin/settings`

* Global economy rules (limits, cooldowns, conversion rates, fees)
* Feature flags (Phase 3)
* Notification center (Phase 3)
* Audit log viewer

**UI requirements**

* Search + filtering must be server-driven (no loading everything client-side).
* Pagination everywhere for large lists.
* Loading and error states for every panel.
* Confirm dialogs for irreversible actions (ban, approve withdrawal, etc.).

---

# 5) Firestore Collections Plan (Schema-Safe, Non-Breaking)

You must produce a “collection usage map” that includes:

* which collections already exist (discovered from code),
* which collections you will add (if needed),
* what each doc contains at a high level,
* required indexes (conceptual),
* and which collections must be admin-only writable.

### 5.1 Minimum collections typically required (adapt to existing repo)

You must map to current implementation; only add if missing:

* `users` (profile, role, city, status)
* `wallets` or wallet fields within users (balances)
* `transactions` / `ledger` (append-only records)
* `withdrawals` (requests + status + processing info)
* `kycSubmissions` (docs/metadata/status/history)
* `partners` (city assignment, share %, wallet)
* `organizations` (referral code, members, commissions)
* `vendorProfiles`
* `products`
* `orders`
* `tasks`
* `gameConfigs`
* `adminSettings`
* `featureFlags` (optional Phase 3)
* `auditLogs` (immutable)

### 5.2 Immutable logging rule (critical)

* `transactions`/`ledger` and `auditLogs` must be append-only.
* Corrections are done via compensating entries, not edits.

---

# 6) API / Cloud Functions List (You Must Define Precisely)

You must produce a complete list of endpoints/functions including:

* Name/path
* Auth requirement (ADMIN only vs SUB_ADMIN permission)
* Request schema (fields + types)
* Validation rules
* Response schema
* Errors (codes + messages)
* Idempotency strategy for sensitive ops

### 6.1 Must-have endpoints/functions (Phase 1)

**Analytics**

* `GET /admin/stats/realtime`
* `GET /admin/revenue/summary?range=day|week|month`
* `GET /admin/cities/summary?range=...`

**Users**

* `GET /admin/users?search=&role=&city=&status=&page=&limit=`
* `GET /admin/users/:uid`
* `POST /admin/users/:uid/role` (logged)
* `POST /admin/users/:uid/status` (ban/suspend/reactivate)
* `POST /admin/users/:uid/wallet-adjust` (reason required, ledger entry required)

**KYC**

* `GET /admin/kyc?status=pending|approved|rejected&page=&limit=`
* `POST /admin/kyc/:submissionId/approve`
* `POST /admin/kyc/:submissionId/reject` (reason required)

**Withdrawals**

* `GET /admin/withdrawals?status=&uid=&min=&max=&from=&to=&page=&limit=`
* `POST /admin/withdrawals/:withdrawalId/approve` (idempotent)
* `POST /admin/withdrawals/:withdrawalId/reject` (reason required)

**Partners + Commissions**

* `GET /admin/partners?city=&page=&limit=`
* `POST /admin/partners/:partnerId/assign-city`
* `POST /admin/partners/:partnerId/set-share` (cap validation)
* `GET /admin/commissions?type=&city=&uid=&from=&to=&page=&limit=`

**Settings**

* `GET /admin/settings`
* `POST /admin/settings` (validated, logged)

### 6.2 Phase 2 endpoints/functions (marketplace + audits)

* Product moderation actions
* Vendor verify/suspend
* Orders list + update status + dispute actions
* Audit logs viewer endpoint

### 6.3 Phase 3 endpoints/functions (nice-to-have)

* Feature flags CRUD
* Notification broadcast with segmentation
* Charts + deeper analytics

---

# 7) Firestore Security Rules Enforcement Plan (Required)

You must provide a clear plan for security rules, including:

## 7.1 Core principles

* Clients must not be able to write:

  * roles, permissions, admin settings
  * wallet balances
  * withdrawal status transitions
  * partner share percentages
  * audit logs (except via trusted server if needed)

## 7.2 Recommended pattern

* End-user writes are limited to:

  * creating withdrawal request (not approving)
  * placing orders
  * submitting KYC
  * completing tasks (if permitted)
* Admin writes happen via Cloud Functions/admin backend only.

## 7.3 Verification requirements

* Provide test cases or rule evaluation scenarios:

  * user cannot update role
  * user cannot change wallet balance
  * vendor cannot update other vendor product
  * partner cannot read other city partner data
  * sub-admin cannot perform restricted operations without permission

---

# 8) Feature Implementation Details (What “Done” Looks Like)

For each feature below, you must implement with:

* data model usage (without breaking schema),
* endpoints/functions,
* UI pages,
* validation,
* logging,
* tests,
* and acceptance criteria.

## 8.1 Analytics & Overview

### Real-time stats (Phase 1)

* Must be efficient (no scanning entire collections).
* Use aggregated counters if they exist; otherwise propose safe incremental counters or cached computed metrics.
* Include: total users, active today, daily signups, total revenue.

### Revenue dashboard (Phase 1)

* Daily/weekly/monthly views.
* Include: withdrawals processed, fees/commissions, net profit (define formula explicitly based on existing data).

### Growth charts + trends (Phase 3)

* Use aggregated time-series documents where possible.

### City-wise breakdown (Phase 1/2)

* Users/orders/revenue per city + partner payout tracking.

## 8.2 User Management (Phase 1)

* List + detail views with server-side filters and pagination.
* Role assignment requires audit log entries.
* Account actions: ban/suspend/reactivate.
* Wallet adjustment requires:

  * reason + reference ID,
  * immutable ledger entry,
  * optional admin note.

## 8.3 KYC Verification (Phase 1)

* Queue with approve/reject.
* Store decision history immutably.
* Ensure document access is secure (signed URLs or secure storage rules as per existing system).

## 8.4 Financial Operations (Phase 1/2)

### Withdrawal queue (Phase 1)

* Approve/reject
* Prevent duplicate approval (idempotency key)
* Update wallet/ledger safely (transaction)
* Log every action with admin UID

### Commission logs (Phase 2)

* Unified audit trail for partner/org/referral commissions.
* Filterable by type, city, user, date range.

## 8.5 Marketplace (Phase 2)

* Product moderation with history.
* Order management and safe status transitions.
* Vendor management (verify/suspend).
* Refund workflow if applicable (must be non-destructive and ledger-backed).

## 8.6 Task & Gamification (Phase 2/3)

* Task CRUD (Phase 2)
* Game settings: probabilities/cooldowns/caps (Phase 2)
* Analytics + leaderboard controls (Phase 3)

## 8.7 Partners & Organizations (Phase 1/2)

### Assign cities (Phase 1)

* Multiple partners per city allowed.
* Enforce **total share cap** (≤ 20% per city) OR enforce **≤ 20% per partner** depending on existing business rules.
* If your business rules require both, enforce both.

### Commission rates (Phase 1)

* Admin sets partner share % and org default (10%).
* Validate bounds.
* Log changes.

---

# 9) Implementation Phases + Acceptance Criteria (Mandatory)

## Phase 1 — Must-Have (Ship-Blocking)

Includes:

* Real-time stats
* User list + user details
* KYC verification queue
* Withdrawal queue
* Assign cities
* Commission rate configuration
* App configuration settings

**Acceptance Criteria**

* Only ADMIN/SUB_ADMIN with permissions can access `/admin/*` routes and APIs.
* Every list has pagination and server-side filtering.
* Withdrawal approvals are idempotent (cannot approve twice).
* Wallet adjustments always create ledger entries and require reason + reference ID.
* All admin actions produce audit logs.
* No Firestore schema-breaking changes.

## Phase 2 — Important (Operational Excellence)

Includes:

* Order management
* Vendor moderation + vendor verification
* Commission logs
* Wallet adjustment improvements + strong audit trails
* Partner management analytics
* Audit log viewer

**Acceptance Criteria**

* Vendor/product/order moderation is permission-gated and logged.
* Order status transitions are validated and consistent.
* Commission logs reconcile with payouts/withdrawals (where applicable).

## Phase 3 — Nice-to-Have (Polish & Growth)

Includes:

* Advanced analytics charts
* Notification center
* Feature flags
* Task analytics
* Leaderboard controls
* Category management

**Acceptance Criteria**

* Feature flags safely toggle features without redeploy and without exposing admin-only writes.
* Notification targeting respects RBAC and segmentation rules.
* Charts do not rely on scanning huge collections.

---

# 10) “Already Implemented” Enhancement Requirement (Mandatory)

Before implementing anything, you must:

1. List which of the above features already exist in the repo (with evidence).
2. For each existing feature, propose **safe enhancements**:

   * better validation
   * better RBAC/permissions
   * pagination/performance fixes
   * improved audit logs
   * safer transactions/idempotency
3. Reuse existing modules and refactor minimally.

---

# 11) Output Requirements (How You Must Respond)

Your final response must include:

1. **Repo findings summary** (what exists already + evidence pointers)
2. **Admin UI route/page map** (Phase-tagged)
3. **Firestore collections usage map** (existing vs new, schema-safe)
4. **Endpoint/Function specification** (Phase-tagged, with request/response + auth)
5. **Security rules plan** (what to lock down, how to test)
6. **Step-by-step implementation plan** (phased tasks, ordered, minimal ambiguity)
7. **Acceptance criteria checklist per phase**
8. **Testing strategy** (unit/integration/rules tests + key cases)

---

## Begin Execution

Start by scanning the repository to identify existing admin/dashboard code, Firestore access patterns, Cloud Functions, and current RBAC enforcement. Then produce the deliverables in the required format and implement Phase 1 first with tests.
