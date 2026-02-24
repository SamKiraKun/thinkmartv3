// File: server/src/routes/wallet/index.ts
/**
 * Wallet routes (read-only for now).
 * Financial writes come in Phase 7.
 */

import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { validateQuery } from '../../middleware/validate.js';
import { getDb } from '../../db/client.js';
import { paginationSchema, paginate, getOffset } from '../../utils/pagination.js';
import { z } from 'zod';

const transactionQuerySchema = paginationSchema.extend({
    type: z.string().optional(),
    currency: z.enum(['COIN', 'INR', 'CASH']).optional(),
});

export async function walletRoutes(app: FastifyInstance) {
    /**
     * GET /api/wallet
     * Get the authenticated user's wallet balance.
     */
    app.get(
        '/api/wallet',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const db = getDb();
            const result = await db.execute({
                sql: 'SELECT * FROM wallets WHERE user_id = ?',
                args: [request.user!.uid],
            });

            if (result.rows.length === 0) {
                return reply.send({
                    data: {
                        userId: request.user!.uid,
                        coinBalance: 0,
                        cashBalance: 0,
                        totalEarnings: 0,
                        totalWithdrawals: 0,
                    },
                });
            }

            const row = result.rows[0];
            return reply.send({
                data: {
                    userId: row.user_id,
                    coinBalance: row.coin_balance,
                    cashBalance: row.cash_balance,
                    totalEarnings: row.total_earnings,
                    totalWithdrawals: row.total_withdrawals,
                    updatedAt: row.updated_at,
                },
            });
        }
    );

    /**
     * GET /api/wallet/transactions
     * Get paginated transaction history for the authenticated user.
     */
    app.get(
        '/api/wallet/transactions',
        {
            preHandler: [requireAuth, validateQuery(transactionQuerySchema)],
        },
        async (request, reply) => {
            const db = getDb();
            const query = request.query as z.infer<typeof transactionQuerySchema>;
            const offset = getOffset(query);

            // Build WHERE clause
            const conditions = ['user_id = ?'];
            const args: (string | number)[] = [request.user!.uid];

            if (query.type) {
                conditions.push('type = ?');
                args.push(query.type);
            }
            if (query.currency) {
                conditions.push('currency = ?');
                args.push(query.currency);
            }

            const whereClause = conditions.join(' AND ');

            // Get total count
            const countResult = await db.execute({
                sql: `SELECT COUNT(*) as total FROM transactions WHERE ${whereClause}`,
                args,
            });
            const total = Number(countResult.rows[0].total);

            // Get paginated results
            const dataResult = await db.execute({
                sql: `SELECT * FROM transactions 
              WHERE ${whereClause} 
              ORDER BY created_at DESC
              LIMIT ? OFFSET ?`,
                args: [...args, query.limit, offset],
            });

            const transactions = dataResult.rows.map((row) => ({
                id: row.id,
                userId: row.user_id,
                type: row.type,
                amount: row.amount,
                currency: row.currency,
                status: row.status,
                description: row.description,
                relatedUserId: row.related_user_id,
                taskId: row.task_id,
                taskType: row.task_type,
                level: row.level,
                sourceTxnId: row.source_txn_id,
                createdAt: row.created_at,
            }));

            return reply.send(paginate(transactions, total, query));
        }
    );
}
