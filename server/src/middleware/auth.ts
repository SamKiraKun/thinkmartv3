// File: server/src/middleware/auth.ts
/**
 * Firebase Auth middleware.
 * Verifies Firebase ID tokens and loads user context from TursoDB.
 *
 * This is the auth bridge: Firebase Auth remains for identity,
 * but role/state is resolved from TursoDB.
 */

import type { FastifyRequest, FastifyReply, FastifyInstance } from 'fastify';
import { initializeApp, cert, getApps, type ServiceAccount } from 'firebase-admin/app';
import { getAuth, type DecodedIdToken } from 'firebase-admin/auth';
import { getDb } from '../db/client.js';
import { logger } from '../config/logger.js';
import { env } from '../config/env.js';
import { UnauthorizedError, ForbiddenError } from '../utils/errors.js';
import { readFileSync, existsSync } from 'fs';

// ─── Firebase Admin Initialization ──────────────────────────────────
function initFirebaseAdmin() {
    if (getApps().length > 0) return;

    const credPath = env.GOOGLE_APPLICATION_CREDENTIALS;

    if (credPath && existsSync(credPath)) {
        const serviceAccount = JSON.parse(
            readFileSync(credPath, 'utf-8')
        ) as ServiceAccount;
        initializeApp({ credential: cert(serviceAccount) });
        logger.info('Firebase Admin initialized with service account file');
    } else if (env.FIREBASE_PROJECT_ID) {
        // Cloud environments with default credentials
        initializeApp({ projectId: env.FIREBASE_PROJECT_ID });
        logger.info('Firebase Admin initialized with project ID');
    } else {
        // Try default credentials (GCP, etc.)
        initializeApp();
        logger.info('Firebase Admin initialized with default credentials');
    }
}

// Initialize on module load
initFirebaseAdmin();

// ─── Types ──────────────────────────────────────────────────────────

export type UserRole = 'user' | 'admin' | 'sub_admin' | 'vendor' | 'partner' | 'organization';

export interface RequestUser {
    uid: string;
    email: string;
    role: UserRole;
    isActive: boolean;
    isBanned: boolean;
    name: string;
    membershipActive: boolean;
}

// Extend Fastify request type
declare module 'fastify' {
    interface FastifyRequest {
        user?: RequestUser;
        userId?: string;
    }
}

// ─── Token Verification ─────────────────────────────────────────────

export async function verifyFirebaseToken(token: string): Promise<DecodedIdToken> {
    const hasServiceAccountFile =
        Boolean(env.GOOGLE_APPLICATION_CREDENTIALS) &&
        existsSync(env.GOOGLE_APPLICATION_CREDENTIALS);

    try {
        // Revocation checks require admin credentials that can call Firebase Auth APIs.
        // On some hosts (e.g. Render without a mounted service account), verifying the
        // token itself works but revocation checks fail with credential errors.
        return await getAuth().verifyIdToken(token, hasServiceAccountFile);
    } catch (err) {
        const code = typeof err === 'object' && err && 'code' in err ? String((err as { code?: unknown }).code) : '';
        const message =
            typeof err === 'object' && err && 'message' in err
                ? String((err as { message?: unknown }).message)
                : '';

        const looksLikeCredentialIssue =
            code.startsWith('app/') ||
            code === 'auth/insufficient-permission' ||
            /credential|permission|iam|metadata server|access token/i.test(message);

        // Fallback: skip revocation check if the host lacks Firebase Admin credentials.
        // This preserves auth for production traffic while still validating signature/issuer/audience.
        if (hasServiceAccountFile && looksLikeCredentialIssue) {
            logger.warn({ code, message }, 'Revocation check failed due to Firebase Admin credentials; retrying without revocation check');
            try {
                return await getAuth().verifyIdToken(token, false);
            } catch {
                // Fall through to normalized unauthorized error below.
            }
        }

        logger.warn(
            {
                code,
                message,
                hasServiceAccountFile,
                firebaseProjectId: env.FIREBASE_PROJECT_ID ?? null,
            },
            'Firebase token verification failed'
        );
        logger.debug({ err }, 'Firebase token verification failed (raw)');
        throw new UnauthorizedError('Invalid or expired token');
    }
}

// ─── User Context Loader ────────────────────────────────────────────

export async function loadUserFromDb(uid: string): Promise<RequestUser | null> {
    const db = getDb();
    const result = await db.execute({
        sql: `SELECT uid, email, name, role, is_active, is_banned, membership_active 
          FROM users WHERE uid = ?`,
        args: [uid],
    });

    if (result.rows.length === 0) return null;

    const row = result.rows[0];
    return {
        uid: row.uid as string,
        email: row.email as string,
        name: row.name as string,
        role: row.role as UserRole,
        isActive: Boolean(row.is_active),
        isBanned: Boolean(row.is_banned),
        membershipActive: Boolean(row.membership_active),
    };
}

// ─── Auth Middleware (Fastify preHandler hook) ───────────────────────

/**
 * Require authentication on a route.
 * Extracts Firebase ID token from Authorization header,
 * verifies it, and loads user context from TursoDB.
 */
export async function requireAuth(
    request: FastifyRequest,
    reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        throw new UnauthorizedError('Missing or invalid Authorization header');
    }

    const token = authHeader.slice(7);
    const decoded = await verifyFirebaseToken(token);

    // Load user from TursoDB (source of truth for role/state)
    const user = await loadUserFromDb(decoded.uid);

    if (!user) {
        // User exists in Firebase but not in TursoDB
        // This can happen during migration or if registration didn't complete
        throw new UnauthorizedError(
            'User profile not found. Please complete registration.'
        );
    }

    if (user.isBanned) {
        throw new ForbiddenError('Account has been suspended');
    }

    if (!user.isActive) {
        throw new ForbiddenError('Account is not active');
    }

    request.user = user;
    request.userId = user.uid; // Backward-compatible alias for older route handlers
}

/**
 * Optional auth - does not fail if no token is provided,
 * but will populate request.user if a valid token is present.
 */
export async function optionalAuth(
    request: FastifyRequest,
    _reply: FastifyReply
): Promise<void> {
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return; // No auth - continue without user context
    }

    try {
        const token = authHeader.slice(7);
        const decoded = await verifyFirebaseToken(token);
        const user = await loadUserFromDb(decoded.uid);
        if (user && !user.isBanned && user.isActive) {
            request.user = user;
            request.userId = user.uid; // Backward-compatible alias for older route handlers
        }
    } catch {
        // Silently ignore auth errors for optional auth
    }
}

// ─── Role Guard Plugin ──────────────────────────────────────────────

export function requireRole(...roles: UserRole[]) {
    return async function roleGuard(
        request: FastifyRequest,
        _reply: FastifyReply
    ): Promise<void> {
        if (!request.user) {
            throw new UnauthorizedError('Authentication required');
        }

        if (!roles.includes(request.user.role)) {
            throw new ForbiddenError(
                `Requires one of roles: ${roles.join(', ')}`
            );
        }
    };
}
