// File: functions/src/withdrawals/requestWithdrawal.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';
import { distributePartnerCommission } from '../partner/partner';

const db = admin.firestore();

// Configurable Limits
const WITHDRAWAL_CONFIG = {
    MIN_AMOUNT: 500,
    MAX_AMOUNT: 50000, // Per request
    MAX_PER_MONTH: 2,
    COOLDOWN_DAYS: 24,
};

/**
 * PRODUCTION-READY: Request Withdrawal with Full Security Checks
 * 
 * Security Features:
 * 1. KYC Verification (Hard Requirement)
 * 2. 24-day cooldown between withdrawals
 * 3. Max 2 withdrawals per month
 * 4. Amount limits (min/max)
 * 5. Prevent duplicate pending withdrawals
 * 6. Balance validation
 */
export const requestWithdrawalSecure = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const { amount, method, details } = data;

    // ========== VALIDATION PHASE (Before Transaction) ==========

    // 1. Basic Input Validation
    if (!amount || typeof amount !== 'number') {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid amount');
    }
    if (amount < WITHDRAWAL_CONFIG.MIN_AMOUNT) {
        throw new functions.https.HttpsError('invalid-argument', `Minimum withdrawal is ₹${WITHDRAWAL_CONFIG.MIN_AMOUNT}`);
    }
    if (amount > WITHDRAWAL_CONFIG.MAX_AMOUNT) {
        throw new functions.https.HttpsError('invalid-argument', `Maximum withdrawal is ₹${WITHDRAWAL_CONFIG.MAX_AMOUNT}`);
    }
    if (!method || !['upi', 'bank'].includes(method)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid payment method');
    }
    if (!details || Object.keys(details).length === 0) {
        throw new functions.https.HttpsError('invalid-argument', 'Payment details required');
    }

    // 2. Fetch User Data
    const userDoc = await db.doc(`users/${userId}`).get();
    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }
    const userData = userDoc.data()!;

    // 3. KYC Verification Check
    if (userData.kycStatus !== 'verified') {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'KYC verification required. Please complete your KYC to withdraw funds.'
        );
    }

    // 4. Check for Existing Pending Withdrawal
    const pendingQuery = await db.collection('withdrawals')
        .where('userId', '==', userId)
        .where('status', '==', 'pending')
        .limit(1)
        .get();

    if (!pendingQuery.empty) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            'You already have a pending withdrawal request. Please wait for it to be processed.'
        );
    }

    // 5. Cooldown Check (24 days since last processed withdrawal)
    // Note: Using simpler query to avoid 'in' + orderBy index issues
    const lastWithdrawalQuery = await db.collection('withdrawals')
        .where('userId', '==', userId)
        .orderBy('processedAt', 'desc')
        .limit(5) // Get last few to find most recent approved/rejected
        .get();

    // Filter for approved/rejected in code
    const lastProcessed = lastWithdrawalQuery.docs.find(
        doc => ['approved', 'rejected'].includes(doc.data().status)
    );

    if (lastProcessed) {
        const lastWithdrawal = lastProcessed.data();
        const lastProcessedAt = lastWithdrawal.processedAt?.toDate();

        if (lastProcessedAt) {
            const cooldownEnd = new Date(lastProcessedAt);
            cooldownEnd.setDate(cooldownEnd.getDate() + WITHDRAWAL_CONFIG.COOLDOWN_DAYS);

            if (new Date() < cooldownEnd) {
                const daysRemaining = Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    `Withdrawal cooldown active. You can request again in ${daysRemaining} day(s).`
                );
            }
        }
    }

    // 6. Monthly Limit Check
    const startOfMonth = new Date();
    startOfMonth.setDate(1);
    startOfMonth.setHours(0, 0, 0, 0);

    const monthlyQuery = await db.collection('withdrawals')
        .where('userId', '==', userId)
        .where('createdAt', '>=', startOfMonth)
        .get();

    if (monthlyQuery.size >= WITHDRAWAL_CONFIG.MAX_PER_MONTH) {
        throw new functions.https.HttpsError(
            'failed-precondition',
            `Maximum ${WITHDRAWAL_CONFIG.MAX_PER_MONTH} withdrawals allowed per month. Limit reached.`
        );
    }

    // ========== TRANSACTION PHASE ==========
    return await db.runTransaction(async (t) => {
        const walletRef = db.doc(`wallets/${userId}`);
        const walletSnap = await t.get(walletRef);

        if (!walletSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Wallet not found');
        }

        const wallet = walletSnap.data()!;

        // 7. Balance Check
        if (wallet.cashBalance < amount) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                `Insufficient balance. Available: ₹${wallet.cashBalance.toFixed(2)}`
            );
        }

        // Deduct balance immediately
        t.update(walletRef, {
            cashBalance: admin.firestore.FieldValue.increment(-amount),
            totalWithdrawals: admin.firestore.FieldValue.increment(amount),
            lastWithdrawalRequest: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Create withdrawal request
        const wRef = db.collection('withdrawals').doc();
        t.set(wRef, {
            userId,
            userName: userData.name || 'Unknown',
            userEmail: userData.email || '',
            userPhone: userData.phone || '',
            userCity: userData.city || null,
            amount,
            method,
            details,
            status: 'pending',
            kycStatus: userData.kycStatus,
            walletBalanceAtRequest: wallet.cashBalance,
            createdAt: admin.firestore.FieldValue.serverTimestamp(),
            // Risk Indicators
            riskFlags: calculateRiskFlags(userData, wallet, amount),
        });

        // Transaction log
        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
            userId,
            amount,
            type: 'debit',
            category: 'withdrawal_request',
            description: `Withdrawal Request (${method.toUpperCase()})`,
            status: 'pending',
            withdrawalId: wRef.id,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        functions.logger.info(`Withdrawal requested: User ${userId}, Amount ₹${amount}, ID ${wRef.id}`);

        return {
            success: true,
            withdrawalId: wRef.id,
            message: 'Withdrawal request submitted. It will be processed within 24-48 hours.'
        };
    });
});

/**
 * Calculate risk flags for admin review
 */
function calculateRiskFlags(userData: any, wallet: any, amount: number): string[] {
    const flags: string[] = [];

    // High-value withdrawal
    if (amount >= 10000) {
        flags.push('HIGH_VALUE');
    }

    // New account (< 7 days)
    const createdAt = userData.createdAt?.toDate?.() || new Date(0);
    const accountAgeDays = Math.floor((Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24));
    if (accountAgeDays < 7) {
        flags.push('NEW_ACCOUNT');
    }

    // Large portion of balance
    if (wallet.cashBalance > 0 && amount / wallet.cashBalance > 0.9) {
        flags.push('FULL_BALANCE');
    }

    // Recent KYC (< 3 days)
    const kycDate = userData.kycVerifiedAt?.toDate?.();
    if (kycDate) {
        const kycAgeDays = Math.floor((Date.now() - kycDate.getTime()) / (1000 * 60 * 60 * 24));
        if (kycAgeDays < 3) {
            flags.push('RECENT_KYC');
        }
    }

    return flags;
}


/**
 * PRODUCTION-READY: Process Withdrawal (Admin Only)
 * 
 * Features:
 * 1. Admin role verification
 * 2. Full audit logging
 * 3. Refund on rejection
 * 4. Partner commission on approval
 */
export const processWithdrawalSecure = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    // Admin Check
    const adminDoc = await db.doc(`users/${context.auth.uid}`).get();
    if (adminDoc.data()?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    const { withdrawalId, action, notes } = data;

    if (!withdrawalId || !action || !['approve', 'reject'].includes(action)) {
        throw new functions.https.HttpsError('invalid-argument', 'Invalid request');
    }

    if (action === 'reject' && !notes) {
        throw new functions.https.HttpsError('invalid-argument', 'Rejection reason required');
    }

    const adminId = context.auth.uid;
    const adminData = adminDoc.data()!;

    return await db.runTransaction(async (t) => {
        const wRef = db.doc(`withdrawals/${withdrawalId}`);
        const wSnap = await t.get(wRef);

        if (!wSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Withdrawal not found');
        }

        const wData = wSnap.data()!;

        if (wData.status !== 'pending') {
            throw new functions.https.HttpsError('failed-precondition', 'Withdrawal already processed');
        }

        if (action === 'approve') {
            // Approve - mark as approved
            t.update(wRef, {
                status: 'approved',
                adminNotes: notes || '',
                processedBy: adminId,
                processedByName: adminData.name || 'Admin',
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Update transaction status
            const txQuery = await db.collection('transactions')
                .where('withdrawalId', '==', withdrawalId)
                .limit(1)
                .get();

            if (!txQuery.empty) {
                t.update(txQuery.docs[0].ref, { status: 'completed' });
            }

            return {
                success: true,
                action: 'approved',
                userId: wData.userId,
                amount: wData.amount,
                city: wData.userCity
            };
        } else {
            // Reject - refund balance
            t.update(db.doc(`wallets/${wData.userId}`), {
                cashBalance: admin.firestore.FieldValue.increment(wData.amount),
                updatedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            t.update(wRef, {
                status: 'rejected',
                adminNotes: notes,
                processedBy: adminId,
                processedByName: adminData.name || 'Admin',
                processedAt: admin.firestore.FieldValue.serverTimestamp()
            });

            // Create refund transaction
            const refundRef = db.collection('transactions').doc();
            t.set(refundRef, {
                userId: wData.userId,
                amount: wData.amount,
                type: 'credit',
                category: 'withdrawal_refund',
                description: `Withdrawal Refund: ${notes}`,
                withdrawalId,
                createdAt: admin.firestore.FieldValue.serverTimestamp()
            });

            return { success: true, action: 'rejected' };
        }
    }).then(async (result) => {
        // Create audit log
        await db.collection('withdrawal_logs').add({
            withdrawalId,
            action: result.action,
            adminId,
            adminName: adminData.name || 'Admin',
            reason: notes || null,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
        });

        // Partner commission on approval (multi-partner support)
        if (result.action === 'approved' && result.city && result.userId && result.amount) {
            await distributePartnerCommission(
                result.city,
                result.amount,
                'withdrawal',
                withdrawalId,
                result.userId
            );
        }

        functions.logger.info(`Withdrawal ${withdrawalId} ${result.action} by admin ${adminId}`);
        return { success: true, message: `Withdrawal ${result.action} successfully` };
    });
});
