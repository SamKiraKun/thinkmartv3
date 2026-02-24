// File: functions/src/triggers/referralStats.ts
/**
 * Firestore Trigger: Pre-compute referral counts
 * 
 * This trigger updates referral statistics on user documents whenever
 * a new user is referred, reducing N+1 queries in the MLM tree view.
 * 
 * Updates:
 * - directReferralCount: Number of users directly referred
 * - totalDownlineCount: Total users in entire downline (all levels)
 * - lastReferralAt: Timestamp of most recent referral
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

async function incrementReferralCounters(referrerId: string, uplinePath: string[]) {
    await db.doc(`users/${referrerId}`).update({
        directReferralCount: admin.firestore.FieldValue.increment(1),
        referralCount: admin.firestore.FieldValue.increment(1), // legacy-compatible aggregate
        lastReferralAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    if (uplinePath.length > 0) {
        const batch = db.batch();

        for (const ancestorId of uplinePath) {
            const ancestorRef = db.doc(`users/${ancestorId}`);
            batch.update(ancestorRef, {
                totalDownlineCount: admin.firestore.FieldValue.increment(1),
            });
        }

        await batch.commit();
        functions.logger.info(`[referralStats] Updated ${uplinePath.length} ancestors' downline counts`);
    }
}

/**
 * Trigger: When a user document is updated and referredBy changes
 * Updates the referrer's directReferralCount
 */
export const onUserReferralLinked = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const userId = context.params.userId;

        // Only trigger when referredBy is newly set
        if (before.referredBy || !after.referredBy) {
            return null;
        }

        const referrerId = after.referredBy;
        functions.logger.info(`[onUserReferralLinked] User ${userId} linked to referrer ${referrerId}`);

        try {
            const uplinePath: string[] = after.uplinePath || [];
            await incrementReferralCounters(referrerId, uplinePath);

            return { success: true };
        } catch (error) {
            functions.logger.error(`[onUserReferralLinked] Error updating referral stats`, error);
            throw error;
        }
    });

/**
 * Trigger: When a user is created with referredBy already set.
 * Handles referral linkage that happens at signup time.
 */
export const onUserCreatedWithReferrer = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
        const userData = snap.data();
        const userId = context.params.userId;

        if (!userData.referredBy) {
            return null;
        }

        const referrerId = userData.referredBy;
        functions.logger.info(`[onUserCreatedWithReferrer] User ${userId} created with referrer ${referrerId}`);

        try {
            const uplinePath: string[] = userData.uplinePath || [];
            await incrementReferralCounters(referrerId, uplinePath);
            return { success: true };
        } catch (error) {
            functions.logger.error(`[onUserCreatedWithReferrer] Error updating referral stats`, error);
            throw error;
        }
    });

/**
 * Trigger: When a user is deleted, decrement referral counts
 */
export const onUserDeleted = functions.firestore
    .document('users/{userId}')
    .onDelete(async (snap, context) => {
        const userData = snap.data();
        const userId = context.params.userId;

        if (!userData.referredBy) {
            return null;
        }

        const referrerId = userData.referredBy;
        functions.logger.info(`[onUserDeleted] Decrementing referral counts for deleted user ${userId}`);

        try {
            // Decrement direct referral count
            await db.doc(`users/${referrerId}`).update({
                directReferralCount: admin.firestore.FieldValue.increment(-1),
                referralCount: admin.firestore.FieldValue.increment(-1), // legacy-compatible aggregate
            });

            // Decrement total downline count for all ancestors
            const uplinePath: string[] = userData.uplinePath || [];
            if (uplinePath.length > 0) {
                const batch = db.batch();

                for (const ancestorId of uplinePath) {
                    const ancestorRef = db.doc(`users/${ancestorId}`);
                    batch.update(ancestorRef, {
                        totalDownlineCount: admin.firestore.FieldValue.increment(-1),
                    });
                }

                await batch.commit();
            }

            return { success: true };
        } catch (error) {
            functions.logger.error(`[onUserDeleted] Error updating referral stats`, error);
            throw error;
        }
    });

/**
 * Scheduled: Recalculate all referral stats (maintenance job)
 * Runs weekly to fix any drift/inconsistencies
 */
export const recalculateReferralStats = functions.pubsub
    .schedule('every sunday 03:00')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
        functions.logger.info('[recalculateReferralStats] Starting weekly referral stats recalculation');

        try {
            // Get all users
            const usersSnap = await db.collection('users').get();
            const userMap = new Map<string, { directCount: number; totalCount: number }>();

            // Initialize counts
            usersSnap.docs.forEach(doc => {
                userMap.set(doc.id, { directCount: 0, totalCount: 0 });
            });

            // Calculate counts
            usersSnap.docs.forEach(doc => {
                const data = doc.data();
                const referredBy = data.referredBy;
                const uplinePath: string[] = data.uplinePath || [];

                // Increment direct count for referrer
                if (referredBy && userMap.has(referredBy)) {
                    const stats = userMap.get(referredBy)!;
                    stats.directCount++;
                }

                // Increment total count for all ancestors
                for (const ancestorId of uplinePath) {
                    if (userMap.has(ancestorId)) {
                        const stats = userMap.get(ancestorId)!;
                        stats.totalCount++;
                    }
                }
            });

            // Batch update all users
            const batches: admin.firestore.WriteBatch[] = [];
            let currentBatch = db.batch();
            let operationCount = 0;

            for (const [userId, stats] of userMap) {
                currentBatch.update(db.doc(`users/${userId}`), {
                    directReferralCount: stats.directCount,
                    referralCount: stats.directCount, // keep legacy field in sync
                    totalDownlineCount: stats.totalCount,
                });
                operationCount++;

                if (operationCount >= 450) { // Leave buffer below 500 limit
                    batches.push(currentBatch);
                    currentBatch = db.batch();
                    operationCount = 0;
                }
            }

            if (operationCount > 0) {
                batches.push(currentBatch);
            }

            // Execute all batches
            await Promise.all(batches.map(b => b.commit()));

            functions.logger.info(`[recalculateReferralStats] Updated ${userMap.size} users`);
            return null;
        } catch (error) {
            functions.logger.error('[recalculateReferralStats] Error', error);
            throw error;
        }
    });
