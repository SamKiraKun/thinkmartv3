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
import { broadcast } from '../realtime/index.js';
import { distributePartnerCommissionsForCity } from '../../utils/partnerCommissions.js';

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
        price?: number;
        coinPrice?: number;
        isCoinOnly?: boolean;
        isCashOnly?: boolean;
    }>;
    shippingAddress: Record<string, any>;
    subtotal?: number;
    cashPaid?: number;
    coinsRedeemed?: number;
    coinValue?: number;
    useCoins?: boolean;
    paymentMode?: 'cash' | 'coins' | 'split';
    couponCode?: string;
    couponDiscount?: number;
};

type OrderPricing = {
    normalizedItems: Array<{
        productId: string;
        quantity: number;
        price: number;
        coinPrice: number;
        isCoinOnly: boolean;
        isCashOnly: boolean;
    }>;
    subtotal: number;
    coinsRedeemed: number;
    coinValue: number;
    cashPaid: number;
};

function validateCreateOrderBody(body: CreateOrderBody) {
    if (!Array.isArray(body.items) || body.items.length === 0) {
        throw new BadRequestError('At least one item is required');
    }

    if (!body.shippingAddress || typeof body.shippingAddress !== 'object') {
        throw new BadRequestError('Shipping address is required');
    }

    for (const item of body.items) {
        if (!item.productId || !Number.isFinite(item.quantity)) {
            throw new BadRequestError('Invalid order item');
        }
        if (item.quantity <= 0) {
            throw new BadRequestError('Item quantity must be positive');
        }
        if (item.price !== undefined && Number(item.price) < 0) {
            throw new BadRequestError('Item price cannot be negative');
        }
    }

    for (const field of ['subtotal', 'cashPaid', 'coinsRedeemed', 'coinValue'] as const) {
        const raw = body[field];
        if (raw === undefined || raw === null) continue;
        const value = Number(raw);
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestError(`${field} must be a non-negative number`);
        }
    }

    const paymentMode = String(body.paymentMode || '').trim().toLowerCase();
    if (paymentMode && !['cash', 'coins', 'split'].includes(paymentMode)) {
        throw new BadRequestError('paymentMode must be cash, coins, or split');
    }
}

function validateClientPricing(body: CreateOrderBody, serverPricing: OrderPricing) {
    const epsilon = 0.01;
    if (body.subtotal !== undefined && Math.abs(Number(body.subtotal) - serverPricing.subtotal) > epsilon) {
        throw new BadRequestError('Order subtotal mismatch');
    }
    if (body.coinValue !== undefined && Math.abs(Number(body.coinValue) - serverPricing.coinValue) > epsilon) {
        throw new BadRequestError('Coin conversion mismatch');
    }
    if (body.cashPaid !== undefined && Math.abs(Number(body.cashPaid) - serverPricing.cashPaid) > epsilon) {
        throw new BadRequestError('Cash payment mismatch');
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

            const db = getDb();
            const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
            const recentOrders = await db.execute({
                sql: `SELECT COUNT(*) as total
                      FROM orders
                      WHERE user_id = ? AND created_at >= ?`,
                args: [userId, oneHourAgo],
            });
            const ordersLastHour = Number(recentOrders.rows[0]?.total || 0);
            if (ordersLastHour >= 5) {
                throw new BadRequestError(
                    'Order limit reached. Maximum 5 orders per hour. Please try again later.'
                );
            }

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
                    broadcast(`user:${userId}`, 'order.created', {
                        orderId,
                        status: 'pending',
                        createdAt: now,
                    });
                    broadcast(`order:${orderId}`, 'order.created', {
                        orderId,
                        status: 'pending',
                        createdAt: now,
                    });
                    if (Number(body.coinsRedeemed || 0) > 0 || Number(body.cashPaid || 0) > 0) {
                        broadcast(`user:${userId}`, 'wallet.updated', {
                            reason: 'order_created_wallet_debit',
                            orderId,
                        });
                    }
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

                    let computedSubtotal = 0;
                    const normalizedItems: OrderPricing['normalizedItems'] = [];

                    for (const item of body.items) {
                        const productResult = await tx.execute({
                            sql: `SELECT id, stock, in_stock, price, coin_price, coin_only, cash_only
                                  FROM products
                                  WHERE id = ?`,
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

                        const unitPrice = Number(product.price);
                        const unitCoinPrice = Number(product.coin_price || 0);
                        const isCoinOnly = Boolean(Number(product.coin_only || 0));
                        const isCashOnly = Boolean(Number(product.cash_only || 0));
                        if (!Number.isFinite(unitPrice) || unitPrice < 0) {
                            throw new BadRequestError(`Invalid product price for product: ${item.productId}`);
                        }

                        computedSubtotal += unitPrice * item.quantity;
                        normalizedItems.push({
                            productId: item.productId,
                            quantity: item.quantity,
                            price: unitPrice,
                            coinPrice: Number.isFinite(unitCoinPrice) ? unitCoinPrice : 0,
                            isCoinOnly,
                            isCashOnly,
                        });
                    }

                    const maxCoinsForSubtotal = Math.floor(computedSubtotal * 10);
                    const paymentMode = String(body.paymentMode || '').trim().toLowerCase();
                    const walletPreviewResult = await tx.execute({
                        sql: 'SELECT coin_balance, cash_balance FROM wallets WHERE user_id = ?',
                        args: [userId],
                    });
                    const walletPreview = walletPreviewResult.rows[0] as Record<string, any> | undefined;
                    const availableCoins = Math.max(0, Math.floor(Number(walletPreview?.coin_balance || 0)));
                    const explicitCoins =
                        body.coinsRedeemed === undefined || body.coinsRedeemed === null
                            ? null
                            : Math.max(0, Math.floor(Number(body.coinsRedeemed) || 0));

                    let normalizedCoinsRedeemed = 0;
                    if (paymentMode === 'cash') {
                        normalizedCoinsRedeemed = 0;
                    } else if (explicitCoins !== null) {
                        normalizedCoinsRedeemed = explicitCoins;
                    } else if (body.useCoins === true || paymentMode === 'coins' || paymentMode === 'split') {
                        normalizedCoinsRedeemed = Math.min(maxCoinsForSubtotal, availableCoins);
                    }

                    if (normalizedCoinsRedeemed > maxCoinsForSubtotal) {
                        throw new BadRequestError('Coins redeemed exceed order value');
                    }
                    if (paymentMode === 'coins' && normalizedCoinsRedeemed < maxCoinsForSubtotal) {
                        throw new BadRequestError('Insufficient coins for coins payment mode');
                    }

                    const normalizedCoinValue = Number((normalizedCoinsRedeemed / 10).toFixed(2));
                    const normalizedCashPaid = Number(Math.max(0, computedSubtotal - normalizedCoinValue).toFixed(2));
                    const serverPricing: OrderPricing = {
                        normalizedItems,
                        subtotal: Number(computedSubtotal.toFixed(2)),
                        coinsRedeemed: normalizedCoinsRedeemed,
                        coinValue: normalizedCoinValue,
                        cashPaid: normalizedCashPaid,
                    };

                    validateClientPricing(body, serverPricing);

                    if (serverPricing.coinsRedeemed > 0 || serverPricing.cashPaid > 0) {
                        const walletDebit = await tx.execute({
                            sql: `UPDATE wallets
                                  SET coin_balance = coin_balance - ?,
                                      cash_balance = cash_balance - ?,
                                      updated_at = ?
                                  WHERE user_id = ?
                                    AND coin_balance >= ?
                                    AND cash_balance >= ?`,
                            args: [
                                serverPricing.coinsRedeemed,
                                serverPricing.cashPaid,
                                now,
                                userId,
                                serverPricing.coinsRedeemed,
                                serverPricing.cashPaid,
                            ],
                        });
                        const affected = Number((walletDebit as any).rowsAffected ?? 0);
                        if (affected === 0) {
                            throw new BadRequestError('Insufficient wallet balance');
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
                            JSON.stringify(serverPricing.normalizedItems),
                            serverPricing.subtotal,
                            serverPricing.cashPaid,
                            serverPricing.coinsRedeemed,
                            serverPricing.coinValue,
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

                    if (serverPricing.coinsRedeemed > 0) {
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                randomUUID(),
                                userId,
                                'PURCHASE',
                                -serverPricing.coinsRedeemed,
                                'COIN',
                                'COMPLETED',
                                `Order ${orderId} coin redemption`,
                                orderId,
                                now,
                            ],
                        });
                    }

                    if (serverPricing.cashPaid > 0) {
                        await tx.execute({
                            sql: `INSERT INTO transactions (
                                    id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                            args: [
                                randomUUID(),
                                userId,
                                'PURCHASE',
                                -serverPricing.cashPaid,
                                'CASH',
                                'COMPLETED',
                                `Order ${orderId} cash payment`,
                                orderId,
                                now,
                            ],
                        });

                        const shippingCity = String(body.shippingAddress.city || '').trim();
                        if (shippingCity) {
                            await distributePartnerCommissionsForCity({
                                tx: tx as any,
                                city: shippingCity,
                                sourceAmount: serverPricing.cashPaid,
                                sourceType: 'purchase',
                                sourceId: orderId,
                                sourceUserId: userId,
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
                            userId,
                            'order.create',
                            'order',
                            orderId,
                            JSON.stringify({
                                itemsCount: body.items.length,
                                subtotal: serverPricing.subtotal,
                                cashPaid: serverPricing.cashPaid,
                                coinsRedeemed: serverPricing.coinsRedeemed,
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
                    sql: 'SELECT user_id, status, status_history FROM orders WHERE id = ?',
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

                return {
                    updated: true,
                    status: body.status,
                    userId: String(existingRow.user_id),
                };
            });

            broadcast(`order:${id}`, 'order.updated', {
                orderId: id,
                status: data.status,
            });
            broadcast(`user:${data.userId}`, 'order.updated', {
                orderId: id,
                status: data.status,
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
                afterCommit: async (result) => {
                    if (result.cached) return;
                    const payload = result.payload as {
                        data?: { id?: string; userId?: string; status?: string };
                    };
                    const cancelledOrderId = payload.data?.id;
                    const cancelledUserId = payload.data?.userId;
                    if (!cancelledOrderId || !cancelledUserId) return;

                    broadcast(`order:${cancelledOrderId}`, 'order.cancelled', {
                        orderId: cancelledOrderId,
                        status: payload.data?.status ?? 'cancelled',
                    });
                    broadcast(`user:${cancelledUserId}`, 'order.cancelled', {
                        orderId: cancelledOrderId,
                        status: payload.data?.status ?? 'cancelled',
                    });
                    broadcast(`user:${cancelledUserId}`, 'wallet.updated', {
                        reason: 'order_cancel_refund',
                        orderId: cancelledOrderId,
                    });
                },
                handler: async (tx) => {
                    const orderResult = await tx.execute({
                        sql: `SELECT id, user_id, status, status_history, cash_paid, coins_redeemed, items
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

                    const parsedItems = (() => {
                        try {
                            const raw = JSON.parse(String((row as any).items || '[]'));
                            return Array.isArray(raw) ? raw : [];
                        } catch {
                            return [] as any[];
                        }
                    })();

                    for (const item of parsedItems) {
                        const productId = String((item as any)?.productId || (item as any)?.id || '').trim();
                        const qty = Number((item as any)?.quantity || 0);
                        if (!productId || !Number.isFinite(qty) || qty <= 0) continue;
                        await tx.execute({
                            sql: `UPDATE products
                                  SET stock = CASE WHEN stock IS NULL THEN NULL ELSE stock + ? END,
                                      in_stock = CASE WHEN stock IS NULL THEN in_stock ELSE 1 END,
                                      updated_at = ?
                                  WHERE id = ?`,
                            args: [qty, now, productId],
                        });
                    }

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
                                userId,
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
