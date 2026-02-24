import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import {
    requirePermission,
    writeAuditLog,
    validateRequiredString,
    validateOptionalString,
    checkIdempotency,
    markIdempotencyComplete
} from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface FeatureFlag {
    id: string;
    name: string;
    description?: string;
    enabled: boolean;
    targetRoles?: string[];
    targetCities?: string[];
    rolloutPercentage?: number;
    createdAt: string;
    updatedAt?: string;
    updatedBy?: string;
}

interface FeatureFlagListResponse {
    flags: FeatureFlag[];
    total: number;
}

// ============================================================================
// Get Feature Flags
// ============================================================================

/**
 * Returns all feature flags.
 */
export const getFeatureFlags = functions.https.onCall(
    async (data, context): Promise<FeatureFlagListResponse> => {
        await requirePermission(context, "featureflags.manage");

        try {
            const snapshot = await db.collection("feature_flags")
                .orderBy("name")
                .get();

            const flags: FeatureFlag[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                flags.push({
                    id: doc.id,
                    name: data.name || doc.id,
                    description: data.description,
                    enabled: data.enabled ?? false,
                    targetRoles: data.targetRoles,
                    targetCities: data.targetCities,
                    rolloutPercentage: data.rolloutPercentage,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                    updatedAt: data.updatedAt?.toDate?.().toISOString(),
                    updatedBy: data.updatedBy,
                });
            });

            return {
                flags,
                total: flags.length,
            };
        } catch (error) {
            functions.logger.error("Error getting feature flags:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve feature flags");
        }
    }
);

// ============================================================================
// Create Feature Flag
// ============================================================================

/**
 * Creates a new feature flag.
 */
export const createFeatureFlag = functions.https.onCall(
    async (
        data: {
            name: string;
            description?: string;
            enabled?: boolean;
            targetRoles?: string[];
            targetCities?: string[];
            rolloutPercentage?: number;
        },
        context
    ): Promise<{ success: boolean; flagId: string }> => {
        const adminContext = await requirePermission(context, "featureflags.manage");

        const name = validateRequiredString(data.name, "name");
        const description = validateOptionalString(data.description, "description");

        // Validate name format (lowercase, underscores)
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            throw new functions.https.HttpsError(
                "invalid-argument",
                "Flag name must be lowercase with underscores (e.g., 'new_checkout_flow')"
            );
        }

        try {
            // Check if flag already exists
            const existing = await db.collection("feature_flags").doc(name).get();
            if (existing.exists) {
                throw new functions.https.HttpsError("already-exists", "Feature flag already exists");
            }

            const flagData = {
                name,
                description: description || null,
                enabled: data.enabled ?? false,
                targetRoles: data.targetRoles || null,
                targetCities: data.targetCities || null,
                rolloutPercentage: data.rolloutPercentage ?? 100,
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                createdBy: adminContext.uid,
            };

            await db.collection("feature_flags").doc(name).set(flagData);

            await writeAuditLog(
                "FEATURE_FLAG_CREATED",
                adminContext.uid,
                name,
                "settings",
                { flagData }
            );

            functions.logger.info(`Feature flag created: ${name} by ${adminContext.uid}`);

            return { success: true, flagId: name };
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error creating feature flag:", error);
            throw new functions.https.HttpsError("internal", "Failed to create feature flag");
        }
    }
);

// ============================================================================
// Update Feature Flag
// ============================================================================

/**
 * Updates an existing feature flag.
 */
export const updateFeatureFlag = functions.https.onCall(
    async (
        data: {
            flagId: string;
            requestId: string;
            enabled?: boolean;
            description?: string;
            targetRoles?: string[];
            targetCities?: string[];
            rolloutPercentage?: number;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "featureflags.manage");

        const flagId = validateRequiredString(data.flagId, "flagId");
        const requestId = validateRequiredString(data.requestId, "requestId");

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "FEATURE_FLAG_UPDATE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const flagRef = db.collection("feature_flags").doc(flagId);
            const flagDoc = await flagRef.get();

            if (!flagDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Feature flag not found");
            }

            const previousData = flagDoc.data()!;
            const updateData: Record<string, any> = {
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: adminContext.uid,
            };

            if (data.enabled !== undefined) updateData.enabled = data.enabled;
            if (data.description !== undefined) updateData.description = data.description || null;
            if (data.targetRoles !== undefined) updateData.targetRoles = data.targetRoles || null;
            if (data.targetCities !== undefined) updateData.targetCities = data.targetCities || null;
            if (data.rolloutPercentage !== undefined) {
                if (data.rolloutPercentage < 0 || data.rolloutPercentage > 100) {
                    throw new functions.https.HttpsError("invalid-argument", "Rollout percentage must be 0-100");
                }
                updateData.rolloutPercentage = data.rolloutPercentage;
            }

            await flagRef.update(updateData);

            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            await writeAuditLog(
                "FEATURE_FLAG_UPDATED",
                adminContext.uid,
                flagId,
                "settings",
                { previous: previousData, updates: updateData }
            );

            functions.logger.info(`Feature flag updated: ${flagId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error updating feature flag:", error);
            throw new functions.https.HttpsError("internal", "Failed to update feature flag");
        }
    }
);

// ============================================================================
// Delete Feature Flag
// ============================================================================

/**
 * Deletes a feature flag.
 */
export const deleteFeatureFlag = functions.https.onCall(
    async (
        data: { flagId: string; requestId: string },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "featureflags.manage");

        const flagId = validateRequiredString(data.flagId, "flagId");
        const requestId = validateRequiredString(data.requestId, "requestId");

        const { isNew, existingResult } = await checkIdempotency(
            requestId,
            "FEATURE_FLAG_DELETE",
            adminContext.uid
        );

        if (!isNew) {
            return existingResult || { success: true };
        }

        try {
            const flagRef = db.collection("feature_flags").doc(flagId);
            const flagDoc = await flagRef.get();

            if (!flagDoc.exists) {
                throw new functions.https.HttpsError("not-found", "Feature flag not found");
            }

            const flagData = flagDoc.data()!;
            await flagRef.delete();

            const result = { success: true };
            await markIdempotencyComplete(requestId, result);

            await writeAuditLog(
                "FEATURE_FLAG_DELETED",
                adminContext.uid,
                flagId,
                "settings",
                { deletedFlag: flagData }
            );

            functions.logger.info(`Feature flag deleted: ${flagId} by ${adminContext.uid}`);

            return result;
        } catch (error) {
            if (error instanceof functions.https.HttpsError) throw error;
            functions.logger.error("Error deleting feature flag:", error);
            throw new functions.https.HttpsError("internal", "Failed to delete feature flag");
        }
    }
);

// ============================================================================
// Check Feature Flag (Client-side)
// ============================================================================

/**
 * Checks if a feature flag is enabled for the calling user.
 * This is a lightweight check for client-side feature gating.
 */
export const checkFeatureFlag = functions.https.onCall(
    async (
        data: { flagName: string },
        context
    ): Promise<{ enabled: boolean }> => {
        if (!context.auth) {
            return { enabled: false };
        }

        const flagName = validateRequiredString(data.flagName, "flagName");

        try {
            const flagDoc = await db.collection("feature_flags").doc(flagName).get();

            if (!flagDoc.exists) {
                return { enabled: false };
            }

            const flag = flagDoc.data()!;

            // If globally disabled, return false
            if (!flag.enabled) {
                return { enabled: false };
            }

            // Check target roles
            if (flag.targetRoles && flag.targetRoles.length > 0) {
                const userDoc = await db.collection("users").doc(context.auth.uid).get();
                const userRole = userDoc.data()?.role;
                if (!flag.targetRoles.includes(userRole)) {
                    return { enabled: false };
                }
            }

            // Check target cities
            if (flag.targetCities && flag.targetCities.length > 0) {
                const userDoc = await db.collection("users").doc(context.auth.uid).get();
                const userCity = userDoc.data()?.city;
                if (!flag.targetCities.includes(userCity)) {
                    return { enabled: false };
                }
            }

            // Check rollout percentage
            if (flag.rolloutPercentage !== undefined && flag.rolloutPercentage < 100) {
                // Use user ID as seed for consistent rollout
                const hash = context.auth.uid.split('').reduce((a, b) => {
                    a = ((a << 5) - a) + b.charCodeAt(0);
                    return a & a;
                }, 0);
                const userPercentile = Math.abs(hash) % 100;
                if (userPercentile >= flag.rolloutPercentage) {
                    return { enabled: false };
                }
            }

            return { enabled: true };
        } catch (error) {
            functions.logger.error("Error checking feature flag:", error);
            return { enabled: false };
        }
    }
);
