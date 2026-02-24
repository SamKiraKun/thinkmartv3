// File: functions/src/coupons/couponFunctions.ts
/**
 * Coupon Cloud Functions
 * 
 * Handles coupon validation, application, and admin management.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';

const db = admin.firestore();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const ValidateCouponSchema = z.object({
    code: z.string().min(1).max(50).transform(s => s.toUpperCase().trim()),
    orderTotal: z.number().positive(),
    productIds: z.array(z.string()).optional(),
    categories: z.array(z.string()).optional(),
});

const CreateCouponSchema = z.object({
    code: z.string().min(3).max(20).transform(s => s.toUpperCase().trim()),
    discountType: z.enum(['percentage', 'fixed', 'free_shipping']),
    discountValue: z.number().min(0),
    validFrom: z.string().datetime(),
    validUntil: z.string().datetime(),
    maxUses: z.number().int().min(0).default(0),
    maxUsesPerUser: z.number().int().min(0).default(1),
    minOrderAmount: z.number().min(0).optional(),
    minOrderItems: z.number().int().min(0).optional(),
    applicableProducts: z.array(z.string()).optional(),
    applicableCategories: z.array(z.string()).optional(),
    excludedProducts: z.array(z.string()).optional(),
    firstTimeOnly: z.boolean().optional(),
    description: z.string().max(500).optional(),
});

// ============================================================================
// VALIDATE COUPON (Callable)
// ============================================================================

/**
 * Validate a coupon code without applying it
 */
export const validateCoupon = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const parsed = ValidateCouponSchema.safeParse(data);
    if (!parsed.success) {
        return { valid: false, message: 'Invalid request' };
    }

    const { code, orderTotal, productIds } = parsed.data;

    // Find coupon
    const couponQuery = await db.collection('coupons')
        .where('code', '==', code)
        .where('isActive', '==', true)
        .limit(1)
        .get();

    if (couponQuery.empty) {
        return { valid: false, message: 'Invalid coupon code' };
    }

    const couponDoc = couponQuery.docs[0];
    const coupon = couponDoc.data();
    const now = admin.firestore.Timestamp.now();

    // Check validity period
    if (coupon.validFrom > now) {
        return { valid: false, message: 'Coupon is not yet active' };
    }
    if (coupon.validUntil < now) {
        return { valid: false, message: 'Coupon has expired' };
    }

    // Check max uses
    if (coupon.maxUses > 0 && coupon.usedCount >= coupon.maxUses) {
        return { valid: false, message: 'Coupon usage limit reached' };
    }

    // Check per-user limit
    if (coupon.maxUsesPerUser > 0) {
        const userUsageQuery = await db.collection('coupon_usage')
            .where('couponId', '==', couponDoc.id)
            .where('userId', '==', userId)
            .count()
            .get();

        if (userUsageQuery.data().count >= coupon.maxUsesPerUser) {
            return { valid: false, message: 'You have already used this coupon' };
        }
    }

    // Check minimum order amount
    if (coupon.minOrderAmount && orderTotal < coupon.minOrderAmount) {
        return {
            valid: false,
            message: `Minimum order amount is ₹${coupon.minOrderAmount}`,
        };
    }

    // Check first-time only
    if (coupon.firstTimeOnly) {
        const ordersQuery = await db.collection('orders')
            .where('userId', '==', userId)
            .where('status', 'in', ['delivered', 'shipped', 'confirmed'])
            .limit(1)
            .get();

        if (!ordersQuery.empty) {
            return { valid: false, message: 'This coupon is for first-time buyers only' };
        }
    }

    // Check product restrictions
    if (coupon.applicableProducts?.length > 0 && productIds) {
        const hasApplicable = productIds.some(p => coupon.applicableProducts.includes(p));
        if (!hasApplicable) {
            return { valid: false, message: 'Coupon not valid for these products' };
        }
    }

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
        discountAmount = Math.round((orderTotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === 'fixed') {
        discountAmount = Math.min(coupon.discountValue, orderTotal);
    } else if (coupon.discountType === 'free_shipping') {
        discountAmount = 0; // Handled separately in order logic
    }

    return {
        valid: true,
        message: 'Coupon applied successfully',
        coupon: {
            id: couponDoc.id,
            code: coupon.code,
            discountType: coupon.discountType,
            discountValue: coupon.discountValue,
            description: coupon.description,
        },
        discountAmount,
    };
});

// ============================================================================
// APPLY COUPON (Called during order creation)
// ============================================================================

/**
 * Apply coupon to an order (internal function, called from placeOrder)
 */
export async function applyCouponToOrder(
    userId: string,
    couponCode: string,
    orderId: string,
    orderTotal: number
): Promise<{ success: boolean; discountAmount: number; error?: string }> {
    const couponQuery = await db.collection('coupons')
        .where('code', '==', couponCode.toUpperCase())
        .where('isActive', '==', true)
        .limit(1)
        .get();

    if (couponQuery.empty) {
        return { success: false, discountAmount: 0, error: 'Invalid coupon' };
    }

    const couponDoc = couponQuery.docs[0];
    const coupon = couponDoc.data();

    // Calculate discount
    let discountAmount = 0;
    if (coupon.discountType === 'percentage') {
        discountAmount = Math.round((orderTotal * coupon.discountValue) / 100);
    } else if (coupon.discountType === 'fixed') {
        discountAmount = Math.min(coupon.discountValue, orderTotal);
    }

    // Record usage
    await db.collection('coupon_usage').add({
        couponId: couponDoc.id,
        couponCode: coupon.code,
        userId,
        orderId,
        discountAmount,
        usedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Increment usage count
    await couponDoc.ref.update({
        usedCount: admin.firestore.FieldValue.increment(1),
    });

    return { success: true, discountAmount };
}

// ============================================================================
// ADMIN: CREATE COUPON
// ============================================================================

export const createCoupon = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Check admin
    const userDoc = await db.doc(`users/${userId}`).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'sub_admin'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const parsed = CreateCouponSchema.safeParse(data);
    if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.message);
    }

    const couponData = parsed.data;

    // Check code uniqueness
    const existing = await db.collection('coupons')
        .where('code', '==', couponData.code)
        .limit(1)
        .get();

    if (!existing.empty) {
        throw new functions.https.HttpsError('already-exists', 'Coupon code already exists');
    }

    const couponRef = db.collection('coupons').doc();
    await couponRef.set({
        ...couponData,
        id: couponRef.id,
        validFrom: admin.firestore.Timestamp.fromDate(new Date(couponData.validFrom)),
        validUntil: admin.firestore.Timestamp.fromDate(new Date(couponData.validUntil)),
        isActive: true,
        usedCount: 0,
        createdBy: userId,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    functions.logger.info(`[createCoupon] Admin ${userId} created coupon ${couponData.code}`);

    return { success: true, couponId: couponRef.id };
});

// ============================================================================
// ADMIN: UPDATE COUPON
// ============================================================================

export const updateCoupon = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Check admin
    const userDoc = await db.doc(`users/${userId}`).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'sub_admin'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const { couponId, ...updates } = data;
    if (!couponId) {
        throw new functions.https.HttpsError('invalid-argument', 'couponId required');
    }

    const couponRef = db.doc(`coupons/${couponId}`);
    const couponDoc = await couponRef.get();

    if (!couponDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Coupon not found');
    }

    await couponRef.update({
        ...updates,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});

// ============================================================================
// ADMIN: DELETE/DEACTIVATE COUPON
// ============================================================================

export const deactivateCoupon = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Check admin
    const userDoc = await db.doc(`users/${userId}`).get();
    const role = userDoc.data()?.role;
    if (!['admin', 'sub_admin'].includes(role)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const { couponId } = data;
    if (!couponId) {
        throw new functions.https.HttpsError('invalid-argument', 'couponId required');
    }

    await db.doc(`coupons/${couponId}`).update({
        isActive: false,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
