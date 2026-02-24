// File: functions/src/orders/updateOrderStatus.ts
// Admin Order Status Management

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// Valid status transitions
const STATUS_TRANSITIONS: Record<string, string[]> = {
    'pending': ['confirmed', 'cancelled'],
    'confirmed': ['shipped', 'cancelled'],
    'shipped': ['delivered', 'cancelled'],
    'delivered': [], // Final state
    'cancelled': [],  // Final state
    'refunded': []    // Final state
};

/**
 * Admin-only function to update order status.
 * Enforces state machine transitions.
 */
export const updateOrderStatus = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const { orderId, newStatus, note } = data as {
        orderId: string;
        newStatus: string;
        note?: string;
    };

    // Validate inputs
    if (!orderId || !newStatus) {
        throw new functions.https.HttpsError('invalid-argument', 'Order ID and new status required');
    }

    // Verify admin role
    const userDoc = await db.doc(`users/${userId}`).get();
    if (userDoc.data()?.role !== 'admin') {
        throw new functions.https.HttpsError('permission-denied', 'Admin access required');
    }

    return await db.runTransaction(async (transaction) => {
        const orderRef = db.doc(`orders/${orderId}`);
        const orderSnap = await transaction.get(orderRef);

        if (!orderSnap.exists) {
            throw new functions.https.HttpsError('not-found', 'Order not found');
        }

        const order = orderSnap.data()!;
        const currentStatus = order.status;

        // Validate state transition
        const allowedTransitions = STATUS_TRANSITIONS[currentStatus] || [];
        if (!allowedTransitions.includes(newStatus)) {
            throw new functions.https.HttpsError(
                'failed-precondition',
                `Cannot transition from ${currentStatus} to ${newStatus}. Allowed: ${allowedTransitions.join(', ') || 'none'}`
            );
        }

        // If cancelling, handle refund
        if (newStatus === 'cancelled') {
            const walletRef = db.doc(`wallets/${order.userId}`);
            const walletSnap = await transaction.get(walletRef);

            if (walletSnap.exists) {
                const cashToRefund = order.cashPaid || 0;
                const coinsToRefund = order.coinsRedeemed || 0;

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

                // Create refund transaction log
                const txRef = db.collection('transactions').doc();
                transaction.set(txRef, {
                    userId: order.userId,
                    amount: cashToRefund,
                    coinAmount: coinsToRefund,
                    type: 'credit',
                    category: 'refund',
                    description: `Admin refund for order #${orderId.slice(-8).toUpperCase()}`,
                    orderId: orderId,
                    adminId: userId,
                    timestamp: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // Update order status
        const newStatusHistory = [
            ...(order.statusHistory || []),
            {
                status: newStatus,
                at: admin.firestore.FieldValue.serverTimestamp(),
                by: userId,
                note: note || `Status updated to ${newStatus}`
            }
        ];

        const orderUpdates: any = {
            status: newStatus,
            statusHistory: newStatusHistory,
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        };

        if (newStatus === 'cancelled') {
            orderUpdates.refundReason = note || 'Admin cancelled order';
            orderUpdates.refundedAt = admin.firestore.FieldValue.serverTimestamp();
        }

        transaction.update(orderRef, orderUpdates);

        return {
            success: true,
            message: `Order status updated to ${newStatus}`,
            previousStatus: currentStatus,
            newStatus
        };
    });
});
