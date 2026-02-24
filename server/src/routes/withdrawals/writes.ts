// File: server/src/routes/withdrawals/writes.ts
/**
 * Withdrawal Write Routes (Wave 2 - Financial Writes)
 *
 * POST   /api/withdrawals                  - Create a withdrawal request
 * PATCH  /api/admin/withdrawals/:id/status - Update withdrawal status (Admin)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';
import { enqueueWithdrawalNotification } from '../../jobs/enqueue.js';

type WithdrawalMethod = 'bank' | 'wallet' | 'upi';
type WithdrawalAdminStatus = 'completed' | 'rejected';

function parseMinWithdrawal(settingsValue: unknown): number {
    if (typeof settingsValue !== 'string') return 500;

    try {
        const parsed = JSON.parse(settingsValue) as { minWithdrawalAmount?: unknown };
        const value = Number(parsed.minWithdrawalAmount);
        return Number.isFinite(value) && value > 0 ? value : 500;
    } catch {
        return 500;
    }
}

async function assertAdmin(uid: string) {
    const db = getDb();
    const userResult = await db.execute({
        sql: 'SELECT role FROM users WHERE uid = ?',
        args: [uid],
    });

    const role = userResult.rows[0]?.role as string | undefined;
    if (!role || !['admin', 'sub_admin'].includes(role)) {
        throw new ForbiddenError('Admin access required');
    }
}

export default async function withdrawalWriteRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/api/withdrawals',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const body = request.body as {
                amount: number;
                method: WithdrawalMethod;
                bankDetails?: Record<string, string>;
                upiId?: string;
            };

            if (!Number.isFinite(body.amount) || !body.method) {
                throw new BadRequestError('Amount and method are required');
            }

            if (body.amount <= 0) {
                throw new BadRequestError('Amount must be positive');
            }

            if (!['bank', 'wallet', 'upi'].includes(body.method)) {
                throw new BadRequestError('Invalid withdrawal method');
            }

            if (body.method === 'bank' && (!body.bankDetails || Object.keys(body.bankDetails).length === 0)) {
                throw new BadRequestError('bankDetails are required for bank withdrawals');
            }

            if (body.method === 'upi' && !body.upiId?.trim()) {
                throw new BadRequestError('upiId is required for UPI withdrawals');
            }

            const db = getDb();
            const settings = await db.execute({
                sql: `SELECT value FROM settings WHERE key = ?`,
                args: ['general'],
            });
            const minWithdrawal = parseMinWithdrawal(settings.rows[0]?.value);

            if (body.amount < minWithdrawal) {
                throw new BadRequestError(`Minimum withdrawal amount is ${minWithdrawal}`);
            }

            const now = new Date().toISOString();
            const id = randomUUID();
            const ledgerTxnId = randomUUID();

            return runIdempotentMutation({
                request,
                reply,
                userId,
                afterCommit: async (result) => {
                    if (result.cached) return;
                    await enqueueWithdrawalNotification({
                        withdrawalId: id,
                        userId,
                        status: 'pending',
                        amount: body.amount,
                    });
                },
                handler: async (tx) => {
                    const walletUpdate = await tx.execute({
                        sql: `UPDATE wallets
                              SET cash_balance = cash_balance - ?, updated_at = ?
                              WHERE user_id = ? AND cash_balance >= ?`,
                        args: [body.amount, now, userId, body.amount],
                    });

                    const affected = Number((walletUpdate as any).rowsAffected ?? 0);
                    if (affected === 0) {
                        throw new BadRequestError('Insufficient cash balance');
                    }

                    await tx.execute({
                        sql: `INSERT INTO withdrawals (
                                id, user_id, amount, method, status, bank_details, upi_id, requested_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            id,
                            userId,
                            body.amount,
                            body.method,
                            'pending',
                            body.bankDetails ? JSON.stringify(body.bankDetails) : null,
                            body.upiId?.trim() || null,
                            now,
                        ],
                    });

                    await tx.execute({
                        sql: `INSERT INTO transactions (
                                id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            ledgerTxnId,
                            userId,
                            'WITHDRAWAL',
                            -body.amount,
                            'CASH',
                            'PENDING',
                            `Withdrawal request via ${body.method}`,
                            id,
                            now,
                        ],
                    });

                    await tx.execute({
                        sql: `INSERT INTO audit_logs (
                                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'withdrawal.request',
                            'withdrawal',
                            id,
                            JSON.stringify({
                                amount: body.amount,
                                method: body.method,
                                ledgerTxnId,
                            }),
                            request.ip,
                            now,
                        ],
                    });

                    return {
                        statusCode: 201,
                        payload: { data: { id, status: 'pending', amount: body.amount } },
                    };
                },
            });
        }
    );

    fastify.patch(
        '/api/admin/withdrawals/:id/status',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const adminId = request.user!.uid;
            const { id } = request.params as { id: string };
            await assertAdmin(adminId);

            const body = request.body as {
                status: WithdrawalAdminStatus;
                rejectionReason?: string;
                adminNotes?: string;
            };

            if (!['completed', 'rejected'].includes(body.status)) {
                throw new BadRequestError('Invalid status');
            }

            if (body.status === 'rejected' && !body.rejectionReason?.trim()) {
                throw new BadRequestError('rejectionReason is required when rejecting');
            }

            const now = new Date().toISOString();

            const data = await withTransaction(async (tx) => {
                const existing = await tx.execute({
                    sql: 'SELECT * FROM withdrawals WHERE id = ?',
                    args: [id],
                });

                if (existing.rows.length === 0) {
                    throw new NotFoundError('Withdrawal not found');
                }

                const withdrawal = existing.rows[0];
                if (withdrawal.status !== 'pending') {
                    throw new BadRequestError('Can only update pending withdrawals');
                }

                const amount = Number(withdrawal.amount);
                if (!Number.isFinite(amount) || amount <= 0) {
                    throw new BadRequestError('Invalid withdrawal amount');
                }

                await tx.execute({
                    sql: `UPDATE withdrawals SET
                            status = ?,
                            rejection_reason = ?,
                            admin_notes = ?,
                            processed_at = ?,
                            processed_by = ?
                          WHERE id = ?`,
                    args: [
                        body.status,
                        body.status === 'rejected' ? body.rejectionReason!.trim() : null,
                        body.adminNotes?.trim() || null,
                        now,
                        adminId,
                        id,
                    ],
                });

                if (body.status === 'rejected') {
                    await tx.execute({
                        sql: `UPDATE wallets
                              SET cash_balance = cash_balance + ?, updated_at = ?
                              WHERE user_id = ?`,
                        args: [amount, now, withdrawal.user_id],
                    });

                    await tx.execute({
                        sql: `UPDATE transactions
                              SET status = ?, description = ?
                              WHERE source_txn_id = ? AND type = 'WITHDRAWAL'`,
                        args: [
                            'FAILED',
                            `Withdrawal rejected: ${body.rejectionReason!.trim()}`,
                            id,
                        ],
                    });
                } else {
                    await tx.execute({
                        sql: `UPDATE wallets
                              SET total_withdrawals = total_withdrawals + ?, updated_at = ?
                              WHERE user_id = ?`,
                        args: [amount, now, withdrawal.user_id],
                    });

                    await tx.execute({
                        sql: `UPDATE transactions
                              SET status = ?
                              WHERE source_txn_id = ? AND type = 'WITHDRAWAL'`,
                        args: ['COMPLETED', id],
                    });
                }

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        body.status === 'completed' ? 'withdrawal.complete' : 'withdrawal.reject',
                        'withdrawal',
                        id,
                        JSON.stringify({
                            amount,
                            userId: withdrawal.user_id,
                            adminNotes: body.adminNotes?.trim() || null,
                        }),
                        request.ip,
                        now,
                    ],
                });

                return {
                    updated: true,
                    status: body.status,
                    userId: String(withdrawal.user_id),
                    amount,
                };
            });

            await enqueueWithdrawalNotification({
                withdrawalId: id,
                userId: data.userId,
                status: data.status as 'completed' | 'rejected',
                amount: data.amount,
            });

            return reply.send({ data: { updated: true, status: data.status } });
        }
    );
}
