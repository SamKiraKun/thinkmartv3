// File: server/src/routes/orders/writes.ts
/**
 * Order Write Routes (Wave 2 - Financial Writes)
 *
 * POST   /api/orders            - Create an order
 * PATCH  /api/orders/:id/status - Update order status (Admin/Vendor)
 */

import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';
import { enqueueOrderCreatedJobs } from '../../jobs/enqueue.js';

const ALLOWED_ORDER_STATUSES = new Set([
    'pending',
    'confirmed',
    'shipped',
    'delivered',
    'cancelled',
    'refunded',
]);

type CreateOrderBody = {
    items: Array<{
        productId: string;
        quantity: number;
        price: number;
        coinPrice?: number;
        isCoinOnly?: boolean;
        isCashOnly?: boolean;
    }>;
    shippingAddress: Record<string, any>;
    subtotal: number;
    cashPaid: number;
    coinsRedeemed: number;
    coinValue: number;
    couponCode?: string;
    couponDiscount?: number;
};

function validateCreateOrderBody(body: CreateOrderBody) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new BadRequestError('At least one item is required');
    }

    if (!body.shippingAddress || typeof body.shippingAddress !== 'object') {
        throw new BadRequestError('Shipping address is required');
    }

    for (const item of body.items) {
        if (!item.productId || !Number.isFinite(item.quantity) || !Number.isFinite(item.price)) {
            throw new BadRequestError('Invalid order item');
        }
        if (item.quantity <= 0) {
            throw new BadRequestError('Item quantity must be positive');
        }
        if (item.price < 0) {
            throw new BadRequestError('Item price cannot be negative');
        }
    }

    for (const field of ['subtotal', 'cashPaid', 'coinsRedeemed', 'coinValue'] as const) {
        const value = Number(body[field]);
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestError(`${field} must be a non-negative number`);
        }
    }
}

async function getRequesterRole(uid: string): Promise<string | null> {
    const db = getDb();
    const userResult = await db.execute({
        sql: 'SELECT role FROM users WHERE uid = ?',
        args: [uid],
    });

    return (userResult.rows[0]?.role as string | undefined) || null;
}

export default async function orderWriteRoutes(fastify: FastifyInstance) {
    fastify.post(
        '/api/orders',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const body = request.body as CreateOrderBody;
            validateCreateOrderBody(body);

            const orderId = randomUUID();
            const now = new Date().toISOString();

            return runIdempotentMutation({
                request,
                reply,
                userId,
                afterCommit: async (result) => {
                    if (result.cached) return;
                    await enqueueOrderCreatedJobs({
                        orderId,
                        userId,
                        itemsCount: body.items.length,
                    });
                },
                handler: async (tx) => {
                    const userResult = await tx.execute({
                        sql: 'SELECT email, name FROM users WHERE uid = ?',
                        args: [userId],
                    });

                    const user = userResult.rows[0];
                    if (!user) {
                        throw new NotFoundError('User profile not found');
                    }

                    if (body.coinsRedeemed > 0) {
                        const coinDebit = await tx.execute({
                            sql: `UPDATE wallets
                                  SET coin_balance = coin_balance - ?, updated_at = ?
                                  WHERE user_id = ? AND coin_balance >= ?`,
                            args: [body.coinsRedeemed, now, userId, body.coinsRedeemed],
                        });

                        const affected = Number((coinDebit as any).rowsAffected ?? 0);
                        if (affected === 0) {
                            throw new BadRequestError('Insufficient coin balance');
                        }
                    }

                    for (const item of body.items) {
                        const productResult = await tx.execute({
                            sql: 'SELECT id, stock, in_stock FROM products WHERE id = ?',
                            args: [item.productId],
                        });

                        const product = productResult.rows[0];
                        if (!product) {
                            throw new NotFoundError(`Product not found: ${item.productId}`);
                        }

                        const stockValue =
                            product.stock === null || product.stock === undefined
                                ? null
                                : Number(product.stock);

                        if (stockValue !== null) {
                            if (!Number.isFinite(stockValue)) {
                                throw new BadRequestError(`Invalid stock for product: ${item.productId}`);
                            }
                            if (stockValue < item.quantity) {
                                throw new BadRequestError(`Insufficient stock for product: ${item.productId}`);
                            }

                            const newStock = stockValue - item.quantity;
                            await tx.execute({
                                sql: `UPDATE products
                                      SET stock = ?, in_stock = ?, updated_at = ?
                                      WHERE id = ?`,
                                args: [newStock, newStock > 0 ? 1 : 0, now, item.productId],
                            });
                        }
                    }

                    await tx.execute({
                        sql: `INSERT INTO orders (
                                id, user_id, user_email, user_name, items, subtotal, cash_paid,
                                coins_redeemed, coin_value, coupon_code, coupon_discount,
                                shipping_address, status, status_history, city,
                                created_at, updated_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            orderId,
                            userId,
                            (user.email as string) || '',
                            (user.name as string) || '',
                            JSON.stringify(body.items),
                            body.subtotal,
                            body.cashPaid,
                            body.coinsRedeemed || 0,
                            body.coinValue || 0,
                            body.couponCode?.trim() || null,
                            body.couponDiscount || 0,
                            JSON.stringify(body.shippingAddress),
                            'pending',
                            JSON.stringify([{ status: 'pending', date: now, note: 'Order placed' }]),
                            body.shippingAddress.city || '',
                            now,
                            now,
                        ],
                    });

                    if (body.coinsRedeemed > 0) {
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                randomUUID(),
                                userId,
                                'PURCHASE',
                                -body.coinsRedeemed,
                                'COIN',
                                'COMPLETED',
                                `Order ${orderId} coin redemption`,
                                orderId,
                                now,
                            ],
                        });
                    }

                    await tx.execute({
                        sql: `INSERT INTO audit_logs (
                                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'order.create',
                            'order',
                            orderId,
                            JSON.stringify({
                                itemsCount: body.items.length,
                                subtotal: body.subtotal,
                                cashPaid: body.cashPaid,
                                coinsRedeemed: body.coinsRedeemed,
                            }),
                            request.ip,
                            now,
                        ],
                    });

                    return {
                        statusCode: 201,
                        payload: { data: { id: orderId, status: 'pending', createdAt: now } },
                    };
                },
            });
        }
    );

    fastify.patch(
        '/api/orders/:id/status',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const { id } = request.params as { id: string };

            const role = await getRequesterRole(userId);
            if (!role || !['admin', 'sub_admin', 'vendor'].includes(role)) {
                throw new ForbiddenError('Not authorized to update orders');
            }

            const body = request.body as {
                status: string;
                note?: string;
                trackingNumber?: string;
            };

            if (!body.status || !ALLOWED_ORDER_STATUSES.has(body.status)) {
                throw new BadRequestError('Invalid order status');
            }

            const now = new Date().toISOString();

            const data = await withTransaction(async (tx) => {
                const orderResult = await tx.execute({
                    sql: 'SELECT status, status_history FROM orders WHERE id = ?',
                    args: [id],
                });

                if (orderResult.rows.length === 0) {
                    throw new NotFoundError('Order not found');
                }

                const existingRow = orderResult.rows[0];
                let history: Array<Record<string, unknown>> = [];
                try {
                    history = existingRow.status_history
                        ? (JSON.parse(existingRow.status_history as string) as Array<Record<string, unknown>>)
                        : [];
                } catch {
                    history = [];
                }

                history.push({
                    status: body.status,
                    date: now,
                    note: body.note?.trim() || null,
                    updatedBy: userId,
                });

                const updates: string[] = ['status = ?', 'status_history = ?', 'updated_at = ?'];
                const params: any[] = [body.status, JSON.stringify(history), now];

                if (body.trackingNumber !== undefined) {
                    updates.push('tracking_number = ?');
                    params.push(body.trackingNumber.trim() || null);
                }

                params.push(id);

                await tx.execute({
                    sql: `UPDATE orders SET ${updates.join(', ')} WHERE id = ?`,
                    args: params,
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        userId,
                        'order.status_update',
                        'order',
                        id,
                        JSON.stringify({
                            newStatus: body.status,
                            note: body.note?.trim() || null,
                            trackingNumber: body.trackingNumber?.trim() || null,
                        }),
                        request.ip,
                        now,
                    ],
                });

                return { updated: true, status: body.status };
            });

            return reply.send({ data });
        }
    );

    fastify.post(
        '/api/orders/:id/cancel',
        { preHandler: [requireAuth] },
        async (request, reply) => {
            const userId = request.user!.uid;
            const { id } = request.params as { id: string };
            const body = request.body as { reason?: string } | undefined;
            const reason = body?.reason?.trim() || 'User requested cancellation';

            return runIdempotentMutation({
                request,
                reply,
                userId,
                handler: async (tx) => {
                    const orderResult = await tx.execute({
                        sql: `SELECT id, user_id, status, status_history, cash_paid, coins_redeemed
                              FROM orders WHERE id = ?`,
                        args: [id],
                    });

                    if (orderResult.rows.length === 0) {
                        throw new NotFoundError('Order not found');
                    }

                    const row = orderResult.rows[0];
                    if (String(row.user_id) !== userId) {
                        throw new ForbiddenError('You can only cancel your own orders');
                    }

                    const currentStatus = String(row.status || '');
                    if (currentStatus !== 'pending') {
                        throw new BadRequestError('Only pending orders can be cancelled');
                    }

                    const now = new Date().toISOString();
                    const cashRefund = Number(row.cash_paid) || 0;
                    const coinRefund = Number(row.coins_redeemed) || 0;
                    let history: Array<Record<string, unknown>> = [];

                    try {
                        history = row.status_history
                            ? (JSON.parse(String(row.status_history)) as Array<Record<string, unknown>>)
                            : [];
                    } catch {
                        history = [];
                    }

                    history.push({
                        status: 'cancelled',
                        date: now,
                        note: reason,
                        updatedBy: userId,
                    });

                    await tx.execute({
                        sql: `UPDATE orders
                              SET status = ?, status_history = ?, refund_reason = ?, refunded_at = ?, updated_at = ?
                              WHERE id = ?`,
                        args: ['cancelled', JSON.stringify(history), reason, now, now, id],
                    });

                    if (cashRefund > 0 || coinRefund > 0) {
                        await tx.execute({
                            sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, updated_at)
                                  VALUES (?, ?, ?, ?)
                                  ON CONFLICT(user_id) DO UPDATE SET
                                    coin_balance = coin_balance + ?,
                                    cash_balance = cash_balance + ?,
                                    updated_at = ?`,
                            args: [userId, coinRefund, cashRefund, now, coinRefund, cashRefund, now],
                        });
                    }

                    if (cashRefund > 0) {
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                randomUUID(),
                                userId,
                                'PURCHASE',
                                cashRefund,
                                'CASH',
                                'COMPLETED',
                                `Refund for cancelled order ${id}`,
                                id,
                                now,
                            ],
                        });
                    }

                    if (coinRefund > 0) {
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                randomUUID(),
                                userId,
                                'PURCHASE',
                                coinRefund,
                                'COIN',
                                'COMPLETED',
                                `Coin refund for cancelled order ${id}`,
                                id,
                                now,
                            ],
                        });
                    }

                    await tx.execute({
                        sql: `INSERT INTO audit_logs (
                                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        args: [
                            randomUUID(),
                            userId,
                            'order.cancel',
                            'order',
                            id,
                            JSON.stringify({ reason, cashRefund, coinRefund }),
                            request.ip,
                            now,
                        ],
                    });

                    return {
                        statusCode: 200,
                        payload: {
                            data: {
                                id,
                                status: 'cancelled',
                                refundedCash: cashRefund,
                                refundedCoins: coinRefund,
                                refundReason: reason,
                                cancelledAt: now,
                            },
                        },
                    };
                },
            });
        }
    );
}
