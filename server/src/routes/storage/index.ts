// File: server/src/routes/storage/index.ts
/**
 * Presigned URL Upload Endpoints (Wave 3 - Phase 8 Storage)
 * 
 * POST /api/storage/presign - Generates a secure, temporary upload URL to R2.
 */

import { FastifyInstance } from 'fastify';
import { generatePresignedUploadUrl } from '../../utils/storage.js';
import { randomUUID } from 'crypto';
import path from 'path';
import { requireAuth } from '../../middleware/auth.js';

export default async function storageRoutes(fastify: FastifyInstance) {

    // ─── Generate Presigned URL ───────────────────────────────────
    fastify.post('/api/storage/presign', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;

        if (!userId) {
            return reply.status(401).send({
                error: { code: 'UNAUTHORIZED', message: 'Authentication required' },
            });
        }

        const body = request.body as {
            filename: string;
            contentType: string;
            folder?: string;
        };

        if (!body.filename || !body.contentType) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'filename and contentType are required' },
            });
        }

        // Security constraints on the MIME type
        const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
        if (!allowedTypes.includes(body.contentType)) {
            return reply.status(400).send({
                error: { code: 'INVALID_FILE_TYPE', message: 'File type not allowed' },
            });
        }

        // Constraint: 10MB approx limit if relying purely on backend proxy,
        // Note: To restrict size dynamically via standard S3 forms, we'd need POST policies.
        // getSignedUrl uses PUT, limiting size natively is harder client side unless checked before submission.

        const folderName = (body.folder || 'misc').trim();
        if (!/^[a-zA-Z0-9/_-]{1,100}$/.test(folderName) || folderName.includes('..')) {
            return reply.status(400).send({
                error: { code: 'INVALID_FOLDER', message: 'Invalid folder path' },
            });
        }

        const ext = path.extname(body.filename) || '';
        const uniqueName = `${randomUUID()}${ext}`;

        // Structure: user_id/folder/uuid.ext for isolation and safety
        const key = `users/${userId}/${folderName}/${uniqueName}`;

        try {
            const { uploadUrl } = await generatePresignedUploadUrl(key, body.contentType);

            return {
                data: {
                    uploadUrl,
                    key,
                }
            };
        } catch (err) {
            fastify.log.error(err, 'Failed to generate presigned URL');
            return reply.status(500).send({
                error: { code: 'INTERNAL_ERROR', message: 'Failed to prepare upload' },
            });
        }
    });
}
