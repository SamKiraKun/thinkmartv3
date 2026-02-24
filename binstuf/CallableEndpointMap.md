# Callable Endpoint Map (Canonical vs Deprecated)

## Canonical Endpoints (Use These)

### Orders
- `createOrderMultiItem`
  - Status: canonical
  - Used by: `app/dashboard/user/checkout/page.tsx`
- `cancelOrder`
  - Status: canonical
  - Used by: `app/dashboard/user/orders/[id]/page.tsx`
- `updateOrderStatus`
  - Status: canonical admin op
  - Used by: `app/dashboard/admin/orders/page.tsx`

### Withdrawals
- `requestWithdrawalSecure`
  - Status: canonical
  - Used by: `app/dashboard/user/withdraw/page.tsx`, `app/dashboard/partner/withdrawals/page.tsx`
- `processWithdrawalSecure`
  - Status: canonical admin op
  - Used by: `app/dashboard/admin/withdrawals/page.tsx`

### Admin: Users/KYC/Tasks/Marketplace
- `getAdminUsersPage`, `setUserRole`, `setUserStatus`, `adjustWallet`
  - Status: canonical
  - Used by: `app/dashboard/admin/users/page.tsx`
- `updatePartnerConfig`, `updateOrgConfig`
  - Status: canonical
  - Used by: `app/dashboard/admin/users/page.tsx`, `app/dashboard/admin/partners-orgs/page.tsx`
- `getPartnersPage`, `getOrganizationsPage`
  - Status: canonical (cursor pagination)
  - Used by: `app/dashboard/admin/partners/manage/page.tsx`, `app/dashboard/admin/partners-orgs/page.tsx`
- `getKycRequests`, `approveKyc`, `rejectKyc`
  - Status: canonical
  - Used by: `app/dashboard/admin/kyc/page.tsx`
- `getAdminTasks`, `createTask`, `updateTask`, `archiveTask`
  - Status: legacy list endpoint + canonical mutations
  - Used by: legacy clients only for list path
- `getAdminTasksPage`, `createTask`, `updateTask`, `archiveTask`
  - Status: canonical
  - Used by: `app/dashboard/admin/cms/page.tsx`, `app/dashboard/admin/tasks/page.tsx`
- `getProductsForModerationPage`, `approveProduct`, `rejectProduct`
  - Status: canonical
  - Used by: `app/dashboard/admin/products/page.tsx`, `app/dashboard/admin/cms/page.tsx`
- `getVendorsPage`, `verifyVendor`, `suspendVendor`
  - Status: canonical
  - Used by: `app/dashboard/admin/vendors/page.tsx`
- `uploadProductImage`
  - Status: canonical (server-authoritative storage write)
  - Used by: `lib/firebase/productImageUpload.ts`

### Vendor/Partner Domains
- Vendor: `getVendorDashboardStats`, `getVendorProducts`, `createVendorProduct`, `updateVendorProduct`, `deleteVendorProduct`
  - Status: canonical
  - Used by: `app/dashboard/vendor/*`
- Partner: `getPartnerDashboardStats`, `getPartnerProducts`, `updatePartnerProduct`, `createPartnerProduct`, `deletePartnerProduct`, `getPartnerAnalytics`, `getPartnerCommissionHistory`, `getCityUsers`
  - Status: canonical
  - Used by: `app/dashboard/partner/*`

### Marketplace (User)
- `getShopProductsPage`
  - Status: canonical (server-backed filters/sort + cursor pagination)
  - Used by: `app/dashboard/user/shop/page.tsx`

## Deprecated / Legacy Endpoints (Migrate Away)

- `createOrder`
  - Reason: legacy single-item flow in `functions/src/index.ts`; duplicates order logic.
  - Current usage: none (migrated from `services/order.service.ts`).
  - Migration target: `createOrderMultiItem`

- `getAdminUsers`
  - Reason: offset pagination; replaced by scalable cursor endpoint.
  - Current usage: none in client app.
  - Migration target: `getAdminUsersPage`

- `getAdminTasks`
  - Reason: offset pagination; replaced by cursor endpoint.
  - Current usage: none in client app.
  - Migration target: `getAdminTasksPage`

- `getProductsForModeration`
  - Reason: offset pagination; replaced by cursor endpoint.
  - Current usage: none in client app.
  - Migration target: `getProductsForModerationPage`

- `getVendors`
  - Reason: offset pagination; replaced by cursor endpoint.
  - Current usage: none in client app.
  - Migration target: `getVendorsPage`

- `getPartners`, `getOrganizations`
  - Reason: offset pagination; replaced by scalable cursor endpoints.
  - Current usage: none in client app.
  - Migration target: `getPartnersPage`, `getOrganizationsPage`

- `updateLeaderboard`
  - Reason: manual trigger legacy-style operation.
  - Current usage: none (removed from user-facing leaderboard page).
  - Migration target: server-driven scheduled refresh (`scheduledLeaderboardUpdate`) + read-only client consumption.

## Completed in this pass
- Partner withdrawals migrated from legacy `requestWithdrawal` to canonical `requestWithdrawalSecure`.
  - File: `app/dashboard/partner/withdrawals/page.tsx`
- Legacy order service migrated from `createOrder` to canonical `createOrderMultiItem`.
  - File: `services/order.service.ts`
- User leaderboard no longer calls `updateLeaderboard` from client.
  - File: `app/dashboard/user/leaderboard/page.tsx`
- Legacy `functions/src/index.ts` business logic extracted to `functions/src/legacy/legacyCore.ts`.
  - Files: `functions/src/index.ts`, `functions/src/legacy/legacyCore.ts`
  - Note: callable names preserved via re-export for compatibility.
- Legacy partner callables moved from `legacyCore` to partner domain module.
  - Moved: `getPartnerStats`, `getPartnerUsers`
  - Files: `functions/src/partner/partner.ts`, `functions/src/legacy/legacyCore.ts`
- Legacy game callables moved from `legacyCore` to gamification domain module.
  - Moved: `spinWheel`, `openLuckyBox`
  - Files: `functions/src/gamification/games.ts`, `functions/src/legacy/legacyCore.ts`, `functions/src/index.ts`
- Legacy leaderboard callables moved from `legacyCore` to gamification leaderboard module.
  - Moved: `updateLeaderboard`, `scheduledLeaderboardUpdate`
  - Files: `functions/src/gamification/leaderboard.ts`, `functions/src/legacy/legacyCore.ts`
- Legacy wallet conversion callable moved from `legacyCore` to wallet domain module.
  - Moved: `convertCoinsToBalance`
  - Files: `functions/src/wallet/convertCoinsToBalance.ts`, `functions/src/index.ts`, `functions/src/legacy/legacyCore.ts`
- Legacy membership callable moved from `legacyCore` to user domain module.
  - Moved: `purchaseMembership`
  - Files: `functions/src/user/upgradeMembership.ts`, `functions/src/legacy/legacyCore.ts`
- Legacy order and survey callables moved from `legacyCore` to domain modules.
  - Moved: `createOrder` -> `functions/src/orders/legacyCreateOrder.ts`
  - Moved: `startSurvey`, `completeSurvey` -> `functions/src/tasks/legacySurvey.ts`
  - Files: `functions/src/index.ts`, `functions/src/legacy/legacyCore.ts`
- Partner/org admin pages migrated to cursor endpoints.
  - Moved: `getPartners` -> `getPartnersPage`, `getOrganizations` -> `getOrganizationsPage`
  - Files: `app/dashboard/admin/partners/manage/page.tsx`, `app/dashboard/admin/partners-orgs/page.tsx`, `functions/src/admin/partnerOrgManagement.ts`

## Next Migration Targets
1. Fully remove `functions/src/legacy/legacyCore.ts` file once filesystem lock issue is resolved (currently neutralized/empty and no longer exported).
2. Begin semantic deprecation of compatibility endpoints (`createOrder`, `startSurvey`, `completeSurvey`) in favor of canonical replacements.
3. Migrate admin users search path from `getAdminUsers` (offset/search endpoint) to a canonical paginated search strategy.
