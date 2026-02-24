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

interface KYCRequest {
    id: string;
    userId: string;
    userName: string;
    userEmail: string;
    userPhone?: string;
    status: string;
    submittedAt: string;
    kycData?: {
        fullName: string;
        dateOfBirth: string;
        address: string;
        city: string;
        state: string;
        pincode: string;
        idType: string;
        idNumber: string;
        bankName?: string;
        accountNumber?: string;
        ifscCode?: string;
    };
    idDocumentUrl?: string;
    addressProofUrl?: string;
    rejectionReason?: string;
    processedAt?: string;
    processedBy?: string;
}

interface KYCListResponse {
    requests: KYCRequest[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface KYCPageCursor {
    submittedAtMs: number;
    id: string;
}

interface KYCPageResponse {
    requests: KYCRequest[];
    nextCursor: KYCPageCursor | null;
    hasMore: boolean;
}

// ============================================================================
// Get KYC Requests (Paginated)
// ============================================================================

/**
 * Returns paginated list of KYC requests with filters.
 */
export const getKycRequests = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "submitted" | "verified" | "rejected";
            page?: number;
            limit?: number;
        },
        context
    ): Promise<KYCListResponse> => {
        await requirePermission(context, "kyc.read");

        const { status, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("users");

            // Filter by KYC status
            if (status) {
                query = query.where("kycStatus", "==", status);
            } else {
                // Default: show pending/submitted
                query = query.where("kycStatus", "in", ["pending", "submitted"]);
            }

            query = query.orderBy("kycSubmittedAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Get page data
            const snapshot = await query.offset(offset).limit(validLimit).get();

            const requests: KYCRequest[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                const kycData = data.kycData || {};

                requests.push({
                    id: doc.id,
                    userId: doc.id,
                    userName: data.name || kycData.fullName || "",
                    userEmail: data.email || "",
                    userPhone: data.phone || null,
                    status: data.kycStatus || "pending",
                    submittedAt: data.kycSubmittedAt?.toDate?.().toISOString() || "",
                    kycData: kycData,
                    idDocumentUrl: kycData.idDocumentUrl || null,
                    addressProofUrl: kycData.addressProofUrl || null,
                    rejectionReason: data.kycRejectionReason || null,
                    processedAt: data.kycProcessedAt?.toDate?.().toISOString() || null,
                    processedBy: data.kycProcessedBy || null,
                });
            });

            return {
                requests,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + requests.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting KYC requests:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve KYC requests"
            );
        }
    }
);

/**
 * Returns cursor-paginated list of KYC requests.
 */
export const getKycRequestsPage = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "submitted" | "verified" | "rejected";
            pageSize?: number;
            cursor?: KYCPageCursor | null;
        },
        context
    ): Promise<KYCPageResponse> => {
        await requirePermission(context, "kyc.read");

        const { status, pageSize = 20, cursor } = data;
        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("users");

            if (status) {
                query = query.where("kycStatus", "==", status);
            } else {
                query = query.where("kycStatus", "in", ["pending", "submitted"]);
            }

            query = query
                .orderBy("kycSubmittedAt", "desc")
                .orderBy(admin.firestore.FieldPath.documentId(), "desc");

            if (cursor?.submittedAtMs && cursor?.id) {
                query = query.startAfter(
                    admin.firestore.Timestamp.fromMillis(cursor.submittedAtMs),
                    cursor.id
                );
            }

            const snapshot = await query.limit(limit + 1).get();
            const pageDocs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            const requests: KYCRequest[] = pageDocs.map((doc) => {
                const row = doc.data();
                const kycData = row.kycData || {};
                return {
                    id: doc.id,
                    userId: doc.id,
                    userName: row.name || kycData.fullName || "",
                    userEmail: row.email || "",
                    userPhone: row.phone || null,
                    status: row.kycStatus || "pending",
                    submittedAt: row.kycSubmittedAt?.toDate?.().toISOString() || "",
                    kycData,
                    idDocumentUrl: kycData.idDocumentUrl || null,
                    addressProofUrl: kycData.addressProofUrl || null,
                    rejectionReason: row.kycRejectionReason || null,
                    processedAt: row.kycProcessedAt?.toDate?.().toISOString() || null,
                    processedBy: row.kycProcessedBy || null,
                };
            });

            const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
            const lastSubmittedAt = lastDoc?.get("kycSubmittedAt");
            const nextCursor =
                hasMore && lastDoc && lastSubmittedAt
                    ? {
                        submittedAtMs: lastSubmittedAt.toMillis(),
                        id: lastDoc.id,
                    }
                    : null;

            return {
                requests,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting KYC requests page:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve KYC requests"
            );
        }
    }
);

// ============================================================================
// Approve KYC
// ============================================================================

/**
 * Approves a KYC submission with audit logging.
 */
export const approveKyc = functions.https.onCall(
    async (
        data: { userId: string; requestId: string; note?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "kyc.approve");

        const userId = validateRequiredString(data.userId, "userId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const note = validateOptionalString(data.note, "note");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "KYC_APPROVE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new functions.https.HttpsError("not-found", "User not found");
            }

            const userData = userDoc.data()!;
            const currentStatus = userData.kycStatus;

            // Validate state transition
            if (currentStatus === "verified") {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    "KYC already verified"
                );
            }

            if (currentStatus !== "submitted" && currentStatus !== "pending") {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    `Cannot approve KYC in '${currentStatus}' status`
                );
            }

            // Update user KYC status
            await userRef.update({
                kycStatus: "verified",
                kycProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
                kycProcessedBy: adminContext.uid,
                kycApprovalNote: note || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "KYC_APPROVED",
                adminContext.uid,
                userId,
                "kyc",
                { previousStatus: currentStatus, note }
            );

            functions.logger.info(`KYC approved: ${userId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error approving KYC:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to approve KYC"
            );
        }
    }
);

// ============================================================================
// Reject KYC
// ============================================================================

/**
 * Rejects a KYC submission with reason and audit logging.
 */
export const rejectKyc = functions.https.onCall(
    async (
        data: { userId: string; requestId: string; reason: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "kyc.approve");

        const userId = validateRequiredString(data.userId, "userId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const reason = validateRequiredString(data.reason, "reason");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "KYC_REJECT",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new functions.https.HttpsError("not-found", "User not found");
            }

            const userData = userDoc.data()!;
            const currentStatus = userData.kycStatus;

            // Validate state transition
            if (currentStatus === "rejected") {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    "KYC already rejected"
                );
            }

            if (currentStatus !== "submitted" && currentStatus !== "pending") {
                throw new functions.https.HttpsError(
                    "failed-precondition",
                    `Cannot reject KYC in '${currentStatus}' status`
                );
            }

            // Update user KYC status
            await userRef.update({
                kycStatus: "rejected",
                kycRejectionReason: reason,
                kycProcessedAt: admin.firestore.FieldValue.serverTimestamp(),
                kycProcessedBy: adminContext.uid,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "KYC_REJECTED",
                adminContext.uid,
                userId,
                "kyc",
                { previousStatus: currentStatus, reason }
            );

            functions.logger.info(
                `KYC rejected: ${userId} by ${adminContext.uid}. Reason: ${reason}`
            );

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error rejecting KYC:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to reject KYC"
            );
        }
    }
);
