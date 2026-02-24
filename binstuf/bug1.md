# ThinkMart Critical Fixes + Feature Expansion — Agent-Grade Implementation Prompt
## (Firebase Auth + Firestore + Cloud Functions + Next.js/React Dashboard)

You are a **code-focused autonomous engineering agent** working inside an existing ThinkMart repository. Your task is to **fix multiple production-breaking issues** across User/Vendor/Admin dashboards and implement missing platform mechanics (cooldowns, cancellations, richer vendor features). This prompt is intentionally strict and explicit to minimize ambiguity and enable correct code generation on the first pass.

---

## 0) Non-Negotiable Operating Rules

### 0.1 Repository-first (no guessing)
Before changing code, **scan the repo** and identify:
- Routing system (Next.js App Router vs Pages Router vs React Router)
- Firebase initialization (client SDK config, Admin SDK usage, env var loading)
- Firestore collections used for: products, orders, users, referrals/leaderboard, memberships, tasks, spin/luckybox, admin stats
- Cloud Functions implementation style (callable vs HTTP onRequest, express router or single handlers)
- Firestore security rules file(s) and any emulator tests

All major claims must include **evidence pointers**:
- file path(s)
- function/component names
- relevant snippet or line ranges (if available)

If you cannot verify something, label it: **Assumption (unverified)** and explain how to confirm.

---

## 1) Mission and Success Criteria

### 1.1 Mission
Fix and implement the following (all are mandatory):
1) Add **cooldown timers** on **Spin**, **Lucky Box**, and **Tasks** (server-enforced + UI countdown)
2) Fix **UI text contrast** (white text on white background)
3) Fix **User Shop products missing** at `/dashboard/user/shop`
4) Allow **user cancel order** while order is still **pending**
5) Fix **Leaderboard: top referrers not showing**
6) Fix **Membership UI**: after upgrading, sidebar still shows “Upgrade Plan”
7) Fix **Vendor products not visible** at `/dashboard/vendor/products` after adding
8) Fix **Vendor orders not visible** at `/dashboard/vendor/orders`
9) Enhance vendor dashboard with **full e-commerce rich features**
10) Fix **Admin dashboard completely broken**:
   - Admin main dashboard loads nothing
   - 500 errors when fetching admin stats
   - Users page empty `/dashboard/admin/users`
   - Partners page empty `/dashboard/admin/partners`
   - Transactions page missing details `/dashboard/admin/transactions`
   - Products moderation function blocked by CORS:
     `getProductsForModerationPage` preflight fails (no Access-Control-Allow-Origin)
11) Ensure all admin features become functional with correct RBAC/security.

### 1.2 Definition of “Done”
This is complete only when:
- All dashboards load expected data in **production** (deployed domain) and **localhost**
- No CORS blocks for Cloud Functions called from the deployed site
- No Firestore “internal” errors without surfaced explanation and server logs
- Cooldowns are enforced server-side (cannot bypass by editing client state)
- Lists are paginated (no full scans) and empty states only show when truly empty
- Vendor and admin cannot access data they should not (rules enforce scope)

---

## 2) Hard Constraints (Do Not Violate)

### 2.1 Firestore schema safety
- Do NOT rename or delete existing collections/fields.
- You may add new optional fields and new collections.
- New fields must be backward compatible and safe defaults.

### 2.2 Security is not UI
- UI hiding is not security.
- Vendor/admin access must be enforced via:
  - Firestore rules (for client reads/writes) and/or
  - Cloud Functions using Admin SDK (recommended for admin operations)

### 2.3 Production-only bugs must be debugged, not guessed
Any “works locally, fails after deploy” issue must be traced through:
- env var differences
- Firebase authorized domains
- Cloud Functions CORS
- auth token/claims differences
- Firestore rules differences between emulator and prod

---

## 3) Required Deliverables (Your Output Must Include)

1) **Repo Findings Summary**
   - Stack, routing, Firebase setup, collection map, functions map, RBAC model
2) **Root Cause Analysis** for each broken feature (with file-level evidence)
3) **Fix Plan + Exact Code Changes**
   - which files/modules to edit/add
   - what to change, step-by-step
4) **Cloud Functions & CORS Fix Plan**
   - exact headers and preflight handling
   - deployment considerations
5) **Firestore Rules Changes** + **Rules Emulator Tests**
6) **Acceptance Criteria Checklist** (per item)
7) **Manual Test Plan** (localhost + production steps)

---

## 4) Implementation Requirements by Area

---

# A) Cooldown Timers (Spin, Lucky Box, Tasks)

### A.1 Problem
Cooldowns currently missing or client-only, allowing abuse and inconsistency.

### A.2 Requirements (Server-Enforced)
Cooldown must be enforced by backend (Cloud Function recommended):
- Each action must store:
  - `lastUsedAt`
  - `nextAvailableAt`
  - optional `usesRemaining` (if daily limited)
- Use **server timestamp** (not client device time).

### A.3 Data Model (Additive, Backward Compatible)
If no existing cooldown storage exists, add:
- `cooldowns/{uid}` document:
  ```ts
  {
    spin: { lastUsedAt: Timestamp, nextAvailableAt: Timestamp },
    luckyBox: { lastUsedAt: Timestamp, nextAvailableAt: Timestamp },
    tasks: { lastUsedAt: Timestamp, nextAvailableAt: Timestamp }
  }
````

Alternative: subcollection `cooldowns/{uid}/actions/{actionName}` if preferred.

### A.4 API Design

Create or refactor server endpoints/functions:

* `POST /spin` (or `spinWheel` callable): validates cooldown → awards reward → updates cooldown
* `POST /luckybox/open`: validates cooldown → awards reward → updates cooldown
* `POST /tasks/claim`: validates cooldown/eligibility → awards → updates cooldown

Each must return:

```ts
{
  ok: boolean,
  reward?: {...},
  cooldown: { nextAvailableAt: string, secondsRemaining: number }
}
```

### A.5 UI Requirements

* Show countdown timers in UI for each feature:

  * button disabled while cooling down
  * timer updates every second (client timer) but source of truth is `nextAvailableAt`
* On load: fetch cooldown state once and initialize UI.

### A.6 Acceptance Criteria

* Users cannot trigger spin/luckybox/tasks before cooldown ends even if they manipulate the client.
* UI correctly displays remaining time and re-enables at expiration.

---

# B) UI Contrast (White on White Text)

### B.1 Problem

Some text is invisible due to identical text and background colors.

### B.2 Requirements

* Audit all pages mentioned in this prompt plus global shared components.
* Fix via theme tokens (preferred) rather than per-component hacks:

  * if Tailwind: standardize to readable text colors (`text-gray-900` etc.)
  * if CSS variables: fix `--foreground` / `--muted-foreground` etc.

### B.3 Acceptance Criteria

* No text becomes invisible on white backgrounds across dashboards (user/vendor/admin).

---

# C) User Shop Products Missing (`/dashboard/user/shop`)

### C.1 Symptom

Products disappeared in shop UI.

### C.2 Required Debug Steps

1. Confirm product collection path and document shape.
2. Identify current query in shop page and its filters (status, visibility, moderation flags).
3. Check Firestore rules for product read access in production.
4. Check indexes required for the query (if composite query used).

### C.3 Fix Requirements

* Ensure shop query returns visible products:

  * Must not require admin-only flags unintentionally
  * Must not filter by vendor-only fields incorrectly
* Pagination required:

  * default limit 20
  * support “Load more” or pages
* Proper empty-state only when real result count is 0.

### C.4 Acceptance Criteria

* Shop shows products in production and localhost.

---

# D) User Order Cancel While Pending

### D.1 Problem

User cannot cancel order in pending state.

### D.2 Requirements

Define order status machine (adapt to repo):

* Cancel allowed only when `status == "pending"` (or equivalent)
* Cancel must:

  * update order status to `cancelled`
  * record `cancelReason?`
  * record `cancelledAt`
  * prevent vendor/admin workflow inconsistencies

### D.3 Implementation

* Add “Cancel Order” button on order details page when status is pending.
* Backend enforcement:

  * Prefer Cloud Function `cancelOrder(orderId)` to validate:

    * order belongs to user
    * status is pending
  * If direct Firestore write is used, rules must enforce:

    * user can update only their own order AND only status transition pending→cancelled.

### D.4 Acceptance Criteria

* User can cancel pending orders; cannot cancel after confirmed/shipped/etc.

---

# E) Leaderboard Top Referrers Not Showing

### E.1 Symptom

Leaderboard shows no top referrers.

### E.2 Required Debug Steps

* Identify referral tracking source:

  * `users.referralsCount`, `referrals` collection, or aggregated leaderboard docs
* Identify leaderboard query and sorting rules
* Check Firestore indexes and rules for read access
* Check if referral count is being written consistently

### E.3 Fix Requirements (Performance Safe)

Preferred approach:

* Maintain aggregate fields:

  * `users/{uid}.referralCount`
* Leaderboard query:

  * orderBy `referralCount desc`, limit 50
  * server-side pagination if needed
    If referralCount isn’t reliable:
* Create scheduled aggregation:

  * `leaderboards/topReferrers` updated by function (daily)

### E.4 Acceptance Criteria

* Top referrers list displays correctly and updates as referrals occur.

---

# F) Membership Sidebar Still Shows “Upgrade Plan” After Upgrade

### F.1 Symptom

User upgrades membership, but sidebar still shows upgrade CTA.

### F.2 Root Causes to Check

* membership state stored in Firestore but UI uses cached state
* auth claims not refreshed
* user context not re-fetching after upgrade

### F.3 Fix Requirements

* Establish one source of truth:

  * either `users/{uid}.membershipPlan` or auth custom claim
* Ensure UI state updates after purchase/upgrade:

  * re-fetch user doc on upgrade success
  * if using custom claims, force token refresh (`getIdToken(true)`)
* Sidebar must render based on updated state.

### F.4 Acceptance Criteria

* Immediately after upgrade, sidebar reflects correct plan without requiring logout/login.

---

# G) Vendor Dashboard Broken: Products and Orders Not Showing

### G.1 Vendor Products Not Visible (`/dashboard/vendor/products`)

* Confirm how products store vendor identity (`vendorUid`, `ownerId`, etc.)
* Fix vendor products query to match actual stored field
* Ensure rules allow vendor to read their own products only

Acceptance:

* Vendor sees products they created.

### G.2 Vendor Orders Not Visible (`/dashboard/vendor/orders`)

* Confirm order documents contain vendor identifier
* Fix query + rules:

  * Vendor can read only orders that belong to them
* Add pagination and status filters (pending/confirmed/shipped)

Acceptance:

* Vendor sees orders for their products.

---

# H) Enhance Vendor Page With Full E-Commerce Features

### H.1 Required Vendor Features (Implement as Phase 2 after fixes)

Vendor dashboard must include:

1. **Products management**

   * list/search/filter, status (active/draft/out-of-stock)
   * edit product, archive product
   * inventory stock field + low-stock indicator
2. **Orders management**

   * order list with status filters
   * order detail view
   * allowed vendor status transitions (define explicitly)
3. **Store profile**

   * logo/banner, contact, address, payout settings
4. **Analytics**

   * total orders, revenue, top products, recent trend chart
   * must be aggregated (no full scans)
5. **Customer messages/notes (optional)**

   * if messaging exists, integrate; else omit

### H.2 Technical Notes

* Use server-driven queries for large lists.
* Use small aggregation docs updated by triggers (on order created/updated).

Acceptance:

* Vendor dashboard feels like a real marketplace backend and remains performant.

---

# I) Admin Dashboard Completely Broken (Critical)

## I.1 Symptoms (Must Fix All)

* Admin main dashboard: 500 + FirebaseError internal
* Cannot see any users `/dashboard/admin/users`
* Product moderation function blocked by CORS:

  * `getProductsForModerationPage` preflight fails:
    `No 'Access-Control-Allow-Origin' header`
* Cannot see partners `/dashboard/admin/partners`
* Admin transactions page lacks detail fields

## I.2 Required Root Cause Checks

1. Confirm admin auth model:

   * `role=admin` in users doc? custom claims? separate admin collection?
2. Confirm admin API calls:

   * are they hitting Cloud Functions HTTP endpoints?
   * do they include auth tokens?
3. Confirm Cloud Functions CORS:

   * preflight OPTIONS must return correct headers
   * Access-Control-Allow-Origin must match production origin(s)
4. Confirm Firestore rules deny direct client access to admin data (expected) BUT then ensure admin routes use server functions properly.
5. Inspect admin stats function:

   * identify what Firestore reads it does
   * ensure it does not scan huge collections
   * add structured error logging and safe fallbacks

## I.3 CORS Fix Requirements (Must Be Explicit)

For any HTTP function called from browser:

* Must respond to OPTIONS with:

  * `Access-Control-Allow-Origin: https://thinkmart.in` (and localhost in dev)
  * `Access-Control-Allow-Methods: GET,POST,OPTIONS`
  * `Access-Control-Allow-Headers: Content-Type, Authorization`
  * `Access-Control-Allow-Credentials` only if cookies used (usually false for Firebase)
* Actual response must include `Access-Control-Allow-Origin` as well.
* Prefer using a vetted CORS middleware:

  * `cors` npm package with explicit origin allowlist

## I.4 Admin Endpoints Must Verify Auth

Each admin function must:

* verify Firebase ID token from `Authorization: Bearer <token>`
* check role/permission:

  * ADMIN only (or permissioned sub-admin if exists)
* return consistent error JSON for failures:

  ```json
  { "ok": false, "error": { "code": "FORBIDDEN", "message": "..." } }
  ```

## I.5 Admin Data Requirements

### Admin Stats

* must not full-scan collections in production
* use aggregated counters if possible:

  * `adminMetrics/realtime` doc updated by triggers
    If metrics do not exist, implement minimal counters:
* update counts on user/product/order creation triggers

### Admin Users Page

* implement server endpoint:

  * `GET /admin/users?page&limit&search`
* results must be paginated and filterable
* return minimal fields needed for listing

### Admin Partners Page

* ensure partners are stored consistently (collection name, field mapping)
* implement paginated endpoint and UI listing

### Admin Transactions Page

* enrich transaction items with:

  * sender uid/name
  * receiver uid/name
  * referenceId (order/withdrawal/etc.)
    If current data lacks these, add forward-compatible fields or join via secondary fetch:
* Prefer storing `fromUid`, `toUid`, `fromName`, `toName` on transaction records at write-time
* Avoid N+1 joins in UI; provide enriched server response.

## I.6 Acceptance Criteria (Admin)

* No admin route is blank due to CORS/500 errors.
* Admin stats loads successfully in production.
* Admin can view users, partners, and transactions with details.
* Non-admin users cannot access admin endpoints (403).

---

## 5) Phased Execution Plan (Required Order)

### Phase 1 — Ship-Blocking Fixes (Do First)

1. Fix CORS + admin endpoints auth verification
2. Fix admin dashboard 500/internal errors with logging
3. Fix shop products missing
4. Fix vendor products/orders visibility
5. Fix membership sidebar state update
6. Fix leaderboard top referrers
7. Implement order cancellation pending→cancelled
8. Fix text contrast issues globally
9. Add cooldowns (spin/luckybox/tasks) server-side + UI

### Phase 2 — Enhancements

* Full vendor ecommerce rich features (analytics, inventory, order management UI)
* Admin transactions enrichment improvements

---

## 6) Testing Requirements (Must Implement)

### 6.1 Firestore Rules Emulator Tests

Add tests proving:

* user reads only their orders
* vendor reads only their products/orders
* admin endpoints require admin auth (server verified)
* client cannot call privileged writes directly

### 6.2 Integration Tests (Minimum)

* CORS preflight returns correct headers for production origin
* admin stats endpoint returns ok in emulator
* cooldown enforcement test: action blocked before nextAvailableAt

---

## 7) Final Response Format (Strict)

Your final response must include:

1. Repo findings (paths, collections, functions)
2. Root causes list (per issue) + evidence
3. Fix plan + file/module change list
4. CORS + admin auth verification design (explicit headers and token verification)
5. Firestore rules changes + tests plan
6. Acceptance checklist (each bullet must map to an issue)
7. Manual test steps (localhost + deployed)

---

## Start Now

Begin by scanning:

* admin dashboard code paths (routes, API client calls)
* cloud functions `getProductsForModerationPage` and admin stats function
* Firestore rules relevant to orders/products/admin
* user shop query code
  Then implement Phase 1 fixes in order, with tests.

IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES