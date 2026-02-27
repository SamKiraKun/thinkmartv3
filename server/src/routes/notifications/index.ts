// File: server/src/routes/notifications/index.ts
/**
 * Notifications Routes
 *
 * GET  /api/notifications          - Get user notifications (paginated)
 * POST /api/notifications/:id/read - Mark a single notification as read
 * POST /api/notifications/read-all - Mark all notifications as read
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function notificationRoutes(fastify: FastifyInstance) {

    // ─── Get Notifications ────────────────────────────────────────
    fastify.get('/api/notifications', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50')));
        const page = Math.max(1, parseInt(query.page || '1'));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: 'SELECT COUNT(*) as total FROM notifications WHERE user_id = ?',
            args: [userId],
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM notifications
                  WHERE user_id = ?
                  ORDER BY created_at DESC
                  LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
        });

        const items = result.rows.map((row) => ({
            id: row.id,
            type: row.type,
            title: row.title,
            body: row.body,
            data: row.data ? JSON.parse(row.data as string) : null,
            isRead: Boolean(row.is_read),
            createdAt: row.created_at,
            readAt: row.read_at || null,
        }));

        return paginatedResponse(items, total, page, limit);
    });

    // ─── Mark Single as Read ──────────────────────────────────────
    fastify.post('/api/notifications/:id/read', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        const existing = await db.execute({
            sql: 'SELECT id FROM notifications WHERE id = ? AND user_id = ?',
            args: [id, userId],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Notification not found' },
            });
        }

        await db.execute({
            sql: `UPDATE notifications SET is_read = 1, read_at = ? WHERE id = ? AND user_id = ?`,
            args: [new Date().toISOString(), id, userId],
        });

        return { data: { updated: true } };
    });

    // ─── Mark All as Read ──────────────────────────────────────────
    fastify.post('/api/notifications/read-all', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;

        await db.execute({
            sql: `UPDATE notifications SET is_read = 1, read_at = ? WHERE user_id = ? AND is_read = 0`,
            args: [new Date().toISOString(), userId],
        });

        return { data: { updated: true } };
    });
}
