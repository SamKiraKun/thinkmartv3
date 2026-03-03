// File: server/src/routes/users/profile.ts
/**
 * User Profile Write Routes (Wave 1 Writes)
 * 
 * PATCH  /api/users/me/profile   - Update own profile (safe fields)
 * POST   /api/users/me/kyc       - Submit KYC metadata
 * PATCH  /api/users/me/password  - Change password (Firebase-backed)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { getAuth } from 'firebase-admin/auth';

// Fields that users are allowed to self-update
const SAFE_FIELDS = ['name', 'phone', 'photo_url', 'state', 'city'];
const userSettingsKey = (uid: string) => `user_settings:${uid}`;

type UserSettingsDto = {
    taskReminders: boolean;
    orderUpdates: boolean;
    updatedAt?: string;
    updatedBy?: string;
};

function normalizeUserSettings(value: unknown, updatedAt?: string, updatedBy?: string): UserSettingsDto {
    let raw: Record<string, unknown> = {};
    if (typeof value === 'string') {
        try {
            raw = JSON.parse(value) as Record<string, unknown>;
        } catch {
            raw = {};
        }
    }
    return {
        taskReminders: raw.taskReminders === undefined ? true : Boolean(raw.taskReminders),
        orderUpdates: raw.orderUpdates === undefined ? true : Boolean(raw.orderUpdates),
        updatedAt,
        updatedBy,
    };
}

function mapFirebasePasswordError(message: string): string {
    const code = String(message || '').toUpperCase();
    if (code.includes('INVALID_PASSWORD') || code.includes('INVALID_LOGIN_CREDENTIALS')) {
        return 'Current password is incorrect';
    }
    if (code.includes('TOO_MANY_ATTEMPTS_TRY_LATER')) {
        return 'Too many failed attempts. Please try again later.';
    }
    return 'Unable to verify current password';
}

async function verifyCurrentPasswordViaFirebase(email: string, currentPassword: string): Promise<void> {
    const apiKey = env.FIREBASE_WEB_API_KEY;
    if (!apiKey) {
        const err = new Error('FIREBASE_WEB_API_KEY_NOT_CONFIGURED');
        (err as any).code = 'FIREBASE_WEB_API_KEY_NOT_CONFIGURED';
        throw err;
    }

    const response = await fetch(
        `https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=${encodeURIComponent(apiKey)}`,
        {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                email,
                password: currentPassword,
                returnSecureToken: false,
            }),
        }
    );

    if (!response.ok) {
        let errorMessage = 'UNKNOWN';
        try {
            const body = await response.json() as any;
            errorMessage = String(body?.error?.message || errorMessage);
        } catch {
            // Ignore parsing failures and use default message.
        }
        const err = new Error(errorMessage);
        (err as any).code = 'FIREBASE_VERIFY_FAILED';
        throw err;
    }
}

export default async function profileWriteRoutes(fastify: FastifyInstance) {
    fastify.get('/api/users/me/settings', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;
        const result = await db.execute({
            sql: `SELECT value, updated_at, updated_by FROM settings WHERE key = ?`,
            args: [userSettingsKey(userId)],
        });
        const row = result.rows[0] as Record<string, any> | undefined;
        return {
            data: normalizeUserSettings(
                row?.value,
                row?.updated_at ? String(row.updated_at) : undefined,
                row?.updated_by ? String(row.updated_by) : undefined
            ),
        };
    });

    fastify.patch('/api/users/me/settings', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;
        const body = (request.body || {}) as Partial<UserSettingsDto>;

        const currentRes = await db.execute({
            sql: `SELECT value FROM settings WHERE key = ?`,
            args: [userSettingsKey(userId)],
        });
        const current = normalizeUserSettings(currentRes.rows[0]?.value);
        const next: UserSettingsDto = {
            taskReminders:
                body.taskReminders === undefined
                    ? current.taskReminders
                    : Boolean(body.taskReminders),
            orderUpdates:
                body.orderUpdates === undefined
                    ? current.orderUpdates
                    : Boolean(body.orderUpdates),
        };
        const now = new Date().toISOString();
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [userSettingsKey(userId), JSON.stringify(next), now, userId],
        });

        return {
            data: {
                ...next,
                updatedAt: now,
                updatedBy: userId,
            },
        };
    });

    // ─── Update Own Profile ───────────────────────────────────────
    fastify.patch('/api/users/me/profile', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as Record<string, any>;

        // Map camelCase input to snake_case columns
        const fieldMap: Record<string, string> = {
            name: 'name',
            phone: 'phone',
            photoURL: 'photo_url',
            state: 'state',
            city: 'city',
        };

        const updates: string[] = [];
        const params: any[] = [];

        for (const [inputKey, colName] of Object.entries(fieldMap)) {
            if (body[inputKey] !== undefined) {
                if (!SAFE_FIELDS.includes(colName)) continue; // Extra safety
                updates.push(`${colName} = ?`);
                params.push(body[inputKey]);
            }
        }

        if (updates.length === 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'No valid fields to update' },
            });
        }

        // Name validation
        if (body.name !== undefined) {
            const name = (body.name as string).trim();
            if (name.length < 2 || name.length > 100) {
                return reply.status(400).send({
                    error: { code: 'VALIDATION_ERROR', message: 'Name must be between 2 and 100 characters' },
                });
            }
        }

        // Phone validation
        if (body.phone !== undefined) {
            const phone = (body.phone as string).trim();
            if (phone && !/^\+?[\d\s-]{7,15}$/.test(phone)) {
                return reply.status(400).send({
                    error: { code: 'VALIDATION_ERROR', message: 'Invalid phone number format' },
                });
            }
        }

        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(userId);

        await db.execute({
            sql: `UPDATE users SET ${updates.join(', ')} WHERE uid = ?`,
            args: params,
        });

        return { data: { updated: true } };
    });

    // ─── Submit KYC ───────────────────────────────────────────────
    // --- Change Own Password ---
    fastify.patch('/api/users/me/password', { preHandler: [requireAuth] }, async (request, reply) => {
        const body = (request.body || {}) as {
            currentPassword?: string;
            newPassword?: string;
        };

        const currentPassword = String(body.currentPassword || '');
        const newPassword = String(body.newPassword || '');

        if (!currentPassword || !newPassword) {
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'currentPassword and newPassword are required',
                },
            });
        }

        if (newPassword.length < 6) {
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'newPassword must be at least 6 characters',
                },
            });
        }

        if (currentPassword === newPassword) {
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: 'New password must be different from current password',
                },
            });
        }

        try {
            // If not configured, return 404 so existing client fallback can use Firebase SDK.
            await verifyCurrentPasswordViaFirebase(request.user!.email, currentPassword);
        } catch (err: any) {
            if (String(err?.code || '') === 'FIREBASE_WEB_API_KEY_NOT_CONFIGURED') {
                return reply.status(404).send({
                    error: { code: 'NOT_FOUND', message: 'Password endpoint not configured' },
                });
            }

            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: mapFirebasePasswordError(String(err?.message || '')),
                },
            });
        }

        await getAuth().updateUser(request.user!.uid, { password: newPassword });
        await getAuth().revokeRefreshTokens(request.user!.uid);

        return reply.send({ data: { updated: true } });
    });

    fastify.post('/api/users/me/kyc', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as {
            fullName: string;
            dateOfBirth: string;
            address: string;
            city: string;
            state: string;
            pincode: string;
            idType: string;
            idNumber: string;
            bankName: string;
            accountNumber: string;
            ifscCode: string;
            idDocumentUrl?: string;
            addressProofUrl?: string;
        };

        // Basic validation
        const required = ['fullName', 'dateOfBirth', 'address', 'city', 'state', 'pincode', 'idType', 'idNumber', 'bankName', 'accountNumber', 'ifscCode'];
        const missing = required.filter(f => !body[f as keyof typeof body]);
        if (missing.length > 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: `Missing required fields: ${missing.join(', ')}` },
            });
        }

        // Check current KYC status
        const current = await db.execute({
            sql: 'SELECT kyc_status FROM users WHERE uid = ?',
            args: [userId],
        });

        if (!current.rows[0]) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        const currentStatus = current.rows[0].kyc_status;
        if (currentStatus === 'verified') {
            return reply.status(409).send({
                error: { code: 'ALREADY_VERIFIED', message: 'KYC is already verified' },
            });
        }

        const kycData = JSON.stringify({
            fullName: body.fullName.trim(),
            dateOfBirth: body.dateOfBirth,
            address: body.address.trim(),
            city: body.city.trim(),
            state: body.state.trim(),
            pincode: body.pincode.trim(),
            idType: body.idType,
            idNumber: body.idNumber.trim(),
            bankName: body.bankName.trim(),
            accountNumber: body.accountNumber.trim(),
            ifscCode: body.ifscCode.trim().toUpperCase(),
            idDocumentUrl: body.idDocumentUrl?.trim() || null,
            addressProofUrl: body.addressProofUrl?.trim() || null,
        });

        await db.execute({
            sql: `UPDATE users SET kyc_status = 'pending', kyc_data = ?, updated_at = ? WHERE uid = ?`,
            args: [kycData, new Date().toISOString(), userId],
        });

        return { data: { kycStatus: 'pending' } };
    });

    // ─── PUT alias for KYC (Flutter sends PUT) ────────────────────
    fastify.put('/api/users/me/kyc', { preHandler: [requireAuth] }, async (request, reply) => {
        // Delegate to the POST handler logic by re-routing the body
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as {
            fullName: string;
            dateOfBirth: string;
            address: string;
            city: string;
            state: string;
            pincode: string;
            idType: string;
            idNumber: string;
            bankName: string;
            accountNumber: string;
            ifscCode: string;
            idDocumentUrl?: string;
            addressProofUrl?: string;
        };

        const current = await db.execute({
            sql: 'SELECT kyc_status FROM users WHERE uid = ?',
            args: [userId],
        });

        if (!current.rows[0]) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'User not found' } });
        }

        if (current.rows[0].kyc_status === 'verified') {
            return reply.status(409).send({ error: { code: 'ALREADY_VERIFIED', message: 'KYC is already verified' } });
        }

        const kycData = JSON.stringify({
            fullName: (body.fullName || '').trim(),
            dateOfBirth: body.dateOfBirth,
            address: (body.address || '').trim(),
            city: (body.city || '').trim(),
            state: (body.state || '').trim(),
            pincode: (body.pincode || '').trim(),
            idType: body.idType,
            idNumber: (body.idNumber || '').trim(),
            bankName: (body.bankName || '').trim(),
            accountNumber: (body.accountNumber || '').trim(),
            ifscCode: (body.ifscCode || '').trim().toUpperCase(),
            idDocumentUrl: body.idDocumentUrl?.trim() || null,
            addressProofUrl: body.addressProofUrl?.trim() || null,
        });

        await db.execute({
            sql: `UPDATE users SET kyc_status = 'pending', kyc_data = ?, updated_at = ? WHERE uid = ?`,
            args: [kycData, new Date().toISOString(), userId],
        });

        return { data: { kycStatus: 'pending' } };
    });
}
