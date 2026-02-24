import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

export const banUser = functions.https.onCall(
  async (data: { userId: string; reason: string }, context) => {
    // Only admin
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { userId, reason } = data;

      // Check if caller is admin
      const callerDoc = await admin
        .firestore()
        .collection("users")
        .doc(context.auth.uid)
        .get();

      if (callerDoc.data()?.role !== "admin") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only admins can ban users"
        );
      }

      // Ban user
      await admin
        .firestore()
        .collection("users")
        .doc(userId)
        .update({
          isActive: false,
          bannedAt: admin.firestore.FieldValue.serverTimestamp(),
          banReason: reason,
        });

      // Disable auth user
      await admin.auth().updateUser(userId, { disabled: true });

      functions.logger.info(`User ${userId} banned. Reason: ${reason}`);

      return { success: true };
    } catch (error) {
      functions.logger.error("Error banning user", error);
      throw new functions.https.HttpsError("internal", "Error banning user");
    }
  }
);

export const exportData = functions.https.onCall(
  async (data: { format: string }, context) => {
    // Only admin
    if (!context.auth) {
      throw new functions.https.HttpsError(
        "unauthenticated",
        "User must be authenticated"
      );
    }

    try {
      const { format } = data;

      // Check if caller is admin
      const callerDoc = await admin
        .firestore()
        .collection("users")
        .doc(context.auth.uid)
        .get();

      if (callerDoc.data()?.role !== "admin") {
        throw new functions.https.HttpsError(
          "permission-denied",
          "Only admins can export data"
        );
      }

      // Export data (implement based on format)
      functions.logger.info(`Data export requested in ${format} format`);

      return { success: true, message: "Export initiated" };
    } catch (error) {
      functions.logger.error("Error exporting data", error);
      throw new functions.https.HttpsError("internal", "Error exporting data");
    }
  }
);
