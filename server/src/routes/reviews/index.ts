// File: server/src/routes/reviews/index.ts
/**
 * Review Routes (Read-only for Wave 1)
 * 
 * GET /api/reviews?productId=xxx    - List reviews for a product (paginated)
 * GET /api/reviews/stats/:productId - Get aggregate stats for a product
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function reviewRoutes(fastify: FastifyInstance) {
    const mapReviewRow = (row: Record<string, any>) => ({
        id: row.id,
        productId: row.product_id,
        userId: row.user_id,
        orderId: row.order_id,
        rating: row.rating,
        title: row.title,
        content: row.content,
        images: row.images ? JSON.parse(row.images as string) : [],
        userName: row.user_name,
        userAvatar: row.user_avatar || null,
        helpful: row.helpful,
        verified: Boolean(row.verified),
        status: row.status,
        createdAt: row.created_at,
        updatedAt: row.updated_at || null,
    });

    // ─── List Reviews for Product ─────────────────────────────────
    fastify.get('/api/reviews', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const productId = query.productId;

        if (!productId) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'productId is required' },
            });
        }

        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10')));
        const offset = (page - 1) * limit;

        // Count
        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM reviews WHERE product_id = ? AND status = 'approved'`,
            args: [productId],
        });
        const total = Number(countResult.rows[0].total);

        // Fetch (newest first)
        const result = await db.execute({
            sql: `SELECT * FROM reviews 
            WHERE product_id = ? AND status = 'approved'
            ORDER BY created_at DESC 
            LIMIT ? OFFSET ?`,
            args: [productId, limit, offset],
        });

        const reviews = result.rows.map((row) => mapReviewRow(row as Record<string, any>));

        return paginatedResponse(reviews, total, page, limit);
    });

    // ─── User's Reviews ─────────────────────────────────────────────────────
    fastify.get('/api/reviews/mine', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50')));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: 'SELECT COUNT(*) as total FROM reviews WHERE user_id = ?',
            args: [userId],
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM reviews
                  WHERE user_id = ?
                  ORDER BY created_at DESC
                  LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
        });

        return paginatedResponse(
            result.rows.map((row) => mapReviewRow(row as Record<string, any>)),
            total,
            page,
            limit
        );
    });

    // ─── Review Eligibility ────────────────────────────────────────────────
    fastify.get('/api/reviews/can-review', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const productId = query.productId;

        if (!productId) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'productId is required' },
            });
        }

        const reviewsResult = await db.execute({
            sql: 'SELECT order_id FROM reviews WHERE user_id = ? AND product_id = ?',
            args: [userId, productId],
        });
        const reviewedOrderIds = new Set(reviewsResult.rows.map((r) => String(r.order_id)));

        const ordersResult = await db.execute({
            sql: `SELECT id, items
                  FROM orders
                  WHERE user_id = ? AND status = 'delivered'
                  ORDER BY created_at DESC
                  LIMIT 100`,
            args: [userId],
        });

        for (const row of ordersResult.rows as Array<Record<string, any>>) {
            let items: Array<{ productId?: string }> = [];
            try {
                items = row.items ? (JSON.parse(String(row.items)) as Array<{ productId?: string }>) : [];
            } catch {
                items = [];
            }
            const hasProduct = items.some((item) => String(item.productId || '') === productId);
            if (hasProduct && !reviewedOrderIds.has(String(row.id))) {
                return reply.send({ data: { canReview: true, orderId: String(row.id) } });
            }
        }

        return reply.send({ data: { canReview: false } });
    });

    // ─── Review Stats for Product ─────────────────────────────────
    fastify.get('/api/reviews/stats/:productId', async (request, reply) => {
        const db = getDb();
        const { productId } = request.params as { productId: string };

        // Try the pre-computed review_stats table first
        const stats = await db.execute({
            sql: 'SELECT * FROM review_stats WHERE product_id = ?',
            args: [productId],
        });

        if (stats.rows.length > 0) {
            const row = stats.rows[0];
            return {
                data: {
                    productId: row.product_id,
                    averageRating: row.average_rating,
                    totalReviews: row.total_reviews,
                    ratingDistribution: row.rating_distribution
                        ? JSON.parse(row.rating_distribution as string)
                        : { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
                    updatedAt: row.last_updated || row.updated_at,
                },
            };
        }

        // Fallback: compute on the fly
        const computed = await db.execute({
            sql: `SELECT 
              COUNT(*) as total,
              COALESCE(AVG(rating), 0) as avg_rating,
              SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END) as r1,
              SUM(CASE WHEN rating = 2 THEN 1 ELSE 0 END) as r2,
              SUM(CASE WHEN rating = 3 THEN 1 ELSE 0 END) as r3,
              SUM(CASE WHEN rating = 4 THEN 1 ELSE 0 END) as r4,
              SUM(CASE WHEN rating = 5 THEN 1 ELSE 0 END) as r5
            FROM reviews 
            WHERE product_id = ? AND status = 'approved'`,
            args: [productId],
        });

        const row = computed.rows[0];
        return {
            data: {
                productId,
                averageRating: Number(Number(row.avg_rating).toFixed(2)),
                totalReviews: Number(row.total),
                ratingDistribution: {
                    1: Number(row.r1),
                    2: Number(row.r2),
                    3: Number(row.r3),
                    4: Number(row.r4),
                    5: Number(row.r5),
                },
            },
        };
    });
}
