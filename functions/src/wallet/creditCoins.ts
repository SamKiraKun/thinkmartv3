import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const creditCoins = functions.https.onCall(
  async (
    data: { userId: string; amount: number; reason: string },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { userId, amount, reason } = data;

      // Update wallet
      await admin
        .firestore()
        .collection("wallets")
        .doc(userId)
        .update({
          coins: admin.firestore.FieldValue.increment(amount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

      // Log transaction
      await admin.firestore().collection("transactions").add({
        userId,
        amount,
        type: "credit",
        description: reason,
        timestamp: admin.firestore.FieldValue.serverTimestamp(),
      });

      functions.logger.info(`Credited ${amount} coins to user ${userId}`);

      return { success: true };
    } catch (error) {
      functions.logger.error("Error crediting coins", error);
      throw new functions.https.HttpsError("internal", "Error crediting coins");
    }
  }
);

export const convertCoins = functions.https.onCall(
  async (data: { userId: string; coins: number }, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { userId, coins } = data;
      const conversionRate = 0.01; // 1 coin = $0.01

      const balance = coins * conversionRate;

      // Update wallet
      await admin
        .firestore()
        .collection("wallets")
        .doc(userId)
        .update({
          coins: admin.firestore.FieldValue.increment(-coins),
          balance: admin.firestore.FieldValue.increment(balance),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

      functions.logger.info(
        `Converted ${coins} coins to $${balance} for user ${userId}`
      );

      return { success: true, balance };
    } catch (error) {
      functions.logger.error("Error converting coins", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error converting coins"
      );
    }
  }
);
