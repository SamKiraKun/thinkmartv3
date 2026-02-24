// File: functions/src/reviews/reviewFunctions.ts
/**
 * Product Review Cloud Functions
 * 
 * Handles review submission, moderation, and stats aggregation.
 * Reviews are only allowed for delivered orders.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { z } from 'zod';
import { enforceRateLimit, RATE_LIMIT_STANDARD } from '../lib/rateLimit';

const db = admin.firestore();

// ============================================================================
// VALIDATION SCHEMAS
// ============================================================================

const SubmitReviewSchema = z.object({
    orderId: z.string().min(1).max(128),
    productId: z.string().min(1).max(128),
    rating: z.number().int().min(1).max(5),
    title: z.string().max(100).optional(),
    content: z.string().min(10).max(2000),
    images: z.array(z.string().url()).max(3).optional(),
});

const UpdateReviewSchema = z.object({
    reviewId: z.string().min(1).max(128),
    rating: z.number().int().min(1).max(5).optional(),
    title: z.string().max(100).optional(),
    content: z.string().min(10).max(2000).optional(),
    images: z.array(z.string().url()).max(3).optional(),
});

const ModerateReviewSchema = z.object({
    reviewId: z.string().min(1).max(128),
    action: z.enum(['approve', 'reject', 'flag']),
    note: z.string().max(500).optional(),
});

// ============================================================================
// SUBMIT REVIEW
// ============================================================================

/**
 * Submit a new product review
 * Only users who have a delivered order for this product can review
 */
export const submitReview = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Rate limit
    await enforceRateLimit(`review:${userId}`, RATE_LIMIT_STANDARD);

    // Validate input
    const parsed = SubmitReviewSchema.safeParse(data);
    if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.message);
    }

    const { orderId, productId, rating, title, content, images } = parsed.data;

    // Verify order exists, belongs to user, is delivered, and has this product
    const orderDoc = await db.doc(`orders/${orderId}`).get();
    if (!orderDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Order not found');
    }

    const orderData = orderDoc.data()!;
    if (orderData.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not your order');
    }

    if (orderData.status !== 'delivered') {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'You can only review delivered orders'
        );
    }

    // Check product is in order (for multi-item orders)
    const orderProducts = orderData.productId
        ? [orderData.productId]
        : (orderData.items?.map((i: { productId: string }) => i.productId) || []);

    if (!orderProducts.includes(productId)) {
        throw new functions.https.HttpsError('invalid-argument', 'Product not in this order');
    }

    // Check if already reviewed
    const existingReview = await db.collection('reviews')
        .where('userId', '==', userId)
        .where('orderId', '==', orderId)
        .where('productId', '==', productId)
        .limit(1)
        .get();

    if (!existingReview.empty) {
        throw new functions.https.HttpsError(
            'already-exists',
            'You have already reviewed this product from this order'
        );
    }

    // Get user info for snapshot
    const userDoc = await db.doc(`users/${userId}`).get();
    const userData = userDoc.data() || {};

    // Create review
    const reviewRef = db.collection('reviews').doc();
    const reviewData = {
        id: reviewRef.id,
        productId,
        userId,
        orderId,
        rating,
        title: title || '',
        content,
        images: images || [],
        userName: userData.displayName || userData.name || 'User',
        userAvatar: userData.photoURL || null,
        helpful: 0,
        verified: true, // Purchase verified
        status: 'approved', // Auto-approve verified purchases
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    await reviewRef.set(reviewData);

    // Update product review stats (async, don't wait)
    updateReviewStats(productId).catch(err => {
        functions.logger.error('Failed to update review stats', err);
    });

    functions.logger.info(`[submitReview] User ${userId} reviewed product ${productId}`);

    return {
        success: true,
        reviewId: reviewRef.id,
    };
});

// ============================================================================
// UPDATE REVIEW
// ============================================================================

/**
 * Update an existing review (user can edit their own reviews)
 */
export const updateReview = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const parsed = UpdateReviewSchema.safeParse(data);
    if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.message);
    }

    const { reviewId, ...updates } = parsed.data;

    // Get review and verify ownership
    const reviewRef = db.doc(`reviews/${reviewId}`);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Review not found');
    }

    const reviewData = reviewDoc.data()!;
    if (reviewData.userId !== userId) {
        throw new functions.https.HttpsError('permission-denied', 'Not your review');
    }

    // Build update object
    const updateData: Record<string, unknown> = {
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    if (updates.rating !== undefined) updateData.rating = updates.rating;
    if (updates.title !== undefined) updateData.title = updates.title;
    if (updates.content !== undefined) updateData.content = updates.content;
    if (updates.images !== undefined) updateData.images = updates.images;

    await reviewRef.update(updateData);

    // Update stats if rating changed
    if (updates.rating !== undefined && updates.rating !== reviewData.rating) {
        updateReviewStats(reviewData.productId).catch(err => {
            functions.logger.error('Failed to update review stats', err);
        });
    }

    return { success: true };
});

// ============================================================================
// DELETE REVIEW
// ============================================================================

/**
 * Delete a review (user can delete their own, admins can delete any)
 */
export const deleteReview = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const { reviewId } = data;
    if (!reviewId) {
        throw new functions.https.HttpsError('invalid-argument', 'reviewId required');
    }

    // Get review
    const reviewRef = db.doc(`reviews/${reviewId}`);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Review not found');
    }

    const reviewData = reviewDoc.data()!;

    // Check permission (owner or admin)
    const userDoc = await db.doc(`users/${userId}`).get();
    const userRole = userDoc.data()?.role;
    const isAdmin = ['admin', 'sub_admin'].includes(userRole);

    if (reviewData.userId !== userId && !isAdmin) {
        throw new functions.https.HttpsError('permission-denied', 'Cannot delete this review');
    }

    await reviewRef.delete();

    // Update stats
    updateReviewStats(reviewData.productId).catch(err => {
        functions.logger.error('Failed to update review stats', err);
    });

    return { success: true };
});

// ============================================================================
// MODERATE REVIEW (Admin)
// ============================================================================

/**
 * Moderate a review (admin only)
 */
export const moderateReview = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    // Check admin
    const userDoc = await db.doc(`users/${userId}`).get();
    const userRole = userDoc.data()?.role;
    if (!['admin', 'sub_admin'].includes(userRole)) {
        throw new functions.https.HttpsError('permission-denied', 'Admin only');
    }

    const parsed = ModerateReviewSchema.safeParse(data);
    if (!parsed.success) {
        throw new functions.https.HttpsError('invalid-argument', parsed.error.message);
    }

    const { reviewId, action, note } = parsed.data;

    const reviewRef = db.doc(`reviews/${reviewId}`);
    const reviewDoc = await reviewRef.get();

    if (!reviewDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'Review not found');
    }

    const statusMap: Record<string, string> = {
        approve: 'approved',
        reject: 'rejected',
        flag: 'flagged',
    };

    await reviewRef.update({
        status: statusMap[action],
        moderationNote: note || null,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update stats (rejected reviews don't count)
    const reviewData = reviewDoc.data()!;
    updateReviewStats(reviewData.productId).catch(err => {
        functions.logger.error('Failed to update review stats', err);
    });

    // Audit log
    await db.collection('audit_logs').add({
        action: `review_${action}`,
        userId,
        targetId: reviewId,
        details: { note },
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});

// ============================================================================
// MARK REVIEW HELPFUL
// ============================================================================

/**
 * Mark a review as helpful/not helpful
 */
export const markReviewHelpful = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const { reviewId, helpful } = data;
    if (!reviewId || typeof helpful !== 'boolean') {
        throw new functions.https.HttpsError('invalid-argument', 'reviewId and helpful required');
    }

    const helpfulRef = db.doc(`review_helpful/${reviewId}_${userId}`);
    const reviewRef = db.doc(`reviews/${reviewId}`);

    await db.runTransaction(async (t) => {
        const helpfulDoc = await t.get(helpfulRef);
        const reviewDoc = await t.get(reviewRef);

        if (!reviewDoc.exists) {
            throw new functions.https.HttpsError('not-found', 'Review not found');
        }

        if (helpfulDoc.exists) {
            const existingVote = helpfulDoc.data()!.helpful;
            if (existingVote === helpful) {
                return; // No change
            }
            // Changing vote: undo old, apply new
            const delta = helpful ? 2 : -2; // +1 to -1 = -2, -1 to +1 = +2
            t.update(helpfulRef, { helpful, updatedAt: admin.firestore.FieldValue.serverTimestamp() });
            t.update(reviewRef, { helpful: admin.firestore.FieldValue.increment(delta) });
        } else {
            // New vote
            const delta = helpful ? 1 : -1;
            t.set(helpfulRef, {
                reviewId,
                userId,
                helpful,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            t.update(reviewRef, { helpful: admin.firestore.FieldValue.increment(delta) });
        }
    });

    return { success: true };
});

// ============================================================================
// HELPER: Update Review Stats
// ============================================================================

async function updateReviewStats(productId: string) {
    const reviewsSnap = await db.collection('reviews')
        .where('productId', '==', productId)
        .where('status', '==', 'approved')
        .get();

    const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let totalRating = 0;

    reviewsSnap.docs.forEach(doc => {
        const rating = doc.data().rating as 1 | 2 | 3 | 4 | 5;
        distribution[rating]++;
        totalRating += rating;
    });

    const totalReviews = reviewsSnap.size;
    const averageRating = totalReviews > 0 ? totalRating / totalReviews : 0;

    await db.doc(`review_stats/${productId}`).set({
        productId,
        totalReviews,
        averageRating: Math.round(averageRating * 10) / 10, // Round to 1 decimal
        ratingDistribution: distribution,
        lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
    });
}
