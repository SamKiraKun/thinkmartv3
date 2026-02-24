// File: functions/src/audit/auditLog.ts
// Audit Logging for Admin and Sub-Admin Actions

import * as functions from 'firebase-functions';
import * as admin from 'firebase-admin';

const db = admin.firestore();

// ============================================================================
// TYPES
// ============================================================================

export interface AuditLogEntry {
    action: string;           // e.g., 'user.update', 'partner.assign', 'withdrawal.approve'
    actorId: string;          // UID of admin/sub-admin performing action
    actorRole: 'admin' | 'sub_admin';
    actorEmail?: string;
    targetType: string;       // e.g., 'user', 'product', 'withdrawal'
    targetId: string;         // ID of affected entity
    changes?: {
        before: Record<string, any>;
        after: Record<string, any>;
    };
    metadata?: Record<string, any>;
    ip?: string;
    timestamp: FirebaseFirestore.FieldValue;
}

// ============================================================================
// HELPER: Create Audit Log
// ============================================================================

/**
 * Creates an audit log entry for admin/sub-admin actions.
 * Called internally by other functions.
 */
export async function createAuditLog(entry: Omit<AuditLogEntry, 'timestamp'>): Promise<string> {
    const logRef = db.collection('audit_logs').doc();

    await logRef.set({
        ...entry,
        timestamp: admin.firestore.FieldValue.serverTimestamp()
    });

    functions.logger.info(`[AUDIT] ${entry.actorRole}:${entry.actorId} performed ${entry.action} on ${entry.targetType}:${entry.targetId}`);

    return logRef.id;
}

// ============================================================================
// HELPER: Require Sub-Admin Permission
// ============================================================================

export type SubAdminPermission =
    | 'manage_users'
    | 'manage_products'
    | 'manage_orders'
    | 'view_analytics'
    | 'process_withdrawals'
    | 'manage_tasks'
    | 'manage_kyc';

/**
 * Checks if user is admin (full access) or sub-admin with specific permission.
 * Throws if unauthorized.
 */
export async function requireAdminPermission(
    context: functions.https.CallableContext,
    requiredPermission?: SubAdminPermission
): Promise<{
    userId: string;
    role: 'admin' | 'sub_admin';
    email: string;
}> {
    if (!context.auth) {
        throw new functions.https.HttpsError('unauthenticated', 'Login required');
    }

    const userId = context.auth.uid;
    const userDoc = await db.doc(`users/${userId}`).get();

    if (!userDoc.exists) {
        throw new functions.https.HttpsError('not-found', 'User not found');
    }

    const userData = userDoc.data()!;
    const role = userData.role;

    // Admins have full access
    if (role === 'admin') {
        return {
            userId,
            role: 'admin',
            email: userData.email || ''
        };
    }

    // Sub-admins need specific permission
    if (role === 'sub_admin') {
        const permissions: SubAdminPermission[] = userData.subAdminPermissions || [];

        if (requiredPermission && !permissions.includes(requiredPermission)) {
            throw new functions.https.HttpsError(
                'permission-denied',
                `Permission denied: ${requiredPermission} required`
            );
        }

        return {
            userId,
            role: 'sub_admin',
            email: userData.email || ''
        };
    }

    // Not admin or sub-admin
    throw new functions.https.HttpsError('permission-denied', 'Admin access required');
}

// ============================================================================
// CLOUD FUNCTION: Log Admin Action (callable for frontend audit)
// ============================================================================

export const logAdminAction = functions.https.onCall(async (data, context) => {
    const { userId, role, email } = await requireAdminPermission(context);

    const { action, targetType, targetId, changes, metadata } = data;

    if (!action || !targetType || !targetId) {
        throw new functions.https.HttpsError('invalid-argument', 'Missing required fields');
    }

    const logId = await createAuditLog({
        action,
        actorId: userId,
        actorRole: role,
        actorEmail: email,
        targetType,
        targetId,
        changes,
        metadata
    });

    return { success: true, logId };
});

// ============================================================================
// CLOUD FUNCTION: Get Audit Logs (Admin Only)
// ============================================================================

export const getAuditLogs = functions.https.onCall(async (data, context) => {
    await requireAdminPermission(context, 'view_analytics');

    const { limit: queryLimit = 50, startAfter, action, actorId, targetType } = data || {};

    let query: FirebaseFirestore.Query = db.collection('audit_logs')
        .orderBy('timestamp', 'desc')
        .limit(Math.min(queryLimit, 100));

    if (action) {
        query = query.where('action', '==', action);
    }
    if (actorId) {
        query = query.where('actorId', '==', actorId);
    }
    if (targetType) {
        query = query.where('targetType', '==', targetType);
    }

    if (startAfter) {
        const startDoc = await db.doc(`audit_logs/${startAfter}`).get();
        if (startDoc.exists) {
            query = query.startAfter(startDoc);
        }
    }

    const snapshot = await query.get();
    const logs = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
    }));

    return { success: true, logs };
});
