import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission, writeAuditLog, checkIdempotency, markIdempotencyComplete } from "./helpers";

const db = admin.firestore();

// ============================================================================
// ADMIN SETTINGS MANAGEMENT
// ============================================================================

interface AdminSettings {
    // Economy settings
    minWithdrawalAmount: number;
    maxWithdrawalAmount: number;
    dailyWithdrawalLimit: number;
    withdrawalFeePercent: number;

    // Referral settings
    referralBonusAmount: number;
    referralCommissionPercent: number;
    orgCommissionPercent: number;
    partnerCommissionPercent: number;

    // Task settings
    dailyTaskLimit: number;
    taskCooldownMinutes: number;

    // Game settings
    dailySpinLimit: number;
    dailyLuckyBoxLimit: number;

    // Platform settings
    maintenanceMode: boolean;
    signupsEnabled: boolean;
    withdrawalsEnabled: boolean;

    updatedAt?: string;
    updatedBy?: string;
}

interface PublicSettings {
    maintenanceMode?: boolean;
    signupsEnabled?: boolean;
    withdrawalsEnabled?: boolean;
    updatedAt?: admin.firestore.FieldValue | string;
    updatedBy?: string;
}

/**
 * Get all admin settings
 */
export const getAdminSettings = functions.https.onCall(
    async (data, context): Promise<{ settings: AdminSettings }> => {
        await requirePermission(context, "settings.manage");

        const settingsDoc = await db.collection("admin_settings").doc("global").get();

        if (!settingsDoc.exists) {
            // Return defaults if no settings exist
            return {
                settings: {
                    minWithdrawalAmount: 100,
                    maxWithdrawalAmount: 50000,
                    dailyWithdrawalLimit: 100000,
                    withdrawalFeePercent: 0,
                    referralBonusAmount: 10,
                    referralCommissionPercent: 5,
                    orgCommissionPercent: 10,
                    partnerCommissionPercent: 20,
                    dailyTaskLimit: 10,
                    taskCooldownMinutes: 5,
                    dailySpinLimit: 3,
                    dailyLuckyBoxLimit: 3,
                    maintenanceMode: false,
                    signupsEnabled: true,
                    withdrawalsEnabled: true,
                },
            };
        }

        return { settings: settingsDoc.data() as AdminSettings };
    }
);

/**
 * Update admin settings with validation and audit logging
 */
export const updateAdminSettings = functions.https.onCall(
    async (
        data: {
            requestId: string;
            settings: Partial<AdminSettings>;
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "settings.manage");

        const { requestId, settings } = data;

        if (!requestId) {
            throw new functions.https.HttpsError("invalid-argument", "Request ID required");
        }

        // Idempotency check
        const idempotencyResult = await checkIdempotency(requestId, "updateAdminSettings", adminContext.uid);
        if (!idempotencyResult.isNew) {
            return { success: true };
        }

        // Validate settings
        const validKeys: (keyof AdminSettings)[] = [
            "minWithdrawalAmount",
            "maxWithdrawalAmount",
            "dailyWithdrawalLimit",
            "withdrawalFeePercent",
            "referralBonusAmount",
            "referralCommissionPercent",
            "orgCommissionPercent",
            "partnerCommissionPercent",
            "dailyTaskLimit",
            "taskCooldownMinutes",
            "dailySpinLimit",
            "dailyLuckyBoxLimit",
            "maintenanceMode",
            "signupsEnabled",
            "withdrawalsEnabled",
        ];

        const sanitizedSettings: Partial<AdminSettings> = {};
        for (const key of validKeys) {
            if (settings[key] !== undefined) {
                sanitizedSettings[key] = settings[key] as any;
            }
        }

        // Validate numeric bounds
        if (sanitizedSettings.minWithdrawalAmount !== undefined && sanitizedSettings.minWithdrawalAmount < 0) {
            throw new functions.https.HttpsError("invalid-argument", "Min withdrawal cannot be negative");
        }
        if (sanitizedSettings.withdrawalFeePercent !== undefined &&
            (sanitizedSettings.withdrawalFeePercent < 0 || sanitizedSettings.withdrawalFeePercent > 100)) {
            throw new functions.https.HttpsError("invalid-argument", "Fee percent must be 0-100");
        }
        if (sanitizedSettings.partnerCommissionPercent !== undefined && sanitizedSettings.partnerCommissionPercent > 50) {
            throw new functions.https.HttpsError("invalid-argument", "Partner commission cannot exceed 50%");
        }

        // Get current settings for audit
        const currentDoc = await db.collection("admin_settings").doc("global").get();
        const currentSettings = currentDoc.exists ? currentDoc.data() : {};

        // Update settings
        await db.collection("admin_settings").doc("global").set(
            {
                ...sanitizedSettings,
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedBy: adminContext.uid,
            },
            { merge: true }
        );

        // Keep public-safe flags in a separate document for unauthenticated reads.
        const publicSettings: PublicSettings = {};
        if (sanitizedSettings.maintenanceMode !== undefined) {
            publicSettings.maintenanceMode = sanitizedSettings.maintenanceMode;
        }
        if (sanitizedSettings.signupsEnabled !== undefined) {
            publicSettings.signupsEnabled = sanitizedSettings.signupsEnabled;
        }
        if (sanitizedSettings.withdrawalsEnabled !== undefined) {
            publicSettings.withdrawalsEnabled = sanitizedSettings.withdrawalsEnabled;
        }
        if (Object.keys(publicSettings).length > 0) {
            await db.collection("public_settings").doc("global").set(
                {
                    ...publicSettings,
                    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                    updatedBy: adminContext.uid,
                },
                { merge: true }
            );
        }

        // Mark idempotency complete
        await markIdempotencyComplete(requestId, "updateAdminSettings");

        // Audit log
        await writeAuditLog(
            "SETTINGS_UPDATED",
            adminContext.uid,
            "global",
            "settings",
            {
                changes: sanitizedSettings,
                previousValues: Object.keys(sanitizedSettings).reduce((acc, key) => {
                    acc[key] = currentSettings ? currentSettings[key] : null;
                    return acc;
                }, {} as Record<string, any>),
            }
        );

        return { success: true };
    }
);

// ============================================================================
// GAME CONFIGURATION
// ============================================================================

interface GameConfig {
    id: string;
    type: "spin_wheel" | "lucky_box";
    name: string;
    enabled: boolean;
    dailyLimit: number;
    cooldownMinutes: number;
    prizes: Array<{
        id: string;
        label: string;
        value: number;
        probability: number;
        color?: string;
    }>;
    updatedAt?: string;
    updatedBy?: string;
}

/**
 * Get all game configurations
 */
export const getGameConfigs = functions.https.onCall(
    async (data, context): Promise<{ configs: GameConfig[] }> => {
        await requirePermission(context, "games.configure");

        const configsSnapshot = await db.collection("game_configs").get();
        const configs: GameConfig[] = [];

        configsSnapshot.forEach((doc) => {
            configs.push({ id: doc.id, ...doc.data() } as GameConfig);
        });

        return { configs };
    }
);

/**
 * Update a game configuration
 */
export const updateGameConfig = functions.https.onCall(
    async (
        data: {
            configId: string;
            requestId: string;
            enabled?: boolean;
            dailyLimit?: number;
            cooldownMinutes?: number;
            prizes?: GameConfig["prizes"];
        },
        context
    ): Promise<{ success: boolean }> => {
        const adminContext = await requirePermission(context, "games.configure");

        const { configId, requestId, enabled, dailyLimit, cooldownMinutes, prizes } = data;

        if (!configId || !requestId) {
            throw new functions.https.HttpsError("invalid-argument", "Config ID and request ID required");
        }

        // Idempotency check
        const idempotencyResult = await checkIdempotency(requestId, "updateGameConfig", adminContext.uid);
        if (!idempotencyResult.isNew) {
            return { success: true };
        }

        const configRef = db.collection("game_configs").doc(configId);
        const configDoc = await configRef.get();

        if (!configDoc.exists) {
            throw new functions.https.HttpsError("not-found", "Game config not found");
        }

        const currentConfig = configDoc.data() as GameConfig;

        // Validate prizes probabilities sum to 100 if provided
        if (prizes) {
            const totalProbability = prizes.reduce((sum, p) => sum + p.probability, 0);
            if (Math.abs(totalProbability - 100) > 0.01) {
                throw new functions.https.HttpsError(
                    "invalid-argument",
                    `Prize probabilities must sum to 100, got ${totalProbability}`
                );
            }
        }

        // Build update object
        const updates: Partial<GameConfig> = {
            updatedAt: new Date().toISOString(),
            updatedBy: adminContext.uid,
        };

        if (enabled !== undefined) updates.enabled = enabled;
        if (dailyLimit !== undefined) updates.dailyLimit = dailyLimit;
        if (cooldownMinutes !== undefined) updates.cooldownMinutes = cooldownMinutes;
        if (prizes !== undefined) updates.prizes = prizes;

        await configRef.update(updates);

        // Mark idempotency complete
        await markIdempotencyComplete(requestId, "updateGameConfig");

        // Audit log
        await writeAuditLog(
            "GAME_CONFIG_UPDATED",
            adminContext.uid,
            configId,
            "settings",
            {
                gameType: currentConfig.type,
                changes: updates,
            }
        );

        return { success: true };
    }
);

// ============================================================================
// COMMISSION LOGS
// ============================================================================

interface CommissionLog {
    id: string;
    type: "partner" | "organization" | "referral";
    recipientId: string;
    recipientName?: string;
    sourceUserId: string;
    sourceUserName?: string;
    amount: number;
    percentage: number;
    sourceTransaction?: string;
    city?: string;
    createdAt: string;
}

/**
 * Get commission logs with filters
 */
export const getCommissionLogs = functions.https.onCall(
    async (
        data: {
            type?: string;
            city?: string;
            recipientId?: string;
            fromDate?: string;
            toDate?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<{ logs: CommissionLog[]; total: number; hasMore: boolean }> => {
        await requirePermission(context, "commissions.configure");

        const { type, city, recipientId, fromDate, toDate, page = 1, limit = 50 } = data;

        let query: admin.firestore.Query = db.collection("commission_logs")
            .orderBy("createdAt", "desc");

        if (type) {
            query = query.where("type", "==", type);
        }

        if (city) {
            query = query.where("city", "==", city);
        }

        if (recipientId) {
            query = query.where("recipientId", "==", recipientId);
        }

        if (fromDate) {
            query = query.where("createdAt", ">=", fromDate);
        }

        if (toDate) {
            query = query.where("createdAt", "<=", toDate);
        }

        // Get total count (approximate)
        const countSnapshot = await query.count().get();
        const total = countSnapshot.data().count;

        // Paginate
        const offset = (page - 1) * limit;
        const snapshot = await query.offset(offset).limit(limit + 1).get();

        const logs: CommissionLog[] = [];
        snapshot.docs.slice(0, limit).forEach((doc) => {
            logs.push({ id: doc.id, ...doc.data() } as CommissionLog);
        });

        return {
            logs,
            total,
            hasMore: snapshot.docs.length > limit,
        };
    }
);
