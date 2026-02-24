import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    requirePermission,
    writeAuditLog,
    validateRequiredString,
    validateOptionalString,
    validatePositiveNumber
} from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface UserListItem {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    state?: string;
    role: string;
    kycStatus?: string;
    membershipActive: boolean;
    isBanned?: boolean;
    createdAt: string;
}

interface UserListResponse {
    users: UserListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface UsersPageCursor {
    createdAtMs: number;
    id: string;
    mode?: "createdAt" | "docId";
}

interface UserCursorPageResponse {
    users: UserListItem[];
    nextCursor: UsersPageCursor | null;
    hasMore: boolean;
}

interface UserDetails {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    state?: string;
    role: string;
    kycStatus?: string;
    membershipActive: boolean;
    isBanned?: boolean;
    banReason?: string;
    createdAt: string;
    lastActiveAt?: string;
    wallet: {
        cashBalance: number;
        coinBalance: number;
    };
    referralCode?: string;
    ownReferralCode?: string;
    referralCount: number;
    withdrawalCount: number;
    orderCount: number;
}

// ============================================================================
// Get Admin Users (Paginated List)
// ============================================================================

/**
 * Returns paginated list of users with filters.
 * @deprecated Use `getAdminUsersPage` for cursor pagination.
 */
export const getAdminUsers = functions.https.onCall(
    async (
        data: {
            search?: string;
            role?: string;
            city?: string;
            status?: string;
            kycStatus?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<UserListResponse> => {
        functions.logger.warn("[DEPRECATED] getAdminUsers called - migrate to getAdminUsersPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "users.read");

        const { search, role, city, status, kycStatus, page = 1, limit = 20 } = data;

        // Validate pagination
        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("users");

            // Apply filters
            if (role) {
                query = query.where("role", "==", role);
            }
            if (city) {
                query = query.where("city", "==", city);
            }
            if (kycStatus) {
                query = query.where("kycStatus", "==", kycStatus);
            }
            if (status === "banned") {
                query = query.where("isBanned", "==", true);
            } else if (status === "active") {
                query = query.where("isBanned", "!=", true);
            }

            // Order and paginate
            query = query.orderBy("createdAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Get page data
            const snapshot = await query.offset(offset).limit(validLimit).get();

            const users: UserListItem[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();

                // Filter by search if provided (client-side for now)
                if (search) {
                    const searchLower = search.toLowerCase();
                    const matchesName = data.name?.toLowerCase().includes(searchLower);
                    const matchesEmail = data.email?.toLowerCase().includes(searchLower);
                    const matchesPhone = data.phone?.includes(search);

                    if (!matchesName && !matchesEmail && !matchesPhone) {
                        return;
                    }
                }

                users.push({
                    id: doc.id,
                    name: data.name || "",
                    email: data.email || "",
                    phone: data.phone || null,
                    city: data.city || null,
                    state: data.state || null,
                    role: data.role || "user",
                    kycStatus: data.kycStatus || null,
                    membershipActive: data.membershipActive || false,
                    isBanned: data.isBanned || false,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                });
            });

            return {
                users,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + users.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting admin users:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve users"
            );
        }
    }
);

/**
 * Returns cursor-paginated users list for better scalability.
 * Keeps filters compatible with existing admin users UI.
 */
export const getAdminUsersPage = functions.https.onCall(
    async (
        data: {
            search?: string;
            role?: string;
            city?: string;
            status?: string;
            kycStatus?: string;
            pageSize?: number;
            cursor?: UsersPageCursor | null;
        },
        context
    ): Promise<UserCursorPageResponse> => {
        await requirePermission(context, "users.read");

        const { search, role, city, status, kycStatus, pageSize = 20, cursor } = data;
        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("users");

            if (role) {
                query = query.where("role", "==", role);
            }
            if (city) {
                query = query.where("city", "==", city);
            }
            if (kycStatus) {
                query = query.where("kycStatus", "==", kycStatus);
            }
            if (status === "banned") {
                query = query.where("isBanned", "==", true);
            } else if (status === "active") {
                query = query.where("isBanned", "==", false);
            }

            const readWithCreatedAt = async () => {
                let q = query
                    .orderBy("createdAt", "desc")
                    .orderBy(admin.firestore.FieldPath.documentId(), "desc");

                if (cursor?.id && cursor.mode !== "docId" && cursor.createdAtMs) {
                    q = q.startAfter(
                        admin.firestore.Timestamp.fromMillis(cursor.createdAtMs),
                        cursor.id
                    );
                }
                return q.limit(limit + 1).get();
            };

            const readWithDocId = async () => {
                let q = query.orderBy(admin.firestore.FieldPath.documentId(), "desc");
                if (cursor?.id) {
                    q = q.startAfter(cursor.id);
                }
                return q.limit(limit + 1).get();
            };

            let snapshot: FirebaseFirestore.QuerySnapshot;
            let cursorMode: "createdAt" | "docId" = cursor?.mode === "docId" ? "docId" : "createdAt";

            if (cursorMode === "docId") {
                snapshot = await readWithDocId();
            } else {
                try {
                    snapshot = await readWithCreatedAt();
                } catch (error) {
                    functions.logger.warn("[getAdminUsersPage] Falling back to docId ordering", error);
                    snapshot = await readWithDocId();
                    cursorMode = "docId";
                }
            }

            const pageDocs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;

            let users: UserListItem[] = pageDocs.map((doc) => {
                const row = doc.data();
                return {
                    id: doc.id,
                    name: row.name || "",
                    email: row.email || "",
                    phone: row.phone || null,
                    city: row.city || null,
                    state: row.state || null,
                    role: row.role || "user",
                    kycStatus: row.kycStatus || null,
                    membershipActive: row.membershipActive || false,
                    isBanned: row.isBanned || false,
                    createdAt: row.createdAt?.toDate?.().toISOString() || "",
                };
            });

            if (search?.trim()) {
                const q = search.trim().toLowerCase();
                users = users.filter((u) =>
                    u.name?.toLowerCase().includes(q) ||
                    u.email?.toLowerCase().includes(q) ||
                    u.phone?.includes(search.trim())
                );
            }

            const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
            const lastCreatedAt = cursorMode === "createdAt" ? lastDoc?.get("createdAt") : null;
            const nextCursor =
                hasMore && lastDoc
                    ? {
                        createdAtMs: lastCreatedAt?.toMillis?.() || 0,
                        id: lastDoc.id,
                        mode: cursorMode,
                    }
                    : null;

            return {
                users,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting admin users page:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve users"
            );
        }
    }
);

// ============================================================================
// Get User Details
// ============================================================================

/**
 * Returns detailed user information including wallet and stats.
 */
export const getUserDetails = functions.https.onCall(
    async (data: { userId: string }, context): Promise<UserDetails> => {
        await requirePermission(context, "users.read");

        const userId = validateRequiredString(data.userId, "userId");

        try {
            const userDoc = await db.collection("users").doc(userId).get();

            if (!userDoc.exists) {
                throw new functions.https.HttpsError(
                    "not-found",
                    "User not found"
                );
            }

            const userData = userDoc.data()!;

            // Get wallet data
            const walletDoc = await db.collection("wallets").doc(userId).get();
            const walletData = walletDoc.exists ? walletDoc.data()! : {};

            // Get counts in parallel
            const [referralCount, withdrawalCount, orderCount] = await Promise.all([
                db.collection("users")
                    .where("referralCode", "==", userData.ownReferralCode)
                    .count()
                    .get(),
                db.collection("withdrawals")
                    .where("userId", "==", userId)
                    .count()
                    .get(),
                db.collection("orders")
                    .where("userId", "==", userId)
                    .count()
                    .get(),
            ]);

            return {
                id: userId,
                name: userData.name || "",
                email: userData.email || "",
                phone: userData.phone || null,
                city: userData.city || null,
                state: userData.state || null,
                role: userData.role || "user",
                kycStatus: userData.kycStatus || null,
                membershipActive: userData.membershipActive || false,
                isBanned: userData.isBanned || false,
                banReason: userData.banReason || null,
                createdAt: userData.createdAt?.toDate?.().toISOString() || "",
                lastActiveAt: userData.lastActiveAt?.toDate?.().toISOString() || null,
                wallet: {
                    cashBalance: walletData.cashBalance || userData.cashBalance || 0,
                    coinBalance: walletData.coinBalance || userData.coinBalance || 0,
                },
                referralCode: userData.referralCode || null,
                ownReferralCode: userData.ownReferralCode || null,
                referralCount: referralCount.data().count,
                withdrawalCount: withdrawalCount.data().count,
                orderCount: orderCount.data().count,
            };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error getting user details:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve user details"
            );
        }
    }
);

// ============================================================================
// Set User Role
// ============================================================================

/**
 * Changes a user's role with audit logging.
 */
export const setUserRole = functions.https.onCall(
    async (
        data: { userId: string; role: string; requestId?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "users.write");

        const userId = validateRequiredString(data.userId, "userId");
        const role = validateRequiredString(data.role, "role");

        // Validate role
        const validRoles = ["user", "vendor", "partner", "sub_admin", "admin", "organization"];
        if (!validRoles.includes(role)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                `Role must be one of: ${validRoles.join(", ")}`
            );
        }

        // Prevent non-full-admins from creating admins
        if ((role === "admin" || role === "sub_admin") && !adminContext.isFullAdmin) {
            throw new functions.https.HttpsError(
                "permission-denied",
                "Only full admins can assign admin roles"
            );
        }

        try {
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new functions.https.HttpsError("not-found", "User not found");
            }

            const previousRole = userDoc.data()?.role || "user";

            await userRef.update({
                role,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Audit log
            await writeAuditLog(
                "USER_ROLE_CHANGED",
                adminContext.uid,
                userId,
                "user",
                { previousRole, newRole: role }
            );

            functions.logger.info(
                `Role changed: ${userId} from ${previousRole} to ${role} by ${adminContext.uid}`
            );

            return { success: true };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error setting user role:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to update user role"
            );
        }
    }
);

// ============================================================================
// Set User Status
// ============================================================================

/**
 * Bans, suspends, or reactivates a user with audit logging.
 */
export const setUserStatus = functions.https.onCall(
    async (
        data: { userId: string; status: "active" | "suspended" | "banned"; reason?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "users.write");

        const userId = validateRequiredString(data.userId, "userId");
        const status = data.status;
        const reason = validateOptionalString(data.reason, "reason");

        if (!["active", "suspended", "banned"].includes(status)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Status must be 'active', 'suspended', or 'banned'"
            );
        }

        // Require reason for ban/suspend
        if ((status === "banned" || status === "suspended") && !reason) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Reason is required for ban/suspend actions"
            );
        }

        try {
            const userRef = db.collection("users").doc(userId);
            const userDoc = await userRef.get();

            if (!userDoc.exists) {
                throw new functions.https.HttpsError("not-found", "User not found");
            }

            const previousStatus = userDoc.data()?.isBanned ? "banned" : "active";

            // Update user document
            const updateData: Record<string, any> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (status === "banned") {
                updateData.isBanned = true;
                updateData.isActive = false;
                updateData.bannedAt = admin.firestore.FieldValue.serverTimestamp();
                updateData.banReason = reason;
            } else if (status === "suspended") {
                updateData.isBanned = false;
                updateData.isActive = false;
                updateData.suspendedAt = admin.firestore.FieldValue.serverTimestamp();
                updateData.suspendReason = reason;
            } else {
                updateData.isBanned = false;
                updateData.isActive = true;
                updateData.reactivatedAt = admin.firestore.FieldValue.serverTimestamp();
            }

            await userRef.update(updateData);

            // Disable/enable Firebase Auth user
            if (status === "banned") {
                await admin.auth().updateUser(userId, { disabled: true });
            } else if (status === "active") {
                await admin.auth().updateUser(userId, { disabled: false });
            }

            // Audit log
            await writeAuditLog(
                `USER_${status.toUpperCase()}`,
                adminContext.uid,
                userId,
                "user",
                { previousStatus, newStatus: status, reason }
            );

            functions.logger.info(
                `User ${status}: ${userId} by ${adminContext.uid}. Reason: ${reason || "N/A"}`
            );

            return { success: true };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error setting user status:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to update user status"
            );
        }
    }
);

// ============================================================================
// Adjust Wallet
// ============================================================================

/**
 * Manually adjusts a user's wallet balance with ledger entry and audit log.
 */
export const adjustWallet = functions.https.onCall(
    async (
        data: {
            userId: string;
            deltaAmount: number;
            currency: "CASH" | "COIN";
            reason: string;
            referenceId?: string;
            requestId: string;
        },
        context
    ): Promise<{ success: boolean; newBalance: number }> => {
        const adminContext = await requirePermission(context, "wallet.adjust");

        const userId = validateRequiredString(data.userId, "userId");
        const deltaAmount = data.deltaAmount;
        const currency = data.currency;
        const reason = validateRequiredString(data.reason, "reason");
        const referenceId = validateOptionalString(data.referenceId, "referenceId");
        const requestId = validateRequiredString(data.requestId, "requestId");

        // Validate delta
        if (typeof deltaAmount !== "number" || deltaAmount === 0) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "deltaAmount must be a non-zero number"
            );
        }

        // Validate currency
        if (currency !== "CASH" && currency !== "COIN") {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "currency must be 'CASH' or 'COIN'"
            );
        }

        // Validate bounds
        if (Math.abs(deltaAmount) > 100000) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Adjustment amount exceeds maximum limit (100,000)"
            );
        }

        try {
            // Idempotency check
            const idempotencyRef = db.collection("idempotency_keys").doc(requestId);
            const existing = await idempotencyRef.get();

            if (existing.exists) {
                const existingData = existing.data()!;
                if (existingData.status === "complete") {
                    return existingData.result;
                }
                throw new functions.https.HttpsError(
                    "aborted",
                    "Request already in progress"
                );
            }

            // Create idempotency key
            await idempotencyRef.set({
                actionType: "WALLET_ADJUST",
                actorId: adminContext.uid,
                status: "pending",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Run transaction
            const result = await db.runTransaction(async (t) => {
                // wallets/{uid} is the canonical balance store (frontend reads this via onSnapshot)
                const walletRef = db.collection("wallets").doc(userId);
                const walletDoc = await t.get(walletRef);

                if (!walletDoc.exists) {
                    throw new functions.https.HttpsError("not-found", "User wallet not found");
                }

                const walletData = walletDoc.data()!;
                const balanceField = currency === "CASH" ? "cashBalance" : "coinBalance";
                const currentBalance = walletData[balanceField] || 0;
                const newBalance = currentBalance + deltaAmount;

                // Prevent negative balance
                if (newBalance < 0) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        `Insufficient balance. Current: ${currentBalance}, Delta: ${deltaAmount}`
                    );
                }

                // Update balance using atomic increment
                t.update(walletRef, {
                    [balanceField]: admin.firestore.FieldValue.increment(deltaAmount),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                // Create ledger entry
                const ledgerRef = db.collection("transactions").doc();
                t.set(ledgerRef, {
                    userId,
                    type: "ADMIN_ADJUSTMENT",
                    amount: deltaAmount,
                    currency,
                    beforeBalance: currentBalance,
                    afterBalance: newBalance,
                    reason,
                    referenceId: referenceId || null,
                    adminId: adminContext.uid,
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                return { newBalance, ledgerId: ledgerRef.id };
            });

            // Mark idempotency complete
            const response = { success: true, newBalance: result.newBalance };
            await idempotencyRef.update({
                status: "complete",
                result: response,
                completedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Audit log
            await writeAuditLog(
                "WALLET_ADJUSTED",
                adminContext.uid,
                userId,
                "user",
                { deltaAmount, currency, reason, referenceId, newBalance: result.newBalance }
            );

            functions.logger.info(
                `Wallet adjusted: ${userId} ${deltaAmount > 0 ? "+" : ""}${deltaAmount} ${currency} by ${adminContext.uid}`
            );

            return response;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error adjusting wallet:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to adjust wallet"
            );
        }
    }
);
