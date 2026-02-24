import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission } from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface QueueItem {
    label: string;
    count: number;
    oldestItemAge: string | null; // e.g. "2h 15m" or null if queue empty
    trend: "up" | "down" | "stable";
}

interface AdminQueueHealth {
    queues: {
        pendingKyc: QueueItem;
        pendingWithdrawals: QueueItem;
        pendingOrders: QueueItem;
        pendingProducts: QueueItem;
    };
    alerts: Array<{
        severity: "warning" | "critical";
        message: string;
        queue: string;
    }>;
    timestamp: string;
}

// ============================================================================
// Helper: Format age
// ============================================================================

function formatAge(ms: number): string {
    if (ms <= 0) return "0m";
    const hours = Math.floor(ms / (1000 * 60 * 60));
    const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
    if (hours > 24) {
        const days = Math.floor(hours / 24);
        return `${days}d ${hours % 24}h`;
    }
    if (hours > 0) return `${hours}h ${minutes}m`;
    return `${minutes}m`;
}

// ============================================================================
// Helper: Get oldest item in a query
// ============================================================================

async function getOldestAge(
    query: FirebaseFirestore.Query,
    timeField: string = "createdAt"
): Promise<{ count: number; oldestMs: number }> {
    try {
        const snapshot = await query.orderBy(timeField, "asc").limit(1).get();
        const countSnap = await query.count().get();
        const count = countSnap.data().count;

        if (snapshot.empty || count === 0) {
            return { count: 0, oldestMs: 0 };
        }

        const oldestData = snapshot.docs[0].data();
        const oldestTimestamp = oldestData[timeField];
        const oldestDate = oldestTimestamp?.toDate?.() || new Date();
        const oldestMs = Date.now() - oldestDate.getTime();

        return { count, oldestMs };
    } catch (error) {
        functions.logger.warn(`[adminQueueHealth] Failed query for field ${timeField}`, error);
        return { count: 0, oldestMs: 0 };
    }
}

// ============================================================================
// CLOUD FUNCTION: Admin Queue Health
// ============================================================================

export const getAdminQueueHealth = functions.https.onCall(
    async (_data, context): Promise<AdminQueueHealth> => {
        await requirePermission(context, "analytics.read");

        const nowMs = Date.now();

        // 1. Pending KYC
        const kycQuery = db.collection("kyc_submissions").where("status", "==", "pending");
        const kycResult = await getOldestAge(kycQuery, "submittedAt");

        // 2. Pending Withdrawals
        const withdrawalQuery = db.collection("withdrawals").where("status", "==", "pending");
        const withdrawalResult = await getOldestAge(withdrawalQuery, "createdAt");

        // 3. Pending Orders (pending + confirmed but not shipped)
        const pendingOrderQuery = db.collection("orders").where("status", "==", "pending");
        const confirmedOrderQuery = db.collection("orders").where("status", "==", "confirmed");
        const [pendingOrderResult, confirmedOrderResult] = await Promise.all([
            getOldestAge(pendingOrderQuery, "createdAt"),
            getOldestAge(confirmedOrderQuery, "createdAt"),
        ]);
        const orderCount = pendingOrderResult.count + confirmedOrderResult.count;
        const orderOldestMs = Math.max(pendingOrderResult.oldestMs, confirmedOrderResult.oldestMs);

        // 4. Pending Products (moderation)
        const productQuery = db.collection("products").where("status", "==", "pending");
        const productResult = await getOldestAge(productQuery, "createdAt");

        // Build queue items
        const SLA_KYC_MS = 24 * 60 * 60 * 1000; // 24h
        const SLA_WITHDRAWAL_MS = 48 * 60 * 60 * 1000; // 48h
        const SLA_ORDER_MS = 24 * 60 * 60 * 1000; // 24h
        const SLA_PRODUCT_MS = 12 * 60 * 60 * 1000; // 12h

        const queues = {
            pendingKyc: {
                label: "Pending KYC Verifications",
                count: kycResult.count,
                oldestItemAge: kycResult.oldestMs > 0 ? formatAge(kycResult.oldestMs) : null,
                trend: "stable" as const,
            },
            pendingWithdrawals: {
                label: "Pending Withdrawals",
                count: withdrawalResult.count,
                oldestItemAge: withdrawalResult.oldestMs > 0 ? formatAge(withdrawalResult.oldestMs) : null,
                trend: "stable" as const,
            },
            pendingOrders: {
                label: "Pending/Confirmed Orders",
                count: orderCount,
                oldestItemAge: orderOldestMs > 0 ? formatAge(orderOldestMs) : null,
                trend: "stable" as const,
            },
            pendingProducts: {
                label: "Products Awaiting Moderation",
                count: productResult.count,
                oldestItemAge: productResult.oldestMs > 0 ? formatAge(productResult.oldestMs) : null,
                trend: "stable" as const,
            },
        };

        // Generate alerts for SLA breaches
        const alerts: AdminQueueHealth["alerts"] = [];

        if (kycResult.oldestMs > SLA_KYC_MS && kycResult.count > 0) {
            alerts.push({
                severity: kycResult.oldestMs > SLA_KYC_MS * 2 ? "critical" : "warning",
                message: `${kycResult.count} KYC verification(s) pending. Oldest: ${formatAge(kycResult.oldestMs)} (SLA: 24h)`,
                queue: "pendingKyc",
            });
        }

        if (withdrawalResult.oldestMs > SLA_WITHDRAWAL_MS && withdrawalResult.count > 0) {
            alerts.push({
                severity: withdrawalResult.oldestMs > SLA_WITHDRAWAL_MS * 2 ? "critical" : "warning",
                message: `${withdrawalResult.count} withdrawal(s) pending. Oldest: ${formatAge(withdrawalResult.oldestMs)} (SLA: 48h)`,
                queue: "pendingWithdrawals",
            });
        }

        if (orderOldestMs > SLA_ORDER_MS && orderCount > 0) {
            alerts.push({
                severity: orderOldestMs > SLA_ORDER_MS * 2 ? "critical" : "warning",
                message: `${orderCount} order(s) awaiting processing. Oldest: ${formatAge(orderOldestMs)} (SLA: 24h)`,
                queue: "pendingOrders",
            });
        }

        if (productResult.oldestMs > SLA_PRODUCT_MS && productResult.count > 0) {
            alerts.push({
                severity: "warning",
                message: `${productResult.count} product(s) awaiting moderation. Oldest: ${formatAge(productResult.oldestMs)} (SLA: 12h)`,
                queue: "pendingProducts",
            });
        }

        return {
            queues,
            alerts,
            timestamp: new Date().toISOString(),
        };
    }
);
