import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    requirePermission,
    writeAuditLog,
    validateRequiredString,
    validateOptionalString,
    validateEnum,
    checkIdempotency,
    markIdempotencyComplete
} from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface OrderListItem {
    id: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    vendorId?: string;
    vendorName?: string;
    status: string;
    subtotal: number;
    cashPaid: number;
    coinsPaid: number;
    itemCount: number;
    createdAt: string;
}

interface OrderListResponse {
    orders: OrderListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface OrdersPageCursor {
    createdAtMs: number;
    id: string;
}

interface OrdersCursorPageResponse {
    orders: Array<OrderListItem & { firstItemName?: string; city?: string }>;
    nextCursor: OrdersPageCursor | null;
    hasMore: boolean;
}

interface OrderDetails {
    id: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    userPhone?: string;
    status: string;
    items: Array<{
        productId: string;
        productName: string;
        quantity: number;
        unitPrice: number;
        vendorId?: string;
        vendorName?: string;
    }>;
    subtotal: number;
    cashPaid: number;
    coinsPaid: number;
    shippingAddress?: any;
    createdAt: string;
    updatedAt?: string;
    statusHistory: Array<{
        status: string;
        timestamp: string;
        updatedBy?: string;
        note?: string;
    }>;
}

const ORDER_STATUSES = [
    "pending",
    "confirmed",
    "processing",
    "shipped",
    "delivered",
    "cancelled",
    "refunded"
] as const;

type OrderStatus = typeof ORDER_STATUSES[number];

// ============================================================================
// Get Orders (Paginated)
// ============================================================================

/**
 * Returns paginated list of orders with filters.
 */
export const getOrders = functions.https.onCall(
    async (
        data: {
            status?: string;
            userId?: string;
            vendorId?: string;
            fromDate?: string;
            toDate?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<OrderListResponse> => {
        await requirePermission(context, "orders.manage");

        const { status, userId, vendorId, fromDate, toDate, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("orders");

            // Apply filters
            if (status) {
                query = query.where("status", "==", status);
            }
            if (userId) {
                query = query.where("userId", "==", userId);
            }
            if (vendorId) {
                query = query.where("vendorIds", "array-contains", vendorId);
            }
            if (fromDate) {
                query = query.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(new Date(fromDate)));
            }
            if (toDate) {
                query = query.where("createdAt", "<=", admin.firestore.Timestamp.fromDate(new Date(toDate)));
            }

            query = query.orderBy("createdAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Get page data
            const snapshot = await query.offset(offset).limit(validLimit).get();

            // Batch fetch user names
            const userIds = new Set<string>();
            snapshot.forEach((doc) => userIds.add(doc.data().userId));

            const userDocs = await Promise.all(
                Array.from(userIds).map((uid) => db.collection("users").doc(uid).get())
            );
            const userMap = new Map(
                userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
            );

            const orders: OrderListItem[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const userData = userMap.get(data.userId) || {};
                const items = data.items || [];

                orders.push({
                    id: doc.id,
                    userId: data.userId,
                    userName: userData.name || null,
                    userEmail: userData.email || null,
                    vendorId: data.vendorIds?.[0] || null,
                    status: data.status || "pending",
                    subtotal: data.subtotal || data.amount || 0,
                    cashPaid: data.cashPaid || 0,
                    coinsPaid: data.coinsRedeemed || data.coinsPaid || 0,
                    itemCount: items.length,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                });
            });

            return {
                orders,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + orders.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting orders:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve orders"
            );
        }
    }
);

/**
 * Returns cursor-paginated list of orders.
 */
export const getOrdersPage = functions.https.onCall(
    async (
        data: {
            status?: string;
            userId?: string;
            vendorId?: string;
            fromDate?: string;
            toDate?: string;
            pageSize?: number;
            cursor?: OrdersPageCursor | null;
        },
        context
    ): Promise<OrdersCursorPageResponse> => {
        await requirePermission(context, "orders.manage");

        const { status, userId, vendorId, fromDate, toDate, pageSize = 20, cursor } = data;
        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("orders");

            if (status) {
                query = query.where("status", "==", status);
            }
            if (userId) {
                query = query.where("userId", "==", userId);
            }
            if (vendorId) {
                query = query.where("vendorIds", "array-contains", vendorId);
            }
            if (fromDate) {
                query = query.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(new Date(fromDate)));
            }
            if (toDate) {
                query = query.where("createdAt", "<=", admin.firestore.Timestamp.fromDate(new Date(toDate)));
            }

            query = query
                .orderBy("createdAt", "desc")
                .orderBy(admin.firestore.FieldPath.documentId(), "desc");

            if (cursor?.createdAtMs && cursor?.id) {
                query = query.startAfter(
                    admin.firestore.Timestamp.fromMillis(cursor.createdAtMs),
                    cursor.id
                );
            }

            const snapshot = await query.limit(limit + 1).get();
            const pageDocs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            const userIds = new Set<string>();
            pageDocs.forEach((doc) => userIds.add(doc.data().userId));

            const userDocs = await Promise.all(
                Array.from(userIds).map((uid) => db.collection("users").doc(uid).get())
            );
            const userMap = new Map(
                userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
            );

            const orders = pageDocs.map((doc) => {
                const row = doc.data();
                const userData = userMap.get(row.userId) || {};
                const items = row.items || [];

                return {
                    id: doc.id,
                    userId: row.userId,
                    userName: userData.name || null,
                    userEmail: userData.email || null,
                    vendorId: row.vendorIds?.[0] || null,
                    status: row.status || "pending",
                    subtotal: row.subtotal || row.amount || 0,
                    cashPaid: row.cashPaid || 0,
                    coinsPaid: row.coinsRedeemed || row.coinsPaid || 0,
                    itemCount: items.length,
                    firstItemName: items[0]?.productName || items[0]?.name || "",
                    city: row.shippingAddress?.city || userData.city || "",
                    createdAt: row.createdAt?.toDate?.().toISOString() || "",
                };
            });

            const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
            const lastCreatedAt = lastDoc?.get("createdAt");
            const nextCursor =
                hasMore && lastDoc && lastCreatedAt
                    ? {
                        createdAtMs: lastCreatedAt.toMillis(),
                        id: lastDoc.id,
                    }
                    : null;

            return {
                orders,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting orders page:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve orders"
            );
        }
    }
);

// ============================================================================
// Get Order Details
// ============================================================================

/**
 * Returns detailed order information.
 */
export const getOrderDetails = functions.https.onCall(
    async (data: { orderId: string }, context): Promise<OrderDetails> => {
        await requirePermission(context, "orders.manage");

        const orderId = validateRequiredString(data.orderId, "orderId");

        try {
            const orderDoc = await db.collection("orders").doc(orderId).get();

            if (!orderDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Order not found");
            }

            const orderData = orderDoc.data()!;

            // Get user info
            const userDoc = await db.collection("users").doc(orderData.userId).get();
            const userData = userDoc.exists ? userDoc.data()! : {};

            // Get vendor names for items
            const vendorIds = new Set<string>();
            (orderData.items || []).forEach((item: any) => {
                if (item.vendorId) vendorIds.add(item.vendorId);
            });

            const vendorDocs = await Promise.all(
                Array.from(vendorIds).map((uid) => db.collection("users").doc(uid).get())
            );
            const vendorMap = new Map(
                vendorDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
            );

            return {
                id: orderId,
                userId: orderData.userId,
                userName: userData.name || null,
                userEmail: userData.email || null,
                userPhone: userData.phone || null,
                status: orderData.status || "pending",
                items: (orderData.items || []).map((item: any) => ({
                    productId: item.productId,
                    productName: item.productName || item.name || "",
                    quantity: item.quantity,
                    unitPrice: item.unitPrice || item.price || 0,
                    vendorId: item.vendorId || null,
                    vendorName: vendorMap.get(item.vendorId)?.name || null,
                })),
                subtotal: orderData.subtotal || orderData.amount || 0,
                cashPaid: orderData.cashPaid || 0,
                coinsPaid: orderData.coinsRedeemed || orderData.coinsPaid || 0,
                shippingAddress: orderData.shippingAddress || null,
                createdAt: orderData.createdAt?.toDate?.().toISOString() || "",
                updatedAt: orderData.updatedAt?.toDate?.().toISOString() || null,
                statusHistory: orderData.statusHistory || [],
            };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error getting order details:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve order details"
            );
        }
    }
);

// ============================================================================
// Update Order Status
// ============================================================================

/**
 * Updates order status with audit logging.
 */
export const adminUpdateOrderStatus = functions.https.onCall(
    async (
        data: {
            orderId: string;
            status: string;
            requestId: string;
            note?: string;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "orders.manage");

        const orderId = validateRequiredString(data.orderId, "orderId");
        const newStatus = validateEnum(data.status, "status", ORDER_STATUSES);
        const requestId = validateRequiredString(data.requestId, "requestId");
        const note = validateOptionalString(data.note, "note");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ORDER_STATUS_UPDATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const orderRef = db.collection("orders").doc(orderId);
            const orderDoc = await orderRef.get();

            if (!orderDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Order not found");
            }

            const orderData = orderDoc.data()!;
            const previousStatus = orderData.status;

            // Add to status history
            const statusHistory = orderData.statusHistory || [];
            statusHistory.push({
                status: newStatus,
                timestamp: new Date().toISOString(),
                updatedBy: adminContext.uid,
                note: note || null,
            });

            await orderRef.update({
                status: newStatus,
                statusHistory,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                lastStatusUpdatedBy: adminContext.uid,
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "ORDER_STATUS_UPDATED",
                adminContext.uid,
                orderId,
                "order",
                { previousStatus, newStatus, userId: orderData.userId, note }
            );

            functions.logger.info(
                `Order status updated: ${orderId} from ${previousStatus} to ${newStatus} by ${adminContext.uid}`
            );

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error updating order status:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to update order status"
            );
        }
    }
);

// ============================================================================
// Process Refund
// ============================================================================

/**
 * Processes order refund with wallet credit and audit logging.
 */
export const processOrderRefund = functions.https.onCall(
    async (
        data: {
            orderId: string;
            requestId: string;
            reason: string;
            refundAmount?: number;
        },
        context
    ): Promise<{ success: boolean; refundedAmount: number }> => {
        const adminContext = await requirePermission(context, "orders.manage");

        const orderId = validateRequiredString(data.orderId, "orderId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const reason = validateRequiredString(data.reason, "reason");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ORDER_REFUND",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true, refundedAmount: 0 };
        }

        try {
            const result = await db.runTransaction(async (t) => {
                const orderRef = db.collection("orders").doc(orderId);
                const orderDoc = await t.get(orderRef);

                if (!orderDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Order not found");
                }

                const orderData = orderDoc.data()!;
                const previousStatus = orderData.status;

                // Calculate refund amount
                const refundAmount = data.refundAmount || orderData.cashPaid || 0;

                if (refundAmount <= 0) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        "No refundable amount"
                    );
                }

                // Credit user's wallet (wallets/{uid} is the canonical balance store)
                const walletRef = db.collection("wallets").doc(orderData.userId);
                const walletDoc = await t.get(walletRef);

                if (walletDoc.exists) {
                    const currentBalance = walletDoc.data()?.cashBalance || 0;
                    t.update(walletRef, {
                        cashBalance: admin.firestore.FieldValue.increment(refundAmount),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Create refund ledger entry
                    const ledgerRef = db.collection("transactions").doc();
                    t.set(ledgerRef, {
                        userId: orderData.userId,
                        type: "ORDER_REFUND",
                        amount: refundAmount,
                        currency: "CASH",
                        beforeBalance: currentBalance,
                        afterBalance: currentBalance + refundAmount,
                        reason,
                        referenceId: orderId,
                        adminId: adminContext.uid,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }

                // Update order status
                const statusHistory = orderData.statusHistory || [];
                statusHistory.push({
                    status: "refunded",
                    timestamp: new Date().toISOString(),
                    updatedBy: adminContext.uid,
                    note: reason,
                });

                t.update(orderRef, {
                    status: "refunded",
                    statusHistory,
                    refundedAt: admin.firestore.FieldValue.serverTimestamp(),
                    refundedBy: adminContext.uid,
                    refundReason: reason,
                    refundAmount,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                return {
                    refundAmount,
                    userId: orderData.userId,
                    previousStatus
                };
            });

            // Mark idempotency complete
            const response = { success: true, refundedAmount: result.refundAmount };
            await markIdempotencyComplete(requestId, response);

            // Audit log
            await writeAuditLog(
                "ORDER_REFUNDED",
                adminContext.uid,
                orderId,
                "order",
                {
                    userId: result.userId,
                    refundAmount: result.refundAmount,
                    previousStatus: result.previousStatus,
                    reason
                }
            );

            functions.logger.info(
                `Order refunded: ${orderId} for ₹${result.refundAmount} by ${adminContext.uid}. Reason: ${reason}`
            );

            return response;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error processing refund:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to process refund"
            );
        }
    }
);
