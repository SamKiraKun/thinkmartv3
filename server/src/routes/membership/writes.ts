import type { FastifyInstance } from 'fastify';
import { requireAuth } from '../../middleware/auth.js';
import { withTransaction } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { runIdempotentMutation } from '../../utils/idempotency.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';

export default async function membershipWriteRoutes(app: FastifyInstance) {
    /**
     * POST /api/membership/purchase
     * Purchase a membership.
     * Deducts cost from user's balance and sets membership_active.
     */
    app.post(
        '/api/membership/purchase',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;

            await runIdempotentMutation({
                request,
                reply,
                userId,
                handler: async (tx) => {
                    let membershipPriceCash = 1000;
                    const settingsRow = await tx.execute({
                        sql: 'SELECT value FROM settings WHERE key = ?',
                        args: ['general'],
                    });
                    if (settingsRow.rows.length > 0) {
                        try {
                            const parsed = settingsRow.rows[0].value
                                ? (JSON.parse(String(settingsRow.rows[0].value)) as Record<string, unknown>)
                                : {};
                            const configuredFee = Number(parsed.membershipFee);
                            if (Number.isFinite(configuredFee) && configuredFee > 0) {
                                membershipPriceCash = configuredFee;
                            }
                        } catch {
                            // Fallback to default.
                        }
                    }

                    const existingUser = await tx.execute({
                        sql: 'SELECT membership_active FROM users WHERE uid = ?',
                        args: [userId],
                    });

                    if (existingUser.rows.length === 0) {
                        throw new NotFoundError('User not found');
                    }

                    if (existingUser.rows[0].membership_active) {
                        throw new BadRequestError('Membership already active');
                    }

                    const wallet = await tx.execute({
                        // SQLite/libSQL does not support FOR UPDATE; the enclosing write transaction
                        // provides atomicity for the subsequent balance update.
                        sql: 'SELECT cash_balance, coin_balance FROM wallets WHERE user_id = ?',
                        args: [userId],
                    });

                    if (wallet.rows.length === 0) {
                        throw new NotFoundError('Wallet not found');
                    }

                    const { cash_balance } = wallet.rows[0];
                    if (Number(cash_balance) < membershipPriceCash) {
                        throw new BadRequestError('Insufficient cash balance');
                    }

                    const now = new Date().toISOString();

                    // Deduct balance
                    if (membershipPriceCash > 0) {
                        await tx.execute({
                            sql: `UPDATE wallets 
                                  SET cash_balance = cash_balance - ?, updated_at = ? 
                                  WHERE user_id = ?`,
                            args: [membershipPriceCash, now, userId],
                        });

                        const txnId = randomUUID();
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                txnId,
                                userId,
                                'MEMBERSHIP_FEE',
                                -membershipPriceCash,
                                'CASH',
                                'COMPLETED',
                                'Purchased ThinkMart Membership',
                                now,
                            ],
                        });
                    }

                    // Activate membership
                    await tx.execute({
                        sql: `UPDATE users 
                              SET membership_active = 1, membership_date = ?, updated_at = ? 
                              WHERE uid = ?`,
                        args: [now, now, userId],
                    });

                    // Audit log
                    await tx.execute({
                        sql: `INSERT INTO audit_logs (
                                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'membership.purchase',
                            'user',
                            userId,
                            JSON.stringify({ pricePaid: membershipPriceCash }),
                            request.ip || 'unknown',
                            now,
                        ],
                    });

                    return { payload: { data: { success: true, activatedAt: now } }, statusCode: 200 };
                },
                afterCommit: async (payload) => {
                    // Trigger referral payout generation logic
                    // In a real app we would enqueue a job to crawl upline and emit payouts
                },
            });
        }
    );
}
