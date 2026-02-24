// File: server/src/routes/users/profile.ts
/**
 * User Profile Write Routes (Wave 1 Writes)
 * 
 * PATCH  /api/users/me/profile   - Update own profile (safe fields)
 * POST   /api/users/me/kyc       - Submit KYC metadata
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';

// Fields that users are allowed to self-update
const SAFE_FIELDS = ['name', 'phone', 'photo_url', 'state', 'city'];

export default async function profileWriteRoutes(fastify: FastifyInstance) {

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
}
