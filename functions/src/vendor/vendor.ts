// File: functions/src/vendor/vendor.ts
// Vendor Cloud Functions - Product and Order Management

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

interface ProductInput {
    name: string;
    description: string;
    price: number;
    category?: string;
    imageUrl?: string;
    stock?: number;
    isActive?: boolean;
}

interface VendorConfig {
    vendorId?: string;
    businessName: string;
    verified: boolean;
    storeProfile?: {
        contactEmail?: string;
        contactPhone?: string;
        addressLine1?: string;
        addressLine2?: string;
        city?: string;
        state?: string;
        pincode?: string;
        payoutMethod?: string;
        payoutAccount?: string;
        logoUrl?: string;
        bannerUrl?: string;
        updatedAt?: unknown;
    };
}

// ============================================================================
// HELPER: Require Vendor Role
// ============================================================================

async function requireVendorRole(context: functions.https.CallableContext): Promise<{
    userId: string;
    vendorId: string;
    vendorAliases: string[];
    vendorData: FirebaseFirestore.DocumentData;
}> {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const userDoc = await db.doc(`users/${userId}`).get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;

    if (userData.role !== 'vendor') {
        throw new functions.https.HttpsError('permission-denied', 'Vendor access required');
    }

    const vendorConfig = userData.vendorConfig as VendorConfig | undefined;
    const vendorId = typeof vendorConfig?.vendorId === 'string' && vendorConfig.vendorId.trim().length > 0
        ? vendorConfig.vendorId.trim()
        : userId;

    const vendorAliases = Array.from(new Set([vendorId, userId].filter(Boolean)));

    return {
        userId,
        vendorId,
        vendorAliases,
        vendorData: userData
    };
}

function toTrimmedString(value: unknown): string {
    if (typeof value !== 'string') {
        return '';
    }
    return value.trim();
}

function sanitizeString(value: unknown, maxLength: number): string {
    return toTrimmedString(value).slice(0, maxLength);
}

function sanitizeEmail(value: unknown): string {
    const email = sanitizeString(value, 120).toLowerCase();
    if (!email) return '';
    const pattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!pattern.test(email)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid contact email');
    }
    return email;
}

function matchesVendorIdentity(value: unknown, vendorAliases: string[]): boolean {
    const normalized = toTrimmedString(value);
    return normalized.length > 0 && vendorAliases.includes(normalized);
}

function rowBelongsToVendor(row: any, vendorAliases: string[]): boolean {
    return (
        matchesVendorIdentity(row?.vendorId, vendorAliases) ||
        matchesVendorIdentity(row?.vendorUid, vendorAliases) ||
        matchesVendorIdentity(row?.vendor, vendorAliases) ||
        matchesVendorIdentity(row?.ownerId, vendorAliases) ||
        matchesVendorIdentity(row?.sellerId, vendorAliases)
    );
}

function itemBelongsToVendor(item: any, vendorAliases: string[]): boolean {
    return (
        matchesVendorIdentity(item?.vendorId, vendorAliases) ||
        matchesVendorIdentity(item?.vendorUid, vendorAliases) ||
        matchesVendorIdentity(item?.vendor, vendorAliases) ||
        matchesVendorIdentity(item?.ownerId, vendorAliases) ||
        matchesVendorIdentity(item?.sellerId, vendorAliases)
    );
}

// ============================================================================
// CLOUD FUNCTION: Get Vendor Dashboard Stats
// ============================================================================

export const getVendorDashboardStats = functions.https.onCall(async (data, context) => {
    try {
        console.log("getVendorDashboardStats called");
        const { vendorId, vendorAliases } = await requireVendorRole(context);
        console.log("Vendor ID identified:", vendorId);

        // Count products
        const productsQuery = vendorAliases.length > 1
            ? await db.collection('products')
                .where('vendorId', 'in', vendorAliases)
                .get()
            : await db.collection('products')
                .where('vendorId', '==', vendorId)
                .get();

        let totalProducts = 0;
        let activeProducts = 0;

        productsQuery.docs.forEach(doc => {
            const data = doc.data();
            if (!data.isDeleted) {
                totalProducts++;
                if (data.isActive) activeProducts++;
            }
        });

        // Count orders containing vendor products
        const ordersQuery = vendorAliases.length > 1
            ? await db.collection('orders')
                .where('vendorIds', 'array-contains-any', vendorAliases)
                .get()
            : await db.collection('orders')
                .where('vendorIds', 'array-contains', vendorId)
                .get();

        let totalOrders = 0;
        let pendingOrders = 0;
        let totalRevenue = 0;

        ordersQuery.docs.forEach(doc => {
            const data = doc.data();
            totalOrders++;
            if (data.status === 'pending' || data.status === 'confirmed') {
                pendingOrders++;
            }
            // Calculate revenue from this vendor's items only
            if (data.items) {
                data.items.forEach((item: any) => {
                    if (vendorAliases.includes(String(item.vendorId || ''))) {
                        totalRevenue += (item.price || 0) * (item.quantity || 1);
                    }
                });
            }
        });

        return {
            totalProducts,
            activeProducts,
            totalOrders,
            pendingOrders,
            totalRevenue
        };
    } catch (error) {
        console.error("Error in getVendorDashboardStats:", error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch vendor stats', error);
    }
});

// ============================================================================
// CLOUD FUNCTION: Get Vendor Store Profile
// ============================================================================

export const getVendorStoreProfile = functions.https.onCall(async (data, context) => {
    const { vendorId, vendorData } = await requireVendorRole(context);

    const vendorConfig = (vendorData.vendorConfig || {}) as VendorConfig;
    const storeProfile = vendorConfig.storeProfile || {};

    return {
        success: true,
        profile: {
            vendorId,
            businessName: toTrimmedString(vendorConfig.businessName) || toTrimmedString(vendorData.name),
            contactEmail: toTrimmedString(storeProfile.contactEmail) || toTrimmedString(vendorData.email),
            contactPhone: toTrimmedString(storeProfile.contactPhone) || toTrimmedString(vendorData.phone),
            addressLine1: toTrimmedString(storeProfile.addressLine1),
            addressLine2: toTrimmedString(storeProfile.addressLine2),
            city: toTrimmedString(storeProfile.city) || toTrimmedString(vendorData.city),
            state: toTrimmedString(storeProfile.state) || toTrimmedString(vendorData.state),
            pincode: toTrimmedString(storeProfile.pincode),
            payoutMethod: toTrimmedString(storeProfile.payoutMethod),
            payoutAccount: toTrimmedString(storeProfile.payoutAccount),
            logoUrl: toTrimmedString(storeProfile.logoUrl),
            bannerUrl: toTrimmedString(storeProfile.bannerUrl),
        }
    };
});

// ============================================================================
// CLOUD FUNCTION: Update Vendor Store Profile
// ============================================================================

export const updateVendorStoreProfile = functions.https.onCall(async (data, context) => {
    const { userId } = await requireVendorRole(context);

    const businessName = sanitizeString(data?.businessName, 120);
    if (!businessName || businessName.length < 2) {
        throw new functions.https.HttpsError('invalid-argument', 'Business name must be at least 2 characters');
    }

    const contactEmail = sanitizeEmail(data?.contactEmail);
    const contactPhone = sanitizeString(data?.contactPhone, 32);
    const addressLine1 = sanitizeString(data?.addressLine1, 180);
    const addressLine2 = sanitizeString(data?.addressLine2, 180);
    const city = sanitizeString(data?.city, 80);
    const state = sanitizeString(data?.state, 80);
    const pincode = sanitizeString(data?.pincode, 16);
    const payoutMethod = sanitizeString(data?.payoutMethod, 40);
    const payoutAccount = sanitizeString(data?.payoutAccount, 120);
    const logoUrl = sanitizeString(data?.logoUrl, 300);
    const bannerUrl = sanitizeString(data?.bannerUrl, 300);

    await db.doc(`users/${userId}`).update({
        'vendorConfig.businessName': businessName,
        'vendorConfig.storeProfile': {
            contactEmail,
            contactPhone,
            addressLine1,
            addressLine2,
            city,
            state,
            pincode,
            payoutMethod,
            payoutAccount,
            logoUrl,
            bannerUrl,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return {
        success: true,
        message: 'Store profile updated'
    };
});

// ============================================================================
// CLOUD FUNCTION: Get Vendor Products
// ============================================================================

export const getVendorProducts = functions.https.onCall(async (data, context) => {
    try {
        const { vendorId, vendorAliases } = await requireVendorRole(context);
        const { includeDeleted = false } = data || {};

        const readByVendorId = async (): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> => {
            const query = vendorAliases.length > 1
                ? db.collection('products')
                    .where('vendorId', 'in', vendorAliases)
                    .orderBy('createdAt', 'desc')
                    .limit(200)
                : db.collection('products')
                    .where('vendorId', '==', vendorId)
                    .orderBy('createdAt', 'desc')
                    .limit(200);
            const snapshot = await query.get();
            return snapshot.docs;
        };

        const readRecentFallback = async (): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> => {
            try {
                const snapshot = await db.collection('products')
                    .orderBy('createdAt', 'desc')
                    .limit(400)
                    .get();
                return snapshot.docs;
            } catch (error) {
                functions.logger.warn('[getVendorProducts] Fallback to docId ordering', error);
                const snapshot = await db.collection('products')
                    .orderBy(admin.firestore.FieldPath.documentId(), 'desc')
                    .limit(400)
                    .get();
                return snapshot.docs;
            }
        };

        let sourceDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];
        try {
            sourceDocs = await readByVendorId();
        } catch (error) {
            functions.logger.warn('[getVendorProducts] vendorId query failed, using fallback scan', error);
        }

        if (!sourceDocs.length) {
            sourceDocs = await readRecentFallback();
        }

        const products = sourceDocs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter((row: any) =>
                (includeDeleted || row.isDeleted !== true) &&
                rowBelongsToVendor(row, vendorAliases)
            );

        return { success: true, products };
    } catch (error) {
        console.error("Error in getVendorProducts:", error);
        throw new functions.https.HttpsError('internal', 'Failed to fetch vendor products', error);
    }
});

// ============================================================================
// CLOUD FUNCTION: Create Vendor Product
// ============================================================================

export const createVendorProduct = functions.https.onCall(async (data, context) => {
    const { userId, vendorId, vendorData } = await requireVendorRole(context);
    const { name, description, price, category, imageUrl, stock, isActive } = data as ProductInput;

    // Validation
    if (!name || typeof name !== 'string' || name.trim().length < 3) {
        throw new functions.https.HttpsError('invalid-argument', 'Product name must be at least 3 characters');
    }
    if (typeof price !== 'number' || price <= 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Price must be a positive number');
    }

    const productRef = db.collection('products').doc();
    await productRef.set({
        id: productRef.id,
        name: name.trim(),
        description: description?.trim() || '',
        price: Math.round(price * 100) / 100,
        category: category || 'general',
        imageUrl: imageUrl || null,
        stock: stock ?? 100,
        inStock: (stock ?? 100) > 0,
        isActive: isActive ?? true,
        isDeleted: false,
        status: 'pending', // Products must be approved by admin before appearing in shop
        vendorId: vendorId,
        vendorUid: userId,
        vendor: vendorId,
        vendorName: vendorData.vendorConfig?.businessName || vendorData.name || 'Vendor',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    functions.logger.info(`Vendor ${vendorId} created product ${productRef.id}`);

    return {
        success: true,
        productId: productRef.id,
        message: 'Product created successfully'
    };
});

// ============================================================================
// CLOUD FUNCTION: Update Vendor Product
// ============================================================================

export const updateVendorProduct = functions.https.onCall(async (data, context) => {
    const { vendorId, vendorAliases } = await requireVendorRole(context);
    const { productId, updates } = data as { productId: string; updates: Partial<ProductInput> };

    if (!productId) {
        throw new functions.https.HttpsError('invalid-argument', 'Product ID required');
    }

    // Verify product ownership
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data()!;
    if (!vendorAliases.includes(String(productData.vendorId || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'You can only edit your own products');
    }

    // Build safe update object
    const safeUpdates: Record<string, any> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    };

    if (updates.name !== undefined && typeof updates.name === 'string') {
        safeUpdates.name = updates.name.trim();
    }
    if (updates.description !== undefined && typeof updates.description === 'string') {
        safeUpdates.description = updates.description.trim();
    }
    if (updates.price !== undefined && typeof updates.price === 'number' && updates.price > 0) {
        safeUpdates.price = Math.round(updates.price * 100) / 100;
    }
    if (updates.category !== undefined) {
        safeUpdates.category = updates.category;
    }
    if (updates.imageUrl !== undefined) {
        safeUpdates.imageUrl = updates.imageUrl || null;
    }
    if (Array.isArray((updates as { images?: unknown[] }).images)) {
        safeUpdates.images = (updates as { images?: unknown[] }).images
            ?.filter((value) => typeof value === 'string' && value.length > 0) || [];
        if (safeUpdates.images.length && !safeUpdates.imageUrl) {
            safeUpdates.imageUrl = safeUpdates.images[0];
        }
    }
    if (updates.stock !== undefined && typeof updates.stock === 'number') {
        safeUpdates.stock = Math.max(0, Math.floor(updates.stock));
        safeUpdates.inStock = safeUpdates.stock > 0;
    }
    if (updates.isActive !== undefined && typeof updates.isActive === 'boolean') {
        safeUpdates.isActive = updates.isActive;
    }

    await productRef.update(safeUpdates);

    functions.logger.info(`Vendor ${vendorId} updated product ${productId}`);

    return { success: true, message: 'Product updated successfully' };
});

// ============================================================================
// CLOUD FUNCTION: Delete Vendor Product
// ============================================================================

export const deleteVendorProduct = functions.https.onCall(async (data, context) => {
    const { vendorId, vendorAliases } = await requireVendorRole(context);
    const { productId } = data as { productId: string };

    if (!productId) {
        throw new functions.https.HttpsError('invalid-argument', 'Product ID required');
    }

    // Verify product ownership
    const productRef = db.doc(`products/${productId}`);
    const productDoc = await productRef.get();

    if (!productDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Product not found');
    }

    const productData = productDoc.data()!;
    if (!vendorAliases.includes(String(productData.vendorId || ''))) {
        throw new functions.https.HttpsError('permission-denied', 'You can only delete your own products');
    }

    // Soft delete
    await productRef.update({
        isActive: false,
        isDeleted: true,
        deletedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
    });

    functions.logger.info(`Vendor ${vendorId} deleted product ${productId}`);

    return { success: true, message: 'Product deleted successfully' };
});

/**
 * Get Orders for Vendor
 * Returns orders that contain products from this vendor.
 * Uses the vendorIds array field for efficient querying.
 */
export const getVendorOrders = functions.https.onCall(async (data, context) => {
    const { vendorId, vendorAliases } = await requireVendorRole(context);

    const { limit: queryLimit = 50, status, lastOrderId } = data || {};

    const effectiveLimit = Math.min(queryLimit, 100);
    const orderMatchesVendor = (row: any) => {
        if (Array.isArray(row.vendorIds) && row.vendorIds.some((value: unknown) => matchesVendorIdentity(value, vendorAliases))) {
            return true;
        }
        if (matchesVendorIdentity(row.vendorId, vendorAliases) || matchesVendorIdentity(row.vendorUid, vendorAliases)) {
            return true;
        }
        return Array.isArray(row.items) && row.items.some((item: any) => itemBelongsToVendor(item, vendorAliases));
    };

    let query = vendorAliases.length > 1
        ? db.collection('orders').where('vendorIds', 'array-contains-any', vendorAliases)
        : db.collection('orders').where('vendorIds', 'array-contains', vendorId);
    if (status) query = query.where('status', '==', status);
    query = query
        .orderBy('createdAt', 'desc')
        .limit(effectiveLimit);

    // Cursor-based pagination
    if (lastOrderId) {
        const lastDoc = await db.doc(`orders/${lastOrderId}`).get();
        if (lastDoc.exists) {
            query = query.startAfter(lastDoc);
        }
    }

    const ordersSnap = await query.get();
    let sourceDocs = ordersSnap.docs;

    // Backward-compatibility fallback: older orders may miss vendorIds.
    if (!sourceDocs.length) {
        const fallbackDocs: FirebaseFirestore.QueryDocumentSnapshot[] = [];

        const pushUnique = (docs: FirebaseFirestore.QueryDocumentSnapshot[]) => {
            const seen = new Set(fallbackDocs.map((doc) => doc.id));
            docs.forEach((doc) => {
                if (!seen.has(doc.id)) {
                    seen.add(doc.id);
                    fallbackDocs.push(doc);
                }
            });
        };

        try {
            const vendorIdQuery = vendorAliases.length > 1
                ? await db.collection('orders')
                    .where('vendorId', 'in', vendorAliases)
                    .orderBy('createdAt', 'desc')
                    .limit(Math.min(effectiveLimit * 2, 200))
                    .get()
                : await db.collection('orders')
                    .where('vendorId', '==', vendorId)
                    .orderBy('createdAt', 'desc')
                    .limit(Math.min(effectiveLimit * 2, 200))
                    .get();
            pushUnique(vendorIdQuery.docs);
        } catch (error) {
            functions.logger.warn('[getVendorOrders] vendorId fallback query failed', error);
        }

        const recentSnap = await db.collection('orders')
            .orderBy('createdAt', 'desc')
            .limit(Math.min(effectiveLimit * 3, 300))
            .get();
        pushUnique(recentSnap.docs);

        sourceDocs = fallbackDocs.filter((doc) => {
            const row = doc.data();
            if (status && row.status !== status) return false;
            return orderMatchesVendor(row);
        }).slice(0, effectiveLimit);
    }

    const orders = sourceDocs.map(doc => {
        const data = doc.data();
        // Filter to only show items belonging to this vendor
        const vendorItems = data.items?.filter((item: any) => itemBelongsToVendor(item, vendorAliases)) || [];

        return {
            id: doc.id,
            userId: data.userId,
            userName: data.userName,
            items: vendorItems, // Only this vendor's items
            vendorItemCount: vendorItems.length,
            totalItemCount: data.items?.length || 0,
            status: data.status,
            shippingAddress: data.shippingAddress,
            city: data.city,
            createdAt: data.createdAt?.toDate?.() || null,
            updatedAt: data.updatedAt?.toDate?.() || null
        };
    });

    return {
        success: true,
        orders,
        hasMore: orders.length === effectiveLimit,
        lastOrderId: orders.length > 0 ? orders[orders.length - 1].id : null
    };
});
