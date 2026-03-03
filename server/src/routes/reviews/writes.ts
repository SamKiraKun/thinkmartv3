// File: server/src/routes/reviews/writes.ts
/**
 * Review Write Routes (Wave 1 Writes)
 *
 * POST   /api/reviews                  - Create a review
 * POST   /api/products/:id/reviews     - Compatibility alias for product detail review submit
 * PATCH  /api/reviews/:id              - Update own review
 * DELETE /api/reviews/:id              - Delete own review
 * POST   /api/reviews/:id/helpful      - Mark review as helpful
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../../middleware/auth.js';
import { withTransaction } from '../../db/client.js';

export default async function reviewWriteRoutes(fastify: FastifyInstance) {
    // Create Review
    fastify.post('/api/reviews', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as {
            productId: string;
            orderId?: string;
            rating: number;
            title?: string;
            content: string;
            images?: string[];
        };

        // Validation
        if (!body.productId || !body.orderId || !body.content || !body.rating) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'productId, orderId, rating, and content are required' },
            });
        }

        if (body.rating < 1 || body.rating > 5) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Rating must be between 1 and 5' },
            });
        }

        // Check for duplicate review
        const existing = await db.execute({
            sql: 'SELECT id FROM reviews WHERE user_id = ? AND product_id = ?',
            args: [userId, body.productId],
        });

        if (existing.rows.length > 0) {
            return reply.status(409).send({
                error: { code: 'ALREADY_EXISTS', message: 'You have already reviewed this product' },
            });
        }

        // Get user name for display
        const userResult = await db.execute({
            sql: 'SELECT name, photo_url FROM users WHERE uid = ?',
            args: [userId],
        });
        const userName = (userResult.rows[0]?.name as string) || 'Anonymous';
        const userAvatar = (userResult.rows[0]?.photo_url as string | undefined) || null;

        // Check if user has purchased this product (verified review)
        const orderResult = await db.execute({
            sql: `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
            args: [body.orderId, userId],
        });
        if (orderResult.rows.length === 0) {
            return reply.status(400).send({
                error: { code: 'INVALID_ORDER', message: 'orderId must be one of your orders' },
            });
        }

        const deliveredOrderResult = await db.execute({
            sql: `SELECT id FROM orders WHERE id = ? AND user_id = ? AND status = 'delivered'`,
            args: [body.orderId, userId],
        });
        const verified = deliveredOrderResult.rows.length > 0;

        const id = randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO reviews (id, product_id, user_id, order_id, rating, title, content, images, user_name, user_avatar, helpful, verified, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'approved', ?)`,
            args: [
                id,
                body.productId,
                userId,
                body.orderId,
                body.rating,
                body.title || null,
                body.content,
                body.images ? JSON.stringify(body.images) : null,
                userName,
                userAvatar,
                verified ? 1 : 0,
                now,
            ],
        });

        // Update review stats (async, non-blocking)
        updateReviewStats(db, body.productId).catch(err =>
            console.error('Failed to update review stats:', err)
        );

        return reply.status(201).send({
            data: { id, productId: body.productId, rating: body.rating, createdAt: now },
        });
    });

    // Compatibility alias used by Flutter product detail submit action.
    fastify.post('/api/products/:id/reviews', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id: productId } = request.params as { id: string };

        const body = request.body as {
            orderId?: string;
            rating?: number;
            title?: string;
            content?: string;
            images?: string[];
        };

        const rating = Number(body.rating || 0);
        if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Rating must be between 1 and 5' },
            });
        }

        let orderId = String(body.orderId || '').trim();
        if (!orderId) {
            const latestOrder = await db.execute({
                sql: `SELECT id FROM orders
                      WHERE user_id = ? AND items LIKE ?
                      ORDER BY created_at DESC
                      LIMIT 1`,
                args: [userId, `%${productId}%`],
            });
            orderId = String(latestOrder.rows[0]?.id || '').trim();
        }

        if (!orderId) {
            return reply.status(400).send({
                error: {
                    code: 'INVALID_ORDER',
                    message: 'No matching order found for this product. Please provide orderId.',
                },
            });
        }

        const normalizedContent =
            String(body.content || '').trim() ||
            String(body.title || '').trim() ||
            'Review submitted from app';

        const existing = await db.execute({
            sql: 'SELECT id FROM reviews WHERE user_id = ? AND product_id = ?',
            args: [userId, productId],
        });
        if (existing.rows.length > 0) {
            return reply.status(409).send({
                error: { code: 'ALREADY_EXISTS', message: 'You have already reviewed this product' },
            });
        }

        const userResult = await db.execute({
            sql: 'SELECT name, photo_url FROM users WHERE uid = ?',
            args: [userId],
        });
        const userName = (userResult.rows[0]?.name as string) || 'Anonymous';
        const userAvatar = (userResult.rows[0]?.photo_url as string | undefined) || null;

        const orderResult = await db.execute({
            sql: `SELECT id FROM orders WHERE id = ? AND user_id = ?`,
            args: [orderId, userId],
        });
        if (orderResult.rows.length === 0) {
            return reply.status(400).send({
                error: { code: 'INVALID_ORDER', message: 'orderId must be one of your orders' },
            });
        }

        const deliveredOrderResult = await db.execute({
            sql: `SELECT id FROM orders WHERE id = ? AND user_id = ? AND status = 'delivered'`,
            args: [orderId, userId],
        });
        const verified = deliveredOrderResult.rows.length > 0;

        const id = randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO reviews (id, product_id, user_id, order_id, rating, title, content, images, user_name, user_avatar, helpful, verified, status, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, 'approved', ?)`,
            args: [
                id,
                productId,
                userId,
                orderId,
                rating,
                body.title || null,
                normalizedContent,
                body.images ? JSON.stringify(body.images) : null,
                userName,
                userAvatar,
                verified ? 1 : 0,
                now,
            ],
        });

        updateReviewStats(db, productId).catch(err =>
            console.error('Failed to update review stats:', err)
        );

        return reply.status(201).send({
            data: { id, productId, rating, createdAt: now },
        });
    });

    // Update Review
    fastify.patch('/api/reviews/:id', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        // Check ownership
        const existing = await db.execute({
            sql: 'SELECT id, product_id FROM reviews WHERE id = ? AND user_id = ?',
            args: [id, userId],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Review not found or not yours' },
            });
        }

        const body = request.body as {
            rating?: number;
            title?: string;
            content?: string;
            images?: string[];
        };

        if (body.rating && (body.rating < 1 || body.rating > 5)) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Rating must be between 1 and 5' },
            });
        }

        const updates: string[] = [];
        const params: any[] = [];

        if (body.rating !== undefined) { updates.push('rating = ?'); params.push(body.rating); }
        if (body.title !== undefined) { updates.push('title = ?'); params.push(body.title); }
        if (body.content !== undefined) { updates.push('content = ?'); params.push(body.content); }
        if (body.images !== undefined) { updates.push('images = ?'); params.push(JSON.stringify(body.images)); }

        if (updates.length === 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'No fields to update' },
            });
        }

        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(id);

        await db.execute({
            sql: `UPDATE reviews SET ${updates.join(', ')} WHERE id = ?`,
            args: params,
        });

        // Update stats if rating changed
        if (body.rating !== undefined) {
            updateReviewStats(db, existing.rows[0].product_id as string).catch(err =>
                console.error('Failed to update review stats:', err)
            );
        }

        return { data: { updated: true } };
    });

    // Delete Review
    fastify.delete('/api/reviews/:id', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        // Check ownership (or admin)
        const existing = await db.execute({
            sql: 'SELECT id, product_id, user_id FROM reviews WHERE id = ?',
            args: [id],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Review not found' },
            });
        }

        const review = existing.rows[0];
        const userResult = await db.execute({ sql: 'SELECT role FROM users WHERE uid = ?', args: [userId] });
        const isAdmin = ['admin', 'sub_admin'].includes(userResult.rows[0]?.role as string);

        if (review.user_id !== userId && !isAdmin) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Not authorized to delete this review' },
            });
        }

        await db.execute({ sql: 'DELETE FROM reviews WHERE id = ?', args: [id] });

        // Update stats
        updateReviewStats(db, review.product_id as string).catch(err =>
            console.error('Failed to update review stats:', err)
        );

        return { data: { deleted: true } };
    });

    // Mark Review as Helpful
    fastify.post('/api/reviews/:id/helpful', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        const existing = await db.execute({
            sql: 'SELECT id, helpful FROM reviews WHERE id = ?',
            args: [id],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Review not found' },
            });
        }

        const voteExists = await db.execute({
            sql: 'SELECT review_id FROM review_helpful WHERE review_id = ? AND user_id = ?',
            args: [id, userId],
        });
        if (voteExists.rows.length > 0) {
            return reply.status(409).send({
                error: { code: 'ALREADY_EXISTS', message: 'You already marked this review as helpful' },
            });
        }

        const result = await withTransaction(async (tx) => {
            const now = new Date().toISOString();
            await tx.execute({
                sql: `INSERT INTO review_helpful (review_id, user_id, helpful, created_at)
                      VALUES (?, ?, 1, ?)`,
                args: [id, userId, now],
            });

            await tx.execute({
                sql: 'UPDATE reviews SET helpful = helpful + 1 WHERE id = ?',
                args: [id],
            });

            const updated = await tx.execute({
                sql: 'SELECT helpful FROM reviews WHERE id = ?',
                args: [id],
            });

            return Number(updated.rows[0]?.helpful || 0);
        });

        return { data: { helpful: result } };
    });
}

// Helper: Update Review Stats
async function updateReviewStats(db: any, productId: string) {
    const stats = await db.execute({
        sql: `SELECT
            COUNT(*) as total,
            COALESCE(AVG(rating), 0) as avg_rating,
            SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1,
            SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
            SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
            SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
            SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5
          FROM reviews WHERE product_id = ? AND status = 'approved'`,
        args: [productId],
    });

    const row = stats.rows[0];
    const now = new Date().toISOString();
    const distribution = JSON.stringify({
        1: Number(row.r1), 2: Number(row.r2), 3: Number(row.r3),
        4: Number(row.r4), 5: Number(row.r5),
    });

    await db.execute({
        sql: `INSERT INTO review_stats (product_id, average_rating, total_reviews, rating_distribution, updated_at)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(product_id) DO UPDATE SET
            average_rating = excluded.average_rating,
            total_reviews = excluded.total_reviews,
            rating_distribution = excluded.rating_distribution,
            updated_at = excluded.updated_at`,
        args: [productId, Number(Number(row.avg_rating).toFixed(2)), Number(row.total), distribution, now],
    });
}
