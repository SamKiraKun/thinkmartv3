import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    requirePermission,
    writeAuditLog,
    validateRequiredString,
    validateOptionalString,
    validatePositiveNumber,
    checkIdempotency,
    markIdempotencyComplete
} from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface PartnerListItem {
    id: string;
    name: string;
    email: string;
    phone?: string;
    city?: string;
    assignedCity: string;
    assignedCities?: string[];
    commissionPercentage: number;
    commissionPercentages?: Record<string, number>;
    totalEarnings: number;
    withdrawableBalance: number;
    status: string;
    partnerConfig?: {
        assignedCities: string[];
        commissionPercentages: Record<string, number>;
        status?: string;
        assignedAt?: string;
        assignedBy?: string;
    };
    createdAt: string;
}

interface PartnerListResponse {
    partners: PartnerListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface OrgListItem {
    id: string;
    orgName: string;
    orgType: string;
    ownerName: string;
    email: string;
    referralCode: string;
    memberCount: number;
    totalCommissions: number;
    status: string;
    createdAt: string;
}

interface OrgListResponse {
    organizations: OrgListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface PartnerPageCursor {
    createdAtMs: number;
    id: string;
    mode?: "createdAt" | "docId";
}

interface PartnerCursorPageResponse {
    partners: PartnerListItem[];
    nextCursor: PartnerPageCursor | null;
    hasMore: boolean;
}

interface OrgPageCursor {
    createdAtMs: number;
    id: string;
    mode?: "createdAt" | "docId";
}

interface OrgCursorPageResponse {
    organizations: OrgListItem[];
    nextCursor: OrgPageCursor | null;
    hasMore: boolean;
}

const normalizePartner = (doc: FirebaseFirestore.QueryDocumentSnapshot): PartnerListItem => {
    const data = doc.data();
    const config = data.partnerConfig || {};

    const assignedCities = Array.isArray(config.assignedCities)
        ? config.assignedCities.filter((city: unknown) => typeof city === "string" && city.trim())
        : [];
    if (!assignedCities.length && typeof config.assignedCity === "string" && config.assignedCity.trim()) {
        assignedCities.push(config.assignedCity.trim());
    }

    const rawCommissionPercentages = config.commissionPercentages;
    const commissionPercentages: Record<string, number> =
        typeof rawCommissionPercentages === "object" && rawCommissionPercentages !== null
            ? Object.entries(rawCommissionPercentages).reduce<Record<string, number>>((acc, [city, value]) => {
                if (typeof city === "string" && city.trim() && typeof value === "number") {
                    acc[city] = value;
                }
                return acc;
            }, {})
            : {};

    if (
        !Object.keys(commissionPercentages).length &&
        typeof config.assignedCity === "string" &&
        config.assignedCity.trim()
    ) {
        commissionPercentages[config.assignedCity.trim()] =
            typeof config.commissionPercentage === "number" ? config.commissionPercentage : 0;
    }

    const primaryCity = assignedCities[0] || config.assignedCity || data.city || "";
    const primaryCommission =
        (primaryCity && typeof commissionPercentages[primaryCity] === "number"
            ? commissionPercentages[primaryCity]
            : null) ??
        (typeof config.commissionPercentage === "number" ? config.commissionPercentage : 0);

    return {
        id: doc.id,
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || null,
        city: data.city || "",
        assignedCity: primaryCity,
        assignedCities,
        commissionPercentage: primaryCommission,
        commissionPercentages,
        totalEarnings: config.totalEarnings || 0,
        withdrawableBalance: config.withdrawableBalance || data.cashBalance || 0,
        status: config.status || "active",
        partnerConfig: {
            assignedCities,
            commissionPercentages,
            status: config.status || "active",
            assignedAt: config.assignedAt?.toDate?.().toISOString?.() || config.assignedAt || null,
            assignedBy: config.assignedBy || null,
        },
        createdAt: data.createdAt?.toDate?.().toISOString() || "",
    };
};

const buildOrgItems = async (docs: FirebaseFirestore.QueryDocumentSnapshot[]): Promise<OrgListItem[]> => {
    const memberCounts = new Map<string, number>();

    for (const orgDoc of docs) {
        const referralCode = orgDoc.data()?.ownReferralCode;
        if (!referralCode) {
            memberCounts.set(orgDoc.id, 0);
            continue;
        }

        const count = await db.collection("users")
            .where("referralCode", "==", referralCode)
            .count()
            .get();
        memberCounts.set(orgDoc.id, count.data().count);
    }

    return docs.map((doc) => {
        const data = doc.data();
        const config = data.orgConfig || {};

        return {
            id: doc.id,
            orgName: config.orgName || data.orgName || "",
            orgType: config.orgType || data.orgType || "",
            ownerName: data.name || "",
            email: data.email || "",
            referralCode: data.ownReferralCode || "",
            memberCount: memberCounts.get(doc.id) || 0,
            totalCommissions: config.totalCommissions || 0,
            status: config.status || "active",
            createdAt: data.createdAt?.toDate?.().toISOString() || "",
        };
    });
};

// ============================================================================
// Get Partners List
// ============================================================================

/**
 * Returns paginated list of partners.
 * @deprecated Use `getPartnersPage` for cursor pagination.
 */
export const getPartners = functions.https.onCall(
    async (
        data: {
            city?: string;
            status?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<PartnerListResponse> => {
        functions.logger.warn("[DEPRECATED] getPartners called - migrate to getPartnersPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "partners.manage");

        const { city, status, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("users")
                .where("role", "==", "partner");

            if (city) {
                query = query.where("partnerConfig.assignedCity", "==", city);
            }
            if (status) {
                query = query.where("partnerConfig.status", "==", status);
            }

            query = query.orderBy("createdAt", "desc");

            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            const snapshot = await query.offset(offset).limit(validLimit).get();

            const partners = snapshot.docs.map((doc) => normalizePartner(doc));

            return {
                partners,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + partners.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting partners:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve partners");
        }
    }
);

/**
 * Returns cursor-paginated list of partners for scalable admin views.
 */
export const getPartnersPage = functions.https.onCall(
    async (
        data: {
            city?: string;
            status?: string;
            pageSize?: number;
            cursor?: PartnerPageCursor | null;
        },
        context
    ): Promise<PartnerCursorPageResponse> => {
        await requirePermission(context, "partners.manage");

        const { city, status, pageSize = 20, cursor } = data;
        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("users")
                .where("role", "==", "partner");

            if (city) {
                query = query.where("partnerConfig.assignedCity", "==", city);
            }
            if (status) {
                query = query.where("partnerConfig.status", "==", status);
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
                    functions.logger.warn("getPartnersPage fallback to docId ordering", error);
                    snapshot = await readWithDocId();
                    cursorMode = "docId";
                }
            }
            const pageDocs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;
            const partners = pageDocs.map((doc) => normalizePartner(doc));

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
                partners,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting partners page:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve partners");
        }
    }
);

// ============================================================================
// Update Partner Config
// ============================================================================

/**
 * Updates partner configuration (city, commission, status).
 */
export const updatePartnerConfig = functions.https.onCall(
    async (
        data: {
            partnerId: string;
            requestId: string;
            assignedCity?: string;
            assignedCities?: string[];
            commissionPercentage?: number;
            commissionPercentages?: Record<string, number>;
            status?: string;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "partners.manage");

        const partnerId = validateRequiredString(data.partnerId, "partnerId");
        const requestId = validateRequiredString(data.requestId, "requestId");

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "PARTNER_CONFIG_UPDATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const partnerRef = db.collection("users").doc(partnerId);
            const partnerDoc = await partnerRef.get();

            if (!partnerDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Partner not found");
            }

            const partnerData = partnerDoc.data()!;
            if (partnerData.role !== "partner") {
                throw new functions.https.HttpsError("failed-precondition", "User is not a partner");
            }

            const previousConfig = partnerData.partnerConfig || {};
            const updateData: Record<string, any> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (data.assignedCity !== undefined) {
                updateData["partnerConfig.assignedCity"] = data.assignedCity;
            }
            if (data.assignedCities !== undefined) {
                if (!Array.isArray(data.assignedCities)) {
                    throw new functions.https.HttpsError("invalid-argument", "assignedCities must be an array");
                }
                updateData["partnerConfig.assignedCities"] = data.assignedCities;
            }
            if (data.commissionPercentage !== undefined) {
                if (data.commissionPercentage < 0 || data.commissionPercentage > 20) {
                    throw new functions.https.HttpsError("invalid-argument", "Commission must be 0-20");
                }
                updateData["partnerConfig.commissionPercentage"] = data.commissionPercentage;
            }
            if (data.commissionPercentages !== undefined) {
                if (typeof data.commissionPercentages !== "object" || data.commissionPercentages === null) {
                    throw new functions.https.HttpsError("invalid-argument", "commissionPercentages must be an object");
                }

                for (const [city, percentage] of Object.entries(data.commissionPercentages)) {
                    if (!city.trim()) {
                        throw new functions.https.HttpsError("invalid-argument", "City key cannot be empty");
                    }
                    if (typeof percentage !== "number" || percentage < 0 || percentage > 20) {
                        throw new functions.https.HttpsError(
                            "invalid-argument",
                            `Commission for ${city} must be between 0 and 20`
                        );
                    }
                }

                updateData["partnerConfig.commissionPercentages"] = data.commissionPercentages;
            }
            if (data.status !== undefined) {
                updateData["partnerConfig.status"] = data.status;
            }

            await partnerRef.update(updateData);

            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            await writeAuditLog(
                "PARTNER_CONFIG_UPDATED",
                adminContext.uid,
                partnerId,
                "partner",
                { previousConfig, updates: data }
            );

            functions.logger.info(`Partner config updated: ${partnerId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error updating partner config:", error);
            throw new functions.https.HttpsError("internal", "Failed to update partner config");
        }
    }
);

// ============================================================================
// Get Organizations List
// ============================================================================

/**
 * Returns paginated list of organizations.
 * @deprecated Use `getOrganizationsPage` for cursor pagination.
 */
export const getOrganizations = functions.https.onCall(
    async (
        data: {
            orgType?: string;
            status?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<OrgListResponse> => {
        functions.logger.warn("[DEPRECATED] getOrganizations called - migrate to getOrganizationsPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "orgs.manage");

        const { orgType, status, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, limit), 100);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("users")
                .where("role", "==", "organization");

            if (orgType) {
                query = query.where("orgConfig.orgType", "==", orgType);
            }
            if (status) {
                query = query.where("orgConfig.status", "==", status);
            }

            query = query.orderBy("createdAt", "desc");

            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            const snapshot = await query.offset(offset).limit(validLimit).get();
            const organizations = await buildOrgItems(snapshot.docs);

            return {
                organizations,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + organizations.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting organizations:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve organizations");
        }
    }
);

/**
 * Returns cursor-paginated list of organizations for scalable admin views.
 */
export const getOrganizationsPage = functions.https.onCall(
    async (
        data: {
            orgType?: string;
            status?: string;
            pageSize?: number;
            cursor?: OrgPageCursor | null;
        },
        context
    ): Promise<OrgCursorPageResponse> => {
        await requirePermission(context, "orgs.manage");

        const { orgType, status, pageSize = 20, cursor } = data;
        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        try {
            let query: FirebaseFirestore.Query = db.collection("users")
                .where("role", "==", "organization");

            if (orgType) {
                query = query.where("orgConfig.orgType", "==", orgType);
            }
            if (status) {
                query = query.where("orgConfig.status", "==", status);
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
                    functions.logger.warn("getOrganizationsPage fallback to docId ordering", error);
                    snapshot = await readWithDocId();
                    cursorMode = "docId";
                }
            }
            const pageDocs = snapshot.docs.slice(0, limit);
            const hasMore = snapshot.docs.length > limit;
            const organizations = await buildOrgItems(pageDocs);

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
                organizations,
                nextCursor,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting organizations page:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve organizations");
        }
    }
);

// ============================================================================
// Update Organization Config
// ============================================================================

/**
 * Updates organization configuration.
 */
export const updateOrgConfig = functions.https.onCall(
    async (
        data: {
            orgId: string;
            requestId: string;
            commissionPercentage?: number;
            status?: string;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "orgs.manage");

        const orgId = validateRequiredString(data.orgId, "orgId");
        const requestId = validateRequiredString(data.requestId, "requestId");

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ORG_CONFIG_UPDATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const orgRef = db.collection("users").doc(orgId);
            const orgDoc = await orgRef.get();

            if (!orgDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Organization not found");
            }

            const orgData = orgDoc.data()!;
            if (orgData.role !== "organization") {
                throw new functions.https.HttpsError("failed-precondition", "User is not an organization");
            }

            const previousConfig = orgData.orgConfig || {};
            const updateData: Record<string, any> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            };

            if (data.commissionPercentage !== undefined) {
                if (data.commissionPercentage < 0 || data.commissionPercentage > 100) {
                    throw new functions.https.HttpsError("invalid-argument", "Commission must be 0-100");
                }
                updateData["orgConfig.commissionPercentage"] = data.commissionPercentage;
            }
            if (data.status !== undefined) {
                updateData["orgConfig.status"] = data.status;
            }

            await orgRef.update(updateData);

            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            await writeAuditLog(
                "ORG_CONFIG_UPDATED",
                adminContext.uid,
                orgId,
                "user",
                { previousConfig, updates: data }
            );

            functions.logger.info(`Organization config updated: ${orgId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error updating org config:", error);
            throw new functions.https.HttpsError("internal", "Failed to update organization config");
        }
    }
);
