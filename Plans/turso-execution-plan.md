# ThinkMart Turso Migration Execution Plan

> Version: 1.0
> Date: 2026-02-22
> Status: Execution baseline (consolidated from `Plans/turso-mig-plan.md` and `Plans/tursoDB-mig-plan2.md`)
> Recommended Strategy: Hybrid migration first (keep Firebase Auth, migrate Firestore + Cloud Functions + Storage)

---

## 1. Purpose

This document is the implementation-grade migration plan for ThinkMart.

It is designed to be:
- Practical for real production rollout
- Safe for financial and MLM logic
- Detailed enough that an LLM (or multiple LLM-assisted tickets) can implement it incrementally
- Explicit about dependencies, sequencing, rollout gates, validation, and rollback

This plan replaces ambiguity between the two earlier plans by defining one primary execution path:

- Phase A (now): Hybrid migration
  - Keep Firebase Auth
  - Migrate Firestore to TursoDB
  - Migrate Cloud Functions to Fastify API
  - Migrate Firebase Storage to Cloudflare R2
- Phase B (later, optional): Migrate Auth away from Firebase if business requires full independence

---

## 2. Source Plans and Decision Summary

### 2.1 Inputs Used

- `Plans/turso-mig-plan.md` (full Firebase exit plan)
- `Plans/tursoDB-mig-plan2.md` (hybrid plan v2)

### 2.2 Consolidated Decision

Use the hybrid plan as the production migration baseline because it removes the highest-risk part (auth migration) while preserving nearly all business value.

#### Why hybrid first

- No forced password reset or user migration event
- Lower operational and security risk during the main migration
- Faster delivery of cost and query improvements (Firestore to SQL)
- Lets the team focus on the highest-value and highest-risk logic first:
  - wallet transactions
  - orders
  - withdrawals
  - MLM/referral distribution
  - admin workflows

#### What remains in Firebase after cutover (hybrid final state)

- Firebase Authentication only (client SDK + API token verification via `firebase-admin`)

#### What is removed from Firebase in hybrid cutover

- Firestore
- Cloud Functions
- Firebase Storage
- Firestore rules and composite indexes as runtime dependencies

---

## 3. Migration Scope

### 3.1 In Scope (Now)

- Firestore data model migration to TursoDB
- Cloud Functions logic migration to Fastify API routes/services
- Firestore security rules replacement with API authz middleware and service checks
- Firebase Storage migration to Cloudflare R2
- Real-time listener replacement (`onSnapshot` to WebSocket / SSE / polling)
- Background trigger replacement (Firestore triggers to BullMQ + Redis jobs)
- Frontend refactor from Firebase SDK data access to API client
- Observability, validation, cutover, rollback, and hypercare

### 3.2 Out of Scope (Now)

- Replacing Firebase Auth password/session handling
- Replacing Firebase email verification/password reset flows
- Full identity provider migration (custom JWT/refresh tokens)

### 3.3 Optional Future Scope

- Full auth migration to custom auth system or external auth provider
- Removing Firebase SDK entirely from frontend (only if/when auth is migrated)

---

## 4. Success Criteria and Non-Negotiables

### 4.1 Business Success Criteria

- Zero user login disruption (Firebase Auth remains functional)
- All user, admin, vendor, partner, and organization dashboards work via Turso-backed API
- Financial integrity preserved (wallet balances, orders, withdrawals, MLM payouts)
- Zero Firestore/Functions/Storage production calls for 7 consecutive days post cutover
- Rollback possible at each phase via feature flags until final decommission window closes

### 4.2 Technical Non-Negotiables

- All financial mutations are transactional and idempotent
- Authorization is enforced server-side on every route and service action
- Data migration is repeatable and validated (dry-run + full run + delta sync)
- Dual-read and parity validation performed before write cutover for each domain
- Observability and alerts exist before production traffic cutover
- Every migrated domain has automated tests (unit + integration at minimum)

---

## 5. Target Architecture (Execution Baseline)

### 5.1 High-Level Architecture

- Frontend: Next.js 14 app (existing)
- Auth: Firebase Auth (kept)
- API: Fastify (new)
- DB: TursoDB via libSQL client
- Cache/Queue/Rate limits: Redis + BullMQ
- File storage: Cloudflare R2 (S3-compatible)
- Real-time: Socket.io (plus polling/SSE where acceptable)
- Search: Typesense (kept, API key access moved behind new API)

### 5.2 Core Architectural Rules

1. Frontend must not read or write business data directly to Firebase/Firestore.
2. Frontend must call only the new API for data operations.
3. API must verify Firebase ID token for every authenticated request.
4. API must resolve role and active/banned state from TursoDB, not token claims alone.
5. All write logic must live in service layer (no business logic inside route handlers).
6. Real-time events must be emitted after successful DB commit only.
7. Background jobs must be enqueue-only from request path and processed asynchronously.
8. Audit logs required for admin and financial state changes.

### 5.3 Recommended Repo Layout (New + Modified)

```text
thinkmartv3/
  app/                     # Next.js frontend (modified)
  hooks/                   # hooks migrated from Firestore to API/WebSocket
  services/                # frontend service layer migrated to apiClient
  lib/
    firebase/
      auth.ts              # kept
      config.ts            # slimmed to auth only after cutover
    api/
      client.ts            # new
      websocket.ts         # new
      types.ts             # new shared DTOs (frontend copies or generated)
  server/                  # new Fastify API project
    src/
      index.ts
      app.ts
      config/
      db/
        client.ts
        migrations/
      middleware/
        auth.ts
        requireRole.ts
        validate.ts
        rateLimit.ts
        requestId.ts
      routes/
        users/
        wallet/
        orders/
        withdrawals/
        tasks/
        products/
        reviews/
        wishlists/
        referrals/
        membership/
        settings/
        uploads/
        admin/
        vendor/
        partner/
        search/
        gamification/
      services/
        walletService.ts
        orderService.ts
        withdrawalService.ts
        mlmService.ts
        taskService.ts
        reviewService.ts
        userService.ts
        uploadService.ts
        notificationService.ts
        auditService.ts
      repositories/        # SQL queries grouped by domain
      realtime/
        socket.ts
        emitters.ts
      jobs/
        queue.ts
        workers/
      schemas/             # zod request/response schemas
      utils/
        idempotency.ts
        pagination.ts
        sql.ts
        errors.ts
  scripts/
    migration/
      export-firestore/
      transform/
      import-turso/
      validate/
      delta-sync/
```

### 5.4 Hosting & Deployment (Chosen Topology + Provider Tradeoffs)

#### 5.4.1 Chosen Production Topology (Approved)

Use this as the default production target unless a later infrastructure decision changes it:

- `www.thinkmart.com` -> **Vercel** (Next.js frontend)
- `api.thinkmart.com` -> **Railway** (Fastify API)
- `cdn.thinkmart.com` -> **Cloudflare R2** custom domain (images/KYC/product assets)

Recommended supporting domains:
- `thinkmart.com` -> redirect to `https://www.thinkmart.com`
- `staging.thinkmart.com` -> Vercel preview/staging frontend
- `api-staging.thinkmart.com` -> Railway staging API
- `cdn-staging.thinkmart.com` -> R2 staging bucket custom domain (optional but recommended)

#### 5.4.2 Why This Split Is Recommended

This split matches the migration architecture and reduces operational risk:

- **Vercel** is the best operational fit for Next.js 14 frontend deployment and preview workflows.
- **Railway** is simple and fast for shipping a Node/Fastify API + separate worker services without heavy infra ops.
- **R2** provides S3-compatible object storage with predictable cost and easy CDN integration.

This also avoids coupling frontend hosting and API runtime to the same provider, which makes rollback and scaling decisions cleaner.

#### 5.4.3 Provider Roles and Responsibilities

##### Frontend: Vercel (`www.thinkmart.com`)

**Host**
- Next.js application (UI/routes/pages/components)
- Browser-side Firebase Auth SDK integration
- API/WebSocket client calls to Railway API

**Why Vercel (Pros)**
- Best-in-class Next.js support (build/runtime compatibility, previews, image optimization integration)
- Fast preview deployments for every PR/branch
- Easy custom domain + TLS setup
- Easy environment variable management by environment
- CDN edge delivery for static assets

**Tradeoffs / Risks**
- Vendor-specific behavior around Next.js features (usually a benefit, but tighter coupling to Vercel)
- Preview URLs can complicate Firebase Auth authorized domains if auth is tested on previews
- Can become more expensive at scale vs self-hosted/static-focused alternatives

**Alternatives (Frontend)**
- **Firebase Hosting**:
  - Pros: already familiar, can keep existing flow
  - Tradeoff: less ideal for modern Next.js operational workflows compared to Vercel
- **Cloudflare Pages**:
  - Pros: strong edge/CDN integration, cost-effective
  - Tradeoff: Next.js compatibility/runtime tradeoffs depending on features used
- **Self-hosted Next.js (VM/containers)**:
  - Pros: full control
  - Tradeoff: highest ops burden, not recommended during this migration

##### API: Railway (`api.thinkmart.com`)

**Host**
- Fastify API service
- WebSocket (Socket.io) endpoint
- Optional separate Railway services for workers/cron (recommended)

**Why Railway (Pros)**
- Fastest path to production for Node.js API
- Simple DX for env vars, deployments, logs, service networking
- Easy to run multiple services (API, worker, scheduler) in one project
- Good fit for a migration where shipping speed matters more than infra customization

**Tradeoffs / Risks**
- Less control than self-managed infrastructure
- Scaling model and runtime limits should be validated for sustained WebSocket concurrency
- Background jobs should run in a **separate worker service**, not inside the API process
- Regional runtime (not edge) means latency depends on region selection and user geography

**Alternatives (API)**
- **Render**:
  - Pros: stable managed web services/workers, straightforward deployments
  - Tradeoff: cold starts/perf characteristics and pricing may differ; evaluate for WebSockets/workers
- **Fly.io**:
  - Pros: strong for long-lived processes, regional placement, WebSocket-friendly
  - Tradeoff: steeper operational learning curve than Railway
- **Google Cloud Run**:
  - Pros: scalable, strong infra foundation
  - Tradeoff: more setup complexity (networking, workers, operational config) than needed initially
- **Self-managed VPS/VM (Docker + Nginx)**:
  - Pros: maximum control and potentially lower cost
  - Tradeoff: highest ops burden and incident risk during migration period

##### File Storage/CDN: Cloudflare R2 (`cdn.thinkmart.com`)

**Host**
- Product images
- User images
- KYC documents (private objects; signed access for admin review)

**Why R2 (Pros)**
- S3-compatible API (easy tooling and library support)
- Cost-effective object storage (especially egress profile depending on setup)
- Custom domain support for CDN delivery
- Clean replacement for Firebase Storage in a provider-neutral architecture

**Tradeoffs / Risks**
- Must design bucket/prefix permissions carefully (especially KYC privacy)
- Uploads require presigned URL flow and finalize callback logic (more engineering than Firebase SDK direct upload)
- CDN caching rules need explicit tuning (cache headers/invalidation behavior)

**Alternatives (Storage)**
- **AWS S3 + CloudFront**:
  - Pros: enterprise-standard, very flexible
  - Tradeoff: more operational/config complexity and potentially higher cost
- **Cloudinary** (for images):
  - Pros: rich media transformations
  - Tradeoff: less suitable as a general-purpose replacement for private KYC docs

#### 5.4.4 Railway Deployment Shape (Recommended)

Use separate services on Railway to avoid operational coupling:

1. `thinkmart-api` (Fastify web service)
   - Serves REST API + WebSocket endpoint
   - Publicly exposed at `api.thinkmart.com`

2. `thinkmart-worker` (BullMQ worker service)
   - Processes queues (referrals, notifications, gamification, reconciliations)
   - Private/internal service (no public domain needed)

3. `thinkmart-scheduler` (optional)
   - Runs cron/scheduled jobs if not handled by worker cron capability
   - Private/internal service

4. `redis` (managed Redis service, Railway or external)
   - Shared by API + worker + scheduler

Operational rule:
- Do not run workers in the API process in production.

#### 5.4.5 DNS, TLS, and Routing Plan

##### DNS Records

- `www.thinkmart.com` -> CNAME to Vercel target
- `api.thinkmart.com` -> CNAME to Railway target
- `cdn.thinkmart.com` -> Cloudflare custom domain for R2 bucket
- `thinkmart.com` -> redirect to `www` (via DNS/hosting redirect rule)

##### TLS

- Use provider-managed TLS certificates on Vercel and Railway
- Use Cloudflare-managed TLS for CDN custom domain
- Enforce HTTPS only on all domains

##### CORS and Origin Controls (API)

Allow only required origins:
- `https://www.thinkmart.com`
- `https://staging.thinkmart.com` (if used)
- Vercel preview domains (optional; only if preview auth/testing is needed)

Do not use wildcard CORS in production.

#### 5.4.6 Firebase Auth Configuration Impacts (Hybrid)

Because Firebase Auth remains in use, update Firebase console settings for hosting changes:

- Add authorized domains:
  - `www.thinkmart.com`
  - `staging.thinkmart.com` (if used)
  - Vercel preview domain(s) if login is tested in previews
- Confirm auth redirect/session behavior still works under `www` domain
- Keep frontend Firebase config env vars in Vercel

Important:
- Hosting the frontend on Vercel does **not** require moving Firebase Auth.
- The API verifies Firebase ID tokens server-side using `firebase-admin`.

#### 5.4.7 Environment and Secret Placement

##### Vercel (Frontend Env Vars)

Keep in Vercel project envs:
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_API_URL=https://api.thinkmart.com`
- `NEXT_PUBLIC_WS_URL=wss://api.thinkmart.com`

##### Railway (API/Worker Env Vars)

Keep in Railway service envs (API + worker, scoped as needed):
- `GOOGLE_APPLICATION_CREDENTIALS` or JSON creds via secret env
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `REDIS_URL`
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL=https://cdn.thinkmart.com`
- `TYPESENSE_HOST`
- `TYPESENSE_API_KEY`

Security rule:
- Never store server secrets in Vercel frontend envs.

#### 5.4.8 Staging and Preview Deployment Model (Recommended)

Use separate environments for safe migration validation:

- **Frontend Staging**: Vercel preview or dedicated Vercel project/domain (`staging.thinkmart.com`)
- **API Staging**: separate Railway service or project (`api-staging.thinkmart.com`)
- **Turso Staging DB**: separate DB from production
- **Redis Staging**: separate instance/DB namespace
- **R2 Staging Bucket**: separate bucket or strict `staging/` prefix separation

Migration testing rule:
- Never point staging frontend to production API during migration validation.

#### 5.4.9 Deployment Pipeline and Promotion Flow

##### Frontend (Vercel)

- PR -> Vercel preview build
- Merge to `main` -> production deploy to `www`
- Optional: protected staging branch -> `staging.thinkmart.com`

##### API/Workers (Railway)

- PR CI runs tests only
- Merge to `main` -> deploy to staging Railway service first
- Promote same commit/image to production Railway services after validation
- Deploy API before worker changes only when backward compatible

##### Release Coordination for Migration Phases

- Read-path releases can ship independently behind flags
- Write-path (especially financial) releases require:
  - reconciliation scripts ready
  - rollback flags tested
  - on-call coverage available

#### 5.4.10 Rollback Strategy by Host Layer

##### Vercel Frontend Rollback

- Revert to previous deployment in Vercel
- Keep feature flags to route back to Firebase reads/writes if needed

##### Railway API Rollback

- Roll back to previous known-good deployment/service version
- Disable specific feature flags server-side (read/write/realtime/upload/jobs)
- If financial integrity issue occurs, freeze affected endpoints before full rollback

##### R2/CDN Rollback

- Application-level rollback is usually route-based (switch upload flow back)
- Do not delete R2 objects during rollback window
- Keep Firebase Storage path available until upload migration is stable

#### 5.4.11 Recommended Final Decision (for this plan)

Proceed with:
- **Frontend**: Vercel (`www.thinkmart.com`)
- **API + Workers**: Railway (`api.thinkmart.com` + internal worker services)
- **CDN/Object Storage**: Cloudflare R2 (`cdn.thinkmart.com`)

This is the best balance of speed, reliability, and operational complexity for the migration timeline in this plan.

#### 5.4.12 Railway Deployment Checklist (API + Workers)

Use this checklist when provisioning and deploying `api.thinkmart.com` on Railway.

##### A. Railway Project and Services

- Create one Railway project for production:
  - `thinkmart-prod`
- Create one Railway project for staging (recommended):
  - `thinkmart-staging`
- In each project, create services:
  - `thinkmart-api` (Fastify web service)
  - `thinkmart-worker` (BullMQ worker)
  - `thinkmart-scheduler` (optional cron/scheduled jobs)
  - `redis` (managed Redis, or connect external Redis)

##### B. Region Selection (Important)

- Choose Railway region closest to the majority of active users and/or Turso primary region.
- Keep API and Redis in the same region to reduce queue latency.
- If possible, align Railway region with the region used most for:
  - Turso primary writes
  - Typesense host
  - admin operations

Rule:
- Prioritize low latency between `API <-> Redis <-> Turso` over edge proximity to every user.

##### C. Build and Start Configuration

Define explicit service start commands (do not rely on defaults).

Example (adjust to actual package manager/scripts):

- `thinkmart-api`
  - Build command: `npm ci && npm run build`
  - Start command: `npm run start:api`

- `thinkmart-worker`
  - Build command: `npm ci && npm run build`
  - Start command: `npm run start:worker`

- `thinkmart-scheduler` (optional)
  - Build command: `npm ci && npm run build`
  - Start command: `npm run start:scheduler`

If using a monorepo:
- Set correct root/workdir for each service
- Use scoped scripts (example: `npm run --workspace server start:api`)

##### D. Health Checks and Readiness

For `thinkmart-api`, configure a health check path:
- `GET /health/live` (process is up)
- `GET /health/ready` (DB + Redis reachable)

Recommended Railway health check target:
- `/health/ready`

Health check requirements:
- Must fail if Turso is unreachable
- Must fail if Redis is required and unavailable
- Must not perform expensive queries

For workers:
- If Railway supports worker health checks, expose lightweight internal health endpoint or heartbeat metric
- Otherwise monitor worker liveness via logs + queue lag dashboards

##### E. Public Domain and Networking

- Attach custom domain to API service:
  - `api.thinkmart.com` -> `thinkmart-api`
- Keep worker and scheduler services private (no public domain)
- Confirm API service supports WebSocket upgrades for Socket.io

Post-setup validation:
- `https://api.thinkmart.com/health/live` returns 200
- `https://api.thinkmart.com/health/ready` returns 200
- WebSocket handshake succeeds from frontend staging domain

##### F. Environment Variables and Secrets (Railway)

Set in **API service**:
- `NODE_ENV=production`
- `PORT` (if Railway injects this, app must honor it)
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `REDIS_URL`
- `GOOGLE_APPLICATION_CREDENTIALS` or service account JSON secret env approach
- `R2_ACCOUNT_ID`
- `R2_ACCESS_KEY_ID`
- `R2_SECRET_ACCESS_KEY`
- `R2_BUCKET_NAME`
- `R2_PUBLIC_URL=https://cdn.thinkmart.com`
- `TYPESENSE_HOST`
- `TYPESENSE_API_KEY`
- `CORS_ALLOWED_ORIGINS=https://www.thinkmart.com,https://staging.thinkmart.com`
- `LOG_LEVEL=info`

Set in **Worker service** (minimum):
- `NODE_ENV=production`
- `TURSO_DATABASE_URL`
- `TURSO_AUTH_TOKEN`
- `REDIS_URL`
- R2 / Typesense / notification secrets only if worker uses them
- `LOG_LEVEL=info`

Set in **Scheduler service** (if used):
- Same as worker, limited to required secrets

Security checklist:
- Do not duplicate secrets across services unless needed
- Rotate service account and R2 keys before production cutover if they were shared in testing
- Store secrets in Railway secret manager only (not checked into repo)

##### G. Process Model and Scaling

- API service:
  - Run 1 instance initially for canary (if traffic is low), then scale as needed
  - Scale based on p95 latency, CPU, memory, and WebSocket connection count
- Worker service:
  - Run at least 1 dedicated instance
  - Scale worker separately from API based on queue lag and job throughput
- Scheduler service:
  - Single instance preferred (avoid duplicate cron execution unless jobs are lock-protected)

Operational rules:
- Do not co-locate workers inside API process in production
- Make all scheduled jobs idempotent and lock-protected

##### H. WebSocket / Socket.io Considerations on Railway

- Verify Railway service/network path supports WebSocket upgrades end-to-end
- Configure server CORS/origin allowlist to Vercel domains
- Ensure sticky sessions are not required, or configure Socket.io adapter/state strategy if scaling horizontally
- If scaling API horizontally later:
  - Use Redis adapter for Socket.io pub/sub (recommended)
  - Test event fan-out across instances

Validation checklist:
- Connect from `staging.thinkmart.com`
- Authenticated socket handshake with Firebase ID token
- `wallet:updated` event received after test mutation
- Reconnect behavior works after API restart

##### I. Deploy Promotion Workflow (Railway)

Staging-first promotion (recommended):
1. Deploy commit to `thinkmart-staging` API + worker
2. Run smoke tests (`/health`, auth middleware, core read endpoints)
3. Run integration tests for changed domains
4. Validate logs/metrics/queue behavior
5. Promote same commit to `thinkmart-prod`
6. Enable/adjust feature flags gradually

Financial-write release rule:
- Do not promote financial write changes without reconciliation scripts ready and on-call coverage confirmed

##### J. Logging, Monitoring, and Incident Readiness

Minimum before production cutover:
- API structured logs visible in Railway log viewer (or exported sink)
- Worker logs visible and searchable
- Error alerts configured (external system preferred)
- Queue lag and failure monitoring available

Recommended additions:
- External log sink (Datadog/Loki/etc.)
- Error tracking (Sentry or equivalent)
- Uptime checks on `/health/ready`

##### K. Railway Rollback Checklist

If deployment causes errors:
1. Disable impacted feature flags (read/write/realtime/upload/jobs)
2. Roll back `thinkmart-api` to previous known-good deployment
3. Roll back `thinkmart-worker` if job contract changed
4. Check queue backlog and failed jobs before re-enabling traffic
5. Run smoke tests and reconciliation checks

If financial integrity is at risk:
- Freeze affected endpoints first
- Then perform service rollback
- Then run reconciliation before reopening writes

##### L. Pre-Cutover Railway Signoff Checklist

- API service healthy (`/health/ready`)
- Worker service running and processing test queue jobs
- Redis connectivity stable
- WebSocket handshake and event delivery verified
- `api.thinkmart.com` TLS and DNS verified
- Env vars/secrets present in prod services
- Logs/alerts monitored by on-call owner
- Rollback procedure tested in staging

#### 5.4.13 Vercel Deployment Checklist (Frontend)

Use this checklist when provisioning and deploying `www.thinkmart.com` on Vercel.

##### A. Vercel Projects and Environments

- Create one Vercel project for production frontend (recommended):
  - `thinkmart-web`
- Configure environments:
  - Production
  - Preview (automatic for PRs)
  - Development (optional local sync)
- Optional: create a dedicated staging branch/domain:
  - `staging.thinkmart.com`

##### B. Domain and Routing Setup

- Attach custom domains:
  - `www.thinkmart.com` -> production deployment
  - `thinkmart.com` -> redirect to `https://www.thinkmart.com`
  - `staging.thinkmart.com` -> staging branch/deployment (optional but recommended)
- Confirm TLS is active for all domains (Vercel-managed certs).
- Enforce canonical host (`www`) to avoid cookie/session inconsistencies.

##### C. Build and Runtime Configuration

- Framework preset: `Next.js`
- Set Node.js version compatible with project and API contracts (recommend Node 20 if supported in project toolchain)
- Define explicit build command (if not default):
  - `npm run build`
- Define install command (if needed):
  - `npm ci`

If monorepo:
- Set root directory to the frontend app path
- Ensure Vercel builds only the frontend package/workspace

##### D. Environment Variables (Vercel Frontend)

Set these in Vercel project envs:

**Firebase Auth (kept)**
- `NEXT_PUBLIC_FIREBASE_API_KEY`
- `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`
- `NEXT_PUBLIC_FIREBASE_PROJECT_ID`
- `NEXT_PUBLIC_FIREBASE_APP_ID`

**API / Realtime**
- `NEXT_PUBLIC_API_URL=https://api.thinkmart.com`
- `NEXT_PUBLIC_WS_URL=wss://api.thinkmart.com`

**Optional environment-specific values**
- `NEXT_PUBLIC_API_URL=https://api-staging.thinkmart.com` (staging/preview if routing to staging API)
- `NEXT_PUBLIC_WS_URL=wss://api-staging.thinkmart.com`

Rules:
- Do not place server secrets in Vercel frontend envs
- Keep preview env vars isolated if preview deployments are used for real auth testing

##### E. Firebase Auth Authorized Domains (Critical for Vercel)

Because Firebase Auth remains active, update Firebase Console -> Authentication -> Settings -> Authorized domains.

Add domains used by the frontend:
- `www.thinkmart.com`
- `thinkmart.com` (if users can land here before redirect)
- `staging.thinkmart.com` (if used)
- Vercel preview domain(s) if login is tested on preview deployments

Operational recommendation:
- If preview login is not required, do **not** authorize broad preview domains; limit auth testing to staging only.

Validation checklist:
- Login works on `www`
- Register works on `www`
- Password reset flow opens correctly from Vercel domain
- `user.getIdToken()` can be used successfully against `api.thinkmart.com`

##### F. Frontend-to-API Integration Checks

- Confirm browser calls to `https://api.thinkmart.com` succeed from Vercel-hosted frontend
- Confirm CORS on API allows:
  - `https://www.thinkmart.com`
  - `https://staging.thinkmart.com` (if used)
- Confirm WebSocket handshake to `wss://api.thinkmart.com` succeeds
- Confirm mixed-content issues do not exist (HTTPS/WSS only)

##### G. Caching, Headers, and Asset Behavior

Review Vercel/Next.js behavior for:
- Static asset caching
- API route caching (if any frontend server routes remain)
- Image optimization settings (if using `next/image`)

If using `next/image` with R2 CDN assets:
- Add `cdn.thinkmart.com` to allowed remote image domains/patterns
- Validate image rendering and caching behavior after migration

Security/UX headers to verify:
- `Strict-Transport-Security`
- `X-Content-Type-Options`
- `Referrer-Policy`
- CSP policy (if configured; verify it allows API/CDN/WebSocket origins)

##### H. Preview and Staging Strategy (Recommended)

Choose one of these models:

1. **Preferred**: Production + dedicated staging
- `www.thinkmart.com` -> production Vercel deployment
- `staging.thinkmart.com` -> staging branch deployment
- PR previews for UI-only validation (limited auth)

2. **Alternative**: Heavy use of PR previews
- Every PR gets preview URL
- Requires careful Firebase authorized domain management
- Higher risk of auth confusion if previews call production API

Rule:
- Do not let preview deployments use production API for write-path testing.

##### I. Deployment Promotion Workflow (Vercel)

Recommended flow:
1. Open PR -> preview deploy generated
2. Validate UI and non-prod integrations
3. Merge to staging branch (optional) -> `staging.thinkmart.com`
4. Run smoke/E2E against staging API
5. Merge/promote to `main` -> `www.thinkmart.com`
6. Enable feature flags gradually (reads first, then writes/realtime/uploads)

Migration release rule:
- Frontend changes that switch data sources must remain feature-flagged until corresponding backend domain is validated.

##### J. Vercel Rollback Checklist

If frontend deployment causes issues:
1. Roll back to previous Vercel deployment
2. Disable related feature flags (read/write/realtime/upload)
3. Confirm Firebase-based fallback paths still function
4. Re-run smoke tests on `www`
5. Verify login and dashboard routing before resuming rollout

If issue is only visual/UI and not data integrity:
- Prefer frontend rollback first without touching Railway services

##### K. Pre-Cutover Vercel Signoff Checklist

- `www.thinkmart.com` resolves correctly with TLS
- `thinkmart.com` redirects to `www`
- Firebase Auth login/register/reset verified on `www`
- `NEXT_PUBLIC_API_URL` and `NEXT_PUBLIC_WS_URL` point to production API
- `cdn.thinkmart.com` assets render in frontend where required
- API and WebSocket connectivity verified from browser
- Feature flags present in frontend and defaulted safely
- Rollback to previous Vercel deployment tested in staging/pre-prod

#### 5.4.14 Day 0 Infrastructure Setup Checklist (Ordered)

Use this on the first infrastructure setup day to establish the hosting baseline before application migration work starts.

##### Goal of Day 0

Create all hosting/runtime foundations and confirm the core network path works:

- `www.thinkmart.com` (Vercel frontend)
- `api.thinkmart.com` (Railway API)
- `cdn.thinkmart.com` (R2 custom domain)
- Firebase Auth on Vercel frontend
- API connectivity from frontend to Railway

##### Day 0 Ordered Steps (Do in Sequence)

1. **Create staging and production environment plan**
- Decide exact names for:
  - Vercel projects/environments
  - Railway projects/services
  - Turso DBs
  - Redis instances
  - R2 buckets
- Record them in the migration parity tracker / infra sheet.

2. **Provision TursoDB (staging + prod)**
- Create staging and production databases.
- Generate auth tokens.
- Store credentials in a secure secret manager.
- Record DB URLs and regions.

3. **Provision Redis (staging + prod)**
- Create Redis instances (Railway-managed or external).
- Verify connection strings.
- Record regions and ensure proximity to Railway API region.

4. **Create R2 buckets and CDN domain plan**
- Create staging and production buckets (recommended).
- Define object prefixes:
  - `users/`
  - `products/`
  - `kyc/`
- Decide which prefixes are public vs private access.
- Reserve/prepare `cdn.thinkmart.com` and optional `cdn-staging.thinkmart.com`.

5. **Create Railway projects/services**
- Create `thinkmart-staging` and `thinkmart-prod`.
- Add services:
  - `thinkmart-api`
  - `thinkmart-worker`
  - `thinkmart-scheduler` (optional)
  - `redis` (if using Railway Redis)
- Set target region(s) before deploying app code.

6. **Create Vercel frontend project**
- Create `thinkmart-web` project.
- Connect repo and set frontend root directory (if monorepo).
- Enable preview deployments.
- Create staging branch/domain strategy if using `staging.thinkmart.com`.

7. **Set baseline secrets and env vars (staging first)**
- In Railway staging: Turso, Redis, R2, Typesense, Firebase Admin secrets.
- In Vercel staging/preview: Firebase Auth public envs + API/WS URLs.
- Do not set production values into preview envs by default.

8. **Deploy minimal API service to Railway**
- Deploy a minimal Fastify service with:
  - `/health/live`
  - `/health/ready`
- Confirm Railway deployment is stable and logs are visible.
- Confirm readiness checks work.

9. **Attach API domain and verify TLS**
- Map `api-staging.thinkmart.com` (recommended first) and/or `api.thinkmart.com` for prod later.
- Validate:
  - DNS resolution
  - TLS certificate issuance
  - `GET /health/live`
  - `GET /health/ready`

10. **Deploy frontend to Vercel with API health check UI test**
- Deploy frontend (staging or preview first).
- Confirm frontend loads on Vercel domain.
- Confirm it can call API health endpoint from browser (CORS test).

11. **Configure Firebase Auth authorized domains**
- Add Vercel domains used for login testing:
  - `www.thinkmart.com`
  - `staging.thinkmart.com` (if used)
  - preview domain(s) only if required
- Verify Firebase login/register works from Vercel-hosted frontend.

12. **Attach R2 custom CDN domain**
- Map `cdn.thinkmart.com` (and staging equivalent if used).
- Verify public object access for a test asset.
- Confirm private object strategy for KYC remains private (no public listing/access).

13. **End-to-end Day 0 smoke validation**
- Browser loads frontend from Vercel
- Frontend calls Railway API over HTTPS
- API health endpoints pass
- Firebase Auth login works on hosted frontend
- WebSocket handshake test passes (if API socket endpoint is already enabled)
- Test image loads from `cdn.thinkmart.com` (if configured)

14. **Document and freeze baseline**
- Record final domains, regions, env var names, and service names in docs.
- Save screenshots/links for dashboards and deployment consoles.
- Mark Day 0 complete in migration tracker.

##### Day 0 Deliverables (Definition of Done)

- Vercel project created and reachable
- Railway API service deployed and reachable via custom domain
- Redis and Turso credentials provisioned and stored securely
- R2 bucket(s) and custom domain configured
- Firebase Auth works on hosted frontend domain(s)
- Frontend -> API HTTPS connectivity verified
- Infrastructure inventory documented

##### Common Day 0 Mistakes to Avoid

- Pointing Vercel preview builds to production API for write testing
- Forgetting Firebase Auth authorized domain updates for Vercel/staging domains
- Running workers inside API service process as a shortcut
- Mixing staging and production secrets
- Skipping custom-domain/TLS verification until later (creates avoidable cutover delays)

---

## 6. Delivery Strategy and Team Model

### 6.1 Recommended Team Composition

Minimum (2 senior engineers):
- Engineer A: Backend/API + DB + jobs + auth middleware
- Engineer B: Frontend refactor + WebSocket client + integration/E2E + cutover coordination

Preferred (3 engineers):
- Engineer A: API/services and authz
- Engineer B: Data migration/ETL + DB validation + observability
- Engineer C: Frontend migration + real-time + uploads

### 6.2 Workstreams (parallelized where safe)

- Workstream 1: Platform and infra
- Workstream 2: Schema and migration tooling
- Workstream 3: API and business logic porting
- Workstream 4: Frontend refactor to API/WebSocket
- Workstream 5: QA, validation, security, and cutover ops

### 6.3 Delivery Principles

- Migrate by domain, not by code file alone
- Reads before writes for the same domain
- Low-risk domains before financial domains
- Keep rollback path open until cutover + hypercare complete
- Use feature flags per capability (read/write/realtime/upload), not one global flag

---

## 7. Phase-Wise Execution Plan (Detailed)

## Phase 0: Program Planning and Control Setup (Week 0 to Week 1)

### Objective

Convert the migration strategy into an executable program with clear ownership, sequencing, and go/no-go gates.

### Dependencies

- None

### Tasks

#### Program Governance

- Approve the hybrid migration strategy as baseline.
- Define migration scope freeze and change control policy.
- Assign phase owners and on-call owners for cutover/hypercare.
- Create a decision log for architecture and risk decisions.

#### Migration Inventory and Parity Tracking

- Build a parity tracker for:
  - Firestore collections -> Turso tables
  - Cloud Functions -> API routes/services
  - `onSnapshot` listeners -> WebSocket/SSE/polling
  - Storage paths -> R2 object prefixes
- Assign each item a migration status:
  - not started
  - schema ready
  - read ready
  - write ready
  - tested
  - cutover enabled
  - Firebase retired

#### Rollout and Feature Flag Strategy

- Define flags (frontend and server side):
  - `tm_read_api_enabled`
  - `tm_write_api_enabled`
  - `tm_realtime_enabled`
  - `tm_upload_r2_enabled`
  - `tm_jobs_enabled`
- Decide flag granularity:
  - global
  - by domain (recommended)
  - by user cohort (recommended for canary)

#### Quality Gates and Metrics

- Define SLOs and thresholds:
  - API error rate
  - p95/p99 latency
  - WebSocket event delivery time
  - DB query latency
  - job failure rate
- Define data integrity gates:
  - row counts
  - wallet reconciliation
  - order total consistency
  - referral tree integrity

### Deliverables

- Migration charter
- Parity tracker spreadsheet or markdown
- Feature flag matrix
- Phase exit criteria checklist
- Initial risk register

### Milestone

- Program kickoff approved and engineering can start build work

### Exit Criteria

- Strategy approved
- Owners assigned
- Quality and rollback criteria documented
- Parity tracker created

---

## Phase 1: Platform Foundation (Infra, API Skeleton, Observability) (Week 1 to Week 2)

### Objective

Provision the new runtime stack and prove the API can authenticate users using Firebase tokens.

### Dependencies

- Phase 0 complete

### Tasks

#### Infrastructure Provisioning

- Provision TursoDB:
  - staging database
  - production database
  - auth tokens and least-privileged credentials
- Provision Redis:
  - staging
  - production
  - secure network access
- Provision Cloudflare R2:
  - bucket(s): staging and production
  - prefix conventions: `users/`, `kyc/`, `products/`
  - public/private access policy definitions
- Provision API runtime hosting (example: Fly.io, Railway, Render, ECS, Cloud Run, or VM)

#### API Server Bootstrap

- Initialize `server/` Fastify project with TypeScript.
- Add config loader with environment validation (Zod or equivalent).
- Add request ID middleware, structured logging (Pino), error handler.
- Add health endpoints:
  - `GET /health/live`
  - `GET /health/ready`
- Add DB and Redis connectivity checks.
#### Auth Bridge (Foundation Only)

- Add `firebase-admin` initialization.
- Implement token verification helper.
- Implement auth middleware skeleton that:
  - verifies Firebase ID token
  - extracts `uid` and `email`
  - loads user role from Turso (stub or temporary mock until schema exists)

#### Observability and Ops

- Set up metrics endpoint (Prometheus format if used).
- Define dashboards:
  - HTTP latency/error dashboard
  - DB latency/error dashboard
  - Redis/job dashboard
  - WebSocket connection dashboard (later phase)
- Set alerts for basic service health and elevated error rate.

#### CI/CD

- Add API server build/test pipeline.
- Add migration execution step for staging deploys.
- Add deployment strategy (blue/green or rolling) for API.

### Deliverables

- Running API service in staging
- Connectivity to Turso and Redis
- Verified Firebase token authentication in staging test route
- Basic logs, metrics, alerts

### Milestone

- Foundation stack is production-shaped and operable

### Exit Criteria

- `GET /health/ready` reflects DB/Redis state
- Firebase ID token verification proven end-to-end in staging
- CI passes on API server

### Rollback

- No user traffic moved yet; rollback is simply disabling API deployment

---

## Phase 2: Schema Finalization and Data Migration Toolchain (Week 2 to Week 3)

### Objective

Build the repeatable ETL pipeline and validate schema design against real Firestore data.

### Dependencies

- Phase 1 complete

### Tasks

#### Schema and Migrations

- Finalize SQL DDL and indexes (use hybrid schema: no `password_hash` table/fields).
- Add migration files for all core tables.
- Add constraints and checks for roles/status values.
- Add audit log, idempotency key, and job tracking tables if not already in plan.

#### ETL Pipeline (Repeatable)

- Implement export scripts from Firestore for all collections.
- Implement transform scripts:
  - Firestore timestamps -> ISO strings
  - nested objects -> JSON columns
  - arrays -> JSON columns or normalized tables (per final schema)
  - enum normalization and status mapping
  - missing/null field handling
- Implement import scripts to TursoDB with batching and retries.

#### Validation Tooling

- Row count comparison script per collection/table.
- Referential integrity checks (logical consistency for user/order/wallet relations).
- Wallet reconciliation script:
  - expected wallet = sum credits - sum debits
- Order total validation script:
  - item totals + discounts + coin/cash split consistency
- Referral tree validation:
  - no cycles
  - no orphan references
  - valid upline path encoding

#### Dry Runs and Performance Check

- Run dry-run export/transform/import on staging snapshot.
- Measure runtime and batch sizes.
- Tune ETL chunking and retry policy.
- Produce validation report and fix transform mismatches.

### Deliverables

- SQL migration set (all tables)
- ETL scripts (export, transform, import, validate, delta sync skeleton)
- Validation report format
- Dry-run timing and performance notes

### Milestone

- Data migration process is deterministic and testable

### Exit Criteria

- Staging backfill completes successfully
- Validation report passes agreed thresholds
- ETL is rerunnable without corrupting data (idempotent or clean-reset mode documented)

### Rollback

- No production traffic moved yet; rollback is schema/ETL iteration only

---

## Phase 3: Auth Bridge + User Profile and Wallet Read Foundation (Week 3 to Week 4)

### Objective

Keep Firebase Auth for identity while moving user profile and wallet data reads/writes to Turso via API.

### Dependencies

- Phase 2 schema and ETL for `users` and `wallets`

### Tasks

#### API Implementation (User Foundation)

- Implement auth middleware fully:
  - verify token
  - load role/is_banned/is_active from `users`
  - attach request user context
- Implement routes:
  - `GET /api/users/me`
  - `POST /api/users/register`
  - `PATCH /api/users/:id` (safe self-update)
  - `GET /api/wallet`
  - `GET /api/wallet/transactions` (read only, paginated)
- Add Zod schemas for all requests/responses.
- Add service/repository layers for users and wallet.

#### Registration Flow (Hybrid)

- Frontend keeps `createUserWithEmailAndPassword` in Firebase Auth.
- After Firebase user creation, frontend calls `POST /api/users/register` with Firebase ID token.
- API creates `users` and `wallets` rows transactionally.
- Referral code processing happens in API service (or queued if async).

#### Frontend Refactor (Foundation)

- Create `lib/api/client.ts` with Firebase token attachment.
- Update login page to fetch profile via `GET /api/users/me` instead of Firestore.
- Update register page to create profile via `POST /api/users/register` instead of Firestore `setDoc`.
- Update `hooks/useAuth.ts` to fetch profile via API (realtime profile updates deferred to later phase).

#### Data Migration and Safety

- Backfill `users` and `wallets` to Turso for existing accounts.
- Add remediation path for users with Firebase account but missing Turso profile:
  - explicit error state
  - retry endpoint or support/admin fix script

### Deliverables

- Hybrid login/register/profile path working in staging
- Frontend `apiClient` merged
- User and wallet data in Turso

### Milestone

- First production-safe hybrid feature path exists (Firebase Auth + Turso profile)

### Exit Criteria

- Register -> login -> dashboard profile works in staging and canary
- No direct Firestore profile read required for login flow
- Missing profile edge case handled gracefully

### Rollback

- Re-enable old login/register Firestore profile flow via feature flag

---

## Phase 4: Read-Path Migration (Wave 1 - Public and Low-Risk User Domains) (Week 4 to Week 5)

### Objective

Move low-risk reads first to reduce Firebase read load while minimizing business risk.

### Dependencies

- Phase 3 complete
- Phase 2 full backfill available for relevant collections

### Domain Order (Wave 1)

- Public settings
- Product catalog (list/detail/search proxy integration)
- Categories/brands/banners
- Reviews (read)
- Tasks (active tasks)
- Wishlist (read)

### Tasks

#### API Routes and Services

- Implement GET endpoints for Wave 1 domains.
- Add pagination, sorting, filtering, and validation.
- Add response DTOs matching frontend expectations (or version and adapt frontend).

#### Frontend Refactor

- Replace Firestore reads in corresponding `services/*.service.ts` and hooks with `apiClient.get(...)`.
- Maintain UI behavior and loading states.
- Add error boundary or toast behavior for API errors.

#### Validation

- Dual-read comparison in staging for sampled users and common filters.
- Compare returned field shape and pagination semantics.
- Verify cache headers and client-side caching behavior if used.

### Deliverables

- Wave 1 read APIs and frontend integrations
- Dual-read validation report for Wave 1

### Milestone

- Public and low-risk reads served from Turso/API

### Exit Criteria

- Wave 1 pages render with acceptable parity and performance
- Feature flag can enable API reads for canary cohort

### Rollback

- Toggle `tm_read_api_enabled` (global or domain-specific) back to Firebase reads

---

## Phase 5: Read-Path Migration (Wave 2 - Transactional and Admin/Vendor/Partner Reads) (Week 5 to Week 7)

### Objective

Move complex reads (orders, transactions, withdrawals, dashboards) after Wave 1 stabilizes.

### Dependencies

- Phase 4 stable in staging and canary
- Full ETL validated for transactional collections

### Domain Order (Wave 2)

1. User transactional reads
   - orders list/detail
   - withdrawals history
   - wallet transactions
2. Referral/team views
3. Vendor dashboard reads (products/orders/analytics)
4. Partner dashboard reads (commissions/city data)
5. Admin dashboard reads (metrics/audit/users/moderation)

### Tasks

#### API Read Endpoints

- Implement all remaining GET routes, including admin/vendor/partner scoped queries.
- Preserve role and ownership checks for each route.
- Add index verification for heavy queries (city+role+date, status+date, etc.).

#### Frontend Refactor

- Replace all remaining Firestore read methods in hooks/services/pages.
- Replace `onSnapshot`-dependent list views with API polling temporarily if realtime not yet migrated.
- Keep feature flags to switch per-domain data source.

#### Dual-Read Validation and Performance

- Run automated comparison for 100+ sample users and role cohorts.
- Compare admin aggregate results across both systems (allowing known rounding or timestamp representation differences).
- Measure p95 latency and DB query performance.
- Tune indexes and query plans.

### Deliverables

- All read paths implemented in API
- Frontend read refactor complete
- Performance and parity reports

### Milestone

- Firestore reads are no longer required for app operation (except fallback path)

### Exit Criteria

- All dashboard pages render via API in staging and production canary
- Acceptable mismatch threshold and documented exceptions
- Read-path error rate and latency within targets

### Rollback

- Per-domain or global read feature flag rollback to Firestore

---

## Phase 6: Write-Path Migration (Wave 1 - Low/Medium Risk Writes) (Week 7 to Week 8)

### Objective

Port non-financial and less sensitive writes to API/services before financial flows.

### Dependencies

- Phase 5 read paths stable

### Domain Order (Wave 1 Writes)

- Wishlist CRUD
- Review create/update/delete/helpful
- User profile safe updates
- KYC metadata submission (file upload integration finalization in later phase)
- Product CRUD (vendor/admin)
- Public/admin settings writes (non-financial)

### Tasks

#### API Writes and Business Logic

- Implement route handlers + service methods with validation.
- Add ownership checks for user content.
- Add role checks for admin/vendor actions.
- Add audit logging where required.

#### Idempotency and Error Model

- Implement idempotency middleware/util for eligible POST endpoints.
- Standardize API error codes and messages for frontend compatibility.

#### Frontend Refactor

- Replace low/medium-risk `httpsCallable()` and Firestore write calls with `apiClient` writes.
- Keep feature flag control for write routing.

#### Testing

- Unit + integration tests per migrated write domain.
- Negative authorization tests.

### Deliverables

- Wave 1 write routes and frontend integrations
- Idempotency utilities and error handling baseline

### Milestone

- Non-financial write traffic can run on API safely

### Exit Criteria

- Wave 1 writes pass integration tests and canary
- Audit logs and auth checks verified

### Rollback

- Toggle `tm_write_api_enabled` for impacted domains back to Firebase/Functions

---

## Phase 7: Write-Path Migration (Wave 2 - Financial and High-Risk Logic) (Week 8 to Week 10)

### Objective

Port the highest-risk business logic from Cloud Functions to transactional API services with strict validation and reconciliation.

### Dependencies

- Phase 6 stable
- Transaction and idempotency utilities mature
- Data validation scripts available

### High-Risk Domains (Must Be Last in Write Migration)

- Order creation and updates
- Wallet debits/credits and transaction logging
- Withdrawals request/approval/processing
- Membership purchase flows
- MLM/referral income distribution (multi-level)
- Admin financial operations and corrections

### Core Implementation Requirements

#### Transaction Safety

- Every financial mutation must be wrapped in a DB transaction.
- Related writes must commit atomically:
  - wallet balance update
  - transaction row insert
  - order row/status history update
  - audit log insert (if synchronous policy)
- Failed transaction must not emit realtime event or enqueue downstream job.

#### Idempotency

- Use idempotency key table for retry-safe endpoints:
  - order creation
  - withdrawal request
  - membership purchase
  - any webhook-like or client retry-prone endpoints
- Store request fingerprint + response summary + expiry.

#### Reconciliation Hooks

- Add post-operation validation hooks or async reconciliation jobs for:
  - wallet balances
  - duplicate transactions
  - inconsistent order totals/status transitions

### Tasks

#### API Porting

- Port Cloud Functions to Fastify routes and services by domain.
- Preserve validation and business rules from current functions.
- Implement status transition guards (order/withdrawal/KYC states).
- Implement admin permissions checks (sub-admin granular permissions if applicable).

#### Frontend Replacement

- Replace `lib/firebase/callable.ts` usage across services with `apiClient.post/patch/...`.
- Keep route-level feature flag routing until production confidence is achieved.

#### QA and Validation

- Golden-path test cases for known financial scenarios.
- Concurrency tests (double submit, retries, race conditions).
- Reconciliation script runs after test suites.

### Deliverables

- Financial and high-risk write APIs
- Frontend callable replacement complete
- Reconciliation reports for test/canary runs

### Milestone

- Cloud Functions no longer needed for business-critical writes (behind rollback flags)

### Exit Criteria

- Order flow, withdrawal flow, and MLM distribution pass integration and staging load tests
- No unresolved reconciliation failures in canary cohort
- Operational runbook for financial incident response exists

### Rollback

- Route/domain level write feature flag rollback to Cloud Functions
- Freeze affected write domain if integrity issue detected

---

## Phase 8: Real-Time, Storage, and Background Jobs Migration (Week 10 to Week 12)

### Objective

Remove remaining runtime dependencies on Firestore listeners, Firebase Storage, and Firestore triggers.

### Dependencies

- Phase 7 stable (realtime events should emit from new write source)
- Redis and R2 already provisioned

### Workstream A: Real-Time Replacement

#### Listener Replacement Strategy

- Keep WebSocket only where realtime materially improves UX:
  - profile updates
  - wallet updates
  - order detail updates
- Use polling/SSE for lower-frequency views:
  - order list
  - withdrawal history

#### Tasks

- Implement Socket.io server with Firebase token authentication.
- Implement room strategy:
  - user room (`user:{uid}`)
  - order room (`order:{id}`)
  - optional admin rooms
- Implement event emitters triggered only after successful DB commit.
- Implement frontend `lib/api/websocket.ts` and reconnection behavior.
- Replace `onSnapshot` listeners in hooks/store/pages with WebSocket/SSE/polling.
- Define fallback behavior if socket unavailable.

#### Acceptance Targets

- Wallet/profile updates delivered within 2 seconds in staging and canary.
- Client reconnect and duplicate listener cleanup verified.

### Workstream B: Storage Migration (Firebase Storage to R2)

#### Tasks

- Implement `POST /api/uploads/presign` (and domain-specific variants if needed).
- Validate upload policy:
  - MIME types
  - max size
  - allowed prefixes by user role/domain
- Implement callback/finalize endpoint to record uploaded object metadata in DB.
- Refactor frontend KYC and product uploads to presigned R2 flow.
- Bulk migrate existing Firebase Storage objects to R2.
- Validate migrated URLs and object counts.

#### Acceptance Targets

- KYC upload end-to-end works (upload + submit + admin review retrieval).
- Product images upload and render from R2/CDN.
- URL validation script confirms accessibility and expected metadata.

### Workstream C: Trigger and Job Migration (Firestore Triggers to BullMQ)

#### Tasks

- Implement BullMQ queues and worker processes.
- Port Firestore trigger behaviors to event-driven jobs:
  - user created -> referral initialization
  - transaction created -> downstream computations
  - badge/leaderboard updates
  - notifications
- Add retry, dead-letter handling, and job observability.
- Add idempotent job handlers for repeat processing safety.

#### Acceptance Targets

- Jobs process successfully in staging under replay/retry conditions.
- Trigger parity verified for core flows (registration, transactions, gamification).

### Deliverables

- Realtime replacement complete
- R2 upload flows complete
- BullMQ jobs and workers complete

### Milestone

- Firestore listeners, Firebase Storage, and Firestore triggers no longer required

### Exit Criteria

- `tm_realtime_enabled`, `tm_upload_r2_enabled`, and `tm_jobs_enabled` can run in canary and production without critical issues
- Firebase Storage and Firestore trigger usage at or near zero in logs

### Rollback

- Re-enable Firestore listeners or polling fallback (temporary) via feature flags
- Switch uploads back to Firebase Storage only if object integrity issue exists and old path remains available
- Disable job consumers and revert to Cloud Function triggers if still available during transition window

---

## Phase 9: Cutover Rehearsal and Production Cutover (Week 12 to Week 13)

### Objective

Execute a controlled cutover with validated rollback and production hypercare readiness.

### Dependencies

- Phases 1 through 8 complete
- Realtime/storage/jobs stable in canary

### Step 1: Rehearsal in Staging (Mandatory)

- Run full backfill from Firestore snapshot.
- Run delta sync.
- Enable all feature flags.
- Execute smoke suite and critical E2E flows.
- Simulate failure and rollback for at least one domain.
- Document timings and operator actions.

### Step 2: Production Cutover Preparation

- Announce maintenance/risk window internally (and externally if needed).
- Freeze schema changes and high-risk feature development.
- Prepare on-call roster and communication channel.
- Confirm dashboard/alert visibility.
- Confirm rollback toggles tested.

### Step 3: Final Sync and Flag Rollout

- Run final data backfill sanity check (if needed).
- Run final delta sync for recent changes.
- Enable flags in sequence (recommended):
  1. reads
  2. writes (low/medium)
  3. writes (financial)
  4. realtime
  5. uploads
  6. jobs
- Monitor metrics and validation checks after each step before proceeding.

### Step 4: Immediate Post-Cutover Validation

- Execute smoke tests for all roles.
- Run reconciliation scripts for wallet/order/withdrawal data.
- Check job queues, WebSocket connections, and upload success rate.
- Validate zero unexpected Firestore/Functions/Storage calls in logs (except fallback/testing).

### Deliverables

- Rehearsal runbook and timing report
- Production cutover checklist and signoff
- Hypercare monitoring dashboard links and escalation matrix

### Milestone

- Production traffic on Turso/API/R2 stack

### Exit Criteria

- No Sev-1 incidents during cutover window
- Critical flows pass smoke tests
- Reconciliation checks pass or documented acceptable deltas exist

### Rollback

- Disable flags in reverse order and route traffic back to Firebase paths
- Keep Firebase services active during rollback window (minimum 30 days recommended)

---

## Phase 10: Hypercare, Cleanup, and Decommission (Week 13 to Week 16)

### Objective

Stabilize production after cutover, then remove deprecated Firebase data/runtime dependencies safely.

### Dependencies

- Phase 9 complete and stable

### Hypercare (Days 1 to 7 after cutover)

- Extended on-call coverage for first 48 hours.
- Run daily reconciliation scripts.
- Track and triage all parity or integrity alerts.
- Hold daily migration review (15 to 30 min).

### Cleanup (After Stability Confirmed)

- Remove frontend Firestore/Functions/Storage SDK data paths.
- Delete deprecated frontend helpers:
  - `lib/firebase/firestore.ts`
  - `lib/firebase/callable.ts`
  - `lib/firebase/functions.ts`
  - `lib/firebase/storage.ts`
  - `lib/firebase/productImageUpload.ts`
- Slim `lib/firebase/config.ts` to auth-only export.
- Archive or remove `functions/` project after confirmed no fallback need.
- Remove `firestore.rules`, `firestore.indexes.json`, `storage.rules` from active deployment path.
- Update docs and onboarding for new architecture.

### Decommission (After Rollback Window)

- Disable Firestore database usage (or fully disable service if approved).
- Disable Cloud Functions deployment/traffic.
- Disable Firebase Storage usage.
- Keep Firebase Auth enabled (hybrid steady state).

### Deliverables

- Cleanup PR(s)
- Updated architecture docs/runbooks
- Decommission approval record

### Milestone

- Hybrid migration complete and legacy Firebase data/runtime dependencies retired

### Exit Criteria

- Zero Firestore/Functions/Storage production calls for 7 consecutive days
- Rollback window closed by explicit approval
- Documentation and runbooks updated

### Rollback

- During hypercare only: re-enable feature flags and Firebase fallback paths if still preserved
- After decommission approval: rollback requires formal incident response and restoration plan

---

## 8. Detailed Dependency Graph and Execution Order

### 8.1 Hard Dependencies

- Phase 1 depends on Phase 0
- Phase 2 depends on Phase 1 (DB/API runtime exists)
- Phase 3 depends on Phase 2 (`users`/`wallets` ETL and schema validated)
- Phase 4 depends on Phase 3 (auth bridge and API client foundation)
- Phase 5 depends on Phase 4 (read parity established first)
- Phase 6 depends on Phase 5 (for stable data views before write cutover)
- Phase 7 depends on Phase 6 (write utilities/idempotency patterns proven)
- Phase 8 depends on Phase 7 (realtime/jobs must emit from canonical write path)
- Phase 9 depends on Phase 8
- Phase 10 depends on Phase 9

### 8.2 Recommended Parallelization (Safe)

Can run in parallel:
- API skeleton + observability + CI (Phase 1)
- ETL tooling + schema migration iteration (Phase 2)
- Frontend `apiClient` scaffolding while API user routes are being built (Phase 3)
- Wave 1 read endpoints and frontend service migrations across separate domains (Phase 4)

Do not parallelize aggressively:
- Financial write migration across multiple domains without shared transaction/idempotency primitives finalized
- Realtime migration before write path source of truth is stable
- Cleanup/deletion before rollback window and monitoring criteria are met

---

## 9. Domain Migration Matrix (Recommended Order)

Use this order to reduce risk while preserving momentum.

| Order | Domain | Read Migration | Write Migration | Risk | Notes |
|:-----|:-------|:--------------|:---------------|:-----|:------|
| 1 | Public settings | Yes | Admin only later | Low | Simple reads, good API baseline |
| 2 | Catalog/products/categories/brands/banners | Yes | Vendor/Admin writes later | Low/Med | High traffic, good SQL payoff |
| 3 | Reviews | Yes | Yes | Medium | Authz and moderation edge cases |
| 4 | Wishlist | Yes | Yes | Low | Good first write migration |
| 5 | Tasks/gamification reads | Yes | Partial | Medium | Business logic can be complex |
| 6 | User profile/wallet reads | Yes | Profile writes | Medium | Hybrid auth foundation |
| 7 | Orders (reads) | Yes | No yet | High | Validate status/history modeling first |
| 8 | Withdrawals (reads) | Yes | No yet | High | Prepares for financial write migration |
| 9 | Admin/vendor/partner dashboards | Yes | Partial | Medium/High | Query/index heavy |
| 10 | Product/admin non-financial writes | Already read | Yes | Medium | Permissions and audit logs |
| 11 | Orders and wallet writes | Already read | Yes | High | Transaction + idempotency critical |
| 12 | Withdrawals and membership | Already read | Yes | High | Financial + admin controls |
| 13 | MLM/referral distributions | Already read | Yes | Very High | Use golden tests and reconciliation |
| 14 | Realtime listeners | N/A | Event emissions | Medium | Only after writes stable |
| 15 | Storage uploads and file migration | N/A | Yes | Medium | R2 and object integrity validation |
| 16 | Background jobs and triggers | N/A | Event driven | Medium/High | Idempotent workers required |

---

## 10. LLM-Ready Implementation Backlog (Code Packages)

This section is intentionally structured as work packages that can be given to an LLM one at a time.

### 10.1 Usage Rules for LLM Coding Tasks

For every LLM coding task:
- Provide exact files to modify/create.
- Provide acceptance criteria and tests to add/update.
- Require no unrelated refactors.
- Require typed DTOs and Zod validation.
- Require authorization checks where relevant.
- Require logging on error paths and key mutation paths.
- Require idempotency for retry-prone POST endpoints.

### 10.2 Work Package Sequence

#### Package 1: API server bootstrap
- Create `server/src/app.ts`, `server/src/index.ts`
- Add config validation, logging, health routes
- Add DB and Redis client stubs
- Tests: health route tests
- Acceptance: service starts and `/health/ready` returns success when dependencies are mocked

#### Package 2: Auth middleware (Firebase token verification)
- Create `server/src/middleware/auth.ts`
- Add `firebase-admin` initialization and token verify helper
- Add request context typing (`uid`, `email`, `role`)
- Tests: missing token, invalid token, banned user, valid user
- Acceptance: protected test route returns 401/403/200 correctly

#### Package 3: DB schema migrations and shared SQL utilities
- Add migration files for `users`, `wallets`, `transactions`, `orders`, `withdrawals`, `reviews`, `wishlists`, `audit_logs`, `idempotency_keys`
- Add migration runner script
- Tests: migration applies on local test DB
- Acceptance: schema can be created from scratch in staging

#### Package 4: Frontend `apiClient`
- Create `lib/api/client.ts`
- Attach Firebase ID token automatically
- Standardize error parsing
- Tests: unit tests with mocked `fetch`
- Acceptance: authenticated requests include `Authorization: Bearer <token>`

#### Package 5: User profile and register API + frontend auth page integration
- Routes: `GET /api/users/me`, `POST /api/users/register`
- Frontend: update login/register pages and `hooks/useAuth.ts`
- Tests: register/login/profile integration flow (Firebase mocked if necessary)
- Acceptance: hybrid auth path works without Firestore profile reads

#### Package 6: Wallet read endpoints and hook migration
- Routes: wallet balance + transactions list
- Frontend: `hooks/useWallet.ts`
- Tests: pagination, authz, empty wallet state
- Acceptance: wallet UI renders from API

#### Package 7: Wave 1 read domains
- Public settings, products, reviews read, tasks, wishlist read
- Frontend service migrations for those domains
- Tests: query params, pagination, authz
- Acceptance: selected pages work via API behind feature flag

#### Package 8: Wave 2 read domains
- Orders/withdrawals/admin/vendor/partner reads
- Tests: role and ownership matrix
- Acceptance: all dashboards render via API in staging

#### Package 9: Idempotency and transaction primitives
- Create `idempotency` middleware/util and transaction wrapper utilities
- Tests: duplicate request returns stable response; partial failures rollback
- Acceptance: primitives ready for financial writes

#### Package 10: Low/medium-risk writes
- Wishlist/review/profile/product/settings writes
- Frontend replacements for write calls
- Tests: authz + validation + success paths
- Acceptance: write canary enabled for selected domains

#### Package 11: Order and wallet services (financial)
- Implement transactional order create and wallet debit logic
- Insert transaction logs and audit logs
- Emit events only after commit
- Tests: concurrency, insufficient funds, idempotency
- Acceptance: order flow passes integration and reconciliation

#### Package 12: Withdrawals and membership financial flows
- Implement request, approve/reject, processing state transitions
- Tests: duplicate requests, role checks, balance checks
- Acceptance: withdrawal workflow stable in staging and canary

#### Package 13: MLM/referral distribution service
- Port and validate multi-level payout logic
- Tests: golden fixtures for 6-level scenarios and edge cases
- Acceptance: payout results match known Firebase function outputs

#### Package 14: WebSocket server and client replacement for `onSnapshot`
- Server socket auth + rooms + emitters
- Frontend socket client + hook/store integration
- Tests: connection auth, event delivery, reconnect cleanup
- Acceptance: wallet/profile/order detail updates within SLO

#### Package 15: R2 uploads and file migration support
- Presign endpoint, finalize endpoint, MIME/size validation
- Frontend KYC/product upload refactors
- Tests: validation and access restrictions
- Acceptance: uploads succeed and metadata persisted

#### Package 16: BullMQ workers and event-driven jobs
- Queue setup, workers, retries, DLQ, instrumentation
- Port referral, badges, leaderboard, notifications
- Tests: idempotent worker retry behavior
- Acceptance: jobs process parity flows without Firestore triggers

#### Package 17: Cutover tooling and validation scripts
- Delta sync, reconciliation scripts, smoke runner, cutover checklist automation
- Tests: dry-run report generation
- Acceptance: staging rehearsal completes with artifact outputs

#### Package 18: Cleanup and decommission PRs
- Remove deprecated Firebase data/runtime code paths
- Slim Firebase config to auth only
- Update docs
- Acceptance: zero Firestore/Functions/Storage imports in active code path

---

## 11. Data Migration Runbook (Detailed)

### 11.1 Principles

- Migration must be repeatable.
- Migration must be verifiable.
- Migration must support a final delta sync near cutover.
- Migration must not silently coerce invalid data without reporting.

### 11.2 Data Migration Stages

#### Stage A: Schema Freeze for Migration Window
- Freeze schema changes for affected domains before full backfill.
- If schema must change, version the transform and migration scripts explicitly.

#### Stage B: Full Backfill (Staging)
- Export Firestore collections.
- Transform to SQL-ready data.
- Import to Turso staging.
- Run validation suite.
- Fix transform/schema mismatches.

#### Stage C: Full Backfill (Production Rehearsal)
- Repeat with production-like volume and timing.
- Record runtime and operator steps.

#### Stage D: Final Production Backfill + Delta Sync
- Backfill baseline dataset.
- Run delta sync for changes since export timestamp.
- Optionally brief write freeze for high-risk domains before final delta.
- Validate row counts and critical reconciliations.

### 11.3 Validation Outputs (Artifacts)

Produce machine-readable and human-readable reports:
- `row-counts.json`
- `wallet-reconciliation.json`
- `referral-integrity.json`
- `order-total-checks.json`
- `migration-errors.csv`
- `summary.md`

### 11.4 Failure Handling

If validation fails:
- Do not cut over that domain.
- Classify error type:
  - transform bug
  - schema mismatch
  - bad source data
  - duplicate or orphan records
- Patch scripts or data remediation.
- Rerun the migration for affected domain(s) and regenerate reports.

---

## 12. Security and Authorization Execution Plan

### 12.1 Authentication (Hybrid)

- Frontend uses Firebase Auth SDK for login/register/password reset.
- Frontend attaches Firebase ID token to API requests.
- API verifies token using `firebase-admin`.
- API loads role/account state from TursoDB for authz decisions.

### 12.2 Authorization Rules Migration

Firestore rules are replaced by:
- Route-level auth requirements (authenticated/public)
- Role checks (`admin`, `sub_admin`, `vendor`, `partner`, `organization`, `user`)
- Ownership checks (`user_id == request.uid`)
- Scope checks (vendor_id, city, referral path)
- Field-level update allowlists (safe self-update)

### 12.3 Required Security Controls (Before Production)

- Input validation on all endpoints (Zod)
- Rate limits on auth-adjacent and financial endpoints
- Request size limits and file type/size validation
- Idempotency for retry-prone mutations
- Audit logging for admin and financial actions
- Negative authz test matrix
- Secret management for Turso/Redis/R2/Typesense

### 12.4 Security Test Matrix (Minimum)

- Cross-user read/write access attempts
- Role escalation attempts via payload tampering
- Invalid/expired Firebase token requests
- Banned/suspended user behavior
- SQL injection attempts in filters/search params
- XSS payload persistence in review/profile fields
- Oversized upload and invalid MIME uploads

---

## 13. Observability, SRE, and Operational Readiness

### 13.1 Required Dashboards

- API requests: volume, latency, status codes by route
- DB queries: latency, errors, slow query list
- Redis: connections, memory, queue throughput
- BullMQ: pending, active, failed, retry counts
- WebSocket: connections, auth failures, event throughput
- Uploads: presign success, upload finalize success, file validation rejects
- Business metrics: order creation success rate, withdrawal success rate

### 13.2 Required Alerts

- API error rate above threshold
- p99 latency above threshold
- DB connection/query failure spike
- Job failure rate or DLQ growth
- Reconciliation script failure
- Realtime delivery latency breach
- Upload failure spike

### 13.3 Runbooks (Must Exist Before Cutover)

- API incident response runbook
- Financial integrity incident runbook
- Job queue backlog/failure runbook
- WebSocket degradation runbook (fallback to polling)
- Storage upload outage runbook
- Rollback runbook (feature flags and sequence)

---

## 14. Testing Strategy by Phase (Execution Gates)

### 14.1 Test Layers

- Unit tests: services, middleware, utilities, validation schemas
- Integration tests: route + DB + auth + service interactions
- E2E tests: role-specific user journeys
- Data validation tests: migration and reconciliation scripts
- Security tests: authz matrix and abuse cases
- Performance tests: API latency and concurrency for high-risk flows

### 14.2 Phase Gates

#### Gate A (end of Phase 1)
- Health endpoints stable
- Auth middleware verifies Firebase tokens in staging

#### Gate B (end of Phase 2)
- Full ETL dry-run passes with validation reports

#### Gate C (end of Phase 3)
- Hybrid register/login/profile path works end-to-end

#### Gate D (end of Phase 5)
- All read paths available via API with parity validation

#### Gate E (end of Phase 7)
- Financial write flows pass integration + reconciliation + concurrency tests

#### Gate F (end of Phase 8)
- Realtime, uploads, and jobs stable in canary

#### Gate G (before Phase 9 production cutover)
- Staging rehearsal completed successfully
- Rollback drill executed successfully

---

## 15. Risk Register (Operationalized)

| Risk | Probability | Impact | Trigger | Mitigation | Owner |
|:-----|:-----------:|:------:|:--------|:-----------|:------|
| Financial inconsistency in wallet/order flows | Medium | Critical | Reconciliation failures or duplicate transactions | Transactional services, idempotency, golden tests, immediate domain rollback | Backend lead |
| Data migration transform mismatch | High | High | Row count/field mismatch reports | Dry-runs, versioned ETL, domain-by-domain validation | Data lead |
| Authorization gap after replacing Firestore rules | Medium | Critical | Cross-user data exposure test failure or prod incident | Authz matrix tests, code review checklist, deny-by-default route guards | Backend lead |
| Realtime regression after `onSnapshot` removal | Medium | Medium | Delayed/duplicate/missed updates | WebSocket canary, polling fallback, event-after-commit rule | Frontend/Backend |
| Job retries causing duplicate effects | Medium | High | Duplicate downstream records or payouts | Idempotent workers, job keys, dedupe tables, DLQ monitoring | Backend lead |
| R2 upload security misconfiguration | Medium | High | Public exposure or invalid uploads | Presigned policies, MIME/size validation, private prefixes for KYC | Backend/SRE |
| Underestimated Cloud Function logic complexity | High | High | Phase slippage, parity defects | Parity tracker, domain waves, early high-risk code inspection, golden fixtures | Tech lead |
| Rollback procedure fails under pressure | Low/Med | Critical | Failed cutover incident | Rehearsal rollback drill, documented sequence, explicit owners | Release manager |

---

## 16. Milestones and Timeline (Recommended Baseline)

This is the realistic hybrid baseline for 2 senior engineers.

- Week 0-1: Phase 0 program planning and controls
- Week 1-2: Phase 1 platform foundation
- Week 2-3: Phase 2 schema + ETL toolchain
- Week 3-4: Phase 3 auth bridge + user/profile/wallet foundation
- Week 4-5: Phase 4 read migration wave 1
- Week 5-7: Phase 5 read migration wave 2
- Week 7-8: Phase 6 write migration wave 1
- Week 8-10: Phase 7 write migration wave 2 (financial)
- Week 10-12: Phase 8 realtime + storage + jobs
- Week 12-13: Phase 9 rehearsal + production cutover
- Week 13-16: Phase 10 hypercare + cleanup + decommission

### Acceleration Option (3 engineers)

Compress by parallelizing:
- ETL and frontend scaffolding earlier
- Read-wave domain migrations across separate engineers
- Realtime and upload groundwork while financial write canary stabilizes (but do not cut over early)

---

## 17. Go/No-Go Checklist for Production Cutover

All must be true before production cutover:

- All critical routes implemented and tested
- Feature flags present and verified
- Staging full rehearsal completed
- Rollback drill completed
- Final ETL and delta sync scripts validated
- Financial reconciliation scripts pass in staging
- Realtime and upload flows verified in canary
- Dashboards and alerts live and reviewed
- On-call owners assigned and available
- Firebase fallback paths preserved and deployable during rollback window

If any item is false, cutover is NO-GO.

---

## 18. Post-Migration Steady State (Hybrid)

After successful cutover and cleanup, ThinkMart steady state should be:

- Firebase Auth remains for identity (client SDK + `firebase-admin` verification)
- TursoDB is source of truth for all business data
- Fastify API is source of truth for all business logic and authorization
- Cloudflare R2 stores files and documents
- Redis + BullMQ handle queues, caching, and rate limits
- Firestore, Cloud Functions, and Firebase Storage are no longer active runtime dependencies

---

## 19. Optional Future Phase: Auth Independence (Separate Project)

Do not include this in the current migration critical path.

If later required, plan as a standalone project with:
- password migration/reset strategy
- token/session replacement
- email verification and reset flows
- user communication and support plan
- staged auth cutover and rollback

This keeps the current migration focused, safer, and deliverable.

---

## 20. Immediate Next Actions (Execution Start)

1. Create `turso-migration-parity-tracker` and feature-flag matrix (Phase 0 deliverables).
2. Scaffold `server/` Fastify API with health checks, config, logging, DB/Redis clients.
3. Implement Firebase token auth middleware and a protected `GET /api/users/me` stub.
4. Finalize SQL schema + migration files and start ETL dry-run on staging data.
5. Add `lib/api/client.ts` and migrate login/register/profile path to hybrid flow.

These five actions unlock the rest of the plan and are the highest-leverage starting point for LLM-assisted coding.
