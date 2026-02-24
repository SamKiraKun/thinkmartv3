// File: functions/src/index.ts
import * as admin from 'firebase-admin';

// Initialize Firebase Admin once for all functions
if (!admin.apps.length) {
  admin.initializeApp();
}

// Export Triggers
export * from './triggers/user';
export * from './triggers/transactions';
export * from './triggers/referralStats'; // NEW: Pre-computed referral counts

// Export Callable Functions
export * from './tasks/rewardTask';
export * from './tasks/startTask';
export * from './tasks/submitSurveyAnswer';
export * from './tasks/dailyCheckin'; // NEW: Daily Check-in

export * from './user/upgradeMembership';
export * from './wallet/convertCoinsToBalance';
export * from './withdrawals/requestWithdrawal'; // NEW: Production Withdrawal System
export * from './partner/partner'; // Partner Dashboard Functions
export * from './vendor/vendor'; // Vendor Dashboard Functions
export * from './vendor/vendorAnalytics'; // Vendor Analytics (revenue trend, top products, fulfillment)
export * from './organization/organization'; // Organization Dashboard Functions
export * from './audit/auditLog'; // NEW: Audit Logging
export * from './orders/createOrderMultiItem'; // Multi-Item Orders

export * from './orders/cancelOrder'; // NEW: Order Cancellation with Refund
export * from './orders/updateOrderStatus'; // NEW: Admin Order Status Updates

// Admin Dashboard Functions (Phase 1)
export * from './admin/getAdminStats'; // Real-time stats, revenue, city summary
export * from './admin/userManagement'; // User list, details, role, status, wallet adjust
export * from './admin/kycManagement'; // KYC list, approve, reject
export * from './admin/withdrawalManagement'; // Withdrawal list, approve, reject
export * from './admin/transactionManagement'; // Admin transactions list (enriched)

// Admin Dashboard Functions (Phase 2 - Marketplace & Orders)
export * from './admin/marketplaceManagement'; // Products, vendors moderation
export * from './admin/orderManagement'; // Orders, refunds

// Admin Dashboard Functions (Phase 3 - Partners, Feature Flags, Audit)
export * from './admin/partnerOrgManagement'; // Partners, organizations
export * from './admin/featureFlags'; // Feature flag CRUD and client check
export * from './admin/auditLogViewer'; // Audit log viewer and stats
export * from './admin/healthCheck'; // Admin health diagnostics
export * from './admin/queueHealth'; // Admin queue health (KYC, withdrawals, orders)

// Admin Dashboard Functions (Phase 4 - Settings, Tasks, Games)
export * from './admin/settingsManagement'; // Settings, game config, commissions
export * from './admin/taskManagement'; // Task CRUD
export * from './admin/uploadProductImage'; // Secure product image upload
export * from './admin/bulkImport'; // CSV product import

// Notifications
export * from './notifications/orderNotifications'; // FCM order/wallet notifications

// Reviews
export * from './reviews/reviewFunctions'; // Product reviews

// Gamification
export * from './gamification/leaderboard'; // Referral leaderboards
export * from './gamification/badges'; // Achievement badges
export * from './gamification/games'; // Spin wheel + lucky box

// Coupons
export * from './coupons/couponFunctions'; // Promo codes

// Search
export * from './search/productSearch'; // Typesense product search

// Marketplace
export * from './marketplace/shopCatalog'; // User shop listing with filters + cursor pagination
export * as dummy from "./dummy";
