// File: functions/src/notifications/orderNotifications.ts
/**
 * Firebase Cloud Messaging (FCM) Order Notifications
 * 
 * Sends push notifications to users when their order status changes.
 * Uses Firestore triggers to automatically notify on status updates.
 */

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();
const messaging = admin.messaging();

// Status display mapping
const STATUS_MESSAGES: Record<string, { title: string; body: string }> = {
    confirmed: {
        title: '✅ Order Confirmed!',
        body: 'Your order has been confirmed and is being prepared.',
    },
    shipped: {
        title: '📦 Order Shipped!',
        body: 'Your order is on its way! Track your delivery in the app.',
    },
    delivered: {
        title: '🎉 Order Delivered!',
        body: 'Your order has been delivered. Enjoy your purchase!',
    },
    cancelled: {
        title: '❌ Order Cancelled',
        body: 'Your order has been cancelled. Refund will be processed shortly.',
    },
    refunded: {
        title: '💰 Refund Processed',
        body: 'Your refund has been processed and will reflect in your wallet.',
    },
};

/**
 * Trigger: Send notification when order status changes
 */
export const onOrderStatusChange = functions.firestore
    .document('orders/{orderId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const orderId = context.params.orderId;

        // Only trigger when status actually changes
        if (before.status === after.status) {
            return null;
        }

        const newStatus = after.status;
        const userId = after.userId;

        functions.logger.info(`[onOrderStatusChange] Order ${orderId} status: ${before.status} → ${newStatus}`);

        // Get notification template
        const notification = STATUS_MESSAGES[newStatus];
        if (!notification) {
            functions.logger.warn(`[onOrderStatusChange] No notification template for status: ${newStatus}`);
            return null;
        }

        try {
            // Get user's FCM token
            const userDoc = await db.doc(`users/${userId}`).get();
            const userData = userDoc.data();
            const fcmToken = userData?.fcmToken;

            if (!fcmToken) {
                functions.logger.info(`[onOrderStatusChange] No FCM token for user ${userId}`);
                // Still create in-app notification
                await createInAppNotification(userId, orderId, newStatus, notification);
                return null;
            }

            // Send push notification
            const message: admin.messaging.Message = {
                token: fcmToken,
                notification: {
                    title: notification.title,
                    body: notification.body,
                },
                data: {
                    type: 'ORDER_STATUS',
                    orderId: orderId,
                    status: newStatus,
                    click_action: 'FLUTTER_NOTIFICATION_CLICK', // For mobile apps
                },
                webpush: {
                    headers: {
                        Urgency: 'high',
                    },
                    notification: {
                        icon: '/icons/icon-192x192.png',
                        badge: '/icons/badge-72x72.png',
                        tag: `order-${orderId}`,
                        requireInteraction: newStatus === 'delivered',
                    },
                    fcmOptions: {
                        link: `/dashboard/user/orders/${orderId}`,
                    },
                },
            };

            await messaging.send(message);
            functions.logger.info(`[onOrderStatusChange] Push notification sent to ${userId}`);

            // Also create in-app notification
            await createInAppNotification(userId, orderId, newStatus, notification);

            return { success: true };
        } catch (error: unknown) {
            // Handle invalid FCM token
            if (error instanceof Error && error.message.includes('not-registered')) {
                functions.logger.warn(`[onOrderStatusChange] Invalid FCM token for user ${userId}, removing...`);
                await db.doc(`users/${userId}`).update({ fcmToken: admin.firestore.FieldValue.delete() });
            } else {
                functions.logger.error(`[onOrderStatusChange] Error sending notification`, error);
            }

            // Still create in-app notification even if push fails
            await createInAppNotification(userId, orderId, newStatus, notification);
            return { success: false };
        }
    });

/**
 * Helper: Create in-app notification document
 */
async function createInAppNotification(
    userId: string,
    orderId: string,
    status: string,
    notification: { title: string; body: string }
) {
    await db.collection('notifications').add({
        userId,
        type: 'ORDER_STATUS',
        title: notification.title,
        body: notification.body,
        data: {
            orderId,
            status,
        },
        read: false,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

/**
 * Trigger: Wallet update notifications
 */
export const onWalletUpdate = functions.firestore
    .document('wallets/{userId}')
    .onUpdate(async (change, context) => {
        const before = change.before.data();
        const after = change.after.data();
        const userId = context.params.userId;

        const cashDiff = (after.cashBalance || 0) - (before.cashBalance || 0);
        const coinDiff = (after.coinBalance || 0) - (before.coinBalance || 0);

        // Only notify on significant changes
        if (cashDiff <= 0 && coinDiff <= 0) {
            return null;
        }

        try {
            const userDoc = await db.doc(`users/${userId}`).get();
            const fcmToken = userDoc.data()?.fcmToken;

            let title = '';
            let body = '';

            if (cashDiff > 0) {
                title = '💰 Cash Credited!';
                body = `₹${cashDiff} has been added to your wallet.`;
            } else if (coinDiff > 0) {
                title = '🪙 Coins Earned!';
                body = `${coinDiff.toLocaleString()} coins have been added to your wallet.`;
            }

            if (!title) return null;

            // Create in-app notification
            await db.collection('notifications').add({
                userId,
                type: 'WALLET_UPDATE',
                title,
                body,
                data: { cashDiff, coinDiff },
                read: false,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
            });

            // Send push if token exists
            if (fcmToken) {
                await messaging.send({
                    token: fcmToken,
                    notification: { title, body },
                    data: {
                        type: 'WALLET_UPDATE',
                        click_action: 'FLUTTER_NOTIFICATION_CLICK',
                    },
                });
            }

            return { success: true };
        } catch (error) {
            functions.logger.error(`[onWalletUpdate] Error`, error);
            return null;
        }
    });

/**
 * Callable: Register/Update FCM Token
 */
export const registerFcmToken = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const { token } = data;
    if (!token || typeof token !== 'string') {
        throw new functions.https.HttpsError('invalid-argument', 'FCM token required');
    }

    const userId = context.auth.uid;

    await db.doc(`users/${userId}`).update({
        fcmToken: token,
        fcmTokenUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});

/**
 * Callable: Mark notification as read
 */
export const markNotificationRead = functions.https.onCall(async (data, context) => {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const { notificationId } = data;
    if (!notificationId) {
        throw new functions.https.HttpsError('invalid-argument', 'notificationId required');
    }

    const userId = context.auth.uid;
    const notifRef = db.doc(`notifications/${notificationId}`);
    const notifDoc = await notifRef.get();

    if (!notifDoc.exists || notifDoc.data()?.userId !== userId) {
        throw new functions.https.HttpsError('not-found', 'Notification not found');
    }

    await notifRef.update({
        read: true,
        readAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { success: true };
});
