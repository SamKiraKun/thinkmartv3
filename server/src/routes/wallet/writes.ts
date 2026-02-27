// File: server/src/routes/wallet/writes.ts
/**
 * Wallet Transaction Write Routes (Wave 2 - Financial Writes)
 *
 * POST /api/wallet/credit      - Add coins/cash (Admin/System)
 * POST /api/wallet/transaction - Log a general transaction (Admin/System)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';
import { enqueueWalletCreditNotification } from '../../jobs/enqueue.js';
import { broadcast } from '../realtime/index.js';

const ALLOWED_TRANSACTION_TYPES = new Set([
    'TASK_REWARD',
    'REFERRAL_BONUS',
    'TEAM_INCOME',
    'WITHDRAWAL',
    'PURCHASE',
    'MEMBERSHIP_FEE',
    'PARTNER_COMMISSION',
    'ADMIN_CREDIT',
]);

const ALLOWED_TRANSACTION_CURRENCIES = new Set(['COIN', 'CASH', 'INR']);
const ALLOWED_TRANSACTION_STATUSES = new Set(['PENDING', 'COMPLETED', 'FAILED']);

async function requireAdminRole(uid: string) {
    const db = getDb();
    const roleResult = await db.execute({
        sql: 'SELECT role FROM users WHERE uid = ?',
        args: [uid],
    });

    const role = roleResult.rows[0]?.role as string | undefined;
    if (!role || !['admin', 'sub_admin'].includes(role)) {
        throw new ForbiddenError('Admin access required');
    }
}

export default async function walletWriteRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/api/wallet/convert-coins',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const body = request.body as { coins?: number };
            const coins = Math.floor(Number(body?.coins ?? 0));

            if (!Number.isFinite(coins) || coins <= 0) {
                throw new BadRequestError('coins must be a positive integer');
            }
            if (coins < 1000) {
                throw new BadRequestError('Minimum conversion is 1000 coins');
            }

            const convertedAmount = Number((coins / 1000).toFixed(2));
            const now = new Date().toISOString();
            const conversionGroupId = randomUUID();

            return runIdempotentMutation({
                request,
                reply,
                userId,
                afterCommit: async (result) => {
                    if (result.cached) return;
                    broadcast(`user:${userId}`, 'wallet.updated', {
                        reason: 'coin_conversion',
                        coinsConverted: coins,
                        convertedAmount,
                    });
                },
                handler: async (tx) => {
                    const walletUpdate = await tx.execute({
                        sql: `UPDATE wallets
                              SET coin_balance = coin_balance - ?,
                                  cash_balance = cash_balance + ?,
                                  updated_at = ?
                              WHERE user_id = ? AND coin_balance >= ?`,
                        args: [coins, convertedAmount, now, userId, coins],
                    });

                    const affected = Number((walletUpdate as any).rowsAffected ?? 0);
                    if (affected === 0) {
                        throw new BadRequestError('Insufficient coin balance');
                    }

                    await tx.execute({
                        sql: `INSERT INTO transactions (
                                id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'PURCHASE',
                            -coins,
                            'COIN',
                            'COMPLETED',
                            `Coin conversion debit (${coins} coins)`,
                            conversionGroupId,
                            now,
                        ],
                    });

                    await tx.execute({
                        sql: `INSERT INTO transactions (
                                id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'PURCHASE',
                            convertedAmount,
                            'CASH',
                            'COMPLETED',
                            `Coin conversion credit (from ${coins} coins)`,
                            conversionGroupId,
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
                            'wallet.convert_coins',
                            'wallet',
                            userId,
                            JSON.stringify({ coins, convertedAmount }),
                            request.ip,
                            now,
                        ],
                    });

                    return {
                        statusCode: 200,
                        payload: {
                            data: {
                                convertedAmount,
                                coinsConverted: coins,
                                currency: 'CASH',
                            },
                        },
                    };
                },
            });
        }
    );

    fastify.post(
        '/api/wallet/credit',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const adminId = request.user!.uid;
            await requireAdminRole(adminId);

            const body = request.body as {
                userId: string;
                amount: number;
                currency: 'COIN' | 'CASH';
                description: string;
            };

            if (!body.userId || !Number.isFinite(body.amount) || !body.currency || !body.description?.trim()) {
                throw new BadRequestError('Missing required fields');
            }

            if (!['COIN', 'CASH'].includes(body.currency)) {
                throw new BadRequestError('currency must be COIN or CASH');
            }

            if (body.amount <= 0) {
                throw new BadRequestError('Amount must be positive');
            }

            const now = new Date().toISOString();
            const transactionId = randomUUID();

            return runIdempotentMutation({
                request,
                reply,
                userId: adminId,
                afterCommit: async (result) => {
                    if (result.cached) return;
                    await enqueueWalletCreditNotification({
                        userId: body.userId,
                        amount: body.amount,
                        currency: body.currency,
                        transactionId,
                    });
                    broadcast(`user:${body.userId}`, 'wallet.updated', {
                        reason: 'admin_credit',
                        amount: body.amount,
                        currency: body.currency,
                        transactionId,
                    });
                },
                handler: async (tx) => {
                const userResult = await tx.execute({
                    sql: 'SELECT uid FROM users WHERE uid = ?',
                    args: [body.userId],
                });

                if (userResult.rows.length === 0) {
                    throw new NotFoundError('Target user not found');
                }

                const column = body.currency === 'COIN' ? 'coin_balance' : 'cash_balance';

                await tx.execute({
                    sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, updated_at)
                          VALUES (?, ?, ?, ?)
                          ON CONFLICT(user_id) DO UPDATE SET
                            ${column} = ${column} + ?,
                            updated_at = ?`,
                    args: [
                        body.userId,
                        body.currency === 'COIN' ? body.amount : 0,
                        body.currency === 'CASH' ? body.amount : 0,
                        now,
                        body.amount,
                        now,
                    ],
                });

                await tx.execute({
                    sql: `INSERT INTO transactions (
                            id, user_id, type, amount, currency, status, description, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        transactionId,
                        body.userId,
                        'ADMIN_CREDIT',
                        body.amount,
                        body.currency,
                        'COMPLETED',
                        body.description.trim(),
                        now,
                    ],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'wallet.credit',
                        'wallet',
                        body.userId,
                        JSON.stringify({
                            amount: body.amount,
                            currency: body.currency,
                            transactionId,
                            description: body.description.trim(),
                        }),
                        request.ip,
                        now,
                    ],
                });

                    return {
                        statusCode: 201,
                        payload: {
                            data: {
                                id: transactionId,
                                amount: body.amount,
                                currency: body.currency,
                                status: 'completed',
                            },
                        },
                    };
                },
            });
        }
    );

    fastify.post(
        '/api/wallet/transaction',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const adminId = request.user!.uid;
            await requireAdminRole(adminId);

            const body = request.body as {
                userId: string;
                type: string;
                amount: number;
                currency: string;
                status: string;
                description: string;
                relatedUserId?: string;
                level?: number;
                sourceTxnId?: string;
            };

            if (!body.userId || !body.type || !Number.isFinite(body.amount) || !body.currency || !body.status || !body.description?.trim()) {
                throw new BadRequestError('Missing required fields');
            }

            const type = body.type.toUpperCase();
            const currency = body.currency.toUpperCase();
            const status = body.status.toUpperCase();

            if (!ALLOWED_TRANSACTION_TYPES.has(type)) {
                throw new BadRequestError('Invalid transaction type');
            }
            if (!ALLOWED_TRANSACTION_CURRENCIES.has(currency)) {
                throw new BadRequestError('Invalid transaction currency');
            }
            if (!ALLOWED_TRANSACTION_STATUSES.has(status)) {
                throw new BadRequestError('Invalid transaction status');
            }

            const id = randomUUID();
            const now = new Date().toISOString();
            const level =
                typeof body.level === 'number' && Number.isFinite(body.level)
                    ? body.level
                    : null;

            return runIdempotentMutation({
                request,
                reply,
                userId: adminId,
                handler: async (tx) => {
                    const userResult = await tx.execute({
                        sql: 'SELECT uid FROM users WHERE uid = ?',
                        args: [body.userId],
                    });

                    if (userResult.rows.length === 0) {
                        throw new NotFoundError('Target user not found');
                    }

                    await tx.execute({
                        sql: `INSERT INTO transactions (
                                id, user_id, type, amount, currency, status, description,
                                related_user_id, level, source_txn_id, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            id,
                            body.userId,
                            type,
                            body.amount,
                            currency,
                            status,
                            body.description.trim(),
                            body.relatedUserId || null,
                            level,
                            body.sourceTxnId || null,
                            now,
                        ],
                    });

                    await tx.execute({
                        sql: `INSERT INTO audit_logs (
                                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            adminId,
                            'transaction.log',
                            'transaction',
                            id,
                            JSON.stringify({
                                userId: body.userId,
                                type,
                                amount: body.amount,
                                currency,
                                status,
                            }),
                            request.ip,
                            now,
                        ],
                    });

                    return {
                        statusCode: 201,
                        payload: {
                            data: { id, status: 'logged' },
                        },
                    };
                },
            });
        }
    );
}
