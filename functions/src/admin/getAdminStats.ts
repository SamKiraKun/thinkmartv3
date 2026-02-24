import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission } from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface AdminStats {
    totalUsers: number;
    activeToday: number;
    newUsersToday: number;
    pendingKyc: number;
    pendingWithdrawals: number;
    totalRevenue: number;
    withdrawalsProcessedToday: number;
    lastUpdated: string;
}

// ============================================================================
// Get Admin Stats
// ============================================================================

/**
 * Returns real-time admin dashboard statistics.
 * Uses cached counters where possible to avoid full collection scans.
 */
export const getAdminStats = functions.https.onCall(
    async (data, context): Promise<AdminStats> => {
        // Require analytics.read permission
        await requirePermission(context, "analytics.read");

        const now = new Date();
        const todayStart = new Date(now);
        todayStart.setHours(0, 0, 0, 0);
        const todayStartTs = admin.firestore.Timestamp.fromDate(todayStart);

        try {
            const safeCount = async (
                label: string,
                getter: () => Promise<any>
            ): Promise<number> => {
                try {
                    const snapshot = await getter();
                    return Number(snapshot.data().count || 0);
                } catch (error) {
                    functions.logger.error(`[getAdminStats] Failed count query: ${label}`, error);
                    return 0;
                }
            };

            const safeMaxCount = async (
                label: string,
                getters: Array<() => Promise<any>>
            ): Promise<number> => {
                const counts = await Promise.all(
                    getters.map((getter, index) => safeCount(`${label}.${index}`, getter))
                );
                return Math.max(...counts, 0);
            };

            const [
                totalUsers,
                pendingKyc,
                pendingWithdrawals,
                newUsersToday,
                activeToday,
            ] = await Promise.all([
                safeCount("users.total", () => db.collection("users").count().get()),
                safeCount("users.kyc.submitted", () =>
                    db.collection("users").where("kycStatus", "==", "submitted").count().get()
                ),
                safeMaxCount("withdraw.pending", [
                    () => db.collection("withdraw_requests").where("status", "==", "pending").count().get(),
                    () => db.collection("withdrawals").where("status", "==", "pending").count().get(),
                ]),
                safeCount("users.newToday", () =>
                    db.collection("users").where("createdAt", ">=", todayStartTs).count().get()
                ),
                safeCount("users.activeToday", () =>
                    db.collection("users").where("lastActiveAt", ">=", todayStartTs).count().get()
                ),
            ]);

            // Use range-only query to avoid composite-index failures in production.
            let withdrawalsProcessedToday = 0;
            try {
                const [withdrawRequestsSnap, withdrawalsSnap] = await Promise.all([
                    db.collection("withdraw_requests")
                        .where("processedAt", ">=", todayStartTs)
                        .select("status")
                        .limit(2000)
                        .get()
                        .catch(() => null),
                    db.collection("withdrawals")
                        .where("processedAt", ">=", todayStartTs)
                        .select("status")
                        .limit(2000)
                        .get()
                        .catch(() => null),
                ]);

                const countProcessed = (snapshot: FirebaseFirestore.QuerySnapshot | null) =>
                    snapshot
                        ? snapshot.docs.reduce((count, row) => {
                            const status = String(row.data().status || "").toLowerCase();
                            return status === "approved" || status === "rejected" ? count + 1 : count;
                        }, 0)
                        : 0;

                withdrawalsProcessedToday = Math.max(
                    countProcessed(withdrawRequestsSnap),
                    countProcessed(withdrawalsSnap)
                );
            } catch (error) {
                functions.logger.error("[getAdminStats] Failed processed-withdrawals query", error);
            }

            // Prefer aggregated metric if available; otherwise use bounded fallback summation.
            let totalRevenue = 0;
            try {
                const metricsDoc = await db.collection("admin_metrics").doc("realtime").get();
                const metricsRevenue = Number(metricsDoc.data()?.totalRevenue || 0);
                if (metricsDoc.exists && Number.isFinite(metricsRevenue) && metricsRevenue >= 0) {
                    totalRevenue = metricsRevenue;
                } else {
                    const [ordersSnapshot, transactionsSnapshot] = await Promise.all([
                        db.collection("orders").select("cashPaid").limit(2000).get(),
                        db.collection("transactions")
                            .select("type", "category", "amount")
                            .limit(2000)
                            .get(),
                    ]);

                    const orderRevenue = ordersSnapshot.docs.reduce((sum, row) => {
                        const cashPaid = Number(row.data().cashPaid || 0);
                        return cashPaid > 0 ? sum + cashPaid : sum;
                    }, 0);

                    const membershipRevenue = transactionsSnapshot.docs.reduce((sum, row) => {
                        const txn = row.data();
                        const type = String(txn.type || "").toUpperCase();
                        const category = String(txn.category || "").toLowerCase();
                        const amount = Number(txn.amount || 0);
                        if (!Number.isFinite(amount) || amount <= 0) return sum;

                        const isMembership =
                            type === "MEMBERSHIP_FEE" ||
                            type === "MEMBERSHIP_PAYMENT" ||
                            category === "membership";
                        return isMembership ? sum + amount : sum;
                    }, 0);

                    totalRevenue = orderRevenue + membershipRevenue;
                }
            } catch (error) {
                functions.logger.error("[getAdminStats] Failed revenue calculation", error);
            }

            return {
                totalUsers,
                activeToday,
                newUsersToday,
                pendingKyc,
                pendingWithdrawals,
                totalRevenue,
                withdrawalsProcessedToday,
                lastUpdated: now.toISOString(),
            };
        } catch (error) {
            functions.logger.error("Error getting admin stats:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve admin statistics"
            );
        }
    }
);

// ============================================================================
// Get Revenue Summary
// ============================================================================

interface RevenueSummary {
    range: string;
    grossRevenue: number;
    withdrawalsProcessed: number;
    commissionsEarned: number;
    netRevenue: number;
    orderCount: number;
    membershipRevenue: number;
}

/**
 * Returns revenue summary for a given time range.
 */
export const getRevenueSummary = functions.region('us-east1').https.onCall(
    async (data: { range?: "day" | "week" | "month" } | undefined, context): Promise<RevenueSummary> => {
        await requirePermission(context, "analytics.read");

        const range = data?.range || "week";
        const now = new Date();
        let startDate: Date;

        switch (range) {
            case "day":
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                break;
            case "week":
                startDate = new Date(now);
                startDate.setDate(startDate.getDate() - 7);
                break;
            case "month":
                startDate = new Date(now);
                startDate.setMonth(startDate.getMonth() - 1);
                break;
            default:
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    "Range must be 'day', 'week', or 'month'"
                );
        }

        try {
            const startTimestamp = admin.firestore.Timestamp.fromDate(startDate);
            const safeQuery = async (
                label: string,
                fetcher: () => Promise<FirebaseFirestore.QuerySnapshot>
            ): Promise<FirebaseFirestore.QuerySnapshot | null> => {
                try {
                    return await fetcher();
                } catch (error) {
                    functions.logger.warn(`[getRevenueSummary] Query failed: ${label}`, error);
                    return null;
                }
            };
            const toPositiveAmount = (value: unknown): number => {
                const amount = Number(value || 0);
                if (!Number.isFinite(amount) || amount <= 0) return 0;
                return amount;
            };

            let grossRevenue = 0;
            let membershipRevenue = 0;
            let orderCount = 0;

            // Keep query index requirements minimal, then filter in-memory.
            const txnSnapshot = await safeQuery("transactions", () =>
                db.collection("transactions")
                    .where("createdAt", ">=", startTimestamp)
                    .select("type", "category", "currency", "amount")
                    .limit(5000)
                    .get()
            );

            txnSnapshot?.forEach((doc) => {
                const txn = doc.data();
                const type = String(txn.type || "").toUpperCase();
                const category = String(txn.category || "").toLowerCase();
                const currency = String(txn.currency || "").toUpperCase();
                const amount = toPositiveAmount(txn.amount);
                if (!amount) return;

                // Legacy rows may omit currency; treat as cash for back-compat.
                if (currency && currency !== "CASH") {
                    return;
                }

                if (type === "ORDER_PAYMENT") {
                    grossRevenue += amount;
                    orderCount += 1;
                    return;
                }

                const isMembership =
                    type === "MEMBERSHIP_PAYMENT" ||
                    type === "MEMBERSHIP_FEE" ||
                    category === "membership";
                if (isMembership) {
                    membershipRevenue += amount;
                    grossRevenue += amount;
                }
            });

            const sumApprovedWithdrawals = (snapshot: FirebaseFirestore.QuerySnapshot | null): number => {
                if (!snapshot) return 0;
                return snapshot.docs.reduce((sum, row) => {
                    const status = String(row.data().status || "").toLowerCase();
                    if (status !== "approved") return sum;
                    return sum + toPositiveAmount(row.data().amount);
                }, 0);
            };

            const [withdrawRequestsSnapshot, withdrawalsSnapshot] = await Promise.all([
                safeQuery("withdraw_requests", () =>
                    db.collection("withdraw_requests")
                        .where("processedAt", ">=", startTimestamp)
                        .select("status", "amount")
                        .limit(5000)
                        .get()
                ),
                safeQuery("withdrawals", () =>
                    db.collection("withdrawals")
                        .where("processedAt", ">=", startTimestamp)
                        .select("status", "amount")
                        .limit(5000)
                        .get()
                ),
            ]);

            // Dual source support: some deployments write to withdraw_requests, some to withdrawals.
            const withdrawalsProcessed = Math.max(
                sumApprovedWithdrawals(withdrawRequestsSnapshot),
                sumApprovedWithdrawals(withdrawalsSnapshot)
            );

            const sumAmounts = (snapshot: FirebaseFirestore.QuerySnapshot | null): number => {
                if (!snapshot) return 0;
                return snapshot.docs.reduce((sum, row) => sum + toPositiveAmount(row.data().amount), 0);
            };

            const [partnerCommissionSnapshot, orgCommissionSnapshot] = await Promise.all([
                safeQuery("partner_commission_logs", () =>
                    db.collection("partner_commission_logs")
                        .where("createdAt", ">=", startTimestamp)
                        .select("amount")
                        .limit(5000)
                        .get()
                ),
                safeQuery("org_commission_logs", () =>
                    db.collection("org_commission_logs")
                        .where("createdAt", ">=", startTimestamp)
                        .select("amount")
                        .limit(5000)
                        .get()
                ),
            ]);

            const commissionsEarned =
                sumAmounts(partnerCommissionSnapshot) + sumAmounts(orgCommissionSnapshot);

            return {
                range,
                grossRevenue,
                withdrawalsProcessed,
                commissionsEarned,
                netRevenue: grossRevenue - withdrawalsProcessed,
                orderCount,
                membershipRevenue,
            };
        } catch (error) {
            functions.logger.error("Error getting revenue summary:", error);
            return {
                range,
                grossRevenue: 0,
                withdrawalsProcessed: 0,
                commissionsEarned: 0,
                netRevenue: 0,
                orderCount: 0,
                membershipRevenue: 0,
            };
        }
    }
);

// ============================================================================
// Get City Summary
// ============================================================================

interface CitySummary {
    city: string;
    userCount: number;
    orderCount: number;
    revenue: number;
    partnerPayout: number;
}

/**
 * Returns summary statistics per city.
 */
export const getCitySummary = functions.https.onCall(
    async (data, context): Promise<CitySummary[]> => {
        await requirePermission(context, "analytics.read");

        try {
            // Get city stats from aggregated collection if exists
            const cityStatsSnapshot = await db.collection("city_stats")
                .orderBy("userCount", "desc")
                .limit(50)
                .get();

            const summaries: CitySummary[] = [];

            cityStatsSnapshot.forEach((doc) => {
                const data = doc.data();
                summaries.push({
                    city: doc.id,
                    userCount: data.userCount || 0,
                    orderCount: data.orderCount || 0,
                    revenue: data.revenue || 0,
                    partnerPayout: data.partnerPayout || 0,
                });
            });

            return summaries;
        } catch (error) {
            functions.logger.error("Error getting city summary:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve city summary"
            );
        }
    }
);
