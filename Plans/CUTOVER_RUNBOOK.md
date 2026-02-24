# ThinkMart Migration: Phase 9 Cutover Runbook

This document is the official playbook for the ThinkMart migration cutover from Firebase/Firestore to TursoDB/Fastify API.

## Pre-Requisites Checklist

Before executing the cutover, verify all of the following conditions are met:
- [ ] Staging and Application versions deployed align tightly with canonical `main`.
- [ ] No active schema alterations or backend code deployments are scheduled within 48 hours.
- [ ] All team members are connected on the War Room channel.
- [ ] **Infrastructure is Healthy:**
  - Vercel deployments passing.
  - Railway APIs responding correctly to `/health/ready`.
  - Up-to-date TursoDB connectivity from server apps.
  - Background Job Queues (BullMQ) empty and workers waiting payload distributions.

## Phase 9.1: The Dry Run (Rehearsal)

**Estimated Time:** 1 to 2 hours
**Purpose:** Verify delta sync logic and test fallback/rollback mechanisms before risking production traffic.

1. **Lock Write Access** *(Rehearsal level - mock lock)*: Verify the scripts required to suspend write mechanisms are accessible.
2. **Execute Delta Data Sync from Firestore -> Turso**:
   ```bash
   npx tsx scripts/migration/runPhase.ts DeltaSync
   ```
3. **Verify Integrity**: Use parity spot-checks to verify a few sample documents exactly match Firestore and Turso results.
4. **Trigger Vercel ENV Swap in Staging:**
   Set `NEXT_PUBLIC_FF_WRITE_API_ENABLED=true` and `NEXT_PUBLIC_FF_READ_API_ENABLED=true`. 
5. **E2E Smoke Tests Evaluation**: Run localized Cypress/Playwright suites or execute manual walk-through flows for Order placements, KYC uploads, and Wallet withdrawals against the staging environment. 

## Phase 9.2: Production Cutover Sequence

**Estimated Time:** 3 hours

### Step 1: Communication & Maintenance Mode
1. Ensure users are warned of "Scheduled Maintenance".
2. Deploy a lightweight "Under Maintenance" modal to the Vercel App to restrict user activity during the sync. 
3. *Optional:* Set Firestore Security Rules to `allow read: if true; allow write: if false;` to guarantee true data immutability.

### Step 2: Final Delta Sync
1. Run the absolute final parity sync matching the Firestore gap since the dry run:
   ```bash
   npx tsx scripts/migration/runPhase.ts DeltaSync --force
   ```
2. Verify table sizes in Turso against collection doc counts in Firestore exactly match using `scripts/migration/metrics.ts`.

### Step 3: Flag Promotion
1. Switch Production Vercel configurations to enforce new routing mechanics:
   - `NEXT_PUBLIC_FF_READ_API_ENABLED=true`
   - `NEXT_PUBLIC_FF_WRITE_API_ENABLED=true`
   - `NEXT_PUBLIC_FF_REALTIME_ENABLED=true`
   - `NEXT_PUBLIC_FF_UPLOAD_R2_ENABLED=true`
2. Save configurations and trigger a new Vercel redeployment cache clear.
3. Validate Railway server load scaling. 

### Step 4: Maintenance Ejection
1. Remove Maintenance modal block.
2. The site is live. Let traffic resume.

## Phase 9.3: Rollback Procedures 

Execute ONLY if critical errors trigger alerts over a sustained 15-minute window or an explicit showstopping error appears (e.g. users cannot checkout).

1. **Cut the Switch**:
   Quick-revert Vercel `NEXT_PUBLIC_FF_*` toggles to `false`. Deploy immediately. 
   *(This instantly reroutes frontend SDKs back to legacy direct Firestore queries).*
2. **Decommission Sync**:
   Any data written natively to Turso during the failed window will be isolated. The legacy Firestore DB has theoretically been locked since Step 1.
3. **Post-Mortem Gathering**:
   Extract logs from Railway, Typesense metrics, and Vercel Edge insights immediately to trace the breakage. 
