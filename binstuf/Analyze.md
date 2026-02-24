## ThinkMart Codebase Audit + Rebuild Plan (Agent-Strict Prompt)

You are a **code-focused autonomous engineering agent**. Your job is to **drop any existing implementation plan** and produce a **ground-truth audit** of the **ThinkMart** project **based only on the provided repository contents**, then produce a **new phased implementation plan** that is **compatible with the current working system**.

This is a **no-assumptions** task: everything you claim must be traceable to the repository files you were given.

---

# 1) Objective

Perform a **full, code-driven audit** of the ThinkMart codebase to determine:

1. Which features are **fully implemented**, **partially implemented**, or **missing**.
2. Where the code has **quality issues** (structure, duplication, anti-patterns, unclear ownership, non-optimal logic).
3. Which files/modules are **actively used and correctly integrated** vs **redundant/unreferenced**.
4. What parts are **not optimized / not scalable**, or pose **performance, security, reliability, or data consistency** risks.
5. What logic could lead to **exploits**, **edge-case failures**, **race conditions**, **incorrect state handling**, or **broken invariants**.
6. Whether database interactions are **safe, efficient, and non-destructive** and do **not** risk data loss or schema instability.

Then, based strictly on what exists today, produce a **new implementation plan** with **phases**, **priorities**, and **acceptance criteria**.

---

# 2) Inputs You Must Use (Hard Rule)

* Use **only** the repository contents you are provided.
* Treat the codebase as the **source of truth**.
* If a required detail is not present in the repo, do **not guess**—instead record it as a **Blocker / Unknown** with what evidence is missing.

---

# 3) Hard Constraints (Non-Negotiable)

## Database Safety (Absolute)

* **DO NOT modify the database schema.**

  * No migrations, no schema refactors, no dropping/renaming tables/collections/fields, no changing primary keys/indexes, no altering constraints.
  * You may propose **non-schema** improvements only: query optimization, parameterization, transaction usage, safer access patterns, caching, pagination, and code-level safeguards.

## No Breaking Changes by Default

* **Do not break existing functionality.**

  * If you believe a breaking change is required, you must:

    1. justify why it’s unavoidable,
    2. provide a migration-safe alternative if possible,
    3. define rollback steps,
    4. define tests proving equivalence or improved correctness.

## Evidence-Based Output

* Every major claim must cite **where in the codebase** it comes from (file paths + key identifiers like function/class names).
* If evidence is weak or absent, mark it explicitly.

## Agent Operating Rules

* Be deterministic and exhaustive.
* Prefer small, safe refactors over large rewrites.
* Prioritize production safety: correctness, security, data integrity, observability.

---

# 4) Required Audit Methodology (Follow In Order)

## Step A — Repository Map (Discovery)

Create a structural map of the repo:

* Tech stack identification (frameworks, runtime, build system, package manager, tooling).
* Entry points (server start, app bootstrap, main routes).
* Dependency boundaries (modules, layers, services).
* DB layer and configuration.
* Auth/session/security components.
* Background jobs/queues/schedulers (if any).
* External integrations (payments, email, storage, APIs).

## Step B — Runtime & Data Flow Trace

Reconstruct the real application flow:

* Request → routing → controllers/handlers → services → DB → response.
* Client → API calls → state handling (if frontend exists).
* Identify where state is stored, cached, and validated.

## Step C — Feature Inventory (Ground Truth)

Build a feature list by reading code, routes, UI components, handlers, and docs **only if docs match code**.
For each feature:

* Status: **Fully Implemented / Partially Implemented / Missing**
* Evidence: file paths + symbols
* What works today (observed behavior implied by code)
* What’s incomplete or broken
* Risk/impact if left as-is

## Step D — File/Module Utilization Verification

For each significant file/module:

* Is it imported/used?
* Is it reachable from an entry point or route?
* Is it dead code, duplicate, or replaced by newer code?
* If redundant: recommend removal strategy (without breaking builds).

## Step E — Quality, Security, Performance, Scalability Review

You must identify and categorize issues, including:

* Code smells: duplication, tight coupling, unclear ownership, bad naming, inconsistent patterns.
* Security: auth bypass, injection risks, insecure defaults, secret handling, unsafe file ops, missing validation, CSRF/CORS issues, insecure cookies/tokens.
* Reliability: error handling gaps, retries, timeouts, idempotency, inconsistent responses.
* Concurrency: race conditions, double-writes, inconsistent state updates, missing locking/transactions.
* Performance: N+1 queries, unbounded reads, missing pagination, heavy synchronous work, lack of caching where safe.
* Data consistency: partial writes, missing transactions, stale reads, non-atomic updates.
* Observability: logging gaps, missing correlation IDs, lack of metrics/events for critical flows.

## Step F — Database Interaction Audit (Schema Frozen)

For every DB access pattern:

* Query safety (parameterization, validation)
* Index usage assumptions (no schema changes; still call out risks)
* Transaction usage (where atomicity is needed)
* Pagination & limits
* Avoiding destructive operations
* Data integrity safeguards at code level (checks, invariants, idempotency keys)

---

# 5) Required Deliverables (Output Must Follow This Structure)

## Deliverable 1 — Executive Summary (1–2 pages equivalent)

* Overall health score (with reasoning)
* Top 10 risks by severity
* Immediate “stop-the-bleeding” actions (if any)
* What is definitely working vs uncertain

## Deliverable 2 — Feature Status Matrix

For each feature:

* Status (Fully / Partial / Missing)
* Evidence pointers (paths + symbols)
* Dependencies (services/DB/integrations it relies on)
* Known bugs / gaps
* Recommended action

## Deliverable 3 — File & Integration Map

* Entry points & routes map
* Module boundaries
* “Used vs unused” file list with evidence
* External integrations list and where they are invoked

## Deliverable 4 — Issues Register (Prioritized)

Each issue must include:

* Severity: **Critical / High / Medium / Low**
* Category: Security / Data Integrity / Reliability / Performance / Maintainability
* Evidence: exact locations
* Why it’s a problem (real failure modes)
* Fix approach (non-breaking by default)
* Test/verification required

## Deliverable 5 — New Implementation Plan (Phased)

Create a step-by-step plan with phases:

* **Phase 0: Safety & Observability Baseline**
* **Phase 1: Critical Fixes**
* **Phase 2: Data Integrity & Reliability**
* **Phase 3: Performance & Scalability**
* **Phase 4: Enhancements (Non-breaking)**

For each phase:

* Goals
* Concrete tasks (small, actionable)
* Dependencies
* Risks + mitigations
* Rollback strategy (when relevant)
* Required tests
* **Acceptance Criteria (Mandatory)**

---

# 6) Acceptance Criteria Requirements (Mandatory Per Phase)

Each phase must include acceptance criteria that are:

* **Objective and testable** (not “works better”).
* Includes:

  * Functional correctness checks
  * Non-regression proof (existing flows still work)
  * Security checks where relevant
  * Performance checks where relevant
  * Data integrity checks where relevant

Examples of acceptable criteria (use repository-appropriate equivalents):

* “All API endpoints return consistent error envelopes with proper status codes.”
* “No unbounded list queries; all list endpoints enforce limit+offset/cursor pagination.”
* “Critical flows have unit/integration tests covering success + failure + edge cases.”
* “No DB writes occur without validation and required invariants enforced in code.”
* “Auth-protected routes reject unauthorized access with test coverage.”
* “No schema changes introduced (verified by no migration files / schema diffs).”

---

# 7) Strict Output Rules (Formatting + Behavior)

* Use clear headings and numbered sections.
* Avoid vague language. If uncertain, state exactly what is unknown and why.
* Do not propose changes that require schema modifications.
* Do not invent features, endpoints, or architecture not proven by the repo.
* When recommending refactors, include:

  * scope, touched modules, and why it’s safe
  * minimal migration steps
  * tests needed to prevent regressions

---

# 8) “Definition of Done” (Whole Task)

You are done only when:

* Every major system area (routing, auth, DB, core features, integrations) is audited.
* All features are classified with evidence.
* Unused/redundant code is identified with evidence.
* Risks are prioritized with clear fixes.
* A phased plan exists with **acceptance criteria per phase**.
* You respected the **NO DB SCHEMA CHANGES** rule.



IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES