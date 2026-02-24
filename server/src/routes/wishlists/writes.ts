// File: server/src/routes/wishlists/writes.ts
/**
 * Wishlist Write Routes (Wave 1 Writes)
 * 
 * POST   /api/wishlists           - Add product to wishlist
 * DELETE /api/wishlists/:id       - Remove from wishlist
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../../middleware/auth.js';

export default async function wishlistWriteRoutes(fastify: FastifyInstance) {

    // ─── Add to Wishlist ──────────────────────────────────────────
    fastify.post('/api/wishlists', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as { productId: string };
        if (!body.productId) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'productId is required' },
            });
        }

        // Check if already wishlisted
        const existing = await db.execute({
            sql: 'SELECT id FROM wishlists WHERE user_id = ? AND product_id = ?',
            args: [userId, body.productId],
        });

        if (existing.rows.length > 0) {
            return reply.status(409).send({
                error: { code: 'ALREADY_EXISTS', message: 'Product already in wishlist' },
                data: { id: existing.rows[0].id },
            });
        }

        // Verify product exists
        const product = await db.execute({
            sql: 'SELECT id, name, image, price, coin_price FROM products WHERE id = ?',
            args: [body.productId],
        });

        if (product.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Product not found' },
            });
        }
        const productRow = product.rows[0];

        const id = randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO wishlists (
                id, user_id, product_id, product_name, product_image, product_price, product_coin_price, added_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                userId,
                body.productId,
                (productRow.name as string) || '',
                (productRow.image as string) || '',
                Number(productRow.price) || 0,
                productRow.coin_price ?? null,
                now,
            ],
        });

        return reply.status(201).send({
            data: { id, productId: body.productId, addedAt: now },
        });
    });

    // ─── Remove from Wishlist ─────────────────────────────────────
    fastify.delete('/api/wishlists/:id', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        // Check ownership
        const existing = await db.execute({
            sql: 'SELECT id FROM wishlists WHERE id = ? AND user_id = ?',
            args: [id, userId],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Wishlist item not found' },
            });
        }

        await db.execute({
            sql: 'DELETE FROM wishlists WHERE id = ? AND user_id = ?',
            args: [id, userId],
        });

        return reply.status(200).send({ data: { deleted: true } });
    });
}
