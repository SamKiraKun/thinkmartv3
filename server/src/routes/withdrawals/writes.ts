// File: server/src/routes/withdrawals/writes.ts
/**
 * Withdrawal Write Routes (Wave 2 - Financial Writes)
 *
 * POST   /api/withdrawals                  - Create a withdrawal request
 * PATCH  /api/withdrawals/:id/cancel       - Cancel own pending withdrawal
 * PATCH  /api/admin/withdrawals/:id/status - Update withdrawal status (Admin)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';
import { enqueueWithdrawalNotification } from '../../jobs/enqueue.js';
import { broadcast } from '../realtime/index.js';
import { distributePartnerCommissionsForCity } from '../../utils/partnerCommissions.js';

type WithdrawalMethod = 'bank' | 'wallet' | 'upi';
type WithdrawalAdminStatus = 'completed' | 'rejected';

type WithdrawalPolicy = {
    minAmount: number;
    maxAmount: number;
    maxPerMonth: number;
    cooldownDays: number;
};

function parseWithdrawalPolicy(settingsValue: unknown): WithdrawalPolicy {
    const fallback: WithdrawalPolicy = {
        minAmount: 500,
        maxAmount: 50000,
        maxPerMonth: 2,
        cooldownDays: 24,
    };
    if (typeof settingsValue !== 'string') return fallback;

    try {
        const parsed = JSON.parse(settingsValue) as Record<string, unknown>;

        const minAmount = Number(parsed.minWithdrawalAmount);
        const maxAmount = Number(parsed.maxWithdrawalAmount);
        const maxPerMonth = Number(
            parsed.maxWithdrawalsPerMonth ?? parsed.monthlyWithdrawalLimit
        );
        const cooldownDays = Number(parsed.withdrawalCooldownDays);

        return {
            minAmount:
                Number.isFinite(minAmount) && minAmount > 0
                    ? minAmount
                    : fallback.minAmount,
            maxAmount:
                Number.isFinite(maxAmount) && maxAmount > 0
                    ? maxAmount
                    : fallback.maxAmount,
            maxPerMonth:
                Number.isFinite(maxPerMonth) && maxPerMonth > 0
                    ? maxPerMonth
                    : fallback.maxPerMonth,
            cooldownDays:
                Number.isFinite(cooldownDays) && cooldownDays >= 0
                    ? cooldownDays
                    : fallback.cooldownDays,
        };
    } catch {
        return fallback;
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
            const policy = parseWithdrawalPolicy(settings.rows[0]?.value);

            if (body.amount < policy.minAmount) {
                throw new BadRequestError(`Minimum withdrawal amount is ${policy.minAmount}`);
            }
            if (body.amount > policy.maxAmount) {
                throw new BadRequestError(`Maximum withdrawal amount is ${policy.maxAmount}`);
            }

            const userResult = await db.execute({
                sql: `SELECT uid, kyc_status FROM users WHERE uid = ?`,
                args: [userId],
            });
            if (userResult.rows.length === 0) {
                throw new NotFoundError('User not found');
            }

            const kycStatus = String(userResult.rows[0]?.kyc_status || 'not_submitted');
            if (kycStatus !== 'verified') {
                throw new BadRequestError(
                    'KYC verification required. Please complete your KYC to withdraw funds.'
                );
            }

            const pendingResult = await db.execute({
                sql: `SELECT id FROM withdrawals
                      WHERE user_id = ? AND status = 'pending'
                      LIMIT 1`,
                args: [userId],
            });
            if (pendingResult.rows.length > 0) {
                throw new BadRequestError(
                    'You already have a pending withdrawal request. Please wait for it to be processed.'
                );
            }

            if (policy.cooldownDays > 0) {
                const lastProcessedResult = await db.execute({
                    sql: `SELECT processed_at
                          FROM withdrawals
                          WHERE user_id = ?
                            AND status IN ('completed', 'rejected')
                            AND processed_at IS NOT NULL
                          ORDER BY processed_at DESC
                          LIMIT 1`,
                    args: [userId],
                });

                if (lastProcessedResult.rows.length > 0) {
                    const lastProcessedAt = Date.parse(String(lastProcessedResult.rows[0]?.processed_at || ''));
                    if (Number.isFinite(lastProcessedAt)) {
                        const cooldownEnd = new Date(lastProcessedAt);
                        cooldownEnd.setDate(cooldownEnd.getDate() + policy.cooldownDays);
                        if (Date.now() < cooldownEnd.getTime()) {
                            const daysRemaining = Math.max(
                                1,
                                Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                            );
                            throw new BadRequestError(
                                `Withdrawal cooldown active. You can request again in ${daysRemaining} day(s).`
                            );
                        }
                    }
                }
            }

            const startOfMonth = new Date();
            startOfMonth.setDate(1);
            startOfMonth.setHours(0, 0, 0, 0);
            const monthlyCountResult = await db.execute({
                sql: `SELECT COUNT(*) as total
                      FROM withdrawals
                      WHERE user_id = ? AND requested_at >= ?`,
                args: [userId, startOfMonth.toISOString()],
            });
            const monthlyCount = Number(monthlyCountResult.rows[0]?.total || 0);
            if (monthlyCount >= policy.maxPerMonth) {
                throw new BadRequestError(
                    `Maximum ${policy.maxPerMonth} withdrawals allowed per month. Limit reached.`
                );
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
                    broadcast(`user:${userId}`, 'withdrawal.created', {
                        withdrawalId: id,
                        status: 'pending',
                        amount: body.amount,
                    });
                    broadcast(`user:${userId}`, 'wallet.updated', {
                        reason: 'withdrawal_requested',
                        withdrawalId: id,
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
        '/api/withdrawals/:id/cancel',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const { id } = request.params as { id: string };
            const now = new Date().toISOString();

            const result = await withTransaction(async (tx) => {
                const existing = await tx.execute({
                    sql: 'SELECT id, user_id, amount, status FROM withdrawals WHERE id = ?',
                    args: [id],
                });

                if (existing.rows.length === 0) {
                    throw new NotFoundError('Withdrawal not found');
                }

                const withdrawal = existing.rows[0] as Record<string, any>;
                if (String(withdrawal.user_id || '') !== userId) {
                    throw new ForbiddenError('You can only cancel your own withdrawal');
                }
                if (String(withdrawal.status || '') !== 'pending') {
                    throw new BadRequestError('Only pending withdrawals can be cancelled');
                }

                const amount = Number(withdrawal.amount || 0);
                if (!Number.isFinite(amount) || amount <= 0) {
                    throw new BadRequestError('Invalid withdrawal amount');
                }

                await tx.execute({
                    sql: `UPDATE withdrawals
                          SET status = ?, rejection_reason = ?, admin_notes = ?, processed_at = ?, processed_by = ?
                          WHERE id = ?`,
                    args: ['rejected', 'Cancelled by user', 'Cancelled by user', now, userId, id],
                });

                await tx.execute({
                    sql: `UPDATE wallets
                          SET cash_balance = cash_balance + ?, updated_at = ?
                          WHERE user_id = ?`,
                    args: [amount, now, userId],
                });

                await tx.execute({
                    sql: `UPDATE transactions
                          SET status = ?, description = ?
                          WHERE source_txn_id = ? AND type = 'WITHDRAWAL'`,
                    args: ['FAILED', 'Withdrawal cancelled by user', id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        userId,
                        'withdrawal.cancel',
                        'withdrawal',
                        id,
                        JSON.stringify({ amount, userId }),
                        request.ip,
                        now,
                    ],
                });

                return { amount };
            });

            await enqueueWithdrawalNotification({
                withdrawalId: id,
                userId,
                status: 'rejected',
                amount: result.amount,
            });
            broadcast(`user:${userId}`, 'withdrawal.updated', {
                withdrawalId: id,
                status: 'rejected',
                amount: result.amount,
            });
            broadcast(`user:${userId}`, 'wallet.updated', {
                reason: 'withdrawal_cancelled',
                withdrawalId: id,
                status: 'rejected',
            });

            return reply.send({ data: { updated: true, status: 'rejected' } });
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

                    const sourceUser = await tx.execute({
                        sql: 'SELECT city FROM users WHERE uid = ?',
                        args: [withdrawal.user_id],
                    });
                    const sourceCity = String(sourceUser.rows[0]?.city || '').trim();
                    if (sourceCity) {
                        await distributePartnerCommissionsForCity({
                            tx: tx as any,
                            city: sourceCity,
                            sourceAmount: amount,
                            sourceType: 'withdrawal',
                            sourceId: id,
                            sourceUserId: String(withdrawal.user_id),
                            createdAt: now,
                        });
                    }
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
            broadcast(`user:${data.userId}`, 'withdrawal.updated', {
                withdrawalId: id,
                status: data.status,
                amount: data.amount,
            });
            broadcast(`user:${data.userId}`, 'wallet.updated', {
                reason: 'withdrawal_status_change',
                withdrawalId: id,
                status: data.status,
            });

            return reply.send({ data: { updated: true, status: data.status } });
        }
    );
}
