// File: functions/src/gamification/leaderboard.ts
/**
 * Referral Leaderboard Cloud Functions
 * 
 * Provides leaderboard functionality for gamification:
 * - Top referrers (by direct referral count)
 * - Top earners (by total earnings)
 * - Weekly/Monthly resets with historical data
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

interface LeaderboardEntry {
    userId: string;
    userName: string;
    userAvatar?: string;
    rank: number;
    value: number; // referral count or earnings amount
    change?: number; // rank change since last update
}

interface LeaderboardData {
    type: 'referrals' | 'earnings';
    period: 'all_time' | 'monthly' | 'weekly';
    entries: LeaderboardEntry[];
    lastUpdated: admin.firestore.Timestamp;
    currentUserRank?: number;
    currentUserValue?: number;
}

function getReferralValue(data: FirebaseFirestore.DocumentData | undefined): number {
    if (!data) return 0;
    const candidates = [
        data.directReferralCount,
        data.referralCount,
        data.referralsCount,
        data.totalReferrals
    ];

    const values = candidates
        .map((value) => Number(value || 0))
        .filter((value) => Number.isFinite(value) && value > 0);

    return values.length ? Math.max(...values) : 0;
}

async function fetchReferralLeaderboardDocs(limit: number): Promise<FirebaseFirestore.QueryDocumentSnapshot[]> {
    const referralFields = [
        'directReferralCount',
        'referralCount',
        'referralsCount',
        'totalReferrals',
    ] as const;

    const fetchTop = async (field: string) => {
        try {
            return await db.collection('users')
                .orderBy(field, 'desc')
                .limit(limit * 3)
                .get();
        } catch (error) {
            functions.logger.warn(`[leaderboard] Unable to query users by ${field}`, error);
            return null;
        }
    };

    const snapshots = await Promise.all(referralFields.map((field) => fetchTop(field)));

    const merged = new Map<string, FirebaseFirestore.QueryDocumentSnapshot>();
    snapshots.forEach((snapshot) => {
        snapshot?.docs.forEach((doc) => merged.set(doc.id, doc));
    });

    if (!merged.size) {
        return [];
    }

    return Array.from(merged.values())
        .sort((a, b) => getReferralValue(b.data()) - getReferralValue(a.data()))
        .slice(0, limit * 2);
}

// ============================================================================
// GET LEADERBOARD (Callable)
// ============================================================================

/**
 * Get leaderboard data
 * Cached in Firestore, updated periodically via scheduled function
 */
export const getLeaderboard = functions.https.onCall(async (data, context) => {
    try {
        const { type = 'referrals', period = 'all_time', limit = 20 } = data || {};

        // Validate inputs
        if (!['referrals', 'earnings'].includes(type)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid type');
        }
        if (!['all_time', 'monthly', 'weekly'].includes(period)) {
            throw new functions.https.HttpsError('invalid-argument', 'Invalid period');
        }

        const leaderboardId = `${type}_${period}`;
        const leaderboardDoc = await db.doc(`leaderboards/${leaderboardId}`).get();

        let leaderboardData: LeaderboardData;
        const STALE_THRESHOLD_MS = 2 * 60 * 60 * 1000; // 2 hours

        if (!leaderboardDoc.exists) {
            // No cache at all — generate on demand
            leaderboardData = await generateLeaderboard(type as 'referrals' | 'earnings', period as 'all_time' | 'monthly' | 'weekly', limit);
        } else {
            leaderboardData = leaderboardDoc.data() as LeaderboardData;

            // Check if stale or empty — regenerate
            const lastUpdatedMs = leaderboardData.lastUpdated?.toMillis?.() || 0;
            const isStale = (Date.now() - lastUpdatedMs) > STALE_THRESHOLD_MS;
            const isEmpty = !leaderboardData.entries || leaderboardData.entries.length === 0;

            if (isEmpty || isStale) {
                try {
                    leaderboardData = await generateLeaderboard(type as 'referrals' | 'earnings', period as 'all_time' | 'monthly' | 'weekly', limit);
                } catch (regenError) {
                    functions.logger.warn('[getLeaderboard] Regeneration failed, serving stale cache', regenError);
                }
            }
        }

        // Add current user's rank if authenticated
        if (context.auth) {
            const userId = context.auth.uid;
            const userEntry = leaderboardData.entries.find(e => e.userId === userId);
            if (userEntry) {
                leaderboardData.currentUserRank = userEntry.rank;
                leaderboardData.currentUserValue = userEntry.value;
            } else {
                // Get user's actual rank (might be outside top N)
                const userRank = await getUserRank(userId, type as 'referrals' | 'earnings');
                leaderboardData.currentUserRank = userRank.rank;
                leaderboardData.currentUserValue = userRank.value;
            }
        }

        return {
            ...leaderboardData,
            entries: leaderboardData.entries.slice(0, limit),
        };
    } catch (error: unknown) {
        functions.logger.error('getLeaderboard failed', error);
        if (error instanceof functions.https.HttpsError) throw error;
        throw new functions.https.HttpsError('internal', 'Failed to fetch leaderboard.');
    }
});

// ============================================================================
// SCHEDULED: Update Leaderboards
// ============================================================================

/**
 * Update all leaderboards every hour
 */
export const updateLeaderboards = functions.pubsub
    .schedule('every 1 hours')
    .timeZone('Asia/Kolkata')
    .onRun(async () => {
        functions.logger.info('[updateLeaderboards] Starting scheduled update');

        const types: Array<'referrals' | 'earnings'> = ['referrals', 'earnings'];
        const periods: Array<'all_time' | 'monthly' | 'weekly'> = ['all_time', 'monthly', 'weekly'];

        for (const type of types) {
            for (const period of periods) {
                try {
                    await generateLeaderboard(type, period, 100); // Store top 100
                    functions.logger.info(`[updateLeaderboards] Updated ${type}_${period}`);
                } catch (error) {
                    functions.logger.error(`[updateLeaderboards] Failed ${type}_${period}`, error);
                }
            }
        }

        return null;
    });

/**
 * Weekly reset: Archive current leaders and reset weekly counters
 */
export const weeklyLeaderboardReset = functions.pubsub
    .schedule('every sunday 00:00')
    .timeZone('Asia/Kolkata')
    .onRun(async () => {
        functions.logger.info('[weeklyLeaderboardReset] Archiving weekly leaders');

        const weekId = getWeekId();

        // Archive current weekly leaders
        const weeklyReferrals = await db.doc('leaderboards/referrals_weekly').get();
        const weeklyEarnings = await db.doc('leaderboards/earnings_weekly').get();

        if (weeklyReferrals.exists) {
            await db.doc(`leaderboard_archives/referrals_${weekId}`).set({
                ...weeklyReferrals.data(),
                archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        if (weeklyEarnings.exists) {
            await db.doc(`leaderboard_archives/earnings_${weekId}`).set({
                ...weeklyEarnings.data(),
                archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        // Award top 3 (optional - add rewards logic here)
        await awardTopPerformers('weekly');

        return null;
    });

/**
 * Monthly reset: Archive and award
 */
export const monthlyLeaderboardReset = functions.pubsub
    .schedule('1 of month 00:00')
    .timeZone('Asia/Kolkata')
    .onRun(async () => {
        functions.logger.info('[monthlyLeaderboardReset] Archiving monthly leaders');

        const monthId = getMonthId();

        const monthlyReferrals = await db.doc('leaderboards/referrals_monthly').get();
        const monthlyEarnings = await db.doc('leaderboards/earnings_monthly').get();

        if (monthlyReferrals.exists) {
            await db.doc(`leaderboard_archives/referrals_${monthId}`).set({
                ...monthlyReferrals.data(),
                archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        if (monthlyEarnings.exists) {
            await db.doc(`leaderboard_archives/earnings_${monthId}`).set({
                ...monthlyEarnings.data(),
                archivedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
        }

        await awardTopPerformers('monthly');

        return null;
    });

// ============================================================================
// HELPERS
// ============================================================================

async function generateLeaderboard(
    type: 'referrals' | 'earnings',
    period: 'all_time' | 'monthly' | 'weekly',
    limit: number
): Promise<LeaderboardData> {
    const field = type === 'referrals' ? 'directReferralCount' : 'totalEarnings';
    const collection = type === 'referrals' ? 'users' : 'wallets';

    // Preserve API compatibility for period values (currently all-time aggregates).
    if (period === 'monthly') {
        getMonthStart();
    } else if (period === 'weekly') {
        getWeekStart();
    }

    const sourceDocs = type === 'referrals'
        ? await fetchReferralLeaderboardDocs(limit)
        : (await db.collection(collection)
            .orderBy(field, 'desc')
            .limit(limit)
            .get()).docs;

    const entries: LeaderboardEntry[] = [];
    let rank = 0;

    for (const doc of sourceDocs) {
        rank++;
        const data = doc.data();

        // Skip users with 0 value
        const value = type === 'referrals'
            ? getReferralValue(data)
            : Number(data[field] || 0);
        if (value === 0) continue;

        // Get user info
        let userName = data.name || data.displayName || 'User';
        let userAvatar = data.photoURL || null;

        // If wallet collection, fetch user info
        if (collection === 'wallets') {
            const userDoc = await db.doc(`users/${doc.id}`).get();
            const userData = userDoc.data() || {};
            userName = userData.name || userData.displayName || 'User';
            userAvatar = userData.photoURL || null;
        }

        entries.push({
            userId: doc.id,
            userName: userName.split(' ')[0], // First name only for privacy
            userAvatar,
            rank,
            value,
        });
    }

    const leaderboardData: LeaderboardData = {
        type,
        period,
        entries,
        lastUpdated: admin.firestore.Timestamp.now(),
    };

    // Cache the leaderboard
    await db.doc(`leaderboards/${type}_${period}`).set(leaderboardData);

    return leaderboardData;
}

async function getUserRank(
    userId: string,
    type: 'referrals' | 'earnings'
): Promise<{ rank: number; value: number }> {
    const field = type === 'referrals' ? 'directReferralCount' : 'totalEarnings';
    const collection = type === 'referrals' ? 'users' : 'wallets';

    const userDoc = await db.doc(`${collection}/${userId}`).get();
    const userData = userDoc.data() || {};
    const userValue = type === 'referrals'
        ? getReferralValue(userData)
        : Number(userData[field] || 0);

    if (userValue === 0) {
        return { rank: 0, value: 0 };
    }

    // Count users with higher value
    let higherCount = 0;
    if (type === 'referrals') {
        try {
            const [directHigher, legacyHigher, legacyPluralHigher, totalReferralsHigher] = await Promise.all([
                db.collection('users').where('directReferralCount', '>', userValue).count().get().catch(() => null),
                db.collection('users').where('referralCount', '>', userValue).count().get().catch(() => null),
                db.collection('users').where('referralsCount', '>', userValue).count().get().catch(() => null),
                db.collection('users').where('totalReferrals', '>', userValue).count().get().catch(() => null)
            ]);
            higherCount = Math.max(
                directHigher?.data()?.count ?? 0,
                legacyHigher?.data()?.count ?? 0,
                legacyPluralHigher?.data()?.count ?? 0,
                totalReferralsHigher?.data()?.count ?? 0
            );
        } catch (error) {
            functions.logger.warn('[getUserRank] Count query failed, returning rank 0', error);
            return { rank: 0, value: userValue };
        }
    } else {
        try {
            const countSnapshot = await db.collection(collection)
                .where(field, '>', userValue)
                .count()
                .get();
            higherCount = countSnapshot.data().count;
        } catch (error) {
            functions.logger.warn('[getUserRank] Count query failed for earnings', error);
            return { rank: 0, value: userValue };
        }
    }

    return {
        rank: higherCount + 1,
        value: userValue,
    };
}

async function awardTopPerformers(period: 'weekly' | 'monthly') {
    // Award coins to top 3 in each category
    const rewards = {
        1: 5000, // 1st place
        2: 2500, // 2nd place
        3: 1000, // 3rd place
    };

    for (const type of ['referrals', 'earnings'] as const) {
        const leaderboard = await db.doc(`leaderboards/${type}_${period}`).get();
        if (!leaderboard.exists) continue;

        const data = leaderboard.data() as LeaderboardData;
        const top3 = data.entries.slice(0, 3);

        for (const entry of top3) {
            const reward = rewards[entry.rank as 1 | 2 | 3];
            if (!reward) continue;

            // Credit reward
            await db.doc(`wallets/${entry.userId}`).update({
                coinBalance: admin.firestore.FieldValue.increment(reward),
            });

            // Log transaction
            await db.collection('transactions').add({
                userId: entry.userId,
                type: 'LEADERBOARD_REWARD',
                amount: reward,
                currency: 'COIN',
                description: `${period.charAt(0).toUpperCase() + period.slice(1)} ${type} leaderboard - Rank #${entry.rank}`,
                status: 'COMPLETED',
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                timestamp: admin.firestore.FieldValue.serverTimestamp(),
            });
        }
    }
}

function getWeekId(): string {
    const now = new Date();
    const year = now.getFullYear();
    const week = Math.ceil((now.getDate() - now.getDay() + 1) / 7);
    return `${year}_W${week}`;
}

function getMonthId(): string {
    const now = new Date();
    return `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getWeekStart(): Date {
    const now = new Date();
    const day = now.getDay();
    const diff = now.getDate() - day;
    return new Date(now.setDate(diff));
}

function getMonthStart(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), 1);
}

// ============================================================================
// LEGACY COMPATIBILITY: Manual/Scheduled topEarners cache
// ============================================================================
// These callable/scheduled exports preserve old names while we migrate clients.

export const updateLeaderboard = functions.https.onCall(async (data, context) => {
    try {
        await refreshLegacyTopEarnersCache();
        return { success: true };
    } catch (error) {
        throw new functions.https.HttpsError('internal', 'Update failed');
    }
});

export const scheduledLeaderboardUpdate = functions.pubsub
    .schedule('every 6 hours')
    .timeZone('Asia/Kolkata')
    .onRun(async (context) => {
        functions.logger.info('Starting scheduled leaderboard update');
        await refreshLegacyTopEarnersCache();
        functions.logger.info('Leaderboard update completed');
        return null;
    });

async function refreshLegacyTopEarnersCache() {
    const walletQuery = await db.collection('wallets')
        .orderBy('totalEarnings', 'desc')
        .limit(20)
        .get();

    const leaderboardData: Array<{
        userId: string;
        name: string;
        photoURL: string | null;
        city: string | null;
        score: number;
        rank: number;
    }> = [];

    for (const walletDoc of walletQuery.docs) {
        const userData = (await db.doc(`users/${walletDoc.id}`).get()).data() || {};
        leaderboardData.push({
            userId: walletDoc.id,
            name: userData.displayName || userData.name || 'User',
            photoURL: userData.photoURL || null,
            city: userData.city || null,
            score: walletDoc.data().totalEarnings || 0,
            rank: 0
        });
    }

    await db.doc('system/leaderboard').set({
        topEarners: leaderboardData.map((item, index) => ({ ...item, rank: index + 1 })),
        lastUpdated: admin.firestore.FieldValue.serverTimestamp()
    });
}
