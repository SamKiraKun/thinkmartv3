# ThinkMart Firebase Audit Output (Repo-Evidence)

Audit date: 2026-02-19  
Scope: `Plans/firebase.md` only (this update does not modify `firestore.rules`, `storage.rules`, or `firestore.indexes.json`).

## 1) Repo Findings Summary

- Stack + routing:
  - Next.js App Router frontend (`next` ^14) with Firebase Web SDK (`firebase` ^10.7.0): `package.json:17`, `package.json:16`, `app/dashboard/layout.tsx:1`.
  - Firebase Cloud Functions (Node/TypeScript) exported from `functions/src/index.ts:1`.
  - Firebase project wiring and rules deployment paths in `firebase.json:2`, `firebase.json:22`.

- RBAC model (actual repo behavior):
  - Primary role source is `users/{uid}.role` (not a separate `admins` collection): `hooks/useAuth.ts:36`, `firestore.rules:16`, `functions/src/admin/helpers.ts:162`.
  - Admin/sub-admin permissions are scoped by `admin_permissions/{uid}` plus token fallback: `functions/src/admin/helpers.ts:191`, `functions/src/admin/helpers.ts:162`.
  - Frontend route gating is role-based (`checkRoleAccess`): `app/dashboard/layout.tsx:11`, `lib/guards/roleGuard.ts:17`.

- Existing rules/index file locations (deploy targets):
  - Firestore rules: `firestore.rules` via `firebase.json:3`.
  - Storage rules: `storage.rules` via `firebase.json:22`.
  - Firestore indexes: `firestore.indexes.json` via `firebase.json:4`.

- Important schema observation:
  - No standalone top-level `admins`, `vendors`, `partners`, or `organizations` collections are used in active app logic.
  - Those roles are represented in `users` docs with nested configs (`vendorConfig`, `partnerConfig`, `orgConfig`): `firestore.rules:60`, `firestore.rules:61`, `firestore.rules:62`, `functions/src/vendor/vendor.ts:58`, `functions/src/partner/partner.ts:121`, `functions/src/organization/organization.ts:17`.

## 2) Firestore Collections Map

### 2.1 Client-facing collections (direct reads/writes from app)

| Collection | Purpose | Key fields used in queries/rules | Read/Write actors | Evidence |
|---|---|---|---|---|
| `users` | Core profile, role, referral tree, KYC status | `role`, `ownReferralCode`, `referralCode`, `uplinePath`, `kycStatus`, `vendorConfig`, `partnerConfig`, `orgConfig` | Read: self/admin/downline; Write: safe self + admin | `firestore.rules:137`, `firestore.rules:143`, `firestore.rules:160`, `hooks/useAuth.ts:36`, `app/dashboard/user/settings/page.tsx:88` |
| `wallets` | Cash/coin balances | `cashBalance`, `coinBalance` | Read: self/admin; client writes blocked | `firestore.rules:170`, `firestore.rules:179`, `hooks/useWallet.ts:26` |
| `transactions` | Ledger/history | `userId`, `type`, `createdAt` | Read: owner/admin; client writes blocked | `firestore.rules:185`, `services/wallet.service.ts:36` |
| `withdrawals` | User/partner withdrawal history | `userId`, `status`, `createdAt`, `userCity` | Read: owner/admin; client create/update blocked (server callable) | `firestore.rules:234`, `app/dashboard/user/withdraw/page.tsx:100`, `app/dashboard/partner/withdrawals/page.tsx:56` |
| `orders` | Orders for users/vendors | `userId`, `vendorIds`, `status`, `createdAt` | Read: owner/admin/vendor-in-order; client create blocked | `firestore.rules:246`, `firestore.rules:250`, `app/dashboard/user/orders/page.tsx:48` |
| `products` | Shop catalog + vendor inventory | `vendorId`, `status`, `isActive`, `isDeleted` | Read: public; write: admin + owner vendor updates | `firestore.rules:262`, `firestore.rules:269`, `services/product.service.ts:51` |
| `tasks` | Task metadata | `isActive`, `type` | Read: signed-in; write: admin only | `firestore.rules:193`, `services/task.service.ts:45` |
| `task_sessions` | Task execution sessions | `userId`, `taskId` | Read: owner/admin; writes server-only | `firestore.rules:226`, `app/dashboard/user/tasks/[taskId]/page.tsx:124` |
| `task_completions` | Completed task history | `userId`, `taskId`, `completedAt` | Read: owner/admin; writes server-only | `firestore.rules:218`, `services/task.service.ts:50` |
| `wishlists` | User wishlist items | `userId`, `addedAt` | Read/write: owner | `firestore.rules:501`, `services/wishlist.service.ts:60` |
| `reviews` | Product reviews | `productId`, `status`, `userId` | Public read for approved; owner/admin/sub-admin scoped access; direct create blocked | `firestore.rules:469`, `services/review.service.ts:79` |
| `review_stats` | Product review aggregates | `productId` | Public read; writes server-only | `firestore.rules:483`, `services/review.service.ts:119` |
| `cooldowns` | Per-user cooldown windows | user doc id | Read: owner/admin/sub-admin; writes blocked | `firestore.rules:367`, `app/dashboard/user/tasks/page.tsx:98` |
| `public_settings` | Public-safe config toggles | global settings doc | Read: public; write: admin | `firestore.rules:435`, `hooks/usePublicSettings.ts:21` |
| `org_commission_logs` | Organization earnings history | `orgId`, `createdAt` | Read: org owner/admin/sub-admin | `firestore.rules:328`, `app/dashboard/organization/earnings/page.tsx:41` |

### 2.2 Server-managed collections (callables/triggers/admin sdk)

| Collection | Purpose | Key fields | Actor model | Evidence |
|---|---|---|---|---|
| `admin_settings` | Global operational config | maintenance/limits/fees keys | Read admin/sub-admin; write admin only | `firestore.rules:426`, `functions/src/admin/settingsManagement.ts:56` |
| `admin_permissions` | Sub-admin permission grants | `permissions[]` | Read admin/sub-admin; writes server-only | `firestore.rules:389`, `functions/src/admin/helpers.ts:191` |
| `audit_logs` | Immutable audit trail | `action`, `actorId`, `targetType`, `createdAt` | Read admin/sub-admin; writes server-only | `firestore.rules:380`, `functions/src/admin/helpers.ts:273` |
| `feature_flags` | Feature toggles | `name`, `enabled`, rollout fields | Read admin/sub-admin; writes server-only | `firestore.rules:416`, `functions/src/admin/featureFlags.ts:48` |
| `admin_metrics` | Aggregated admin dashboard stats | realtime snapshot docs | Read admin/sub-admin; writes server-only | `firestore.rules:406`, `functions/src/admin/getAdminStats.ts:124` |
| `idempotency_keys` | Duplicate-operation protection | `status`, `actionType`, `result` | fully server-only | `firestore.rules:398`, `functions/src/admin/helpers.ts:293` |
| `partner_wallets` | Partner payout wallet | `cashBalance`, `totalEarnings` | Read owner/admin/sub-admin; writes server-only | `firestore.rules:302`, `functions/src/partner/partner.ts:70` |
| `partner_commission_logs` | Partner commission ledger | `partnerId`, `sourceType`, `createdAt` | Read owner/admin/sub-admin; writes server-only | `firestore.rules:310`, `functions/src/partner/partner.ts:79` |
| `withdrawal_logs` | Withdrawal action logs | status/action metadata | Read admin/sub-admin; writes server-only | `firestore.rules:320`, `functions/src/withdrawals/requestWithdrawal.ts:341` |
| `city_stats` | Partner/admin city aggregates | `userCount`, etc | Read partner/admin/sub-admin; writes server-only | `firestore.rules:338`, `functions/src/triggers/user.ts:79` |
| `kyc_documents` | KYC metadata docs | `userId`, `fileUrl` | Read owner/admin/sub-admin; create owner; update blocked | `firestore.rules:346`, `tests/firestore.rules.test.ts:1018` |
| `game_limits` | Game limit counters | `userId` + counters | Read owner; writes server-only | `firestore.rules:358` |
| `notifications` | User notifications | `userId`, `status` | server-written, user-specific reads are callable/UI mediated | `functions/src/notifications/orderNotifications.ts:139` |
| `coupons` | Coupon definitions | `code`, `isActive`, limits | callable/admin managed | `functions/src/coupons/couponFunctions.ts:63` |
| `coupon_usage` | Coupon redemption records | `couponId`, `userId` | server-only writes | `functions/src/coupons/couponFunctions.ts:191` |
| `leaderboards` | Cached leaderboard docs | `type`, `period`, `entries` | server-managed | `functions/src/gamification/leaderboard.ts:111` |
| `leaderboard_archives` | Period archive snapshots | weekly/monthly refs | server-managed | `functions/src/gamification/leaderboard.ts:208` |
| `user_badges` | Badge state by user | `userId`, `earnedAt` | server-managed | `functions/src/gamification/badges.ts:61` |
| `review_helpful` | Helpful-vote markers | composite id vote key | reads public; writes via callable | `firestore.rules:492`, `functions/src/reviews/reviewFunctions.ts:332` |
| `rate_limits` | Anti-abuse function throttling | key doc + counters | server-only | `functions/src/lib/rateLimit.ts:37` |
| `withdraw_requests` | Legacy fallback source in stats | pending/processed statuses | server-only legacy compatibility | `functions/src/admin/getAdminStats.ts:76` |

### 2.3 Collections present in rules but low/no active client usage in current app

- `surveys`, `survey_responses`, `teams`, `system/leaderboard`, `product_categories`, `product_brands`, `banners`.
- Evidence: `firestore.rules:201`, `firestore.rules:209`, `firestore.rules:281`, `firestore.rules:289`, `firestore.rules:443`, `firestore.rules:451`, `firestore.rules:459`.

## 3) Storage Paths Map

| Storage path pattern | Stores | Upload actor | Read actor | Evidence |
|---|---|---|---|---|
| `users/{uid}/...` | profile/avatar and user-owned media | user own uid only; images <=5MB | owner + admin/sub-admin | `storage.rules:15`, `storage.rules:18`, `app/dashboard/user/settings/page.tsx:76` |
| `kyc_documents/{uid}/...` | current KYC documents | user own uid; image/pdf <=10MB | owner + admin/sub-admin | `storage.rules:37`, `storage.rules:41`, `app/dashboard/user/kyc/page.tsx:17` |
| `kyc/{uid}/...` | legacy KYC path retained for backward compatibility | user own uid; image/pdf <=10MB | owner + admin/sub-admin | `storage.rules:44`, `tests/storage.rules.test.ts:46` |
| `products/{productId}/...` | product images | direct client writes blocked; uploaded server-side via callable | public read | `storage.rules:27`, `storage.rules:29`, `functions/src/admin/uploadProductImage.ts:107` |
| `/{allPaths=**}` | everything else | denied | denied | `storage.rules:54` |

## 4) Access Matrix

| Resource | Public | User | Vendor | Partner | Organization | Admin/Sub-admin |
|---|---|---|---|---|---|---|
| `users/{uid}` | no | read self; safe self update only | vendor role still scoped to own user doc | partner role still scoped to own user doc/downline rules | org role still scoped to own doc/downline rules | full read/write |
| `wallets/{uid}` | no | read own only | read own only if same uid | read own only if same uid | read own only if same uid | read any; no direct writes |
| `transactions` | no | read own only | read own only | read own only | read own only | read any; writes server-only |
| `orders/{id}` | no | read own orders | read only orders containing vendor id in `vendorIds` | none direct | none direct | read any; status update allowed |
| `products/{id}` | yes (read) | read | owner vendor update/delete with vendorId lock | none direct in rules | none direct in rules | full write |
| `withdrawals/{id}` | no | read own; create/update blocked | read own only if same uid | read own only if same uid | read own only if same uid | read any; writes server-only |
| `reviews/{id}` | read if approved | owner read/update/delete; direct create blocked | same as user role | same as user role | same as user role | full moderation read/delete |
| `wishlists/{id}` | no | CRUD own by `userId` | same as user role | same as user role | same as user role | no override in current rules |
| `admin_settings/{id}` | no | no | no | no | no | read admin/sub-admin; write full admin only |
| `feature_flags/{id}` | no | no | no | no | no | read admin/sub-admin; writes server-only |
| `partner_wallets/{id}` | no | no | no | read own | no | read any partner wallet |
| `org_commission_logs/{id}` | no | no | no | no | read own by `orgId` | read any |
| `city_stats/{id}` | no | no | no | read allowed | no | read allowed |
| Storage `users/{uid}/...` | no | own upload/read | own upload/read | own upload/read | own upload/read | read any |
| Storage `products/...` | yes (read) | no write | no write | no write | no write | no write via client rules (server sdk only) |

Notes:
- Deny-by-default posture is present for unspecified documents due explicit match coverage and server-only write blocks.
- Privilege escalation protection exists on `users` self-updates via blocked keys (`role`, `permissions`, `partnerConfig`, `orgConfig`, etc.): `firestore.rules:58`.

## 5) Final Firestore Rules

Repo file path: `firestore.rules`

```rules
rules_version = '2';

service cloud.firestore {
match /databases/{database}/documents {

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Checks if the authenticated user has the 'admin' role.
 */
function isAdmin() {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'admin';
}

/**
 * Checks if the authenticated user is an admin or sub_admin.
 */
function isAdminOrSubAdmin() {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role in ['admin', 'sub_admin'];
}

/**
 * Checks if the authenticated user has the 'vendor' role.
 */
function isVendor() {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'vendor';
}

/**
 * Checks if the authenticated user has the 'partner' role.
 */
function isPartner() {
  return request.auth != null && 
         exists(/databases/$(database)/documents/users/$(request.auth.uid)) &&
         get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role == 'partner';
}

/**
 * Helper to fetch the current user's profile data for efficiency.
 */
function getUserData() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data;
}

/**
 * Prevent users from modifying privileged authorization/system fields.
 */
function isSafeUserSelfUpdate() {
  return !request.resource.data.diff(resource.data).affectedKeys().hasAny([
    'role',
    'isBanned',
    'partnerConfig',
    'orgConfig',
    'vendorConfig',
    'adminPermissions',
    'permissions',
    'kycStatus',
    'kycVerifiedAt',
    'kycRejectionReason'
  ]);
}

/**
 * KYC submission updates from users are allowed only for moving into "pending".
 * This supports app/dashboard/user/kyc/page.tsx while preventing self-verification.
 */
function isKycSubmissionUpdate() {
  let changedKeys = request.resource.data.diff(resource.data).affectedKeys();

  return changedKeys.hasOnly([
    'kycStatus',
    'kycData',
    'kycSubmittedAt',
    'kycRejectionReason',
    'updatedAt'
  ])
  && request.resource.data.kycStatus == 'pending'
  && (
    !('kycRejectionReason' in request.resource.data) ||
    request.resource.data.kycRejectionReason == null
  );
}

/**
 * User profile create must not set privileged fields.
 */
function isSafeUserCreate() {
  let hasRole = 'role' in request.resource.data;
  let role = hasRole ? request.resource.data.role : 'user';
  let hasOrgConfig = 'orgConfig' in request.resource.data;
  let hasVendorConfig = 'vendorConfig' in request.resource.data;

  return role in ['user', 'vendor', 'organization']
    && !('isBanned' in request.resource.data)
    && !('partnerConfig' in request.resource.data)
    && !('adminPermissions' in request.resource.data)
    && !('permissions' in request.resource.data)
    && (
      role == 'organization'
        ? hasOrgConfig && !hasVendorConfig
        : !hasOrgConfig
    )
    && (
      role == 'vendor'
        ? hasVendorConfig
          && !hasOrgConfig
          && request.resource.data.vendorConfig.vendorId == request.auth.uid
        : !hasVendorConfig
    );
}

/**
 * Checks if the current user's vendorId matches the product's vendorId.
 */
function isProductOwner() {
  return request.auth != null &&
         isVendor() &&
         getUserData().vendorConfig.vendorId == resource.data.vendorId;
}

// ============================================================================
// COLLECTION RULES
// ============================================================================

/**
 * USERS COLLECTION
 * - Stores user profiles, roles, referral codes, and ancestry data.
 */
match /users/{userId} {
  // Allow read access if:
  // 1. The user is reading their own profile.
  // 2. The user is an Admin.
  // 3. The target user is a DIRECT referral (target.referralCode == my.ownReferralCode).
  // 4. The target user is in the DOWNLINE (my.uid is in target.uplinePath).
  allow read: if request.auth != null && (
    request.auth.uid == userId || 
    isAdmin() || 
    // UPDATED: Check against referralCode string
    resource.data.referralCode == getUserData().ownReferralCode ||
    // Legacy/Fallback checks
    resource.data.referredBy == request.auth.uid ||
    request.auth.uid in resource.data.uplinePath
  );
  
  // Allow creation only if the user is creating their own document during signup
  // without setting privileged fields.
  allow create: if request.auth != null
                && request.auth.uid == userId
                && isSafeUserCreate();
  
  // Allow updates by admins, or safe self-profile updates only.
  allow update: if request.auth != null && (
    isAdmin() ||
    (request.auth.uid == userId && (isSafeUserSelfUpdate() || isKycSubmissionUpdate()))
  );
}

/**
 * WALLETS COLLECTION
 * - Stores 'cashBalance' (Cash) and 'coinBalance' (Points).
 */
match /wallets/{userId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isAdmin());
  
  // Updated to use new schema: cashBalance and coinBalance
  allow create: if request.auth != null 
                && request.auth.uid == userId
                && request.resource.data.cashBalance == 0
                && request.resource.data.coinBalance == 0;
  
  allow update: if false; 
}

/**
 * TRANSACTIONS COLLECTION
 */
match /transactions/{transactionId} {
  allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
  allow write: if false; 
}

/**
 * TASKS COLLECTION
 */
match /tasks/{taskId} {
  allow read: if request.auth != null;
  allow write: if isAdmin();
}

/**
 * SURVEYS COLLECTION
 */
match /surveys/{surveyId} {
  allow read: if request.auth != null;
  allow write: if isAdmin();
}

/**
 * SURVEY RESPONSES COLLECTION
 */
match /survey_responses/{responseId} {
  allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update, delete: if false;
}

/**
 * TASK COMPLETIONS COLLECTION
 */
match /task_completions/{completionId} {
  allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
  allow write: if false; 
}

/**
 * TASK SESSIONS COLLECTION
 */
match /task_sessions/{sessionId} {
  allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
  allow write: if false; 
}

/**
 * WITHDRAWALS COLLECTION
 */
match /withdrawals/{withdrawalId} {
  allow read: if request.auth != null && (request.auth.uid == resource.data.userId || isAdmin());
  allow create: if false; 
  allow update: if false; 
}

/**
 * ORDERS COLLECTION
 * - Users can read their own orders
 * - Vendors can read orders containing their products (via vendorIds array)
 * - Admin can read all orders
 */
match /orders/{orderId} {
  allow read: if request.auth != null && (
    request.auth.uid == resource.data.userId || 
    isAdmin() ||
    (isVendor() && getUserData().vendorConfig.vendorId in resource.data.vendorIds)
  );
  allow update: if isAdmin();
  allow create: if false;
}

/**
 * PRODUCTS COLLECTION
 * - Public read access
 * - Admin can write any product
 * - Vendor can update/delete their own products (vendorId match)
 */
match /products/{productId} {
  allow read: if true;
  
  // Admin can do anything
  allow write: if isAdmin();
  
  // Vendor can update their own products
  allow update: if isVendor() && 
                   resource.data.vendorId == getUserData().vendorConfig.vendorId &&
                   request.resource.data.vendorId == resource.data.vendorId; // Can't change vendorId
  
  // Vendor can delete (soft-delete) their own products
  allow delete: if isVendor() && 
                   resource.data.vendorId == getUserData().vendorConfig.vendorId;
}

/**
 * TEAMS DATA
 */
match /teams/{userId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isAdminOrSubAdmin());
  allow write: if false; 
}

/**
 * SYSTEM / LEADERBOARD
 */
match /system/leaderboard {
  allow read: if request.auth != null;
  allow write: if false; 
}

// ============================================================================
// SERVER-ONLY COLLECTIONS (No client access)
// These collections are managed exclusively by Cloud Functions
// ============================================================================

/**
 * PARTNER WALLETS - Managed by Cloud Functions only
 */
match /partner_wallets/{partnerId} {
  allow read: if request.auth != null && (request.auth.uid == partnerId || isAdminOrSubAdmin());
  allow write: if false; // Server-only writes via Cloud Functions
}

/**
 * PARTNER COMMISSION LOGS - Audit trail
 */
match /partner_commission_logs/{logId} {
  allow read: if request.auth != null && (
    resource.data.partnerId == request.auth.uid || isAdminOrSubAdmin()
  );
  allow write: if false; // Server-only
}

/**
 * WITHDRAWAL LOGS - Admin audit trail
 */
match /withdrawal_logs/{logId} {
  allow read: if isAdminOrSubAdmin();
  allow write: if false; // Server-only
}

/**
 * ORGANIZATION COMMISSION LOGS
 */
match /org_commission_logs/{logId} {
  allow read: if request.auth != null && (
    resource.data.orgId == request.auth.uid || isAdminOrSubAdmin()
  );
  allow write: if false; // Server-only
}

/**
 * CITY STATS - Aggregated data
 */
match /city_stats/{cityId} {
  allow read: if isAdminOrSubAdmin() || isPartner();
  allow write: if false; // Server-only via triggers
}

/**
 * KYC DOCUMENTS
 */
match /kyc_documents/{docId} {
  allow read: if request.auth != null && (
    resource.data.userId == request.auth.uid || isAdminOrSubAdmin()
  );
  allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
  allow update, delete: if false;
}

/**
 * GAME LIMITS - Daily limits for spin wheel and lucky box
 * Server-only writes, users can read their own limits
 */
match /game_limits/{limitId} {
  allow read: if request.auth != null && resource.data.userId == request.auth.uid;
  allow write: if false; // Server-only via Cloud Functions
}

/**
 * COOLDOWNS - Server-enforced action cooldown windows
 * Users can read their own cooldown state, writes are server-only.
 */
match /cooldowns/{userId} {
  allow read: if request.auth != null && (request.auth.uid == userId || isAdminOrSubAdmin());
  allow write: if false;
}

// ============================================================================
// ADMIN DASHBOARD COLLECTIONS (Phase 1)
// ============================================================================

/**
 * AUDIT LOGS - Immutable record of admin actions
 * Admins can read, only server can write
 */
match /audit_logs/{logId} {
  allow read: if isAdminOrSubAdmin();
  allow write: if false; // Server-only (append via Cloud Functions)
}

/**
 * ADMIN PERMISSIONS - Sub-admin permission assignments
 * Server-only, admins can read
 */
match /admin_permissions/{uid} {
  allow read: if isAdminOrSubAdmin();
  allow write: if false; // Server-only
}

/**
 * IDEMPOTENCY KEYS - Prevent duplicate sensitive operations
 * Server-only
 */
match /idempotency_keys/{keyId} {
  allow read, write: if false; // Server-only
}

/**
 * ADMIN METRICS - Aggregated dashboard statistics
 * Admins can read, only server can write
 */
match /admin_metrics/{docId} {
  allow read: if isAdminOrSubAdmin();
  allow write: if false; // Server-only
}

/**
 * FEATURE FLAGS - Feature toggle configuration
 * Admins can read, only server can write
 * Users can check flags via Cloud Function
 */
match /feature_flags/{flagId} {
  allow read: if isAdminOrSubAdmin();
  allow write: if false; // Server-only
}

/**
 * ADMIN SETTINGS
 * Global configuration like withdrawal limits, fees, maintenance mode, etc.
 * SECURITY: Read is restricted to admin/sub-admin, write to full admin only.
 */
match /admin_settings/{settingId} {
    allow read: if isAdminOrSubAdmin();
    allow write: if isAdmin(); // Full admin only - prevents sub-admin tampering
}

/**
 * PUBLIC SETTINGS
 * Public-safe feature flags/settings intended for unauthenticated read access.
 */
match /public_settings/{settingId} {
    allow read: if true;
    allow write: if isAdmin();
}

/**
 * PRODUCT CATEGORIES
 */
match /product_categories/{categoryId} {
    allow read: if true;
    allow write: if isAdminOrSubAdmin();
}

/**
 * PRODUCT BRANDS
 */
match /product_brands/{brandId} {
    allow read: if true;
    allow write: if isAdminOrSubAdmin();
}

/**
 * BANNERS / CAROUSEL
 */
match /banners/{bannerId} {
    allow read: if true;
    allow write: if isAdminOrSubAdmin();
}

/**
 * PRODUCT REVIEWS
 * Users can create reviews for products they've ordered (verified via Cloud Function)
 * Users can read all approved reviews, update/delete their own
 */
match /reviews/{reviewId} {
    allow read: if resource.data.status == 'approved' || 
                   (request.auth != null && resource.data.userId == request.auth.uid) ||
                   isAdminOrSubAdmin();
    allow create: if false; // Via Cloud Function (verifies purchase)
    allow update: if request.auth != null && resource.data.userId == request.auth.uid;
    allow delete: if request.auth != null && 
                     (resource.data.userId == request.auth.uid || isAdminOrSubAdmin());
}

/**
 * REVIEW STATS (Aggregated)
 * Read-only for clients, updated by Cloud Functions
 */
match /review_stats/{productId} {
    allow read: if true;
    allow write: if false; // Server-only
}

/**
 * REVIEW HELPFUL VOTES
 * Users can vote on reviews
 */
match /review_helpful/{voteId} {
    allow read: if true;
    allow write: if false; // Via Cloud Function
}

/**
 * WISHLISTS
 * Users can manage their own wishlist items
 */
match /wishlists/{itemId} {
    allow read: if request.auth != null && resource.data.userId == request.auth.uid;
    allow create: if request.auth != null && request.resource.data.userId == request.auth.uid;
    allow update, delete: if request.auth != null && resource.data.userId == request.auth.uid;
}

}
}
```

## 6) Final Storage Rules

Repo file path: `storage.rules`

```rules
rules_version = '2';

service firebase.storage {
  match /b/{bucket}/o {
    function isAdminOrSubAdmin() {
      return request.auth != null &&
             firestore.exists(/databases/(default)/documents/users/$(request.auth.uid)) &&
             firestore.get(/databases/(default)/documents/users/$(request.auth.uid)).data.role in ['admin', 'sub_admin'];
    }

    // ============================================================================
    // USER PROFILE IMAGES
    // Users can only read/write their own profile assets
    // ============================================================================
    match /users/{userId}/{allPaths=**} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdminOrSubAdmin());
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 5 * 1024 * 1024  // Max 5MB
                   && request.resource.contentType.matches('image/.*');  // Images only
    }

    // ============================================================================
    // PRODUCT IMAGES - SERVER-ONLY UPLOADS
    // All product image uploads MUST go through Cloud Functions (uploadProductImage)
    // This prevents unauthorized users from uploading malicious content
    // ============================================================================
    match /products/{allPaths=**} {
      allow read: if true;  // Public can view product images
      allow write: if false; // Server-only via Admin SDK in Cloud Functions
    }

    // ============================================================================
    // KYC DOCUMENTS - User can upload their own, admins can read
    // Current app path: kyc_documents/{uid}/...
    // Legacy path retained for backward compatibility: kyc/{uid}/...
    // ============================================================================
    match /kyc_documents/{userId}/{allPaths=**} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdminOrSubAdmin());
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 10 * 1024 * 1024  // Max 10MB
                   && request.resource.contentType.matches('(image/.*|application/pdf)');
    }

    match /kyc/{userId}/{allPaths=**} {
      allow read: if request.auth != null && (request.auth.uid == userId || isAdminOrSubAdmin());
      allow write: if request.auth != null && request.auth.uid == userId
                   && request.resource.size < 10 * 1024 * 1024  // Max 10MB
                   && request.resource.contentType.matches('(image/.*|application/pdf)');
    }

    // ============================================================================
    // DEFAULT DENY - All other paths are blocked
    // ============================================================================
    match /{allPaths=**} {
      allow read, write: if false;
    }

  }
}
```

## 7) Indexes

### 7.1 Existing index coverage in repo

`firestore.indexes.json` already contains composite indexes for key active query groups including:
- `orders` (`vendorIds + createdAt`, `vendorIds + status + createdAt`, `status + createdAt`, `userId + createdAt`) at `firestore.indexes.json:212`, `firestore.indexes.json:226`, `firestore.indexes.json:276`, `firestore.indexes.json:290`.
- `withdrawals` (`status/userId + createdAt/processedAt`) at `firestore.indexes.json:64`, `firestore.indexes.json:92`, `firestore.indexes.json:162`.
- `transactions` (`userId + createdAt`, `userId + type + createdAt`) at `firestore.indexes.json:304`, `firestore.indexes.json:318`.
- `reviews` sort variants (`createdAt`, `helpful`, `rating`) at `firestore.indexes.json:378`, `firestore.indexes.json:396`, `firestore.indexes.json:414`.
- `users` role/city/referral/kyc query combos at `firestore.indexes.json:22`, `firestore.indexes.json:134`, `firestore.indexes.json:194`, `firestore.indexes.json:336`.
- `wishlists`, `partner_commission_logs`, `org_commission_logs`, `audit_logs` at `firestore.indexes.json:350`, `firestore.indexes.json:244`, `firestore.indexes.json:364`, `firestore.indexes.json:446`.

### 7.2 Likely index gaps from current query code (static analysis)

Potential missing composite indexes for callable paths:
1. Vendor product list by vendor with createdAt sort:
   - Query evidence: `functions/src/vendor/vendor.ts:294`, `functions/src/vendor/vendor.ts:298`.
2. Partner analytics on commission logs ascending time window:
   - Query evidence: `functions/src/partner/partner.ts:374`, `functions/src/partner/partner.ts:376`.
3. Partner analytics users by city+role with createdAt ascending:
   - Query evidence: `functions/src/partner/partner.ts:405`, `functions/src/partner/partner.ts:408`.
4. Legacy partner users list by city ordered by createdAt desc:
   - Query evidence: `functions/src/partner/partner.ts:495`, `functions/src/partner/partner.ts:496`.

Suggested `firestore.indexes.json` additions (if these queries emit index errors in emulator/prod):

```json
{
  "collectionGroup": "products",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "vendorId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

```json
{
  "collectionGroup": "partner_commission_logs",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "partnerId", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

```json
{
  "collectionGroup": "users",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "city", "order": "ASCENDING" },
    { "fieldPath": "role", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "ASCENDING" }
  ]
}
```

```json
{
  "collectionGroup": "users",
  "queryScope": "COLLECTION",
  "fields": [
    { "fieldPath": "city", "order": "ASCENDING" },
    { "fieldPath": "createdAt", "order": "DESCENDING" }
  ]
}
```

Important note:
- `functions/src/partner/partner.ts:740` uses `where('isDeleted', '!=', true)` combined with `orderBy('createdAt', 'desc')` (`functions/src/partner/partner.ts:737`). This may require query-shape adjustment (not only index) depending on Firestore constraints.

## 8) Validation Plan

### 8.1 Automated rules tests

Run:

```bash
npm run test:rules
```

Runner uses Firebase emulators for Firestore + Storage:
- `package.json:12`
- `scripts/run-rules-tests.js:40`
- `scripts/run-rules-tests.js:42`
- `scripts/run-rules-tests.js:43`

### 8.2 Existing pass/fail scenarios already covered in tests

Firestore:
- User cannot self-promote role: `tests/firestore.rules.test.ts:174`.
- User cannot read other users: `tests/firestore.rules.test.ts:146`.
- Full admin can update admin settings: `tests/firestore.rules.test.ts:453`.
- Regular user cannot update admin settings: `tests/firestore.rules.test.ts:467`.
- Admin can read protected operational logs/flags:
  - withdrawal logs: `tests/firestore.rules.test.ts:879`
  - feature flags: `tests/firestore.rules.test.ts:1146`

Storage:
- User can upload own KYC image and cannot upload invalid file type: `tests/storage.rules.test.ts:96`, `tests/storage.rules.test.ts:109`.
- User cannot read another user KYC docs; admin can read: `tests/storage.rules.test.ts:129`, `tests/storage.rules.test.ts:136`.
- Product image writes blocked for client users/admins: `tests/storage.rules.test.ts:184`, `tests/storage.rules.test.ts:197`.

### 8.3 Missing/needed tests to close requested scenarios

Add Firestore tests for:
1. Vendor cannot read other vendors' orders (currently not explicitly covered).
2. Admin access to moderation queues (`kyc_submissions`, pending products/orders) via expected read surfaces.
3. Partner/org scoped access regression checks for `partner_wallets`, `org_commission_logs`, and `city_stats` under role mismatch.

### 8.4 Manual verification checklist by page flow

1. User dashboard flows:
- `/dashboard/user/orders`, `/dashboard/user/withdraw`, `/dashboard/user/settings`, `/dashboard/user/kyc`.
- Verify no permission-denied for owner reads and no forbidden writes succeed.

2. Vendor dashboard flows:
- `/dashboard/vendor/products`, `/dashboard/vendor/orders`.
- Verify only vendor-owned products are mutable and only vendor-related orders are visible.

3. Admin dashboard flows:
- `/dashboard/admin/settings`, `/dashboard/admin/withdrawals`, `/dashboard/admin/products`, `/dashboard/admin/kyc`.
- Verify sub-admin can read where intended, but cannot mutate `admin_settings`.

4. Partner/organization flows:
- `/dashboard/partner`, `/dashboard/partner/withdrawals`, `/dashboard/organization`, `/dashboard/organization/earnings`.
- Verify data is scoped to own `partnerId`/`orgId` or assigned city only.

### 8.5 Status from this update

- Static audit completed and evidence mapped.
- Rules/index test suite was not executed in this edit-only pass; run `npm run test:rules` to confirm runtime behavior.
