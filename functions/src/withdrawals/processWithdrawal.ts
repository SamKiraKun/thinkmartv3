import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const processWithdrawal = functions.https.onCall(
  async (
    data: { userId: string; amount: number; method: string; bankDetails?: any },
    context
  ) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { userId, amount, method, bankDetails } = data;
      const MIN_WITHDRAWAL = 100;

      // Validate amount
      if (amount < MIN_WITHDRAWAL) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          `Minimum withdrawal is $${MIN_WITHDRAWAL}`
        );
      }

      // Get user wallet
      const walletDoc = await admin
        .firestore()
        .collection("wallets")
        .doc(userId)
        .get();

      if (!walletDoc.exists) {
        throw new functions.https.HttpsError("not-found", "Wallet not found");
      }

      const wallet = walletDoc.data();
      if (wallet?.balance < amount) {
        throw new functions.https.HttpsError(
          "invalid-argument",
          "Insufficient balance"
        );
      }

      // Create withdrawal request
      const withdrawalDoc = {
        userId,
        amount,
        method,
        bankDetails: bankDetails || null,
        status: "pending",
        requestedAt: admin.firestore.FieldValue.serverTimestamp(),
        processedAt: null,
        rejectionReason: null,
      };

      const docRef = await admin
        .firestore()
        .collection("withdrawals")
        .add(withdrawalDoc);

      // Deduct from wallet
      await admin
        .firestore()
        .collection("wallets")
        .doc(userId)
        .update({
          balance: admin.firestore.FieldValue.increment(-amount),
          lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
        });

      functions.logger.info(
        `Withdrawal request created: ${docRef.id} for user ${userId}`
      );

      return { success: true, withdrawalId: docRef.id };
    } catch (error) {
      functions.logger.error("Error processing withdrawal", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error processing withdrawal"
      );
    }
  }
);

export const approveWithdrawal = functions.https.onCall(
  async (data: { withdrawalId: string }, context) => {
    // Only admin
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { withdrawalId } = data;

      await admin
        .firestore()
        .collection("withdrawals")
        .doc(withdrawalId)
        .update({
          status: "approved",
          processedAt: admin.firestore.FieldValue.serverTimestamp(),
        });

      functions.logger.info(`Withdrawal ${withdrawalId} approved`);

      return { success: true };
    } catch (error) {
      functions.logger.error("Error approving withdrawal", error);
      throw new functions.https.HttpsError(
        "internal",
        "Error approving withdrawal"
      );
    }
  }
);
