// File: functions/src/orders/cancelOrder.ts
// Order Cancellation with Refund Logic

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

/**
 * Cancel an order and refund the user's wallet.
 * - Users can only cancel their own pending orders
 * - Admins can cancel any order
 * - Refunds coins to coinBalance and cash to cashBalance
 */
export const cancelOrder = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const { orderId, reason } = data as { orderId: string; reason?: string };

    if (!orderId) {
        throw new functions.https.HttpsError('invalid-argument', 'Order ID required');
    }

    // Get user role to check if admin
    const userDoc = await db.doc(`users/${userId}`).get();
    const isAdmin = userDoc.data()?.role === 'admin';

    return await db.runTransaction(async (transaction) => {
        const orderRef = db.doc(`orders/${orderId}`);
        const orderSnap = await transaction.get(orderRef);

        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found');
        }

        const order = orderSnap.data()!;

        // Verify ownership (unless admin)
        if (!isAdmin && order.userId !== userId) {
            throw new functions.https.HttpsError('permission-denied', 'Cannot cancel this order');
        }

        // Check if order can be cancelled
        // Users can only cancel pending orders
        // Admins can cancel pending, confirmed, or shipped orders
        const userCancellableStates = ['pending'];
        const adminCancellableStates = ['pending', 'confirmed', 'shipped'];

        if (isAdmin) {
            if (!adminCancellableStates.includes(order.status)) {
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    `Cannot cancel ${order.status} orders`
                );
            }
        } else {
            if (!userCancellableStates.includes(order.status)) {
                throw new functions.https.HttpsError(
                    'failed-precondition',
                    'Can only cancel pending orders. Contact support for other orders.'
                );
            }
        }

        // Get wallet for refund
        const walletRef = db.doc(`wallets/${order.userId}`);
        const walletSnap = await transaction.get(walletRef);

        if (!walletSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'User wallet not found');
        }

        // Refund amounts
        const cashToRefund = order.cashPaid || 0;
        const coinsToRefund = order.coinsRedeemed || 0;

        // Update wallet with refunds
        const walletUpdates: any = {
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (cashToRefund > 0) {
            walletUpdates.cashBalance = admin.firestore.FieldValue.increment(cashToRefund);
        }
        if (coinsToRefund > 0) {
            walletUpdates.coinBalance = admin.firestore.FieldValue.increment(coinsToRefund);
        }

        transaction.update(walletRef, walletUpdates);

        // Update order status
        const newStatusHistory = [
            ...(order.statusHistory || []),
            {
                status: 'cancelled',
                at: admin.firestore.FieldValue.serverTimestamp(),
                by: isAdmin ? userId : null,
                note: reason || 'Order cancelled'
            }
        ];

        transaction.update(orderRef, {
            status: 'cancelled',
            statusHistory: newStatusHistory,
            cancelReason: reason || 'User requested cancellation',
            cancelledAt: admin.firestore.FieldValue.serverTimestamp(),
            refundReason: reason || 'User requested cancellation',
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        // Restore Stock
        if (order.items && Array.isArray(order.items)) {
            const productRefs = order.items.map((item: any) => db.doc(`products/${item.productId}`));
            const productSnaps = await Promise.all(productRefs.map((ref: any) => transaction.get(ref)));

            productSnaps.forEach((snap: any, index: number) => {
                if (snap.exists) {
                    const item = order.items[index];
                    transaction.update(productRefs[index], {
                        stock: admin.firestore.FieldValue.increment(item.quantity),
                        updatedAt: admin.firestore.FieldValue.serverTimestamp()
                    });
                }
            });
        }

        // Create refund transaction log
        const txRef = db.collection('transactions').doc();
        transaction.set(txRef, {
            userId: order.userId,
            fromUid: 'system',
            fromName: 'ThinkMart',
            toUid: order.userId,
            amount: cashToRefund,
            coinAmount: coinsToRefund,
            type: 'credit',
            category: 'refund',
            description: `Refund for cancelled order #${orderId.slice(-8).toUpperCase()}`,
            orderId: orderId,
            referenceId: orderId,
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        });

        return {
            success: true,
            message: 'Order cancelled and refunded',
            refunded: {
                cash: cashToRefund,
                coins: coinsToRefund
            }
        };
    });
});
