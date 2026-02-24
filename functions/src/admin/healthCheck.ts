import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

interface HealthCheckResult {
    status: "healthy" | "degraded" | "unhealthy";
    timestamp: string;
    admin: {
        uid: string;
        role: string | null;
        permissions: string[];
    };
    collections: Record<string, { accessible: boolean; sampleCount: number; error?: string }>;
    functions: Record<string, boolean>;
    latencyMs: number;
}

const CRITICAL_COLLECTIONS = [
    "users",
    "wallets",
    "orders",
    "withdrawals",
    "transactions",
    "products",
    "cooldowns",
    "leaderboards",
];

/**
 * Admin Health Check Callable
 * 
 * Validates:
 * 1. Admin role document exists and has correct permissions
 * 2. Critical Firestore collections are accessible
 * 3. Basic Firestore read latency
 * 
 * Use this as a diagnostic tool when admin pages show empty/broken states.
 */
export const adminHealthCheck = functions.https.onCall(
    async (_data, context): Promise<HealthCheckResult> => {
        // 1. Auth check
        if (!context.auth) {
            throw new functions.https.HttpsError("unauthenticated", "Login required");
        }

        const uid = context.auth.uid;
        const startMs = Date.now();

        // 2. Role document check
        let role: string | null = null;
        let permissions: string[] = [];
        try {
            const userDoc = await db.collection("users").doc(uid).get();
            if (userDoc.exists) {
                const userData = userDoc.data()!;
                role = userData.role || null;
                permissions = userData.permissions || [];
            }
        } catch (error) {
            functions.logger.error("[adminHealthCheck] Failed to read user doc", error);
        }

        // Only admins/sub_admins should use this
        if (role !== "admin" && role !== "sub_admin") {
            throw new functions.https.HttpsError(
                "permission-denied",
                "Only admin users can run health checks"
            );
        }

        // 3. Collection accessibility checks
        const collectionResults: Record<string, { accessible: boolean; sampleCount: number; error?: string }> = {};

        for (const collectionName of CRITICAL_COLLECTIONS) {
            try {
                const snapshot = await db.collection(collectionName).limit(1).get();
                const countSnapshot = await db.collection(collectionName).count().get();
                collectionResults[collectionName] = {
                    accessible: true,
                    sampleCount: countSnapshot.data().count,
                };
            } catch (error: any) {
                collectionResults[collectionName] = {
                    accessible: false,
                    sampleCount: 0,
                    error: error.message || "Unknown error",
                };
            }
        }

        // 4. Determine overall status
        const inaccessible = Object.values(collectionResults).filter(c => !c.accessible);
        let status: "healthy" | "degraded" | "unhealthy" = "healthy";
        if (inaccessible.length > 0 && inaccessible.length < CRITICAL_COLLECTIONS.length) {
            status = "degraded";
        } else if (inaccessible.length === CRITICAL_COLLECTIONS.length) {
            status = "unhealthy";
        }

        const latencyMs = Date.now() - startMs;

        // 5. Log & return
        functions.logger.info(`[adminHealthCheck] status=${status} latency=${latencyMs}ms`, {
            uid,
            role,
            inaccessibleCount: inaccessible.length,
        });

        return {
            status,
            timestamp: new Date().toISOString(),
            admin: {
                uid,
                role,
                permissions,
            },
            collections: collectionResults,
            functions: {},
            latencyMs,
        };
    }
);
