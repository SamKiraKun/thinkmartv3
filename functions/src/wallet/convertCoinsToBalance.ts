import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Legacy-compatible callable moved from legacyCore.
 * Converts user coins to cash balance at fixed platform conversion rate.
 */
export const convertCoinsToBalance = functions.https.onCall(async (data, context) => {
    if (!context.auth) throw new functions.https.HttpsError('unauthenticated', 'Login required');
    const { coinsToConvert } = data;
    const userId = context.auth.uid;

    const conversionRate = 100 / 100000;
    const rupees = Math.floor(coinsToConvert * conversionRate);

    if (rupees < 1) throw new functions.https.HttpsError('invalid-argument', 'Minimum conversion amount is ₹1');

    return await db.runTransaction(async (t) => {
        const walletRef = db.doc(`wallets/${userId}`);
        const walletSnap = await t.get(walletRef);
        const wallet = walletSnap.data()!;

        if ((wallet.coinBalance || 0) < coinsToConvert) {
            throw new functions.https.HttpsError('failed-precondition', 'Insufficient coins');
        }

        t.update(walletRef, {
            coinBalance: admin.firestore.FieldValue.increment(-coinsToConvert),
            cashBalance: admin.firestore.FieldValue.increment(rupees)
        });

        const txRef = db.collection('transactions').doc();
        t.set(txRef, {
            userId,
            amount: rupees,
            coinAmount: coinsToConvert,
            type: 'credit',
            category: 'conversion',
            description: `Converted coins to ₹${rupees}`,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return { success: true, convertedAmount: rupees };
    });
});
