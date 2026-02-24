import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { CreateMultiItemOrderSchema, withValidation } from "../lib/validation";
import { distributePartnerCommission } from "../partner/partner";

const db = admin.firestore();
const COIN_RATE = 0.001; // 1 coin = INR 0.001

interface OrderTransactionResult {
    orderId: string;
    city: string | null;
    cashPaid: number;
}

export const createOrderMultiItem = functions.https.onCall(
    withValidation(CreateMultiItemOrderSchema, async (data, context) => {
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Login required");
        }

        const userId = context.auth.uid;
        const { items, useCoins = 0, shippingAddress } = data;

        // Rate limiting: max 5 orders per hour per user.
        const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
        const recentOrders = await db
            .collection("orders")
            .where("userId", "==", userId)
            .where("createdAt", ">=", oneHourAgo)
            .get();

        if (recentOrders.size >= 5) {
            throw new functions.https.HttpsError(
                "resource-exhausted",
                "Order limit reached. Maximum 5 orders per hour. Please try again later."
            );
        }

        const userDoc = await db.doc(`users/${userId}`).get();
        const userData = userDoc.data() || {};
        const userCity = (userData.city as string | undefined) || shippingAddress.city;

        try {
            const result = await db.runTransaction(async (transaction): Promise<OrderTransactionResult> => {
                const walletRef = db.doc(`wallets/${userId}`);
                const walletSnap = await transaction.get(walletRef);

                if (!walletSnap.exists) {
                    throw new functions.https.HttpsError("not-found", "Wallet not found");
                }

                const wallet = walletSnap.data() || {};
                const walletCashBalance = Number(wallet.cashBalance || 0);
                const walletCoinBalance = Number(wallet.coinBalance || 0);

                const productRefs = items.map((item) => db.doc(`products/${item.productId}`));
                const productSnaps = await Promise.all(productRefs.map((ref) => transaction.get(ref)));

                let subtotal = 0;
                const orderItems: Array<{
                    productId: string;
                    productName: string;
                    productImage: string | null;
                    quantity: number;
                    unitPrice: number;
                    coinPrice: number | null;
                    vendorId: string | null;
                }> = [];

                for (let i = 0; i < items.length; i += 1) {
                    const productSnap = productSnaps[i];
                    const item = items[i];

                    if (!productSnap.exists) {
                        throw new functions.https.HttpsError("not-found", `Product ${item.productId} not found`);
                    }

                    const product = productSnap.data() || {};
                    const productName = String(product.name || "Product");
                    const trackedStock =
                        typeof product.stock === "number" ? Number(product.stock) : null;
                    const isInStock =
                        typeof product.inStock === "boolean"
                            ? Boolean(product.inStock)
                            : trackedStock === null || trackedStock > 0;

                    if (!isInStock) {
                        throw new functions.https.HttpsError("failed-precondition", `${productName} is out of stock`);
                    }

                    if (trackedStock !== null && item.quantity > trackedStock) {
                        throw new functions.https.HttpsError(
                            "failed-precondition",
                            `Insufficient stock for ${productName}. Only ${trackedStock} available.`
                        );
                    }

                    const unitPrice = Number(product.price || 0);
                    if (unitPrice <= 0) {
                        throw new functions.https.HttpsError(
                            "failed-precondition",
                            `${productName} is currently unavailable for purchase`
                        );
                    }

                    subtotal += unitPrice * item.quantity;

                    orderItems.push({
                        productId: item.productId,
                        productName,
                        productImage:
                            typeof product.image === "string" && product.image.length > 0
                                ? product.image
                                : null,
                        quantity: item.quantity,
                        unitPrice,
                        coinPrice: typeof product.coinPrice === "number" ? product.coinPrice : null,
                        vendorId: typeof product.vendorId === "string" ? product.vendorId : null,
                    });
                }

                const vendorIds = [...new Set(orderItems.map((item) => item.vendorId).filter(Boolean))];
                const coinsToUse = Math.min(useCoins, walletCoinBalance);
                const requestedCoinValue = coinsToUse * COIN_RATE;
                const usableCoinValue = Math.min(requestedCoinValue, subtotal);
                const actualCoinsDeducted = Math.floor(usableCoinValue / COIN_RATE);
                const actualCoinValueUsed = actualCoinsDeducted * COIN_RATE;
                const cashNeeded = Math.max(0, subtotal - actualCoinValueUsed);

                if (cashNeeded > 0 && walletCashBalance < cashNeeded) {
                    throw new functions.https.HttpsError(
                        "failed-precondition",
                        `Insufficient cash balance. Need INR ${cashNeeded.toFixed(2)}`
                    );
                }

                if (actualCoinsDeducted > walletCoinBalance) {
                    throw new functions.https.HttpsError("failed-precondition", "Insufficient coin balance");
                }

                const walletUpdates: Record<string, unknown> = {
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                };
                if (cashNeeded > 0) {
                    walletUpdates.cashBalance = admin.firestore.FieldValue.increment(-cashNeeded);
                }
                if (actualCoinsDeducted > 0) {
                    walletUpdates.coinBalance = admin.firestore.FieldValue.increment(-actualCoinsDeducted);
                }
                transaction.update(walletRef, walletUpdates);

                for (let i = 0; i < items.length; i += 1) {
                    const product = productSnaps[i].data() || {};
                    if (typeof product.stock === "number") {
                        transaction.update(productRefs[i], {
                            stock: admin.firestore.FieldValue.increment(-items[i].quantity),
                            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                        });
                    }
                }

                const orderRef = db.collection("orders").doc();
                transaction.set(orderRef, {
                    userId,
                    userEmail: userData.email || null,
                    userName: userData.name || null,
                    items: orderItems,
                    vendorIds,
                    subtotal,
                    cashPaid: cashNeeded,
                    coinsRedeemed: actualCoinsDeducted,
                    coinValue: actualCoinValueUsed,
                    shippingAddress,
                    city: userCity || null,
                    status: "pending",
                    statusHistory: [
                        {
                            status: "pending",
                            at: admin.firestore.FieldValue.serverTimestamp(),
                            note: "Order placed",
                        },
                    ],
                    createdAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                });

                const txRef = db.collection("transactions").doc();
                transaction.set(txRef, {
                    userId,
                    amount: cashNeeded,
                    coinAmount: actualCoinsDeducted,
                    type: "debit",
                    category: "purchase",
                    description: `Order: ${orderItems.length} item(s)`,
                    orderId: orderRef.id,
                    timestamp: admin.firestore.FieldValue.serverTimestamp(),
                });

                return {
                    orderId: orderRef.id,
                    city: userCity || null,
                    cashPaid: cashNeeded,
                };
            });

            if (result.cashPaid > 0 && result.city) {
                await distributePartnerCommission(
                    result.city,
                    result.cashPaid,
                    "purchase",
                    result.orderId,
                    userId
                );
            }

            return { success: true, orderId: result.orderId };
        } catch (error: unknown) {
            if (error instanceof functions.https.HttpsError) {
                throw error;
            }

            functions.logger.error("[createOrderMultiItem] Unexpected error", {
                uid: userId,
                error,
            });
            throw new functions.https.HttpsError("internal", "Failed to create order");
        }
    })
);
