// File: functions/src/organization/organization.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Helper: Require Organization Role
 * Validates user has organization role and returns org data
 */
async function requireOrgRole(context: functions.https.CallableContext) {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const userDoc = await db.doc(`users/${userId}`).get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;
    if (userData.role !== 'organization') {
        throw new functions.https.HttpsError('permission-denied', 'Organization role required');
    }

    return {
        orgId: userId,
        orgConfig: userData.orgConfig || {},
        userData
    };
}

/**
 * Get Organization Dashboard Stats
 * Returns member count, earnings, and commission data
 */
export const getOrgDashboardStats = functions.https.onCall(async (data, context) => {
    const { orgId, orgConfig, userData } = await requireOrgRole(context);

    const referralCode = userData.ownReferralCode;
    if (!referralCode) {
        return {
            success: true,
            stats: {
                totalMembers: 0,
                activeMembers: 0,
                totalEarnings: 0,
                pendingEarnings: 0
            }
        };
    }

    // Count members who used this org's referral code
    const membersQuery = await db.collection('users')
        .where('referralCode', '==', referralCode)
        .get();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    let totalMembers = 0;
    let activeMembers = 0;

    membersQuery.docs.forEach(doc => {
        totalMembers++;
        const lastActive = doc.data().lastActiveAt?.toDate?.();
        if (lastActive && lastActive >= sevenDaysAgo) {
            activeMembers++;
        }
    });

    // Get org wallet/earnings
    const orgWalletDoc = await db.doc(`wallets/${orgId}`).get();
    const wallet = orgWalletDoc.data() || { cashBalance: 0, totalEarnings: 0 };

    // Get commission logs
    const commissionQuery = await db.collection('org_commission_logs')
        .where('orgId', '==', orgId)
        .orderBy('createdAt', 'desc')
        .limit(100)
        .get();

    let totalEarnings = 0;
    let pendingEarnings = 0;

    commissionQuery.docs.forEach(doc => {
        const log = doc.data();
        totalEarnings += log.amount || 0;
        if (log.status === 'pending') {
            pendingEarnings += log.amount || 0;
        }
    });

    return {
        success: true,
        stats: {
            totalMembers,
            activeMembers,
            totalEarnings,
            pendingEarnings,
            walletBalance: wallet.cashBalance || 0,
            referralCode
        },
        orgConfig
    };
});

/**
 * Get Organization Members
 * Returns paginated list of members who joined via org's referral code
 */
export const getOrgMembers = functions.https.onCall(async (data, context) => {
    const { orgId, userData } = await requireOrgRole(context);

    const { limit: queryLimit = 50, lastMemberId, search } = data || {};
    const referralCode = userData.ownReferralCode;

    if (!referralCode) {
        return { success: true, members: [], hasMore: false };
    }

    let query = db.collection('users')
        .where('referralCode', '==', referralCode)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(queryLimit, 100));

    // Cursor-based pagination
    if (lastMemberId) {
        const lastDoc = await db.doc(`users/${lastMemberId}`).get();
        if (lastDoc.exists) {
            query = query.startAfter(lastDoc);
        }
    }

    const membersSnap = await query.get();

    let members = membersSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            name: data.name || data.displayName || 'Unknown',
            email: data.email ? `${data.email.substring(0, 3)}***` : null, // Masked email
            phone: data.phone ? `***${data.phone.slice(-4)}` : null, // Masked phone
            city: data.city || null,
            createdAt: data.createdAt?.toDate?.() || null,
            membershipActive: data.membershipActive || false,
            lastActiveAt: data.lastActiveAt?.toDate?.() || null
        };
    });

    // Client-side search filter (for small result sets)
    if (search && search.length >= 2) {
        const searchLower = search.toLowerCase();
        members = members.filter(m =>
            m.name?.toLowerCase().includes(searchLower) ||
            m.city?.toLowerCase().includes(searchLower)
        );
    }

    return {
        success: true,
        members,
        hasMore: membersSnap.docs.length === Math.min(queryLimit, 100),
        lastMemberId: members.length > 0 ? members[members.length - 1].id : null
    };
});

/**
 * Get Organization Earnings
 * Returns commission logs and earnings analytics
 */
export const getOrgEarnings = functions.https.onCall(async (data, context) => {
    const { orgId } = await requireOrgRole(context);

    const { limit: queryLimit = 50, lastLogId } = data || {};

    let query = db.collection('org_commission_logs')
        .where('orgId', '==', orgId)
        .orderBy('createdAt', 'desc')
        .limit(Math.min(queryLimit, 100));

    if (lastLogId) {
        const lastDoc = await db.doc(`org_commission_logs/${lastLogId}`).get();
        if (lastDoc.exists) {
            query = query.startAfter(lastDoc);
        }
    }

    const logsSnap = await query.get();

    const logs = logsSnap.docs.map(doc => {
        const data = doc.data();
        return {
            id: doc.id,
            amount: data.amount || 0,
            type: data.type || 'commission',
            sourceType: data.sourceType || null,
            status: data.status || 'completed',
            createdAt: data.createdAt?.toDate?.() || null
        };
    });

    // Calculate summary stats from logs
    let totalEarnings = 0;
    let thisMonthEarnings = 0;
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);

    logs.forEach(log => {
        totalEarnings += log.amount;
        if (log.createdAt && log.createdAt >= thisMonthStart) {
            thisMonthEarnings += log.amount;
        }
    });

    return {
        success: true,
        logs,
        summary: {
            totalEarnings,
            thisMonthEarnings
        },
        hasMore: logsSnap.docs.length === Math.min(queryLimit, 100),
        lastLogId: logs.length > 0 ? logs[logs.length - 1].id : null
    };
});
