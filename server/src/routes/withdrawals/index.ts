// File: server/src/routes/withdrawals/index.ts
/**
 * Withdrawal Routes (Read for Wave 2)
 * 
 * GET /api/withdrawals         - User's withdrawal history (paginated)
 * GET /api/withdrawals/summary - Quick stats (total withdrawn, pending count)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function withdrawalRoutes(fastify: FastifyInstance) {

    // ─── User's Withdrawal History ────────────────────────────────
    fastify.get('/api/withdrawals', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10')));
        const offset = (page - 1) * limit;
        const status = query.status; // pending, processing, completed, rejected

        const conditions: string[] = ['user_id = ?'];
        const params: any[] = [userId];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM withdrawals ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM withdrawals ${where} ORDER BY requested_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const withdrawals = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            amount: row.amount,
            method: row.method,
            status: row.status,
            bankDetails: row.bank_details ? JSON.parse(row.bank_details as string) : null,
            upiId: row.upi_id,
            rejectionReason: row.rejection_reason,
            adminNotes: row.admin_notes,
            requestedAt: row.requested_at,
            processedAt: row.processed_at,
            processedBy: row.processed_by,
        }));

        return paginatedResponse(withdrawals, total, page, limit);
    });

    // ─── Withdrawal Summary ───────────────────────────────────────
    fastify.get('/api/withdrawals/summary', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const result = await db.execute({
            sql: `SELECT 
              COUNT(*) as total_requests,
              SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END) as total_withdrawn,
              SUM(CASE WHEN status = 'pending' THEN amount ELSE 0 END) as pending_amount,
              SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending_count,
              SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected_count
            FROM withdrawals WHERE user_id = ?`,
            args: [userId],
        });

        const row = result.rows[0];
        return {
            data: {
                totalRequests: Number(row.total_requests),
                totalWithdrawn: Number(row.total_withdrawn) || 0,
                pendingAmount: Number(row.pending_amount) || 0,
                pendingCount: Number(row.pending_count) || 0,
                rejectedCount: Number(row.rejected_count) || 0,
            },
        };
    });
}
