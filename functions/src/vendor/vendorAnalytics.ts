import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// Helper: Require Vendor Role (re-used from vendor.ts pattern)
// ============================================================================

async function requireVendorRole(context: functions.https.CallableContext): Promise<{
    userId: string;
    vendorId: string;
    vendorAliases: string[];
}> {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const userDoc = await db.collection('users').doc(userId).get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;

    if (userData.role !== 'vendor') {
        throw new functions.https.HttpsError('permission-denied', 'Vendor role required');
    }

    const vendorId = userData.vendorId || userId;
    const vendorAliases = [
        vendorId,
        userData.businessName || '',
        userData.shopName || '',
        userId,
    ].map(v => String(v || '').trim().toLowerCase()).filter(Boolean);

    return { userId, vendorId, vendorAliases };
}

function toTrimmedLower(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function matchesVendor(value: unknown, aliases: string[]): boolean {
    const v = toTrimmedLower(value);
    return v !== '' && aliases.includes(v);
}

function orderBelongsToVendor(orderData: any, aliases: string[]): boolean {
    if (Array.isArray(orderData.vendorIds)) {
        for (const vid of orderData.vendorIds) {
            if (matchesVendor(vid, aliases)) return true;
        }
    }
    if (matchesVendor(orderData.vendorId, aliases)) return true;
    if (matchesVendor(orderData.vendorName, aliases)) return true;
    if (Array.isArray(orderData.items)) {
        for (const item of orderData.items) {
            if (matchesVendor(item.vendorId, aliases) || matchesVendor(item.vendorName, aliases)) {
                return true;
            }
        }
    }
    return false;
}

// ============================================================================
// CLOUD FUNCTION: Get Vendor Analytics
// ============================================================================

interface RevenueTrendPoint {
    date: string; // YYYY-MM-DD
    revenue: number;
    orderCount: number;
}

interface TopProduct {
    productId: string;
    name: string;
    totalSold: number;
    totalRevenue: number;
    imageUrl: string | null;
}

interface FulfillmentStats {
    averageProcessingHours: number;
    onTimeRate: number; // percentage
    pendingCount: number;
    confirmedCount: number;
    shippedCount: number;
    deliveredCount: number;
    cancelledCount: number;
}

interface VendorAnalytics {
    revenueTrend: RevenueTrendPoint[];
    topProducts: TopProduct[];
    fulfillment: FulfillmentStats;
    summary: {
        totalRevenueLast30Days: number;
        totalOrdersLast30Days: number;
        averageOrderValue: number;
        returnRate: number;
    };
}

export const getVendorAnalytics = functions.https.onCall(
    async (_data, context): Promise<VendorAnalytics> => {
        const { vendorAliases } = await requireVendorRole(context);

        const now = new Date();
        const thirtyDaysAgo = new Date(now);
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const thirtyDaysAgoTs = admin.firestore.Timestamp.fromDate(thirtyDaysAgo);

        // Fetch vendor orders from last 90 days for trend (wider window for chart)
        const ninetyDaysAgo = new Date(now);
        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
        const ninetyDaysAgoTs = admin.firestore.Timestamp.fromDate(ninetyDaysAgo);

        // Read all vendor orders (bounded scan of recent orders)
        let allOrders: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        try {
            const ordersSnap = await db.collection('orders')
                .where('createdAt', '>=', ninetyDaysAgoTs)
                .orderBy('createdAt', 'desc')
                .limit(2000)
                .get();

            allOrders = ordersSnap.docs.filter(doc => orderBelongsToVendor(doc.data(), vendorAliases));
        } catch {
            // Fallback: try vendorIds array-contains
            try {
                const ordersSnap = await db.collection('orders')
                    .where('vendorIds', 'array-contains', vendorAliases[0])
                    .orderBy('createdAt', 'desc')
                    .limit(2000)
                    .get();
                allOrders = ordersSnap.docs;
            } catch {
                functions.logger.warn('[getVendorAnalytics] Both order queries failed');
            }
        }

        // 1. Revenue Trend (last 30 days, daily buckets)
        const revenueTrend: RevenueTrendPoint[] = [];
        const dailyBuckets: Record<string, { revenue: number; count: number }> = {};

        // Initialize 30 day buckets
        for (let i = 29; i >= 0; i--) {
            const d = new Date(now);
            d.setDate(d.getDate() - i);
            const key = d.toISOString().split('T')[0];
            dailyBuckets[key] = { revenue: 0, count: 0 };
        }

        // 2. Top Products aggregation
        const productSales: Record<string, { name: string; totalSold: number; totalRevenue: number; imageUrl: string | null }> = {};

        // 3. Fulfillment stats
        let pendingCount = 0;
        let confirmedCount = 0;
        let shippedCount = 0;
        let deliveredCount = 0;
        let cancelledCount = 0;
        let totalProcessingMs = 0;
        let processedOrderCount = 0;
        let onTimeCount = 0;
        let totalRevenue30d = 0;
        let totalOrders30d = 0;
        let returnCount = 0;

        const SLA_HOURS = 48; // 48-hour SLA for processing

        for (const doc of allOrders) {
            const data = doc.data();
            const createdAt = data.createdAt?.toDate?.() || new Date(0);
            const dateKey = createdAt.toISOString().split('T')[0];
            const orderRevenue = Number(data.cashPaid || data.totalAmount || data.productPrice || 0);
            const status = String(data.status || '').toLowerCase();

            // Trend buckets
            if (dailyBuckets[dateKey] !== undefined) {
                dailyBuckets[dateKey].revenue += orderRevenue;
                dailyBuckets[dateKey].count += 1;
            }

            // 30-day summary
            if (createdAt >= thirtyDaysAgo) {
                totalRevenue30d += orderRevenue;
                totalOrders30d += 1;
            }

            // Product aggregation
            const items = Array.isArray(data.items) ? data.items : [];
            if (items.length > 0) {
                for (const item of items) {
                    const pid = item.productId || 'unknown';
                    if (!productSales[pid]) {
                        productSales[pid] = {
                            name: item.productName || item.name || 'Unknown Product',
                            totalSold: 0,
                            totalRevenue: 0,
                            imageUrl: item.imageUrl || item.productImage || null,
                        };
                    }
                    productSales[pid].totalSold += Number(item.quantity || 1);
                    productSales[pid].totalRevenue += Number(item.price || 0) * Number(item.quantity || 1);
                }
            } else if (data.productId) {
                const pid = data.productId;
                if (!productSales[pid]) {
                    productSales[pid] = {
                        name: data.productName || 'Unknown Product',
                        totalSold: 0,
                        totalRevenue: 0,
                        imageUrl: data.productImage || null,
                    };
                }
                productSales[pid].totalSold += 1;
                productSales[pid].totalRevenue += orderRevenue;
            }

            // Fulfillment status counts
            switch (status) {
                case 'pending': pendingCount++; break;
                case 'confirmed': confirmedCount++; break;
                case 'shipped': shippedCount++; break;
                case 'delivered': deliveredCount++; break;
                case 'cancelled': cancelledCount++; break;
                case 'returned': returnCount++; break;
            }

            // Processing time (created -> confirmed/shipped)
            const processedAt = data.confirmedAt?.toDate?.() || data.shippedAt?.toDate?.() || data.updatedAt?.toDate?.();
            if (processedAt && (status === 'confirmed' || status === 'shipped' || status === 'delivered')) {
                const processingMs = processedAt.getTime() - createdAt.getTime();
                if (processingMs > 0 && processingMs < 30 * 24 * 60 * 60 * 1000) { // sanity: < 30 days
                    totalProcessingMs += processingMs;
                    processedOrderCount++;
                    if (processingMs <= SLA_HOURS * 60 * 60 * 1000) {
                        onTimeCount++;
                    }
                }
            }
        }

        // Build revenue trend array
        for (const [date, bucket] of Object.entries(dailyBuckets)) {
            revenueTrend.push({
                date,
                revenue: Math.round(bucket.revenue * 100) / 100,
                orderCount: bucket.count,
            });
        }

        // Build top products (sorted by revenue, top 10)
        const topProducts: TopProduct[] = Object.entries(productSales)
            .map(([productId, data]) => ({
                productId,
                ...data,
            }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 10);

        // Build fulfillment stats
        const averageProcessingHours = processedOrderCount > 0
            ? Math.round((totalProcessingMs / processedOrderCount) / (1000 * 60 * 60) * 10) / 10
            : 0;

        const onTimeRate = processedOrderCount > 0
            ? Math.round((onTimeCount / processedOrderCount) * 100)
            : 100;

        const averageOrderValue = totalOrders30d > 0
            ? Math.round((totalRevenue30d / totalOrders30d) * 100) / 100
            : 0;

        const totalNonCancelled = totalOrders30d - cancelledCount;
        const returnRate = totalNonCancelled > 0
            ? Math.round((returnCount / totalNonCancelled) * 100 * 10) / 10
            : 0;

        return {
            revenueTrend,
            topProducts,
            fulfillment: {
                averageProcessingHours,
                onTimeRate,
                pendingCount,
                confirmedCount,
                shippedCount,
                deliveredCount,
                cancelledCount,
            },
            summary: {
                totalRevenueLast30Days: Math.round(totalRevenue30d * 100) / 100,
                totalOrdersLast30Days: totalOrders30d,
                averageOrderValue,
                returnRate,
            },
        };
    }
);
