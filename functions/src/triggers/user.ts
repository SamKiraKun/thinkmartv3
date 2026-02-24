// File: functions/src/triggers/user.ts
import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * PRODUCTION-READY Trigger: User Creation
 * FIXED: All reads now happen before any writes to comply with Firestore transaction rules.
 */
export const onUserCreate = functions.firestore
    .document('users/{userId}')
    .onCreate(async (snap, context) => {
        const userData = snap.data();
        const userId = context.params.userId;
        const referralCode = userData.referralCode; // The code of the UPLINE

        functions.logger.info(`[onUserCreate] New user: ${userId}, Referral Code: ${referralCode || 'NONE'}`);

        try {
            // --- PHASE 1: PRE-TRANSACTION READS ---
            // Firestore transactions require all reads BEFORE any writes.
            // We perform reads OUTSIDE the transaction for the referrer lookup.

            let referrerData: { id: string; uplinePath: string[] } | null = null;

            if (referralCode) {
                const referrerQuery = await db.collection('users')
                    .where('ownReferralCode', '==', referralCode)
                    .limit(1)
                    .get();

                if (!referrerQuery.empty) {
                    const referrerDoc = referrerQuery.docs[0];
                    referrerData = {
                        id: referrerDoc.id,
                        uplinePath: referrerDoc.data().uplinePath || []
                    };
                    functions.logger.info(`[onUserCreate] Found referrer: ${referrerData.id}`);
                } else {
                    functions.logger.warn(`[onUserCreate] Referral code "${referralCode}" not found. Skipping referral bonus.`);
                }
            }

            // --- PHASE 2: TRANSACTION (All reads within, then all writes) ---
            await db.runTransaction(async (transaction) => {
                const walletRef = db.collection('wallets').doc(userId);
                const userRef = db.collection('users').doc(userId);

                // Read: New user's wallet (to check if it exists)
                const walletDoc = await transaction.get(walletRef);
                // Read: New user's profile (for idempotency check)
                const userSnapshot = await transaction.get(userRef);

                // Read: Referrer's wallet (only if referrer exists)
                let referrerWalletDoc = null;
                if (referrerData) {
                    const referrerWalletRef = db.collection('wallets').doc(referrerData.id);
                    referrerWalletDoc = await transaction.get(referrerWalletRef);
                }

                // --- ALL READS COMPLETE. NOW WRITES. ---

                // 1. Create Wallet for New User (if not exists)
                if (!walletDoc.exists) {
                    transaction.set(walletRef, {
                        userId: userId,
                        coinBalance: 0,
                        cashBalance: 0,
                        totalEarnings: 0,
                        totalWithdrawals: 0,
                        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    });
                }

                // 2. City Stats Aggregation
                if (userData.city && userData.state) {
                    const cityId = `${userData.city}-${userData.state}`.toLowerCase().replace(/\s+/g, '-');
                    const cityStatsRef = db.collection('city_stats').doc(cityId);
                    transaction.set(cityStatsRef, {
                        city: userData.city,
                        state: userData.state,
                        userCount: admin.firestore.FieldValue.increment(1)
                    }, { merge: true });
                }

                // 3. Referral Logic
                if (referrerData && userSnapshot.exists && !userSnapshot.data()?.referralProcessed) {
                    const referrerWalletRef = db.collection('wallets').doc(referrerData.id);

                    // A. Link Users
                    const uplinePath = [referrerData.id, ...referrerData.uplinePath].slice(0, 6);
                    transaction.update(userRef, {
                        referredBy: referrerData.id,
                        uplinePath: uplinePath,
                        referralProcessed: true // Idempotency Flag
                    });

                    // B. Credit Referrer (User X) - 500 Coins
                    if (referrerWalletDoc && referrerWalletDoc.exists) {
                        transaction.update(referrerWalletRef, {
                            coinBalance: admin.firestore.FieldValue.increment(500),
                            totalEarnings: admin.firestore.FieldValue.increment(500)
                        });
                    } else {
                        // Create wallet if referrer doesn't have one (edge case)
                        transaction.set(referrerWalletRef, {
                            userId: referrerData.id,
                            coinBalance: 500,
                            cashBalance: 0,
                            totalEarnings: 500,
                            totalWithdrawals: 0,
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }

                    // C. Credit New User (User Y) - 500 Coins
                    // We update the wallet we potentially just created above.
                    // Firestore allows updating a doc set in the same transaction.
                    transaction.update(walletRef, {
                        coinBalance: admin.firestore.FieldValue.increment(500),
                        totalEarnings: admin.firestore.FieldValue.increment(500)
                    });

                    // D. Log Transaction for Referrer
                    const referrerTxRef = db.collection('transactions').doc();
                    transaction.set(referrerTxRef, {
                        userId: referrerData.id,
                        type: 'REFERRAL_BONUS',
                        amount: 500,
                        currency: 'COIN',
                        description: `Referral bonus for user ${userData.name || 'New User'}`,
                        status: 'COMPLETED',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        relatedUserId: userId
                    });

                    // E. Log Transaction for New User
                    const newUserTxRef = db.collection('transactions').doc();
                    transaction.set(newUserTxRef, {
                        userId: userId,
                        type: 'WELCOME_BONUS',
                        amount: 500,
                        currency: 'COIN',
                        description: `Welcome bonus for joining via referral code ${referralCode}`,
                        status: 'COMPLETED',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        timestamp: admin.firestore.FieldValue.serverTimestamp(),
                        relatedUserId: referrerData.id
                    });

                    functions.logger.info(`[onUserCreate] Referral bonuses credited for ${userId} and ${referrerData.id}.`);
                }
            });

            functions.logger.info(`[onUserCreate] User ${userId} initialized successfully.`);
        } catch (error) {
            functions.logger.error(`[onUserCreate] Error initializing user ${userId}`, error);
        }
    });