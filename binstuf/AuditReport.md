# ThinkMart V2 Deep Audit Report

## 3.1 Executive Summary

### Top 5 risks (security/correctness) with immediate fixes
1. **Client-side privileged writes bypass intended server-authoritative design (Critical).**
   - Evidence: `app/dashboard/admin/tasks/create/page.tsx` (`addDoc`), `app/dashboard/admin/tasks/create-video/page.tsx` (`addDoc`), `app/dashboard/admin/partners/manage/page.tsx` (`updateDoc`).
   - Why it matters: admin operations are performed directly from client Firestore SDK and rely only on rules; this increases blast radius, complicates auditability, and conflicts with existing callable-function admin framework in `functions/src/admin/*`.
   - Immediate fix: route all admin mutations through Cloud Functions (`functions/src/admin/userManagement.ts`, `functions/src/admin/taskManagement.ts`, `functions/src/admin/marketplaceManagement.ts`) and remove direct client writes.

2. **Users can self-upgrade privilege in current Firestore rules (Critical).**
   - Evidence: `firestore.rules` allows owner updates on `users/{userId}` while admin checks trust `users/{uid}.role` (`isAdmin`).
   - Why it matters: a user may set their own role to `admin` and inherit admin-only read/write paths.
   - Immediate fix: restrict self-updatable user fields and move role/status writes to callable-only admin flows.

3. **Dual pathway risk from legacy-compat exports and newer domain handlers (High).**
   - Evidence: `functions/src/index.ts` exports both modern and legacy compatibility handlers (e.g., `./orders/createOrderMultiItem`, `./orders/legacyCreateOrder`, `./tasks/legacySurvey`).
   - Why it matters: divergence causes inconsistent validation/idempotency/permissions and hard-to-predict behavior.
   - Immediate fix: define canonical endpoints, deprecate legacy exports, and unify validation/error envelope.

4. **Rules tests are not operational in default local workflow (High).**
   - Evidence: `tests/firestore.rules.test.ts` requires emulator at `localhost:8080`; `cmd /c npm test -- --runInBand` fails with emulator connection errors and `testEnv.cleanup` on undefined.
   - Why it matters: security rules regressions can ship undetected.
   - Immediate fix: use `npm run test:rules` in CI and harden test setup/teardown guards.

5. **Authorization model is split between client route guard and backend checks (Medium/High).**
   - Evidence: `middleware.ts` does not enforce auth/roles; dashboard relies on client-side redirects in `app/dashboard/layout.tsx` and `lib/guards/roleGuard.ts`.
   - Why it matters: UI-level gating is not a security boundary and can cause exposure of data-fetch attempts before redirect.
   - Immediate fix: keep client guard for UX only; enforce all access in rules and callable functions, and reduce direct Firestore writes in pages.

### Top 5 performance wins
1. **Paginate high-volume admin/user lists instead of full fetch + client filtering.**
   - Evidence: `app/dashboard/admin/withdrawals/page.tsx`, `app/dashboard/admin/users/page.tsx`, `app/dashboard/user/tasks/page.tsx`.
2. **Eliminate N+1 reads in review eligibility checks.**
   - Evidence: `services/review.service.ts` (`canUserReview` loops orders and issues per-order review queries).
3. **Move product search/filter/sort to server-backed query/search for shop lists.**
   - Evidence: `app/dashboard/user/shop/page.tsx` fetches all active products then filters/sorts in memory.
4. **Replace `<img>` with `next/image` on major product/order pages/components.**
   - Evidence: lint warnings across `app/dashboard/**` and `components/shop/**`.
5. **Normalize query contracts with cursor pagination for orders/transactions/withdrawals/users.**
   - Evidence: mixed `.limit(100)` patterns and no cursor API in several pages/services.

### Top 5 UX improvements
1. Replace `alert()/prompt()/confirm()` admin workflows with form-based modals and validation summaries.
   - Evidence: `app/dashboard/admin/withdrawals/page.tsx`, `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/cms/page.tsx`, `app/dashboard/user/withdraw/page.tsx`.
2. Fix accessibility attribute and form semantics.
   - Evidence: `app/auth/login/page.tsx` uses `area-label` typo; many icon-only buttons lack accessible labels.
3. Unify error presentation and retry UX for callable failures.
   - Evidence: broad `catch (err: any)` patterns and raw `err.message` display.
4. Improve loading states for data-heavy dashboards with skeletons + empty-state actions.
   - Evidence: multiple pages show only spinner or generic “No data”.
5. Add deterministic user feedback for long-running operations (order placement, withdrawal processing).
   - Evidence: state transitions rely on alerts and full page reloads.

### If we only had 1 week
1. Lock security boundaries: remove direct admin/product mutations from client, enforce callable-only mutation paths.
2. Patch Firestore role escalation risk in users rules and add blocking tests.
3. Stabilize rules testing in CI (`npm run test:rules`) and add critical authorization test cases.
4. Consolidate legacy/new function endpoints for orders/withdrawals/rewards.
5. Introduce cursor pagination on admin withdrawals/users and user orders.

---

## 3.2 Code Quality Findings

### Evidence Index
- `F-001` | High | `services/product.service.ts`, `firestore.rules`, `functions/src/admin/marketplaceManagement.ts` | direct `addDoc/updateDoc/deleteDoc` product mutations from client service | `services/product.service.ts`, product admin/vendor flows
- `F-002` | High | `functions/src/index.ts`, `functions/src/orders/legacyCreateOrder.ts`, `functions/src/tasks/legacySurvey.ts` | canonical and legacy callable exports coexist without explicit governance | `functions/src/index.ts`, `app/dashboard/**`, `services/**`
- `F-003` | High | `lib/firebase/config.ts`, `lib/firebase/firebase.config.ts` | duplicate client Firebase config modules and imports | `lib/firebase/*`, app/services imports
- `F-004` | High | `app/dashboard/admin/tasks/create/page.tsx`, `app/dashboard/admin/tasks/create-video/page.tsx`, `app/dashboard/admin/partners/manage/page.tsx` | direct `addDoc/updateDoc` privileged mutations from client | admin dashboard pages + callable layer
- `F-005` | Medium | `app/dashboard/user/tasks/page.tsx` | `debugCreateTask` (dead debug path), unused imports | `app/dashboard/user/tasks/page.tsx`
- `F-006` | Medium | `app/dashboard/admin/users/page.tsx`, `lib/types/roles.ts` | narrowed role union in UI (`user|admin|partner`) | `app/dashboard/admin/users/page.tsx`
- `F-007` | Medium | `services/order.service.ts`, multiple pages/services | `catch (error: any)`, inconsistent error handling | `services/*`, `app/dashboard/**`
- `F-008` | Medium | `app/auth/login/page.tsx`, `app/auth/register/page.tsx` | mixed redirect mechanics (`window.location.href`, router push), typos | auth pages

### F-001 Product mutations still bypass backend audit boundary
- **Severity:** High
- **Evidence:** `services/product.service.ts` (`addProduct`, `updateProduct`, `deleteProduct`) performs direct Firestore writes from client context.
- **Problem:** product lifecycle mutations are client-authoritative instead of callable-authoritative.
- **Why it matters:** weaker auditability/idempotency and larger blast radius under rules drift.
- **Fix plan:**
  1. Move create/update/delete product mutations into callable handlers under `functions/src/admin/*` or `functions/src/vendor/*`.
  2. Keep client service as transport wrapper around callables only.
  3. Preserve image upload via existing `uploadProductImage` callable path.
- **Acceptance criteria:**
  - No direct Firestore mutation calls for product writes in `services/product.service.ts`.
  - Product create/edit/delete succeeds through callable endpoints with audit fields.
- **Estimated effort:** M

### F-002 Canonical vs legacy callable surface is not explicitly governed
- **Severity:** High
- **Evidence:** `functions/src/index.ts` exports both canonical handlers and compatibility paths (e.g., `./orders/createOrderMultiItem` with `./orders/legacyCreateOrder`, `./tasks/submitSurveyAnswer` with `./tasks/legacySurvey`).
- **Problem:** clients can continue binding to legacy callables with weaker/older contracts.
- **Why it matters:** validation and behavior divergence can persist silently.
- **Fix plan:**
  1. Publish canonical callable contract map by domain.
  2. Add deprecation metadata and timeline for legacy callables.
  3. Add CI grep check to prevent new client references to deprecated callables.
- **Acceptance criteria:**
  - Single canonical endpoint documented per operation.
  - No new client references to deprecated callables.
- **Estimated effort:** M

### F-003 Initialization/config duplication
- **Severity:** High
- **Evidence:** `lib/firebase/config.ts` and `lib/firebase/firebase.config.ts` duplicate client Firebase setup modules.
- **Problem:** duplicate configs increase drift risk and runtime confusion.
- **Why it matters:** environment inconsistencies and hard-to-debug behavior.
- **Fix plan:**
  1. Consolidate client Firebase config module.
  2. Enforce one admin init path in functions.
  3. Update imports to single source.
- **Acceptance criteria:**
  - One client config module; one admin init path.
- **Estimated effort:** S
---


## 3.3 Security Review

### SEC-001 User role self-escalation possible via Firestore rules
- Severity: Critical
- Evidence: firestore.rules lines 13-17 (isAdmin trusts users/{uid}.role) plus lines 89-90 (owner can update full user doc).
- Exploit scenario: an authenticated user updates their own role to admin and then gains admin-only access.
- Fix plan:
  1. Restrict self-updates in users/{userId} to a safe field allowlist (exclude role and privileged config fields).
  2. Move role/status changes to callable admin functions in functions/src/admin/userManagement.ts.
  3. Add negative rules tests for self role-escalation attempts.
- Regression tests:
  - user cannot set own role/isBanned/partnerConfig/orgConfig.
  - admin-only update path still works.

### SEC-002 Privileged writes still occur directly from client pages
- Severity: High
- Evidence: app/dashboard/admin/tasks/create/page.tsx line 77, app/dashboard/admin/tasks/create-video/page.tsx line 69, app/dashboard/admin/partners/manage/page.tsx line 146.
- Exploit scenario: if rules drift or are misconfigured, high-impact writes bypass backend audit and idempotency controls.
- Fix plan:
  1. Replace direct Firestore writes with callable mutations.
  2. Keep rules as defense in depth, not primary business control.
  3. Require audit fields (requestId, actor, reason) for privileged mutations.

### SEC-003 KYC storage rule comment and behavior are inconsistent
- Severity: Medium
- Evidence: storage.rules lines 28-35 comment says admins can read, but read condition is user-owned only.
- Risk: operational confusion and ad hoc workarounds.
- Fix plan:
  1. Decide intended access model (strict user-only or admin review allowed).
  2. Align rule condition and comments.
  3. Add storage emulator tests for both user and admin/sub-admin access cases.

### SEC-004 Public read on admin settings should be explicitly justified
- Severity: Medium
- Evidence: firestore.rules lines 344-346 allow public read; tests/firestore.rules.test.ts lines 224-229 assert unauthenticated read succeeds.
- Risk: sensitive operational config may be exposed unintentionally.
- Fix plan:
  1. Split public flags into a separate public_settings collection.
  2. Restrict admin_settings read to admin/sub-admin unless explicitly intended.
  3. Lock behavior with rules tests.

### SEC-005 Route middleware is non-enforcing by design
- Severity: Medium
- Evidence: middleware.ts lines 11-14 defer auth to client-side redirects.
- Risk: protected pages may attempt data fetches before redirect in future regressions.
- Fix plan:
  1. Keep backend/rules as explicit security boundary.
  2. Ensure sensitive reads/writes are always callable/rule protected.
  3. Add unauthenticated access smoke tests for critical APIs.

---

## 3.4 Performance Review

### Current bottlenecks (evidence-based)
1. Unpaginated and client-filtered withdrawals fetch
   - Evidence: app/dashboard/admin/withdrawals/page.tsx lines 80-100 fetch all records, then filter in memory.
   - Impact: high read cost and slow admin UX.
   - Fix: backend filtering plus cursor pagination in functions/src/admin/withdrawalManagement.ts.

2. Shop loads all active products and filters client-side
   - Evidence: services/product.service.ts lines 29-33 and app/dashboard/user/shop/page.tsx lines 51-87.
   - Impact: large payload and expensive client compute.
   - Fix: server-driven search/filter/sort with pageSize and cursor.

3. Offset pagination in admin user management
   - Evidence: functions/src/admin/userManagement.ts lines 91-92 and 120.
   - Impact: offset cost grows with page number.
   - Fix: replace offset pagination with cursor startAfter.

4. N+1 query pattern in review eligibility
   - Evidence: services/review.service.ts lines 166-183 query reviews per order.
   - Impact: many round trips for single eligibility checks.
   - Fix: consolidate query strategy or denormalize review lookup keys.

5. Large fixed limits in admin pages
   - Evidence: app/dashboard/admin/users/page.tsx line 95, app/dashboard/admin/kyc/page.tsx line 60, app/dashboard/admin/cms/page.tsx lines 25 and 31 use limit 100.
   - Impact: over-fetching on tab/filter changes.
   - Fix: default to 20-30 with load-more or paginated table controls.

### Quick wins (1-3 days)
- Reduce default limits from 100 to 20-30.
- Move withdrawals filters to backend.
- Add latency and Firestore read-count logs on key callables.

### Deep improvements (1-2 weeks)
- Shared cursor pagination contract across list APIs.
- Server-backed shop search strategy.
- Materialized aggregates for heavy dashboard totals.

### What to measure (before/after)
- p95 latency for getAdminUsers/getWithdrawals/shop search.
- Firestore reads per page load for admin users, admin withdrawals, and shop.
- Time-to-first-list-render on withdrawals and shop pages.

---
## 3.5 Architecture Review

### Current state
- **Framework:** Next.js 14 App Router + Firebase (Auth, Firestore, Functions, Storage).
- **State:** mixed Zustand + local state + ad hoc listeners.
- **Data access:** mixed direct Firestore in pages and service wrappers; callable usage is partial.
- **Backend:** modular Cloud Functions exist but coexist with a large legacy `functions/src/index.ts`.

### A-001 Separation of concerns is inconsistent
- **Evidence:** many page components perform direct DB mutations; services exist but are bypassed.
- **Recommendation:** enforce “pages -> services -> callable/backend” for mutations; page-level reads only for low-risk, role-scoped data.

### A-002 Service layer is partial and non-authoritative
- **Evidence:** `services/*` exists, but admin pages bypass it heavily.
- **Recommendation:** build domain repositories (`users`, `orders`, `withdrawals`, `products`, `tasks`) with typed contracts and cursor APIs.

### A-003 Function module sprawl and legacy coupling
- **Evidence:** `functions/src/index.ts` is mostly export-only, but it still mixes canonical and legacy-compatibility exports in one surface.
- **Recommendation:** keep `index.ts` export-only and separate legacy compatibility exports into an explicit `legacy` namespace with deprecation timelines.

### A-004 Error/log strategy not unified
- **Evidence:** mixed `console.error`, `functions.logger`, and ad hoc user messages.
- **Recommendation:** shared error adapter and structured log fields (`action`, `uid`, `requestId`, `resourceId`).

### Incremental folder structure improvements
- `app/dashboard/*` keeps UI-only responsibilities.
- `services/` split into `services/read/` and `services/mutate/` (callable-backed).
- `functions/src/domains/{orders,withdrawals,rewards,admin}/` with `schemas/` and `handlers/`.
- `lib/errors/` for shared client-side error normalization.

---

## 3.6 UI/UX Review

### UX-001 Admin workflows rely on browser dialogs
- **Where:** `app/dashboard/admin/withdrawals/page.tsx`, `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/cms/page.tsx`.
- **Change:** replace prompts/alerts/confirms with modal forms + inline validation + outcome toast.
- **Why:** better trust, fewer accidental actions, clearer recovery.

### UX-002 Accessibility and semantics issues
- **Where:** `app/auth/login/page.tsx` (`area-label` typo), icon-only controls in admin pages.
- **Change:** fix aria attributes, add `aria-label` on icon buttons.
- **Why:** keyboard/screen-reader compatibility.

### UX-003 Inconsistent failure feedback
- **Where:** checkout, withdrawal, admin actions.
- **Change:** unified error banner component with retry/copy details where appropriate.
- **Why:** reduces support burden and user confusion.

### UX-004 Heavy table/list pages lack progressive loading/filter UX
- **Where:** admin users/withdrawals and tasks.
- **Change:** server-side pagination controls, debounce search, empty states with next action.
- **Why:** scalability and perceived responsiveness.

### UX-005 Mobile interaction density in admin pages
- **Where:** admin tables and detail drawers.
- **Change:** condensed mobile cards and sticky action bar for approve/reject/configure actions.
- **Why:** fewer mis-clicks and better completion rate.

---

## 3.7 Missing Functionality / Gaps

1. **Centralized idempotency for all financial/reward endpoints (partial).**
   - Impact: prevents duplicate reward/order/withdrawal side effects.
   - Dependency: callable refactor in `functions/src`.
   - Targets: `functions/src/index.ts`, `functions/src/orders/*`, `functions/src/tasks/*`, `functions/src/withdrawals/*`.

2. **Unified admin client over callable APIs (missing).**
   - Impact: security and maintainability.
   - Dependency: complete function coverage for CMS/roles/KYC.
   - Targets: `app/dashboard/admin/*`, `functions/src/admin/*`.

3. **Cursor-based API contracts for high-volume lists (missing/partial).**
   - Impact: performance and predictable UX.
   - Dependency: new service interfaces.
   - Targets: `services/*`, admin/user list pages, `functions/src/admin/userManagement.ts`.

4. **End-to-end smoke tests for critical flows (missing).**
   - Impact: shipping confidence.
   - Dependency: test harness choice (Playwright/Cypress).
   - Targets: `tests/e2e/*` (new).

5. **Observability dashboard for finance/reward anomalies (missing).**
   - Impact: fraud/error detection.
   - Dependency: standardized logs + metrics counters.
   - Targets: `functions/src/*`, admin analytics views.

---

## 3.8 New Feature Ideas Aligned With Product Goals

1. **Withdrawal Risk Queue Scoring**
   - Value: faster fraud triage and safer payouts.
   - Complexity: M
   - Dependencies: existing `riskFlags` in `requestWithdrawalSecure`.
   - Priority: High

2. **Partner/Vendor SLA Dashboard**
   - Value: track order handling quality by city/vendor.
   - Complexity: M
   - Dependencies: order status history normalization.
   - Priority: High

3. **Task Abuse Detection Signals**
   - Value: protects reward economy from scripted abuse.
   - Complexity: M
   - Dependencies: session telemetry, rate-limit metrics.
   - Priority: High

4. **Saved Search + Facet Presets for Shop**
   - Value: higher conversion and repeat engagement.
   - Complexity: S
   - Dependencies: search service maturity.
   - Priority: Medium

5. **Role-Based Admin Workspace Personalization**
   - Value: less clutter for sub-admins.
   - Complexity: M
   - Dependencies: permissions model in `admin_permissions`.
   - Priority: Medium

6. **Order Exception Center**
   - Value: centralized handling for cancelled/refunded/stuck orders.
   - Complexity: M
   - Dependencies: stable order state machine.
   - Priority: High

7. **KYC Document Re-submission Workflow**
   - Value: better user completion rate for rejected KYC.
   - Complexity: S
   - Dependencies: kyc status and reason schema improvements.
   - Priority: Medium

8. **Revenue Integrity Reports (daily reconcile)**
   - Value: financial trust and audit readiness.
   - Complexity: L
   - Dependencies: normalized transaction schema.
   - Priority: High

9. **Referral Funnel Analytics**
   - Value: improve acquisition quality.
   - Complexity: M
   - Dependencies: referral event instrumentation.
   - Priority: Medium

10. **PWA Offline Read Mode for user dashboard**
   - Value: improved usability in low-connectivity markets.
   - Complexity: M
   - Dependencies: cache policy and stale-safe views.
   - Priority: Low
---

## 3.9 Prioritized Roadmap

### High / Medium / Low Impact Buckets
- **High:** secure mutation boundaries, backend consolidation, rules test hardening, list pagination.
- **Medium:** service layer cleanup, image optimization, error/UX consistency.
- **Low:** advanced UX polish and non-critical optimizations.

### Week-by-week plan

#### Week 1 (Must Ship)
1. **Secure mutation boundary alignment** (Fullstack)
   - Tasks: remove direct admin/product/task privileged writes from client; callable-only mutation paths.
   - Dependencies: existing admin callable coverage; add missing callables where absent.
   - Acceptance gate: no privileged `updateDoc/addDoc/deleteDoc` in admin UI modules.

2. **Users rules hardening against self role escalation** (Backend)
   - Tasks: restrict self-updatable fields in `firestore.rules` for `users/{userId}` and add explicit escalation tests.
   - Dependencies: existing admin callables for role/status changes.
   - Acceptance gate: user cannot update own `role`/privileged fields; admin callables remain functional.

3. **Rules test stabilization + CI gate** (Backend)
   - Tasks: fix emulator-based test execution, add guards in `tests/firestore.rules.test.ts`, CI `npm run test:rules`.
   - Acceptance gate: rules suite passes in CI and blocks merges on failure.

4. **Canonical endpoint definition** (Backend)
   - Tasks: publish mapping of deprecated vs active callables.
   - Acceptance gate: client references only canonical list.

#### Week 2
1. **Pagination and query hardening** (Fullstack)
   - Tasks: cursor APIs for users/withdrawals/orders; remove heavy client-side filtering.
   - Dependencies: service contracts.
   - Acceptance gate: list pages support cursor pagination and bounded reads.

2. **Validation and error envelope standardization** (Backend)
   - Tasks: apply Zod validation wrappers and common response/error format.
   - Acceptance gate: all critical callables return standardized schema.

3. **Config/init consolidation** (Fullstack)
   - Tasks: unify Firebase client config and function admin init.
   - Acceptance gate: single config source used across app.

#### Week 3
1. **UI/UX consistency and accessibility sweep** (Frontend)
   - Tasks: replace native dialogs, fix aria attributes, improve states.
   - Acceptance gate: critical flows have accessible labels and consistent feedback.

2. **Image and render optimization** (Frontend)
   - Tasks: migrate key images to `next/image`, reduce heavy client filtering.
   - Acceptance gate: lint warnings for `no-img-element` reduced on primary user paths.

3. **Observability improvements** (Backend)
   - Tasks: structured logs + metric counters for finance/reward/admin actions.
   - Acceptance gate: audit-ready logs with request/action IDs.

---

## 3.10 Implementation Map (File-Level)

- `app/dashboard/admin/tasks/create/page.tsx`
  - Change type: fix/refactor
  - Summary: replace direct `addDoc` task creation with callable-backed create flow.
  - Risk: medium.

- `app/dashboard/admin/tasks/create-video/page.tsx`
  - Change type: fix/refactor
  - Summary: remove direct task writes and route video task creation through callable with validation.
  - Risk: medium.

- `app/dashboard/admin/partners/manage/page.tsx`
  - Change type: fix/refactor
  - Summary: replace direct partner config `updateDoc` with admin callable mutation and audit metadata.
  - Risk: medium.

- `services/product.service.ts`
  - Change type: refactor
  - Summary: move product create/update/delete writes to callable endpoints; keep service as client transport.
  - Risk: medium.

- `firestore.rules`
  - Change type: security fix
  - Summary: restrict self-updatable user fields to prevent role/config escalation.
  - Risk: high (security-critical).

- `tests/firestore.rules.test.ts`
  - Change type: add tests
  - Summary: add explicit tests that users cannot self-assign admin role or privileged config fields.
  - Risk: low.

- `functions/src/admin/userManagement.ts`
  - Change type: performance/security refactor
  - Summary: replace offset pagination with cursor and standardize response envelope.
  - Risk: medium.

- `functions/src/admin/withdrawalManagement.ts`
  - Change type: performance refactor
  - Summary: move city/amount filters to backend query path and support cursor pagination.
  - Risk: medium.

- `app/dashboard/admin/withdrawals/page.tsx`
  - Change type: perf/ux refactor
  - Summary: consume paginated callable API instead of full-fetch + client filtering.
  - Risk: medium.

- `app/auth/login/page.tsx`
  - Change type: accessibility fix
  - Summary: correct `area-label` to `aria-label` and sweep similar attribute issues.
  - Risk: low.

- `lib/firebase/config.ts` and `lib/firebase/firebase.config.ts`
  - Change type: consolidation
  - Summary: keep one canonical client Firebase config module and migrate imports.
  - Risk: low.
---
## Repo Mapping and Feature Inventory (Audit Process Output)

### Architecture map
- Frontend routing/layout/auth:
  - `app/**`, `app/dashboard/layout.tsx`, `middleware.ts`, `hooks/useAuth.ts`, `lib/guards/roleGuard.ts`
- Data access patterns:
  - direct Firestore in many pages (`app/dashboard/**`, `app/auth/*`)
  - partial service wrappers (`services/*`, `lib/firebase/firestore.ts`)
- Backend:
  - modular functions in `functions/src/*`
  - export hub in `functions/src/index.ts` with both canonical and legacy compatibility exports
- Security surfaces:
  - `firestore.rules`, `storage.rules`, `tests/firestore.rules.test.ts`

### Feature inventory matrix
- Auth/profile: **Implemented (partial hardening needed)**
  - Evidence: `app/auth/login/page.tsx`, `app/auth/register/page.tsx`, `hooks/useAuth.ts`
- Marketplace browse/detail/checkout/orders: **Implemented (partial)**
  - Evidence: `app/dashboard/user/shop/*`, `app/dashboard/user/checkout/page.tsx`, `functions/src/orders/*`
  - Gaps: query scalability, client-authoritative product mutations, mixed order APIs
- Wallet/withdrawals: **Implemented (partial)**
  - Evidence: `app/dashboard/user/withdraw/page.tsx`, `functions/src/withdrawals/requestWithdrawal.ts`
  - Gaps: error UX consistency, endpoint consolidation
- Partner/vendor/org/admin dashboards: **Implemented (partial)**
  - Evidence: `app/dashboard/partner/*`, `app/dashboard/vendor/*`, `app/dashboard/organization/*`, `app/dashboard/admin/*`
  - Gaps: direct privileged client writes, pagination/perf
- Tasks/gamification/rewards: **Implemented (partial)**
  - Evidence: `app/dashboard/user/tasks/*`, `functions/src/tasks/*`, legacy compatibility task exports routed via `functions/src/index.ts`
  - Gaps: consolidation and consistent anti-abuse controls
- Reviews/search: **Implemented (partial)**
  - Evidence: `services/review.service.ts`, `functions/src/reviews/reviewFunctions.ts`, `services/search.service.ts`, `functions/src/search/productSearch.ts`
  - Gaps: resilient fallback UX and query contract consistency

### Assumptions (unverified)
1. `functions/src` is deployed source of truth and `functions/lib` is compiled output.
2. Admin callables in `functions/src/admin/*` are intended to replace direct admin Firestore writes in UI.
3. Production environments use Firebase Emulator-backed rules tests in CI; currently not enforced locally by default command.

---

## Verification Notes
- `cmd /c npm run lint` completed with warnings (not failures), including multiple `@next/next/no-img-element` and two `react-hooks/exhaustive-deps` warnings.
- `cmd /c npm test -- --runInBand` failed because Firestore emulator was not running (`localhost:8080`), and teardown attempted `cleanup()` on undefined test env.
---

## 3.11 Code Snippets (High-Impact)

### A) Improved query + pagination (cursor-based users list)
```ts
// functions/src/admin/userManagement.ts (pattern)
export const getAdminUsersPage = functions.https.onCall(async (data, context) => {
  await requirePermission(context, "users.read");

  const pageSize = Math.min(Math.max(Number(data.pageSize ?? 20), 1), 100);
  const lastCreatedAt = data.cursor?.createdAt ?? null;
  const lastId = data.cursor?.id ?? null;

  let q = db.collection("users").orderBy("createdAt", "desc").orderBy(admin.firestore.FieldPath.documentId()).limit(pageSize + 1);

  if (lastCreatedAt && lastId) {
    q = q.startAfter(lastCreatedAt, lastId);
  }

  const snap = await q.get();
  const docs = snap.docs.slice(0, pageSize);
  const hasMore = snap.docs.length > pageSize;

  return {
    items: docs.map((d) => ({ id: d.id, ...d.data() })),
    nextCursor: hasMore
      ? {
          createdAt: docs[docs.length - 1].get("createdAt"),
          id: docs[docs.length - 1].id,
        }
      : null,
  };
});
```

### B) Secure validation (Zod + wrapper)
```ts
// functions/src/orders/createOrderMultiItem.ts (pattern)
import { withValidation, CreateMultiItemOrderSchema } from "../lib/validation";

export const createOrderMultiItem = functions.https.onCall(
  withValidation(CreateMultiItemOrderSchema, async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError("unauthenticated", "Login required");
    }

    // data is typed + validated
    const { items, useCoins, shippingAddress } = data;
    // ... business logic
    return { success: true, data: { orderId: "..." } };
  })
);
```

### C) Reusable service/repository pattern
```ts
// services/repositories/orders.repository.ts (pattern)
export interface OrdersPageCursor {
  createdAt: unknown;
  id: string;
}

export interface OrdersPage {
  items: Order[];
  nextCursor: OrdersPageCursor | null;
}

export async function getUserOrdersPage(pageSize: number, cursor?: OrdersPageCursor): Promise<OrdersPage> {
  const fn = httpsCallable(functions, "getUserOrdersPage");
  const res = await fn({ pageSize, cursor });
  return res.data as OrdersPage;
}
```

### D) Firestore rules test example
```ts
// tests/firestore.rules.test.ts (pattern)
test("vendor cannot update another vendor product", async () => {
  const vendorA = testEnv.authenticatedContext("vendorA").firestore();
  const vendorB = testEnv.authenticatedContext("vendorB").firestore();

  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await setDoc(doc(ctx.firestore(), "users", "vendorA"), { role: "vendor", vendorConfig: { vendorId: "vendorA" } });
    await setDoc(doc(ctx.firestore(), "users", "vendorB"), { role: "vendor", vendorConfig: { vendorId: "vendorB" } });
    await setDoc(doc(ctx.firestore(), "products", "p1"), { vendorId: "vendorA", price: 100, inStock: true });
  });

  await assertSucceeds(updateDoc(doc(vendorA, "products", "p1"), { price: 120 }));
  await assertFails(updateDoc(doc(vendorB, "products", "p1"), { price: 1 }));
});
```

---

## 3.12 Testing Strategy

### Unit tests
- Validation and helpers:
  - `functions/src/lib/validation.ts`
  - `functions/src/admin/helpers.ts`
  - payment/reward calculation helpers in orders/tasks modules.
- Service-level client adapters:
  - error normalization utilities
  - cursor contract parsing

### Integration tests (Cloud Functions)
- Money/task/admin callables:
  - auth required
  - role required
  - invalid payload rejected
  - idempotency behavior for duplicate requests
- Focus files:
  - `functions/src/orders/createOrderMultiItem.ts`
  - `functions/src/withdrawals/requestWithdrawal.ts`
  - `functions/src/tasks/rewardTask.ts`
  - `functions/src/admin/userManagement.ts`

### Firestore rules tests
- Extend `tests/firestore.rules.test.ts` to cover:
  - strict user/vender/partner/admin access boundaries
  - server-only collections write denial (`wallets`, `transactions`, `idempotency_keys`, `audit_logs`)
  - `admin_settings` intended public-read/admin-write behavior

### Storage rules tests
- Add emulator tests for:
  - own-profile uploads allowed under `/users/{uid}/**`
  - `/products/**` client writes denied
  - KYC file constraints (type/size)

### E2E tests (recommended)
- Critical user paths:
  - register -> login -> task reward -> wallet update
  - shop -> checkout -> order history
  - KYC verified -> withdrawal request
- Critical admin paths:
  - review/approve/reject withdrawals
  - role change and wallet adjustment with audit visibility

### CI suggestions
1. `npm run lint`
2. `npm run build`
3. `npm run test:rules`
4. Functions integration test job (emulator-backed)
5. Secret scanning + dependency audit
