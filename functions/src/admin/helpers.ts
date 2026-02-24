import * as functions from "firebase-functions";
import * as admin from "firebase-admin";

const db = admin.firestore();

// ============================================================================
// Types
// ============================================================================

export type AdminPermission =
    | "users.read"
    | "users.write"
    | "kyc.read"
    | "kyc.approve"
    | "withdrawals.read"
    | "withdrawals.approve"
    | "wallet.adjust"
    | "marketplace.moderate"
    | "orders.manage"
    | "vendors.manage"
    | "tasks.manage"
    | "games.configure"
    | "partners.manage"
    | "orgs.manage"
    | "commissions.configure"
    | "settings.manage"
    | "featureflags.manage"
    | "notifications.send"
    | "auditlogs.read"
    | "analytics.read";

export interface AdminContext {
    uid: string;
    role: string;
    permissions: AdminPermission[];
    isFullAdmin: boolean;
}

const ADMIN_PERMISSION_VALUES: AdminPermission[] = [
    "users.read",
    "users.write",
    "kyc.read",
    "kyc.approve",
    "withdrawals.read",
    "withdrawals.approve",
    "wallet.adjust",
    "marketplace.moderate",
    "orders.manage",
    "vendors.manage",
    "tasks.manage",
    "games.configure",
    "partners.manage",
    "orgs.manage",
    "commissions.configure",
    "settings.manage",
    "featureflags.manage",
    "notifications.send",
    "auditlogs.read",
    "analytics.read",
];

const LEGACY_PERMISSION_MAP: Record<string, AdminPermission[]> = {
    manage_users: ["users.read", "users.write", "wallet.adjust"],
    manage_products: ["marketplace.moderate", "vendors.manage"],
    manage_orders: ["orders.manage"],
    view_analytics: ["analytics.read"],
    process_withdrawals: ["withdrawals.read", "withdrawals.approve"],
    manage_tasks: ["tasks.manage"],
    manage_kyc: ["kyc.read", "kyc.approve"],
    manage_partners: ["partners.manage"],
    manage_orgs: ["orgs.manage"],
    manage_settings: ["settings.manage", "commissions.configure", "games.configure"],
    manage_feature_flags: ["featureflags.manage"],
    view_audit_logs: ["auditlogs.read"],
};

function normalizePermissionValue(value: unknown): AdminPermission[] {
    if (typeof value !== "string") {
        return [];
    }

    const normalized = value.trim().toLowerCase();
    if (!normalized) {
        return [];
    }

    if ((ADMIN_PERMISSION_VALUES as string[]).includes(normalized)) {
        return [normalized as AdminPermission];
    }

    return LEGACY_PERMISSION_MAP[normalized] || [];
}

function collectPermissions(...sources: unknown[]): AdminPermission[] {
    const result = new Set<AdminPermission>();

    const pushValue = (value: unknown) => {
        normalizePermissionValue(value).forEach((permission) => result.add(permission));
    };

    const walk = (source: unknown) => {
        if (Array.isArray(source)) {
            source.forEach((value) => walk(value));
            return;
        }

        if (typeof source === "string") {
            pushValue(source);
        }
    };

    sources.forEach((source) => walk(source));
    return Array.from(result);
}

export interface AuditLogEntry {
    action: string;
    actorId: string;
    actorName?: string | null;
    targetId: string;
    targetType: "user" | "withdrawal" | "kyc" | "order" | "product" | "partner" | "settings";
    metadata?: Record<string, any> | null;
    createdAt: FirebaseFirestore.FieldValue;
}

// ============================================================================
// Admin Role Check
// ============================================================================

/**
 * Verifies caller is an admin or sub_admin.
 * Returns admin context with permissions.
 */
export async function requireAdminRole(
    context: functions.https.CallableContext
): Promise<AdminContext> {
    if (!context.auth) {
        throw new functions.https.HttpsError(
            "unauthenticated",
            "Authentication required"
        );
    }

    const uid = context.auth.uid;
    const userDoc = await db.collection("users").doc(uid).get();

    if (!userDoc.exists) {
        functions.logger.error(`[requireAdminRole] No user document found for uid=${uid}`);
        throw new functions.https.HttpsError(
            "permission-denied",
            `Admin role document missing for user ${uid}. Ensure the user document exists in the 'users' collection with a valid 'role' field.`
        );
    }

    const userData = userDoc.data()!;
    const normalizeRole = (value: unknown): string => {
        const raw = String(value || "").trim().toLowerCase();
        if (raw === "subadmin") return "sub_admin";
        return raw;
    };

    const docRole = normalizeRole(userData.role);
    const tokenRole = normalizeRole(context.auth.token?.role);
    const roleCandidates = [docRole, tokenRole].filter((value) => Boolean(value));
    const role = roleCandidates.includes("admin")
        ? "admin"
        : roleCandidates.includes("sub_admin")
            ? "sub_admin"
            : roleCandidates[0] || "";

    // Check if user is admin or sub_admin
    if (role !== "admin" && role !== "sub_admin") {
        functions.logger.warn(`[requireAdminRole] uid=${uid} has role='${role}' (required: admin|sub_admin)`);
        throw new functions.https.HttpsError(
            "permission-denied",
            `Admin access required. Current role is '${role || 'none'}'. Please contact a platform administrator to grant admin access.`
        );
    }

    // Full admin has all permissions
    if (role === "admin") {
        return {
            uid,
            role,
            permissions: [], // Admin has implicit full access
            isFullAdmin: true,
        };
    }

    // Sub-admin: load explicit permissions
    const permDoc = await db.collection("admin_permissions").doc(uid).get();
    const permissions = collectPermissions(
        permDoc.data()?.permissions,
        userData.permissions,
        userData.adminPermissions,
        userData.subAdminPermissions,
        context.auth.token?.permissions,
        context.auth.token?.subAdminPermissions
    );

    return {
        uid,
        role,
        permissions,
        isFullAdmin: false,
    };
}

// ============================================================================
// Permission Check
// ============================================================================

/**
 * Verifies caller has a specific permission.
 * Full admins pass all checks automatically.
 */
export async function requirePermission(
    context: functions.https.CallableContext,
    permission: AdminPermission
): Promise<AdminContext> {
    const adminContext = await requireAdminRole(context);

    // Full admin bypasses permission checks
    if (adminContext.isFullAdmin) {
        return adminContext;
    }

    // Sub-admin must have explicit permission
    if (!adminContext.permissions.includes(permission)) {
        throw new functions.https.HttpsError(
            "permission-denied",
            `Permission '${permission}' required`
        );
    }

    return adminContext;
}

// ============================================================================
// Audit Logging
// ============================================================================

/**
 * Writes an immutable audit log entry.
 * This is append-only - entries cannot be modified or deleted.
 */
export async function writeAuditLog(
    action: string,
    actorId: string,
    targetId: string,
    targetType: AuditLogEntry["targetType"],
    metadata?: Record<string, any>
): Promise<string> {
    // Get actor name for readability
    let actorName: string | null = null;
    try {
        const actorDoc = await db.collection("users").doc(actorId).get();
        actorName = actorDoc.data()?.name || null;
    } catch {
        // Ignore - name is optional
    }

    const logEntry: AuditLogEntry = {
        action,
        actorId,
        actorName: actorName || null,
        targetId,
        targetType,
        metadata: metadata || null,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    };

    const logRef = await db.collection("audit_logs").add(logEntry);

    functions.logger.info(`Audit: ${action} by ${actorId} on ${targetType}/${targetId}`);

    return logRef.id;
}

// ============================================================================
// Idempotency Helper
// ============================================================================

/**
 * Prevents duplicate execution of sensitive operations.
 * Returns true if this is a new request, false if already processed.
 */
export async function checkIdempotency(
    requestId: string,
    actionType: string,
    actorId: string
): Promise<{ isNew: boolean; existingResult?: any }> {
    const keyRef = db.collection("idempotency_keys").doc(requestId);

    const existing = await keyRef.get();
    if (existing.exists) {
        const data = existing.data()!;
        return { isNew: false, existingResult: data.result };
    }

    // Create pending key
    await keyRef.set({
        actionType,
        actorId,
        status: "pending",
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    return { isNew: true };
}

/**
 * Marks an idempotency key as completed with result.
 */
export async function markIdempotencyComplete(
    requestId: string,
    result: any
): Promise<void> {
    await db.collection("idempotency_keys").doc(requestId).update({
        status: "complete",
        result,
        completedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Validates required string fields.
 */
export function validateRequiredString(
    value: any,
    fieldName: string
): string {
    if (typeof value !== "string" || value.trim() === "") {
        throw new functions.https.HttpsError(
            "invalid-argument",
            `${fieldName} is required`
        );
    }
    return value.trim();
}

/**
 * Validates optional string fields.
 */
export function validateOptionalString(
    value: any,
    fieldName: string
): string | null {
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "string") {
        throw new functions.https.HttpsError(
            "invalid-argument",
            `${fieldName} must be a string`
        );
    }
    return value.trim() || null;
}

/**
 * Validates positive number fields.
 */
export function validatePositiveNumber(
    value: any,
    fieldName: string
): number {
    if (typeof value !== "number" || isNaN(value) || value <= 0) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            `${fieldName} must be a positive number`
        );
    }
    return value;
}

/**
 * Validates enum values.
 */
export function validateEnum<T extends string>(
    value: any,
    fieldName: string,
    allowedValues: readonly T[]
): T {
    if (!allowedValues.includes(value)) {
        throw new functions.https.HttpsError(
            "invalid-argument",
            `${fieldName} must be one of: ${allowedValues.join(", ")}`
        );
    }
    return value;
}
