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

interface ProductListItem {
    id: string;
    name: string;
    price: number;
    vendorId: string;
    vendorName?: string;
    category: string;
    status: string;
    stock: number;
    createdAt: string;
}

interface ProductListResponse {
    products: ProductListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface ProductPageCursor {
    createdAtMs: number;
    id: string;
    mode?: "createdAt" | "docId";
}

interface ProductCursorResponse {
    products: ProductListItem[];
    nextCursor: ProductPageCursor | null;
    hasMore: boolean;
    total: number;
}

interface VendorListItem {
    id: string;
    businessName: string;
    ownerName: string;
    email: string;
    phone?: string;
    city?: string;
    status: string;
    productCount: number;
    createdAt: string;
}

interface VendorListResponse {
    vendors: VendorListItem[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface VendorPageCursor {
    createdAtMs: number;
    id: string;
    mode?: "createdAt" | "docId";
}

interface VendorCursorResponse {
    vendors: VendorListItem[];
    nextCursor: VendorPageCursor | null;
    hasMore: boolean;
    total: number;
}

function timestampToMillis(value: unknown): number {
    if (value && typeof (value as { toMillis?: () => number }).toMillis === "function") {
        return (value as { toMillis: () => number }).toMillis();
    }
    if (value && typeof (value as { seconds?: unknown }).seconds === "number") {
        return Number((value as { seconds: number }).seconds) * 1000;
    }
    if (typeof value === "string") {
        const parsed = Date.parse(value);
        return Number.isFinite(parsed) ? parsed : 0;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    return 0;
}

async function buildVendorNameMap(vendorIds: string[]): Promise<Map<string, any>> {
    const uniqueIds = Array.from(new Set(vendorIds.filter(Boolean)));
    const vendorDocs = await Promise.all(
        uniqueIds.map((uid) => db.collection("users").doc(uid).get())
    );
    return new Map(vendorDocs.filter((d) => d.exists).map((d) => [d.id, d.data()]));
}

// ============================================================================
// Get Products for Moderation
// ============================================================================

/**
 * Returns paginated list of products for moderation.
 */
export const getProductsForModeration = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "approved" | "rejected" | "suspended";
            vendorId?: string;
            category?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<ProductListResponse> => {
        functions.logger.warn("[DEPRECATED] getProductsForModeration called - migrate to getProductsForModerationPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "marketplace.moderate");

        const { status, vendorId, category, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, Number(limit || 20)), 100);
        const validPage = Math.max(1, Number(page || 1));

        try {
            let query: FirebaseFirestore.Query = db.collection("products");

            // Apply filters
            if (status) {
                query = query.where("status", "==", status);
            }
            if (vendorId) {
                query = query.where("vendorId", "==", vendorId);
            }
            if (category) {
                query = query.where("category", "==", category);
            }

            query = query.orderBy("createdAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Legacy page pagination without Firestore offset.
            let pageCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
            let pageDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
            let hasMore = false;

            for (let currentPage = 1; currentPage <= validPage; currentPage += 1) {
                let pageQuery = query.orderBy(admin.firestore.FieldPath.documentId(), "desc");
                if (pageCursor) {
                    pageQuery = pageQuery.startAfter(
                        pageCursor.get("createdAt"),
                        pageCursor.id
                    );
                }

                const snapshot = await pageQuery.limit(validLimit + 1).get();
                const docs = snapshot.docs.slice(0, validLimit);
                hasMore = snapshot.docs.length > validLimit;

                if (currentPage === validPage) {
                    pageDocs = docs;
                    break;
                }

                if (!docs.length || !hasMore) {
                    pageDocs = [];
                    hasMore = false;
                    break;
                }

                pageCursor = docs[docs.length - 1];
            }

            // Batch fetch vendor names
            const vendorIds = new Set<string>();
            pageDocs.forEach((doc) => vendorIds.add(doc.data().vendorId));

            const vendorDocs = await Promise.all(
                Array.from(vendorIds).map((uid) => db.collection("users").doc(uid).get())
            );
            const vendorMap = new Map(
                vendorDocs.filter((d) => d.exists).map((d) => [d.id, d.data()])
            );

            const products: ProductListItem[] = [];
            pageDocs.forEach((doc) => {
                const data = doc.data();
                const vendorData = vendorMap.get(data.vendorId) || {};

                products.push({
                    id: doc.id,
                    name: data.name || "",
                    price: data.price || 0,
                    vendorId: data.vendorId || "",
                    vendorName: vendorData.businessName || vendorData.name || "",
                    category: data.category || "",
                    status: data.status || "pending",
                    stock: data.stock || 0,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                });
            });

            return {
                products,
                total,
                page: validPage,
                limit: validLimit,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting products for moderation:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve products"
            );
        }
    }
);

// ============================================================================
// Approve Product
// ============================================================================

/**
 * Approves a product for listing with audit logging.
 */
export const approveProduct = functions.https.onCall(
    async (
        data: { productId: string; requestId: string; note?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "marketplace.moderate");

        const productId = validateRequiredString(data.productId, "productId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const note = validateOptionalString(data.note, "note");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "PRODUCT_APPROVE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const productRef = db.collection("products").doc(productId);
            const productDoc = await productRef.get();

            if (!productDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Product not found");
            }

            const productData = productDoc.data()!;
            const currentStatus = productData.status;

            await productRef.update({
                status: "approved",
                approvedAt: admin.firestore.FieldValue.serverTimestamp(),
                approvedBy: adminContext.uid,
                approvalNote: note || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "PRODUCT_APPROVED",
                adminContext.uid,
                productId,
                "product",
                { productName: productData.name, vendorId: productData.vendorId, previousStatus: currentStatus, note }
            );

            functions.logger.info(`Product approved: ${productId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error approving product:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to approve product"
            );
        }
    }
);

// ============================================================================
// Reject Product
// ============================================================================

/**
 * Rejects a product with reason and audit logging.
 */
export const rejectProduct = functions.https.onCall(
    async (
        data: { productId: string; requestId: string; reason: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "marketplace.moderate");

        const productId = validateRequiredString(data.productId, "productId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const reason = validateRequiredString(data.reason, "reason");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "PRODUCT_REJECT",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const productRef = db.collection("products").doc(productId);
            const productDoc = await productRef.get();

            if (!productDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Product not found");
            }

            const productData = productDoc.data()!;
            const currentStatus = productData.status;

            await productRef.update({
                status: "rejected",
                rejectedAt: admin.firestore.FieldValue.serverTimestamp(),
                rejectedBy: adminContext.uid,
                rejectionReason: reason,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "PRODUCT_REJECTED",
                adminContext.uid,
                productId,
                "product",
                { productName: productData.name, vendorId: productData.vendorId, previousStatus: currentStatus, reason }
            );

            functions.logger.info(`Product rejected: ${productId} by ${adminContext.uid}. Reason: ${reason}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error rejecting product:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to reject product"
            );
        }
    }
);

/**
 * Returns cursor-paginated products for moderation.
 */
export const getProductsForModerationPage = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "approved" | "rejected" | "suspended";
            vendorId?: string;
            category?: string;
            pageSize?: number;
            cursor?: ProductPageCursor | null;
        },
        context
    ): Promise<ProductCursorResponse> => {
        await requirePermission(context, "marketplace.moderate");

        const {
            status,
            vendorId,
            category,
            pageSize = 20,
            cursor
        } = data;

        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        let query: FirebaseFirestore.Query = db.collection("products");
        if (status) {
            query = query.where("status", "==", status);
        }
        if (vendorId) {
            query = query.where("vendorId", "==", vendorId);
        }
        if (category) {
            query = query.where("category", "==", category);
        }

        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

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
                functions.logger.warn("getProductsForModerationPage fallback to docId ordering", error);
                snapshot = await readWithDocId();
                cursorMode = "docId";
            }
        }
        const pageDocs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        const vendorMap = await buildVendorNameMap(pageDocs.map((doc) => String(doc.data().vendorId || "")));

        const products: ProductListItem[] = pageDocs.map((doc) => {
            const row = doc.data();
            const vendorData = vendorMap.get(row.vendorId) || {};
            return {
                id: doc.id,
                name: row.name || "",
                price: row.price || 0,
                vendorId: row.vendorId || "",
                vendorName: vendorData.businessName || vendorData.name || "",
                category: row.category || "",
                status: row.status || "pending",
                stock: row.stock || 0,
                createdAt: row.createdAt?.toDate?.().toISOString() || "",
            };
        });

        const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
        const nextCursor = hasMore && lastDoc
            ? {
                createdAtMs: cursorMode === "createdAt" ? timestampToMillis(lastDoc.get("createdAt")) : 0,
                id: lastDoc.id,
                mode: cursorMode
            }
            : null;

        return {
            products,
            nextCursor,
            hasMore,
            total
        };
    }
);

// ============================================================================
// Admin Product CRUD
// ============================================================================

/**
 * Creates a product via admin callable flow.
 */
export const adminCreateProduct = functions.https.onCall(
    async (
        data: {
            requestId: string;
            name: string;
            description: string;
            price: number;
            commission?: number;
            category: string;
            inStock?: boolean;
            stock?: number;
            coinPrice?: number;
            badges?: string[];
            coinOnly?: boolean;
            cashOnly?: boolean;
            deliveryDays?: number;
            vendor?: string;
        },
        context
    ): Promise<{ success: boolean; productId: string }> => {
        const adminContext = await requirePermission(context, "marketplace.moderate");

        const requestId = validateRequiredString(data.requestId, "requestId");
        const name = validateRequiredString(data.name, "name");
        const description = validateRequiredString(data.description, "description");
        const category = validateRequiredString(data.category, "category");
        const price = validatePositiveNumber(data.price, "price");

        if (data.commission !== undefined && (typeof data.commission !== "number" || data.commission < 0)) {
            throw new functions.https.HttpsError("invalid-argument", "commission must be a non-negative number");
        }

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ADMIN_PRODUCT_CREATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true, productId: "" };
        }

        const now = admin.firestore.FieldValue.serverTimestamp();
        const productRef = db.collection("products").doc();

        await productRef.set({
            name,
            description,
            price,
            commission: data.commission ?? 0,
            category,
            inStock: data.inStock ?? true,
            stock: data.stock ?? 0,
            coinPrice: data.coinPrice ?? null,
            badges: data.badges ?? [],
            coinOnly: data.coinOnly ?? false,
            cashOnly: data.cashOnly ?? false,
            deliveryDays: data.deliveryDays ?? null,
            vendor: data.vendor ?? null,
            image: "",
            images: [],
            status: "approved",
            createdAt: now,
            updatedAt: now,
            createdBy: adminContext.uid,
        });

        const result = { success: true, productId: productRef.id };
        await markIdempotencyComplete(requestId, result);

        await writeAuditLog(
            "ADMIN_PRODUCT_CREATED",
            adminContext.uid,
            productRef.id,
            "product",
            { name, category, price }
        );

        return result;
    }
);

/**
 * Updates a product via admin callable flow.
 */
export const adminUpdateProduct = functions.https.onCall(
    async (
        data: {
            requestId: string;
            productId: string;
            updates: Record<string, any>;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "marketplace.moderate");

        const requestId = validateRequiredString(data.requestId, "requestId");
        const productId = validateRequiredString(data.productId, "productId");

        if (!data.updates || typeof data.updates !== "object") {
            throw new functions.https.HttpsError("invalid-argument", "updates object is required");
        }

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ADMIN_PRODUCT_UPDATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        const productRef = db.collection("products").doc(productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Product not found");
        }

        const allowedFields = [
            "name", "description", "price", "commission", "category", "inStock", "stock",
            "coinPrice", "badges", "coinOnly", "cashOnly", "deliveryDays", "vendor",
            "image", "images", "status"
        ];

        const sanitized: Record<string, any> = {};
        for (const field of allowedFields) {
            if (Object.prototype.hasOwnProperty.call(data.updates, field)) {
                sanitized[field] = data.updates[field];
            }
        }
        sanitized.updatedAt = admin.firestore.FieldValue.serverTimestamp();
        sanitized.updatedBy = adminContext.uid;

        await productRef.update(sanitized);

        const result = { success: true };
        await markIdempotencyComplete(requestId, result);

        await writeAuditLog(
            "ADMIN_PRODUCT_UPDATED",
            adminContext.uid,
            productId,
            "product",
            { changedFields: Object.keys(sanitized).filter((k) => k !== "updatedAt" && k !== "updatedBy") }
        );

        return result;
    }
);

/**
 * Deletes a product via admin callable flow.
 */
export const adminDeleteProduct = functions.https.onCall(
    async (
        data: { requestId: string; productId: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "marketplace.moderate");

        const requestId = validateRequiredString(data.requestId, "requestId");
        const productId = validateRequiredString(data.productId, "productId");

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "ADMIN_PRODUCT_DELETE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        const productRef = db.collection("products").doc(productId);
        const productDoc = await productRef.get();
        if (!productDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Product not found");
        }

        const productData = productDoc.data() || {};
        await productRef.delete();

        const result = { success: true };
        await markIdempotencyComplete(requestId, result);

        await writeAuditLog(
            "ADMIN_PRODUCT_DELETED",
            adminContext.uid,
            productId,
            "product",
            { name: productData.name, category: productData.category }
        );

        return result;
    }
);

// ============================================================================
// Get Vendors List
// ============================================================================

/**
 * Returns paginated list of vendors.
 */
export const getVendors = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "verified" | "suspended";
            city?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<VendorListResponse> => {
        functions.logger.warn("[DEPRECATED] getVendors called - migrate to getVendorsPage", {
            uid: context.auth?.uid,
        });
        await requirePermission(context, "vendors.manage");

        const { status, city, page = 1, limit = 20 } = data;

        const validLimit = Math.min(Math.max(1, Number(limit || 20)), 100);
        const validPage = Math.max(1, Number(page || 1));

        try {
            let query: FirebaseFirestore.Query = db.collection("users")
                .where("role", "==", "vendor");

            // Apply filters
            if (status) {
                query = query.where("vendorConfig.status", "==", status);
            }
            if (city) {
                query = query.where("city", "==", city);
            }

            query = query.orderBy("createdAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Legacy page pagination without Firestore offset.
            let pageCursor: FirebaseFirestore.QueryDocumentSnapshot | null = null;
            let pageDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
            let hasMore = false;

            for (let currentPage = 1; currentPage <= validPage; currentPage += 1) {
                let pageQuery = query.orderBy(admin.firestore.FieldPath.documentId(), "desc");
                if (pageCursor) {
                    pageQuery = pageQuery.startAfter(
                        pageCursor.get("createdAt"),
                        pageCursor.id
                    );
                }

                const snapshot = await pageQuery.limit(validLimit + 1).get();
                const docs = snapshot.docs.slice(0, validLimit);
                hasMore = snapshot.docs.length > validLimit;

                if (currentPage === validPage) {
                    pageDocs = docs;
                    break;
                }

                if (!docs.length || !hasMore) {
                    pageDocs = [];
                    hasMore = false;
                    break;
                }

                pageCursor = docs[docs.length - 1];
            }

            // Get product counts
            const vendorIds: string[] = [];
            pageDocs.forEach((doc) => vendorIds.push(doc.id));

            const productCounts = new Map<string, number>();
            if (vendorIds.length > 0) {
                // Batch in groups of 10 for Firestore 'in' query limit
                for (let i = 0; i < vendorIds.length; i += 10) {
                    const batch = vendorIds.slice(i, i + 10);
                    const countPromises = batch.map((vid) =>
                        db.collection("products").where("vendorId", "==", vid).count().get()
                    );
                    const counts = await Promise.all(countPromises);
                    batch.forEach((vid, idx) => {
                        productCounts.set(vid, counts[idx].data().count);
                    });
                }
            }

            const vendors: VendorListItem[] = [];
            pageDocs.forEach((doc) => {
                const data = doc.data();
                const vendorConfig = data.vendorConfig || {};

                vendors.push({
                    id: doc.id,
                    businessName: vendorConfig.businessName || data.businessName || "",
                    ownerName: data.name || "",
                    email: data.email || "",
                    phone: data.phone || null,
                    city: data.city || null,
                    status: vendorConfig.status || "pending",
                    productCount: productCounts.get(doc.id) || 0,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                });
            });

            return {
                vendors,
                total,
                page: validPage,
                limit: validLimit,
                hasMore,
            };
        } catch (error) {
            functions.logger.error("Error getting vendors:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to retrieve vendors"
            );
        }
    }
);

/**
 * Returns cursor-paginated vendors list.
 */
export const getVendorsPage = functions.https.onCall(
    async (
        data: {
            status?: "pending" | "verified" | "suspended";
            city?: string;
            pageSize?: number;
            cursor?: VendorPageCursor | null;
        },
        context
    ): Promise<VendorCursorResponse> => {
        await requirePermission(context, "vendors.manage");

        const {
            status,
            city,
            pageSize = 20,
            cursor
        } = data;

        const limit = Math.min(Math.max(1, Number(pageSize || 20)), 100);

        let query: FirebaseFirestore.Query = db.collection("users")
            .where("role", "==", "vendor");

        if (status) {
            query = query.where("vendorConfig.status", "==", status);
        }
        if (city) {
            query = query.where("city", "==", city);
        }

        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

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
                functions.logger.warn("getVendorsPage fallback to docId ordering", error);
                snapshot = await readWithDocId();
                cursorMode = "docId";
            }
        }
        const pageDocs = snapshot.docs.slice(0, limit);
        const hasMore = snapshot.docs.length > limit;

        const vendorIds = pageDocs.map((doc) => doc.id);
        const productCounts = new Map<string, number>();
        if (vendorIds.length) {
            for (let i = 0; i < vendorIds.length; i += 10) {
                const batch = vendorIds.slice(i, i + 10);
                const counts = await Promise.all(
                    batch.map((vendorId) =>
                        db.collection("products").where("vendorId", "==", vendorId).count().get()
                    )
                );
                batch.forEach((vendorId, idx) => {
                    productCounts.set(vendorId, counts[idx].data().count);
                });
            }
        }

        const vendors: VendorListItem[] = pageDocs.map((doc) => {
            const row = doc.data();
            const vendorConfig = row.vendorConfig || {};
            return {
                id: doc.id,
                businessName: vendorConfig.businessName || row.businessName || "",
                ownerName: row.name || "",
                email: row.email || "",
                phone: row.phone || null,
                city: row.city || null,
                status: vendorConfig.status || "pending",
                productCount: productCounts.get(doc.id) || 0,
                createdAt: row.createdAt?.toDate?.().toISOString() || "",
            };
        });

        const lastDoc = pageDocs.length ? pageDocs[pageDocs.length - 1] : null;
        const nextCursor = hasMore && lastDoc
            ? {
                createdAtMs: cursorMode === "createdAt" ? timestampToMillis(lastDoc.get("createdAt")) : 0,
                id: lastDoc.id,
                mode: cursorMode
            }
            : null;

        return {
            vendors,
            nextCursor,
            hasMore,
            total
        };
    }
);

// ============================================================================
// Verify Vendor
// ============================================================================

/**
 * Verifies a vendor with audit logging.
 */
export const verifyVendor = functions.https.onCall(
    async (
        data: { vendorId: string; requestId: string; note?: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "vendors.manage");

        const vendorId = validateRequiredString(data.vendorId, "vendorId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const note = validateOptionalString(data.note, "note");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "VENDOR_VERIFY",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const vendorRef = db.collection("users").doc(vendorId);
            const vendorDoc = await vendorRef.get();

            if (!vendorDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Vendor not found");
            }

            const vendorData = vendorDoc.data()!;

            if (vendorData.role !== "vendor") {
                throw new functions.https.HttpsError("failed-precondition", "User is not a vendor");
            }

            const currentStatus = vendorData.vendorConfig?.status || "pending";

            await vendorRef.update({
                "vendorConfig.status": "verified",
                "vendorConfig.verifiedAt": admin.firestore.FieldValue.serverTimestamp(),
                "vendorConfig.verifiedBy": adminContext.uid,
                "vendorConfig.verificationNote": note || null,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "VENDOR_VERIFIED",
                adminContext.uid,
                vendorId,
                "user",
                { businessName: vendorData.vendorConfig?.businessName, previousStatus: currentStatus, note }
            );

            functions.logger.info(`Vendor verified: ${vendorId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error verifying vendor:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to verify vendor"
            );
        }
    }
);

// ============================================================================
// Suspend Vendor
// ============================================================================

/**
 * Suspends a vendor with reason and audit logging.
 */
export const suspendVendor = functions.https.onCall(
    async (
        data: { vendorId: string; requestId: string; reason: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "vendors.manage");

        const vendorId = validateRequiredString(data.vendorId, "vendorId");
        const requestId = validateRequiredString(data.requestId, "requestId");
        const reason = validateRequiredString(data.reason, "reason");

        // Idempotency check
        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "VENDOR_SUSPEND",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const vendorRef = db.collection("users").doc(vendorId);
            const vendorDoc = await vendorRef.get();

            if (!vendorDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Vendor not found");
            }

            const vendorData = vendorDoc.data()!;

            if (vendorData.role !== "vendor") {
                throw new functions.https.HttpsError("failed-precondition", "User is not a vendor");
            }

            const currentStatus = vendorData.vendorConfig?.status || "pending";

            await vendorRef.update({
                "vendorConfig.status": "suspended",
                "vendorConfig.suspendedAt": admin.firestore.FieldValue.serverTimestamp(),
                "vendorConfig.suspendedBy": adminContext.uid,
                "vendorConfig.suspensionReason": reason,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Also suspend all products from this vendor
            const productsSnapshot = await db.collection("products")
                .where("vendorId", "==", vendorId)
                .where("status", "==", "approved")
                .get();

            const batch = db.batch();
            productsSnapshot.forEach((doc) => {
                batch.update(doc.ref, {
                    status: "suspended",
                    suspendedAt: admin.firestore.FieldValue.serverTimestamp(),
                    suspensionReason: `Vendor suspended: ${reason}`,
                });
            });
            await batch.commit();

            // Mark idempotency complete
            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            // Audit log
            await writeAuditLog(
                "VENDOR_SUSPENDED",
                adminContext.uid,
                vendorId,
                "user",
                {
                    businessName: vendorData.vendorConfig?.businessName,
                    previousStatus: currentStatus,
                    reason,
                    productsSuspended: productsSnapshot.size
                }
            );

            functions.logger.info(
                `Vendor suspended: ${vendorId} by ${adminContext.uid}. Reason: ${reason}. Products suspended: ${productsSnapshot.size}`
            );

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error suspending vendor:", error);
            throw new functions.https.HttpsError(
                "internal",
                "Failed to suspend vendor"
            );
        }
    }
);
