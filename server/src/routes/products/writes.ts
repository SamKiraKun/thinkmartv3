// File: server/src/routes/products/writes.ts
/**
 * Product Write Routes (Vendor/Partner/Admin, Wave 1 Writes)
 * 
 * POST   /api/products           - Create product (vendor/partner/admin)
 * PATCH  /api/products/:id       - Update product (owner vendor/partner or admin)
 * DELETE /api/products/:id       - Delete product (owner vendor/partner or admin)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export default async function productWriteRoutes(fastify: FastifyInstance) {

    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('vendor', 'partner', 'admin', 'sub_admin'));

    // ─── Create Product ───────────────────────────────────────────
    fastify.post('/api/products', async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const body = request.body as {
            name: string;
            description: string;
            price: number;
            category: string;
            image: string;
            images?: string[];
            commission?: number;
            coinPrice?: number;
            stock?: number;
            badges?: string[];
            coinOnly?: boolean;
            cashOnly?: boolean;
            deliveryDays?: number;
            isActive?: boolean;
        };

        // Validation
        if (!body.name || !body.price || !body.category || !body.image) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'name, price, category, and image are required' },
            });
        }

        if (body.price <= 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Price must be positive' },
            });
        }

        const id = randomUUID();
        const now = new Date().toISOString();
        const userResult = await db.execute({
            sql: 'SELECT role FROM users WHERE uid = ?',
            args: [userId],
        });
        const role = String(userResult.rows[0]?.role || 'vendor');
        const autoApproved = ['admin', 'sub_admin'].includes(role);
        const status = autoApproved ? 'approved' : 'pending';

        await db.execute({
            sql: `INSERT INTO products (
              id, name, description, price, category, image, images,
              commission, coin_price, in_stock, stock, badges,
              coin_only, cash_only, delivery_days, vendor, status,
              moderation_reason, moderated_at, moderated_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                body.name.trim(),
                body.description?.trim() || '',
                body.price,
                body.category,
                body.image,
                body.images ? JSON.stringify(body.images) : null,
                body.commission || 0,
                body.coinPrice || 0,
                body.isActive !== undefined
                    ? (body.isActive ? 1 : 0)
                    : body.stock !== undefined ? (body.stock > 0 ? 1 : 0) : 1,
                body.stock ?? 0,
                body.badges ? JSON.stringify(body.badges) : null,
                body.coinOnly ? 1 : 0,
                body.cashOnly ? 1 : 0,
                body.deliveryDays || 7,
                userId,
                status,
                null,
                autoApproved ? now : null,
                autoApproved ? userId : null,
                now,
                now,
            ],
        });

        return reply.status(201).send({
            data: { id, name: body.name, createdAt: now, status },
        });
    });

    // ─── Update Product ───────────────────────────────────────────
    fastify.patch('/api/products/:id', async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        // Check product exists and user is owner or admin
        const existing = await db.execute({
            sql: 'SELECT id, vendor FROM products WHERE id = ?',
            args: [id],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Product not found' },
            });
        }

        const userResult = await db.execute({
            sql: 'SELECT role FROM users WHERE uid = ?',
            args: [userId],
        });
        const isAdmin = ['admin', 'sub_admin'].includes(userResult.rows[0]?.role as string);

        if (existing.rows[0].vendor !== userId && !isAdmin) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Not authorized to update this product' },
            });
        }

        const body = request.body as Record<string, any>;

        const fieldMap: Record<string, string> = {
            name: 'name', description: 'description', price: 'price',
            category: 'category', image: 'image', commission: 'commission',
            coinPrice: 'coin_price', stock: 'stock', deliveryDays: 'delivery_days',
        };

        const updates: string[] = [];
        const params: any[] = [];

        for (const [inputKey, colName] of Object.entries(fieldMap)) {
            if (body[inputKey] !== undefined) {
                updates.push(`${colName} = ?`);
                params.push(body[inputKey]);
            }
        }

        // Handle boolean/JSON fields
        if (body.inStock !== undefined) { updates.push('in_stock = ?'); params.push(body.inStock ? 1 : 0); }
        if (body.isActive !== undefined) { updates.push('in_stock = ?'); params.push(body.isActive ? 1 : 0); }
        if (body.coinOnly !== undefined) { updates.push('coin_only = ?'); params.push(body.coinOnly ? 1 : 0); }
        if (body.cashOnly !== undefined) { updates.push('cash_only = ?'); params.push(body.cashOnly ? 1 : 0); }
        if (body.images !== undefined) { updates.push('images = ?'); params.push(JSON.stringify(body.images)); }
        if (body.badges !== undefined) { updates.push('badges = ?'); params.push(JSON.stringify(body.badges)); }

        if (updates.length === 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'No fields to update' },
            });
        }

        updates.push('updated_at = ?');
        params.push(new Date().toISOString());
        params.push(id);

        await db.execute({
            sql: `UPDATE products SET ${updates.join(', ')} WHERE id = ?`,
            args: params,
        });

        return { data: { updated: true } };
    });

    // ─── Delete Product ───────────────────────────────────────────
    fastify.delete('/api/products/:id', async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        const existing = await db.execute({
            sql: 'SELECT id, vendor FROM products WHERE id = ?',
            args: [id],
        });

        if (existing.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Product not found' },
            });
        }

        const userResult = await db.execute({
            sql: 'SELECT role FROM users WHERE uid = ?',
            args: [userId],
        });
        const isAdmin = ['admin', 'sub_admin'].includes(userResult.rows[0]?.role as string);

        if (existing.rows[0].vendor !== userId && !isAdmin) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Not authorized to delete this product' },
            });
        }

        await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });

        return { data: { deleted: true } };
    });
}
