import * as functions from "firebase-functions";
import * as admin from "firebase-admin";
import { requirePermission, validateOptionalString } from "./helpers";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

interface AuditLogEntry {
    id: string;
    action: string;
    actorId: string;
    actorName?: string;
    targetId: string;
    targetType: string;
    metadata?: Record<string, any>;
    createdAt: string;
}

interface AuditLogListResponse {
    logs: AuditLogEntry[];
    total: number;
    page: number;
    limit: number;
    hasMore: boolean;
}

interface AuditLogStats {
    totalLogs: number;
    logsToday: number;
    topActions: Array<{ action: string; count: number }>;
    topActors: Array<{ actorId: string; actorName?: string; count: number }>;
}

// ============================================================================
// Get Audit Logs
// ============================================================================

/**
 * Returns paginated list of audit logs with filters.
 */
export const getAdminAuditLogs = functions.https.onCall(
    async (
        data: {
            action?: string;
            actorId?: string;
            targetType?: string;
            targetId?: string;
            fromDate?: string;
            toDate?: string;
            page?: number;
            limit?: number;
        },
        context
    ): Promise<AuditLogListResponse> => {
        await requirePermission(context, "auditlogs.read");

        const { action, actorId, targetType, targetId, fromDate, toDate, page = 1, limit = 50 } = data;

        const validLimit = Math.min(Math.max(1, limit), 200);
        const validPage = Math.max(1, page);
        const offset = (validPage - 1) * validLimit;

        try {
            let query: FirebaseFirestore.Query = db.collection("audit_logs");

            // Apply filters
            if (action) {
                query = query.where("action", "==", action);
            }
            if (actorId) {
                query = query.where("actorId", "==", actorId);
            }
            if (targetType) {
                query = query.where("targetType", "==", targetType);
            }
            if (targetId) {
                query = query.where("targetId", "==", targetId);
            }
            if (fromDate) {
                query = query.where("createdAt", ">=", admin.firestore.Timestamp.fromDate(new Date(fromDate)));
            }
            if (toDate) {
                query = query.where("createdAt", "<=", admin.firestore.Timestamp.fromDate(new Date(toDate)));
            }

            query = query.orderBy("createdAt", "desc");

            // Get total count
            const countSnapshot = await query.count().get();
            const total = countSnapshot.data().count;

            // Get page data
            const snapshot = await query.offset(offset).limit(validLimit).get();

            const logs: AuditLogEntry[] = [];
            snapshot.forEach((doc) => {
                const data = doc.data();
                logs.push({
                    id: doc.id,
                    action: data.action || "",
                    actorId: data.actorId || "",
                    actorName: data.actorName,
                    targetId: data.targetId || "",
                    targetType: data.targetType || "",
                    metadata: data.metadata,
                    createdAt: data.createdAt?.toDate?.().toISOString() || "",
                });
            });

            return {
                logs,
                total,
                page: validPage,
                limit: validLimit,
                hasMore: offset + logs.length < total,
            };
        } catch (error) {
            functions.logger.error("Error getting audit logs:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve audit logs");
        }
    }
);

// ============================================================================
// Get Audit Log Stats
// ============================================================================

/**
 * Returns audit log statistics.
 */
export const getAuditLogStats = functions.https.onCall(
    async (data, context): Promise<AuditLogStats> => {
        await requirePermission(context, "auditlogs.read");

        try {
            const now = new Date();
            const todayStart = new Date(now);
            todayStart.setHours(0, 0, 0, 0);

            // Get total count
            const totalSnapshot = await db.collection("audit_logs").count().get();
            const totalLogs = totalSnapshot.data().count;

            // Get today's count
            const todaySnapshot = await db.collection("audit_logs")
                .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(todayStart))
                .count()
                .get();
            const logsToday = todaySnapshot.data().count;

            // Get top actions (last 7 days)
            const weekAgo = new Date(now);
            weekAgo.setDate(weekAgo.getDate() - 7);

            const recentLogs = await db.collection("audit_logs")
                .where("createdAt", ">=", admin.firestore.Timestamp.fromDate(weekAgo))
                .select("action", "actorId", "actorName")
                .limit(1000)
                .get();

            const actionCounts = new Map<string, number>();
            const actorCounts = new Map<string, { count: number; name?: string }>();

            recentLogs.forEach((doc) => {
                const data = doc.data();

                // Count actions
                const action = data.action;
                actionCounts.set(action, (actionCounts.get(action) || 0) + 1);

                // Count actors
                const actorId = data.actorId;
                const existing = actorCounts.get(actorId) || { count: 0 };
                actorCounts.set(actorId, {
                    count: existing.count + 1,
                    name: data.actorName || existing.name,
                });
            });

            // Sort and get top 5
            const topActions = Array.from(actionCounts.entries())
                .sort((a, b) => b[1] - a[1])
                .slice(0, 5)
                .map(([action, count]) => ({ action, count }));

            const topActors = Array.from(actorCounts.entries())
                .sort((a, b) => b[1].count - a[1].count)
                .slice(0, 5)
                .map(([actorId, { count, name }]) => ({ actorId, actorName: name, count }));

            return {
                totalLogs,
                logsToday,
                topActions,
                topActors,
            };
        } catch (error) {
            functions.logger.error("Error getting audit log stats:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve audit log stats");
        }
    }
);

// ============================================================================
// Get Action Types
// ============================================================================

/**
 * Returns unique action types for filtering.
 */
export const getAuditActionTypes = functions.https.onCall(
    async (data, context): Promise<{ actions: string[] }> => {
        await requirePermission(context, "auditlogs.read");

        try {
            // Get distinct action types from recent logs
            const snapshot = await db.collection("audit_logs")
                .orderBy("createdAt", "desc")
                .limit(500)
                .select("action")
                .get();

            const actionSet = new Set<string>();
            snapshot.forEach((doc) => {
                const action = doc.data().action;
                if (action) actionSet.add(action);
            });

            return {
                actions: Array.from(actionSet).sort(),
            };
        } catch (error) {
            functions.logger.error("Error getting action types:", error);
            throw new functions.https.HttpsError("internal", "Failed to retrieve action types");
        }
    }
);
