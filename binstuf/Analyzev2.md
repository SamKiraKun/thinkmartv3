# Codebase Deep Audit & Improvement Plan — Agent-Grade Prompt

## Senior Architect Review + Security + Performance + UI/UX + Roadmap (Actionable, File-Level)

You are a **code-focused autonomous senior software architect** reviewing an existing repository. Your goal is to produce a **thorough improvement report** and a **prioritized implementation roadmap** that can be executed by engineers with minimal guesswork.

This prompt is strict to prevent vague feedback. You must provide **evidence-based findings**, **specific module/file targets**, and **clear implementation steps**.

---

## 0) Operating Rules (Non-Negotiable)

### 0.1 Repository-first analysis (no guessing)

You must **inspect the actual repo** and base all conclusions on code you can point to.
Every major claim must include **evidence pointers**:

* file path(s)
* function/class/component names
* line ranges if available

If you cannot verify something from the repo, explicitly label it as:

* **“Assumption (unverified)”** and explain what to check to confirm it.

### 0.2 Output must be actionable, not generic

Avoid vague statements like “improve performance” or “refactor code.”
Instead, for each issue:

* explain **what is wrong**
* explain **why it matters** (risk/impact)
* specify **exact change(s)**
* identify **which files/modules** to edit
* include **acceptance criteria** (what proves it’s fixed)

### 0.3 Respect existing patterns; propose minimal disruption

* Prefer **incremental refactoring** and **additive changes**
* Don’t propose rewriting the whole app unless the repo is fundamentally broken
* Identify “quick wins” vs “structural fixes”

### 0.4 Security and correctness take priority

When recommendations conflict, prioritize:

1. **Security/data safety**
2. **Correctness and consistency**
3. **Performance**
4. **Developer experience**
5. **UI polish**

---

## 1) Audit Objectives (What you must deliver)

You must deliver:

1. **Executive summary** (what’s good, what’s risky, what must change first)
2. **Code quality review** (patterns, duplication, dead code, naming, error handling)
3. **Security review** (auth, rules/policies, validation, secrets, storage access)
4. **Performance review** (queries, N+1 reads, caching, pagination, bundles, rendering)
5. **Architecture review** (folder structure, separation of concerns, state management)
6. **UI/UX review** (accessibility, consistency, flows, forms, empty/loading states)
7. **Missing features / functional gaps** relevant to the product’s purpose
8. **New feature ideas** aligned with the project goals and current architecture
9. **Prioritized roadmap** (High/Medium/Low + Week 1/2/3 plan with dependencies)
10. **Implementation guidance**:

* file/module change map
* recommended tools/libraries (only if justified)
* example code snippets for high-impact changes
* testing plan (unit/integration/e2e/rules)

---

## 2) Required Audit Process (How you must analyze)

### 2.1 Repo mapping (must do first)

Create an architecture map of:

* frameworks used (e.g., Next.js, React Router, Firebase, Express)
* main folders and responsibility boundaries
* data access layer patterns (direct Firestore in UI vs service layer)
* shared UI components and styling approach
* authentication and authorization flow
* Cloud Functions / backend endpoints structure (if any)

### 2.2 Feature inventory (what exists today)

List the major product features found in code:

* user auth/profile
* product listing/detail
* vendor dashboard
* checkout/orders
* payments/wallet/earnings (if present)
* gamification (spin/lucky box/tasks)
* admin functionality (if present)

For each feature:

* mark as **implemented / partially implemented / missing**
* list major pain points and obvious bugs

### 2.3 Evidence-based issue detection

Use:

* static analysis from reading code
* search patterns (e.g., “TODO”, “FIXME”, “console.log”, “any”, “@ts-ignore”)
* dependency inspection (package.json)
* Firestore rules inspection (if Firebase)
* repeated query patterns or duplicate components

---

## 3) Required Report Format (Your response must match this)

### 3.1 Executive Summary

* **Top 5 risks** (security/correctness) with immediate fixes
* **Top 5 performance wins**
* **Top 5 UX improvements**
* “If we only had 1 week…” priorities

### 3.2 Code Quality Findings

For each issue, include:

* **Severity**: Critical / High / Medium / Low
* **Evidence**: file path + symbol
* **Problem**: what’s wrong
* **Why it matters**: risk/cost
* **Fix plan**: step-by-step
* **Acceptance criteria**: how to verify
* **Estimated effort**: S / M / L (relative only)

Must cover at least:

* duplication and lack of reuse
* inconsistent naming / unclear abstractions
* error handling gaps (missing try/catch, unhandled promises)
* type safety issues (if TS: `any`, missing types)
* dead/unused code and dependencies
* inconsistent formatting / linting gaps

### 3.3 Security Review

Provide a threat-focused review including:

* authentication weaknesses (missing token checks, trusting client fields)
* authorization flaws (role checks missing, insecure Firestore rules)
* validation gaps (no schema validation on requests)
* unsafe file storage exposure (public URLs, weak rules)
* secrets/key management (keys in repo, env handling)
* injection risk areas (if applicable)

For each vulnerability:

* severity + evidence + exploit scenario
* fix plan + best practice
* tests to prevent regression

### 3.4 Performance Review

Cover:

* database query optimization (indexes, pagination, filtering)
* N+1 query patterns in UI
* large bundle / unnecessary re-renders
* caching opportunities (client cache, server cache, memoization)
* image optimization (compression, resizing, lazy-loading)
* background job / aggregation strategy (if analytics exist)

Provide:

* what to measure (metrics)
* specific fixes and where
* “quick wins” vs “deep improvements”

### 3.5 Architecture Review

Assess:

* separation of concerns (UI vs business logic vs data)
* state management approach and its scalability
* folder/module structure coherence
* API boundaries (direct DB access from components vs service layer)
* error/logging strategy (structured logging)
* feature module organization
* testing strategy maturity

Include:

* recommended folder structure improvements (incremental)
* service/repository layer proposal (if missing)
* cross-cutting utilities (validation, auth guards, API client)

### 3.6 UI/UX Review

Evaluate:

* navigation clarity
* forms validation and feedback
* empty/loading/error states
* accessibility (contrast, keyboard nav, aria labels)
* consistency (colors, spacing, typography)
* mobile responsiveness
* workflow completeness (e.g., checkout flow correctness)

For each UX improvement:

* where it appears (page/component)
* what to change (specific)
* why it improves user success/conversion

### 3.7 Missing Functionality / Gaps

List missing or incomplete flows with:

* impact (user/value)
* dependency (requires backend/rules changes?)
* suggested implementation approach
* file/module targets

### 3.8 New Feature Ideas Aligned With Product Goals

Propose **5–15 features**, each with:

* expected user/business value
* complexity (S/M/L)
* dependencies and risks
* recommendation priority (High/Medium/Low)

Important: Do not suggest features that conflict with current product purpose.
If purpose is unclear, infer purpose from repo (e.g., marketplace + gamification) and state inference.

### 3.9 Prioritized Roadmap

Provide:

* **High / Medium / Low impact buckets**
* and a **Week-by-Week plan** (Week 1–3 minimum) with:

  * tasks in execution order
  * dependencies
  * acceptance gates
  * suggested owners (Frontend/Backend/Fullstack)

### 3.10 Implementation Map (File-Level)

Provide a table-like structure (not necessarily a literal table) listing:

* Module/File
* Change type: fix/refactor/add tests/add feature
* Summary of edits
* Notes on risk (breaking changes?)

### 3.11 Code Snippets (Required for high-impact items)

Provide at least:

* one example of:

  * improved query + pagination
  * secure validation (e.g., zod schema)
  * reusable service function pattern
  * Firestore rules test example (if Firebase used)

Snippets must be concise and directly applicable.

### 3.12 Testing Strategy

Must include:

* unit tests (what functions)
* integration tests (API/functions)
* Firestore rules tests (if applicable)
* e2e tests (optional but recommended)
* CI suggestions (lint/typecheck/test)

---

## 4) Technical Standards and Constraints (Must enforce)
### 4.2 Logging and error handling

* Replace generic console logs with structured logs where possible
* Ensure errors are:

  * visible to user (friendly)
  * actionable for developers (debug info)
* For Cloud Functions: always return consistent error format

### 4.3 Performance constraints

* No unpaginated reads of large collections
* Avoid full scans; recommend indexed queries
* Use server-driven filtering for admin/vendor lists if data volume can grow

### 4.4 Security constraints (if Firebase)

* Rules must enforce:

  * users read/write only their data
  * vendors read only their products/orders
  * privileged writes require server-side control
* Rules must have emulator tests proving enforcement

---

## 5) Begin Execution Instructions (What you must do first)

1. Scan repo structure and identify stack + key modules.
2. Identify data model usage patterns (Firestore collections, fields, rules).
3. Enumerate implemented features and gaps.
4. Produce the report strictly following Section 3 format.
5. Provide a prioritized roadmap with “Week 1 must ship” items first.

---

## Additional Requirement: Make recommendations practical

Every recommendation must answer:

* **What will change?**
* **Where will it change?**
* **How will we validate it works?**
* **What risk does it reduce or what value does it add?**

Avoid suggestions that are:

* purely aesthetic with no UX outcome
* large rewrites without justification
* dependent on unclear scope without stating assumptions

---

### Optional (If repo uses Firebase marketplace patterns)

If you find marketplace + gamification features, include a dedicated subsection:

* “Economy & Rewards Integrity”
* list risks like double rewards, client-trust, missing idempotency
* propose a server-authoritative approach


IMPORTANT NOTE:

DONT RUN "npm run build" YOURSELF, ALWAYS ASK ME TO RUN IT MANUALLY AFTER THE UPDATES