// File: server/src/routes/wishlists/index.ts
/**
 * Wishlist Routes (Read for Wave 1)
 * 
 * GET /api/wishlists               - User's wishlist (paginated)
 * GET /api/wishlists/check/:productId - Check if product is in wishlist
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function wishlistRoutes(fastify: FastifyInstance) {

    // ─── Get User's Wishlist ──────────────────────────────────────
    fastify.get('/api/wishlists', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: 'SELECT COUNT(*) as total FROM wishlists WHERE user_id = ?',
            args: [userId],
        });
        const total = Number(countResult.rows[0].total);

        // Join with products to return product details
        const result = await db.execute({
            sql: `SELECT w.id, w.product_id, w.added_at,
                   COALESCE(p.name, w.product_name) as name,
                   COALESCE(p.price, w.product_price) as price,
                   COALESCE(p.image, w.product_image) as image,
                   p.category,
                   p.in_stock,
                   COALESCE(p.coin_price, w.product_coin_price) as coin_price
            FROM wishlists w
            LEFT JOIN products p ON w.product_id = p.id
            WHERE w.user_id = ?
            ORDER BY w.added_at DESC
            LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
        });

        const items = result.rows.map(row => ({
            id: row.id,
            productId: row.product_id,
            addedAt: row.added_at,
            product: {
                name: row.name,
                price: row.price,
                image: row.image,
                category: row.category,
                inStock: row.in_stock === null || row.in_stock === undefined ? null : Boolean(row.in_stock),
                coinPrice: row.coin_price,
            },
        }));

        return paginatedResponse(items, total, page, limit);
    });

    // ─── Check if Product is Wishlisted ───────────────────────────
    fastify.get('/api/wishlists/check/:productId', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { productId } = request.params as { productId: string };

        const result = await db.execute({
            sql: 'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
            args: [userId, productId],
        });

        return {
            data: {
                isWishlisted: result.rows.length > 0,
                wishlistId: result.rows.length > 0 ? result.rows[0].id : null,
            },
        };
    });
}
