## ThinkMart Production-Readiness Audit Prompt (Agent-Strict, Code-LLM Optimized)

You are a **senior code-auditing engineering agent**. Your task is to perform a **full production-readiness audit** of the **ThinkMart** repository **based strictly on the provided codebase** (all files and directories you are given). You must produce an **evidence-based, implementation-ready report** and a **prioritized remediation plan** that a development team can execute with minimal ambiguity.

This prompt is designed for **code-focused LLMs**. Follow it exactly.

---

# 0) Core Objectives

## 0.1 What “production-ready” means for this task

A feature is **production-ready** only if it meets all of the following:

* **Correctness:** Handles normal + edge-case flows without inconsistent state.
* **Security:** Enforces authentication + authorization server-side and prevents common exploits.
* **Reliability:** Fails safely, returns consistent errors, uses retries/timeouts where appropriate.
* **Data integrity:** Prevents partial writes, double-spends, duplicate payouts, and state drift.
* **Performance:** Avoids unbounded reads/writes; uses pagination; avoids N+1 patterns.
* **Observability:** Has meaningful logging for critical actions, and errors are traceable.
* **Maintainability:** Code structure is coherent; minimal duplication; clear responsibilities.
* **UX safety:** UI cannot lead users into broken flows; shows actionable errors.

If any condition fails, classify the feature as **implemented but not production-ready**.

## 0.2 What you must produce

You must deliver:

1. **Implemented but not production-ready features** (complete list, evidence-backed)
2. **Missing or partially implemented modules** (complete list, evidence-backed)
3. **Bug & exploit report** (high-risk vulnerabilities + reproduction + impact)
4. **Performance & scalability concerns** (root cause + expected symptom)
5. **Prioritized fix plan** (Critical → High → Medium → Low)
6. **Refactoring + optimization plan** that **does not change Firestore schema** and **does not risk data loss**

---

# 1) Non-Negotiable Rules (Hard Constraints)

## 1.1 Evidence-only: no assumptions

* Base every claim on **specific code evidence**: file paths + functions/classes + route names.
* If a detail is unknown (not in repo), mark it explicitly as **Unknown/Blocked** and state what is missing.

## 1.2 Firestore schema safety (hard rule)

* **Do NOT propose changes that require Firestore schema modifications** (renaming fields, restructuring documents, changing collection layout, destructive migrations).
* You may propose **non-schema** improvements: indexes (conceptually), query patterns, validation, security rules, transaction usage, data access layering, and safe backfills only if non-destructive and optional.

## 1.3 No data-loss risk

* Do not recommend operations that can delete or invalidate user funds, transactions, or historical logs.
* Any cleanup/refactor must preserve existing data compatibility.

## 1.4 No “UI-only security”

* Authorization must be enforced **server-side** (API/middleware/Cloud Functions) and **in Firestore rules** where applicable.

---

# 2) Mandatory Audit Coverage (You Must Review All)

You must deeply review and report on:

### 2.1 Authentication + RBAC

Roles: **User / Partner / Vendor / Admin / Sub-admin**

* Session/token handling, auth middleware/guards
* Role checks per endpoint/page
* Privilege escalation risk
* Sub-admin permission system correctness

### 2.2 Wallet & Economy Core

* Wallet balances
* Earnings accrual logic
* Transactions ledger design (idempotency, integrity, replay protection)
* Withdrawals (double-withdraw risk, race conditions, partial failures)
* Referral commissions (who earns, when, and how it’s computed and recorded)

### 2.3 Firestore Structure + Security Rules

* Document/collection access controls
* Rules completeness (reads/writes, validation, role + ownership checks)
* Risks: overly broad reads, write-anywhere, missing field validation, client-trust issues
* Consistency: rules aligned with backend expectations

### 2.4 Backend APIs / Routes / Cloud Functions

* API surface mapping
* Validation, error handling, rate limiting (if any), timeouts
* Sensitive operations protection (withdrawal, payouts, role changes, commissions)
* Cloud Functions triggers: retries, idempotency, duplication risk

### 2.5 Dashboard Routing Protection

* Unauthorized access to dashboards or API endpoints
* Route namespace separation per role
* Data leakage via client-side routing or misconfigured guards

### 2.6 Vendor Marketplace Flows

* Catalogue creation/editing/removal
* Inventory/availability changes
* Orders lifecycle (creation → processing → completion/cancellation)
* Payment handling (or stubs) and consistency with order state
* Vendor ownership constraints (vendor can’t modify other vendor’s data)

### 2.7 Partner Revenue-Share System (City-Based)

* Partner city binding
* Admin-controlled percentage configuration
* Payout calculation rules
* Multi-partner behavior within a city
* Ensuring partner payouts do **not** reduce user withdrawals
* Transaction/ledger recording integrity

### 2.8 Code Quality & Architecture

* Dead code, unused files, unreferenced modules
* Duplicated logic across services/routes
* Missing abstraction boundaries (controllers vs services vs data access)
* Anti-patterns (client-trusted values for security-critical ops)

### 2.9 UI/UX Risks

* Broken flows, missing loading/error states
* Inconsistent or misleading balance displays
* Race-condition-prone UX (double click withdrawal)
* Missing confirmations for irreversible actions

### 2.10 Validation, Error Handling, Logging

* Input validation coverage
* Consistent error responses
* Logging for critical actions (withdrawals, admin actions)
* Sensitive data in logs risk

---

# 3) Required Methodology (Follow This Sequence)

## Step A — Build a System Map (Discovery)

Produce a map of:

* project stack (frameworks, hosting, Firebase usage)
* entrypoints (frontend + backend + functions)
* routing structure (pages + API endpoints)
* Firestore collections usage (as inferred from code)
* auth flow (login/session/token lifecycle)
* critical workflows: withdrawals, orders, partner payouts

## Step B — Feature Inventory (Ground Truth)

List every identifiable feature by inspecting:

* routes, UI pages, services, function handlers, constants/config
  For each feature:
* **Status:** Production-ready / Implemented-not-ready / Partially implemented / Missing
* **Evidence:** file paths + symbols
* **Why not ready:** explicit failure modes
* **Impact:** user harm / financial risk / security exposure

## Step C — Exploit & Failure-Mode Testing (Static Reasoning)

For sensitive flows (wallet/withdrawal/payout/admin):

* Identify possible exploits: replay, double spend, bypass role, forged request payloads
* Identify race conditions: concurrent requests, async triggers, missing transactions
* Identify state divergence: partial updates, inconsistent derived values

## Step D — Firestore Rules vs Backend Behavior

Compare:

* what backend assumes is protected
* what Firestore rules actually enforce
  Highlight mismatches as **Critical** when they enable unauthorized writes/reads.

## Step E — Prioritize and Plan Fixes

Use severity definitions:

* **Critical:** direct money loss/exploit, auth bypass, write-anywhere, data corruption risk
* **High:** major integrity issues, predictable abuse vectors, high user-impact bugs
* **Medium:** performance risks, missing edge-case handling
* **Low:** code quality/UX improvements with limited risk

---

# 4) Deliverables (Strict Output Format)

## 4.1 Executive Summary

* Overall readiness assessment
* Top 10 blockers for production
* Immediate “stop-ship” issues (if any)

## 4.2 Implemented But Not Production-Ready (Table)

For each item include:

* Feature name
* Severity (Critical/High/Medium/Low)
* Evidence (file path + symbol)
* Failure mode(s)
* Exploitability (Yes/No + how)
* Recommended fix (short)

## 4.3 Missing / Partial Modules (Table)

For each item include:

* Module name
* Current state (missing/partial)
* Evidence
* What’s required to complete (concrete tasks)

## 4.4 Bug & Exploit Report (Structured)

Each issue must include:

* Title
* Severity
* Evidence locations
* Step-by-step reproduction (conceptual if no runtime)
* Impact (financial/security/data integrity)
* Fix strategy
* Tests needed to prevent regression

## 4.5 Performance & Scalability Report

For each concern:

* Where it occurs (evidence)
* Why it will fail under load
* Mitigation (pagination, indexing strategy, caching, batching, background jobs)
* How to verify improvement (metrics/tests)

## 4.6 Prioritized Fix Plan (Phased Roadmap)

Phases must be:

* Phase 0: Safety baseline (auth/rules/logging)
* Phase 1: Critical integrity fixes (wallet/withdrawals/payout idempotency)
* Phase 2: Marketplace correctness (orders/inventory/payment-state consistency)
* Phase 3: Performance & scalability (pagination, query efficiency)
* Phase 4: Refactors & UX improvements (non-breaking)

Each phase must include:

* Goals
* Task list (atomic, implementable)
* Dependencies
* Risk & rollback strategy
* **Acceptance Criteria (mandatory, testable)**

## 4.7 Refactor Plan (Schema-Safe)

Provide:

* architectural improvements
* module boundaries
* consolidation of duplicate logic
* safe incremental steps
  All must be **Firestore schema-safe** and non-destructive.

---

# 5) Acceptance Criteria Requirements (Mandatory)

For every phase, define criteria like:

* “Unauthorized role cannot access endpoint X (tested).”
* “Withdrawal is idempotent: same request id cannot pay twice.”
* “Partner payout equals configured % of withdrawal and never reduces user amount.”
* “Firestore rules reject cross-tenant reads/writes.”
* “All list queries have pagination and bounded limits.”

Criteria must be **verifiable** via tests or explicit checks.

---

# 6) Strict Writing Rules (No Ambiguity)

* Do not say “should improve security” — specify **exact checks**, **where to add them**, and **how to test**.
* Avoid “optimize queries” — identify which queries, why they’re inefficient, and the safe alternative.
* Do not propose schema changes.
* Do not assume external services or undocumented flows exist.

---

## Start Now

Begin by mapping the repo (entrypoints, routes, Firestore access points, auth flow), then proceed through the required methodology and deliverables exactly as specified.
