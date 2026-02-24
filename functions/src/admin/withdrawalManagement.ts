import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    requirePermission,
    writeAuditLog,
    validateRequiredString,
    validateOptionalString,
    checkIdempotency,
    markIdempotencyComplete
} from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface WithdrawalRequest {
    id: string;
    userId: string;
    userName?: string;
    userEmail?: string;
    userPhone?: string;
    userCity?: string;
    amount: number;
    method: string;
    details: any;
    status: string;
    kycStatus?: string;
    walletBalanceAtRequest?: number;
    riskFlags?: string[];
    createdAt: string;
    processedAt?: string;
    processedBy?: string;
    adminNotes?: string;
}

interface WithdrawalListResponse {
    withdrawals: WithdrawalRequest[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface WithdrawalPageCursor {
    createdAtMs: number;
    id: string;
}

interface WithdrawalCursorPageResponse {
    withdrawals: WithdrawalRequest[];
    nextCursor: WithdrawalPageCursor | null;
    hasMore: boolean;
}

// ============================================================================
// Get Withdrawals (Paginated)
// ============================================================================

/**
 * Returns paginated list of withdrawal requests with filters.
 */
export const getWithdrawals = functions.https.onCall(
    async (
        data: {
            status?: string;
            userId?: string;
            city?: string;
            minAmount?: number;
            maxAmount?: number;
            fromDate?: string;
            toDate?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<WithdrawalListResponse> => {
        await requirePermission(context, "withdrawals.read");

        const { status, userId, city, minAmount, maxAmount, fromDate, toDate, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("withdrawals");

            // Apply filters
            if (status) {
                query = query.where("status", "==", status);
            }
            if (userId) {
                query = query.where("userId", "==", userId);
            }
            if (city) {
                query = query.where("userCity", "==", city);
            }
            if (minAmount !== undefined) {
                query = query.where("amount", ">=", minAmount);
            }
            if (maxAmount !== undefined) {
                query = query.where("amount", "<=", maxAmount);
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

            const withdrawals: WithdrawalRequest[] = [];

            // Batch fetch user details
            const userIds = new Set<string>();
            snapshot.forEach((doc) => userIds.add(doc.data().userId));

            const userDocs = await Promise.all(
                Array.from(userIds).map((uid) => db.collection("users").doc(uid).get())
            );
            const userMap = new Map(
                userDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
            );

            snapshot.forEach((doc) => {
                const data = doc.data();
                const userData = userMap.get(data.userId) || {};

                withdrawals.push({
                    id: doc.id,
                    userId: data.userId,
                    userName: userData.name || null,
                    userEmail: userData.email || null,
                    userPhone: userData.phone || null,
                    userCity: userData.city || null,
                    amount: data.amount,
                    method: data.method,
                    details: data.details || null,
                    status: data.status,
                    kycStatus: userData.kycStatus || null,
                    walletBalanceAtRequest: data.walletBalanceAtRequest || null,
                    riskFlags: data.riskFlags || null,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                    processedAt: data.processedAt?.toDate?.().toISOString() || null,
                    processedBy: data.processedBy || null,
                    adminNotes: data.adminNotes || null,
                });
            });

            return {
                withdrawals,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + withdrawals.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting withdrawals:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve withdrawals"
            );
        }
    }
);

/**
 * Returns cursor-paginated list of withdrawal requests with filters.
 */
export const getWithdrawalsPage = functions.https.onCall(
    async (
        data: {
            status?: string;
            userId?: string;
            city?: string;
            minAmount?: number;
            maxAmount?: number;
            fromDate?: string;
            toDate?: string;
            pageSize?: number;
            cursor?: WithdrawalPageCursor | null;
        },
        context
    ): Promise<WithdrawalCursorPageResponse> => {
        await requirePermission(context, "withdrawals.read");

        const {
            status,
            userId,
            city,
            minAmount,
            maxAmount,
            fromDate,
            toDate,
            pageSize = 20,
            cursor
        } = data;

        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("withdrawals");

            if (status) {
                query = query.where("status", "==", status);
            }
            if (userId) {
                query = query.where("userId", "==", userId);
            }
            if (city) {
                query = query.where("userCity", "==", city);
            }
            if (minAmount !== undefined) {
                query = query.where("amount", ">=", minAmount);
            }
            if (maxAmount !== undefined) {
                query = query.where("amount", "<=", maxAmount);
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

            const withdrawals: WithdrawalRequest[] = pageDocs.map((doc) => {
                const row = doc.data();
                const userData = userMap.get(row.userId) || {};
                return {
                    id: doc.id,
                    userId: row.userId,
                    userName: userData.name || null,
                    userEmail: userData.email || null,
                    userPhone: userData.phone || null,
                    userCity: userData.city || null,
                    amount: row.amount,
                    method: row.method,
                    details: row.details || null,
                    status: row.status,
                    kycStatus: userData.kycStatus || null,
                    walletBalanceAtRequest: row.walletBalanceAtRequest || null,
                    riskFlags: row.riskFlags || null,
                    createdAt: row.createdAt?.toDate?.().toISOString() || "",
                    processedAt: row.processedAt?.toDate?.().toISOString() || null,
                    processedBy: row.processedBy || null,
                    adminNotes: row.adminNotes || null,
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
                withdrawals,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting withdrawals page:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve withdrawals"
            );
        }
    }
);

// ============================================================================
// Approve Withdrawal
// ============================================================================

/**
 * Approves a withdrawal request with idempotency and audit logging.
 */
export const approveWithdrawal = functions.https.onCall(
    async (
        data: { withdrawalId: string; requestId: string; processorRef?: string; note?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "withdrawals.approve");

        const withdrawalId = validateRequiredString(data.withdrawalId, "withdrawalId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const processorRef = validateOptionalString(data.processorRef, "processorRef");
        const note = validateOptionalString(data.note, "note");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "WITHDRAWAL_APPROVE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const result = await db.runTransaction(async (t) => {
                const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
                const withdrawalDoc = await t.get(withdrawalRef);

                if (!withdrawalDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Withdrawal not found");
                }

                const withdrawalData = withdrawalDoc.data()!;
                const currentStatus = withdrawalData.status;

                // Validate state transition
                if (currentStatus !== "pending") {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        `Cannot approve withdrawal in '${currentStatus}' status`
                    );
                }

                // Get admin name
                const adminDoc = await t.get(db.collection("users").doc(adminContext.uid));
                const adminName = adminDoc.data()?.name || "Admin";

                // Update withdrawal status
                t.update(withdrawalRef, {
                    status: "approved",
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    processedBy: adminContext.uid,
                    processedByName: adminName,
                    processorRef: processorRef || null,
                    adminNotes: note || null,
                });

                return { withdrawalId, userId: withdrawalData.userId, amount: withdrawalData.amount };
            });

            // Mark idempotency complete
            const response = { success: true };
            await markIdempotencyComplete(requestId, response);

            // Audit log
            await writeAuditLog(
                "WITHDRAWAL_APPROVED",
                adminContext.uid,
                withdrawalId,
                "withdrawal",
                { userId: result.userId, amount: result.amount, processorRef, note }
            );

            functions.logger.info(
                `Withdrawal approved: ${withdrawalId} for ${result.amount} by ${adminContext.uid}`
            );

            return response;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error approving withdrawal:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to approve withdrawal"
            );
        }
    }
);

// ============================================================================
// Reject Withdrawal
// ============================================================================

/**
 * Rejects a withdrawal request with reason, refunds balance, and audit logging.
 */
export const rejectWithdrawal = functions.https.onCall(
    async (
        data: { withdrawalId: string; requestId: string; reason: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "withdrawals.approve");

        const withdrawalId = validateRequiredString(data.withdrawalId, "withdrawalId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const reason = validateRequiredString(data.reason, "reason");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "WITHDRAWAL_REJECT",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const result = await db.runTransaction(async (t) => {
                const withdrawalRef = db.collection("withdrawals").doc(withdrawalId);
                const withdrawalDoc = await t.get(withdrawalRef);

                if (!withdrawalDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "Withdrawal not found");
                }

                const withdrawalData = withdrawalDoc.data()!;
                const currentStatus = withdrawalData.status;
                const userId = withdrawalData.userId;
                const amount = withdrawalData.amount;

                // Validate state transition
                if (currentStatus !== "pending") {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        `Cannot reject withdrawal in '${currentStatus}' status`
                    );
                }

                // Get admin name
                const adminDoc = await t.get(db.collection("users").doc(adminContext.uid));
                const adminName = adminDoc.data()?.name || "Admin";

                // Refund the amount to user's wallet (wallets/{uid} is the canonical balance store)
                const walletRef = db.collection("wallets").doc(userId);
                const walletDoc = await t.get(walletRef);

                if (walletDoc.exists) {
                    const currentBalance = walletDoc.data()?.cashBalance || 0;
                    t.update(walletRef, {
                        cashBalance: admin.firestore.FieldValue.increment(amount),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });

                    // Create refund ledger entry
                    const ledgerRef = db.collection("transactions").doc();
                    t.set(ledgerRef, {
                        userId,
                        type: "WITHDRAWAL_REFUND",
                        amount,
                        currency: "CASH",
                        beforeBalance: currentBalance,
                        afterBalance: currentBalance + amount,
                        reason: `Withdrawal rejected: ${reason}`,
                        referenceId: withdrawalId,
                        adminId: adminContext.uid,
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }

                // Update withdrawal status
                t.update(withdrawalRef, {
                    status: "rejected",
                    rejectionReason: reason,
                    processedAt: admin.firestore.FieldValue.serverTimestamp(),
                    processedBy: adminContext.uid,
                    processedByName: adminName,
                });

                return { withdrawalId, userId, amount };
            });

            // Mark idempotency complete
            const response = { success: true };
            await markIdempotencyComplete(requestId, response);

            // Audit log
            await writeAuditLog(
                "WITHDRAWAL_REJECTED",
                adminContext.uid,
                withdrawalId,
                "withdrawal",
                { userId: result.userId, amount: result.amount, reason }
            );

            functions.logger.info(
                `Withdrawal rejected: ${withdrawalId} for ${result.amount} by ${adminContext.uid}. Reason: ${reason}`
            );

            return response;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error rejecting withdrawal:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to reject withdrawal"
            );
        }
    }
);
