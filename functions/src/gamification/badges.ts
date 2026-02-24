// File: functions/src/gamification/badges.ts
/**
 * Achievement Badge Cloud Functions
 * 
 * Automatic badge awarding based on user activity triggers.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// BADGE DEFINITIONS (Server-side copy)
// ============================================================================

interface BadgeCriteria {
    type: 'referral_count' | 'order_count' | 'total_spent' | 'total_earned'
    | 'daily_streak' | 'review_count' | 'wishlist_count' | 'manual';
    threshold: number;
}

interface BadgeDefinition {
    id: string;
    name: string;
    icon: string;
    rarity: 'common' | 'rare' | 'epic' | 'legendary';
    criteria: BadgeCriteria;
    coinReward: number;
}

const BADGES: BadgeDefinition[] = [
    { id: 'first_referral', name: 'First Referral', icon: '👥', rarity: 'common', criteria: { type: 'referral_count', threshold: 1 }, coinReward: 100 },
    { id: 'network_builder', name: 'Network Builder', icon: '🌐', rarity: 'rare', criteria: { type: 'referral_count', threshold: 10 }, coinReward: 500 },
    { id: 'influencer', name: 'Influencer', icon: '⭐', rarity: 'epic', criteria: { type: 'referral_count', threshold: 50 }, coinReward: 2000 },
    { id: 'legend', name: 'Legend', icon: '👑', rarity: 'legendary', criteria: { type: 'referral_count', threshold: 100 }, coinReward: 5000 },
    { id: 'first_purchase', name: 'First Purchase', icon: '🛒', rarity: 'common', criteria: { type: 'order_count', threshold: 1 }, coinReward: 50 },
    { id: 'loyal_customer', name: 'Loyal Customer', icon: '💎', rarity: 'rare', criteria: { type: 'order_count', threshold: 10 }, coinReward: 300 },
    { id: 'big_spender', name: 'Big Spender', icon: '💰', rarity: 'epic', criteria: { type: 'total_spent', threshold: 10000 }, coinReward: 1000 },
    { id: 'first_earnings', name: 'First Earnings', icon: '💵', rarity: 'common', criteria: { type: 'total_earned', threshold: 100 }, coinReward: 50 },
    { id: 'money_maker', name: 'Money Maker', icon: '🤑', rarity: 'rare', criteria: { type: 'total_earned', threshold: 5000 }, coinReward: 500 },
    { id: 'reviewer', name: 'Reviewer', icon: '✍️', rarity: 'common', criteria: { type: 'review_count', threshold: 1 }, coinReward: 50 },
    { id: 'critic', name: 'Critic', icon: '📝', rarity: 'rare', criteria: { type: 'review_count', threshold: 10 }, coinReward: 300 },
];

// ============================================================================
// CHECK AND AWARD BADGE
// ============================================================================

async function checkAndAwardBadge(
    userId: string,
    criteriaType: string,
    currentValue: number
): Promise<void> {
    const eligibleBadges = BADGES.filter(
        (b) => b.criteria.type === criteriaType && currentValue >= b.criteria.threshold
    );

    for (const badge of eligibleBadges) {
        const badgeId = `${userId}_${badge.id}`;
        const badgeRef = db.doc(`user_badges/${badgeId}`);
        const existing = await badgeRef.get();

        if (existing.exists) continue; // Already earned

        // Award badge
        await badgeRef.set({
            id: badgeId,
            badgeId: badge.id,
            userId,
            badgeName: badge.name,
            badgeIcon: badge.icon,
            badgeRarity: badge.rarity,
            earnedAt: admin.firestore.FieldValue.serverTimestamp(),
            progress: currentValue,
            rewardsClaimed: false,
        });

        // Credit coin reward
        await db.doc(`wallets/${userId}`).update({
            coinBalance: admin.firestore.FieldValue.increment(badge.coinReward),
        });

        // Log transaction
        await db.collection('transactions').add({
            userId,
            type: 'BADGE_REWARD',
            amount: badge.coinReward,
            currency: 'COIN',
            description: `Achievement unlocked: ${badge.name}`,
            status: 'COMPLETED',
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Create notification
        await db.collection('notifications').add({
            userId,
            type: 'BADGE_EARNED',
            title: 'Achievement Unlocked! 🏆',
            body: `You earned the "${badge.name}" badge and ${badge.coinReward} coins!`,
            data: { badgeId: badge.id },
            read: false,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
        });

        functions.logger.info(`[badges] User ${userId} earned badge: ${badge.name}`);
    }
}

// ============================================================================
// TRIGGERS
// ============================================================================

/**
 * Check referral badges when user's referral count changes
 */
export const onReferralCountChange = functions.firestore
    .document('users/{userId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const userId = context.params.userId;

        const beforeCount = before.directReferralCount || 0;
        const afterCount = after.directReferralCount || 0;

        if (afterCount > beforeCount) {
            await checkAndAwardBadge(userId, 'referral_count', afterCount);
        }
    });

/**
 * Check order badges when order is delivered
 */
export const onOrderDelivered = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();

        if (before.status !== 'delivered' && after.status === 'delivered') {
            const userId = after.userId;

            // Count delivered orders
            const ordersSnap = await db.collection('orders')
                .where('userId', '==', userId)
                .where('status', '==', 'delivered')
                .count()
                .get();

            const orderCount = ordersSnap.data().count;
            await checkAndAwardBadge(userId, 'order_count', orderCount);

            // Calculate total spent
            const ordersValueSnap = await db.collection('orders')
                .where('userId', '==', userId)
                .where('status', '==', 'delivered')
                .get();

            let totalSpent = 0;
            ordersValueSnap.docs.forEach(doc => {
                totalSpent += doc.data().totalAmount || doc.data().productPrice || 0;
            });

            await checkAndAwardBadge(userId, 'total_spent', totalSpent);
        }
    });

/**
 * Check earning badges when wallet is updated
 */
export const onWalletEarningsChange = functions.firestore
    .document('wallets/{userId}')
    .onUpdate(async (change, context) => {
        const after = change.after.data();
        const userId = context.params.userId;

        const totalEarned = after.totalEarnings || after.totalWithdrawn || 0;
        if (totalEarned > 0) {
            await checkAndAwardBadge(userId, 'total_earned', totalEarned);
        }
    });

/**
 * Check review badges when review is created
 */
export const onReviewCreated = functions.firestore
    .document('reviews/{reviewId}')
    .onCreate(async (snap, context) => {
        const review = snap.data();
        const userId = review.userId;

        const reviewsSnap = await db.collection('reviews')
            .where('userId', '==', userId)
            .count()
            .get();

        const reviewCount = reviewsSnap.data().count;
        await checkAndAwardBadge(userId, 'review_count', reviewCount);
    });

// ============================================================================
// CALLABLE: Get User Badges
// ============================================================================

export const getUserBadges = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }
    const userId = context.auth.uid;

    const badgesSnap = await db.collection('user_badges')
        .where('userId', '==', userId)
        .orderBy('earnedAt', 'desc')
        .get();

    const earnedBadges = badgesSnap.docs.map(doc => doc.data());

    // Calculate progress for unearnened badges
    const earnedIds = new Set(earnedBadges.map(b => b.badgeId));
    const unearned = BADGES.filter(b => !earnedIds.has(b.id));

    // Get current stats
    const userDoc = await db.doc(`users/${userId}`).get();
    const walletDoc = await db.doc(`wallets/${userId}`).get();
    const userData = userDoc.data() || {};
    const walletData = walletDoc.data() || {};

    const stats: Record<string, number> = {
        referral_count: userData.directReferralCount || 0,
        total_earned: walletData.totalEarnings || 0,
        // These would require additional queries
        order_count: 0,
        total_spent: 0,
        review_count: 0,
    };

    const unearnedWithProgress = unearned.map(badge => ({
        ...badge,
        currentValue: stats[badge.criteria.type] || 0,
        percentComplete: Math.min(100, Math.round((stats[badge.criteria.type] || 0) / badge.criteria.threshold * 100)),
    }));

    return {
        earned: earnedBadges,
        available: unearnedWithProgress,
    };
});
