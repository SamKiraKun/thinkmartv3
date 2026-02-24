// File: server/src/routes/products/index.ts
/**
 * Product Routes (Read-only for Wave 1)
 * 
 * GET /api/products          - List products (paginated, filterable)
 * GET /api/products/:id      - Get single product
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginationSchema, paginatedResponse } from '../../utils/pagination.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';

export default async function productRoutes(fastify: FastifyInstance) {

    const mapProductRow = (row: Record<string, any>) => ({
        id: row.id,
        name: row.name,
        description: row.description,
        price: row.price,
        category: row.category,
        image: row.image,
        images: row.images ? JSON.parse(row.images as string) : [],
        commission: row.commission,
        coinPrice: row.coin_price,
        inStock: Boolean(row.in_stock),
        stock: row.stock,
        badges: row.badges ? JSON.parse(row.badges as string) : [],
        coinOnly: Boolean(row.coin_only),
        cashOnly: Boolean(row.cash_only),
        deliveryDays: row.delivery_days,
        vendor: row.vendor,
        status: row.status || 'approved',
        moderationReason: row.moderation_reason || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    });

    // ─── List Products ────────────────────────────────────────────
    fastify.get('/api/products', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const category = query.category;
        const search = query.search;
        const vendor = query.vendor;
        const inStockOnly = query.inStock === 'true';
        const sortBy = query.sortBy || 'created_at';
        const sortOrder = query.sortOrder === 'asc' ? 'ASC' : 'DESC';

        const allowedSorts = ['created_at', 'price', 'name', 'commission'];
        const safeSort = allowedSorts.includes(sortBy) ? sortBy : 'created_at';

        // Build WHERE clause
        const conditions: string[] = [];
        const params: any[] = [];

        if (category) {
            conditions.push('category = ?');
            params.push(category);
        }
        if (search) {
            conditions.push('(name LIKE ? OR description LIKE ?)');
            params.push(`%${search}%`, `%${search}%`);
        }
        if (vendor) {
            conditions.push('vendor = ?');
            params.push(vendor);
        }
        conditions.push(`COALESCE(status, 'approved') = 'approved'`);
        if (inStockOnly) {
            conditions.push('in_stock = 1');
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        // Count
        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM products ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        // Fetch
        const result = await db.execute({
            sql: `SELECT * FROM products ${where} ORDER BY ${safeSort} ${sortOrder} LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const products = result.rows.map(row => mapProductRow(row as Record<string, any>));

        return paginatedResponse(products, total, page, limit);
    });

    // Owner/privileged listing (includes pending/rejected products)
    fastify.get('/api/products/mine', { preHandler: [requireAuth, requireRole('vendor', 'partner', 'admin', 'sub_admin')] }, async (request) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50')));
        const offset = (page - 1) * limit;
        const status = query.status;
        const ownerId = query.vendor && ['admin', 'sub_admin'].includes(String(request.user?.role || ''))
            ? String(query.vendor)
            : request.user!.uid;

        const conditions = ['vendor = ?'];
        const params: any[] = [ownerId];
        if (status) {
            conditions.push('COALESCE(status, ?) = ?');
            params.push('approved', status);
        }
        const where = `WHERE ${conditions.join(' AND ')}`;

        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as total FROM products ${where}`,
            args: params,
        });
        const total = Number(countRes.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT * FROM products ${where} ORDER BY created_at DESC, id DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        return paginatedResponse(
            result.rows.map((row) => mapProductRow(row as Record<string, any>)),
            total,
            page,
            limit
        );
    });

    // ─── Get Product ──────────────────────────────────────────────
    fastify.get('/api/products/:id', async (request, reply) => {
        const db = getDb();
        const { id } = request.params as { id: string };

        const result = await db.execute({
            sql: `SELECT * FROM products
                  WHERE id = ? AND COALESCE(status, 'approved') = 'approved'`,
            args: [id],
        });

        if (result.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Product not found' },
            });
        }

        const row = result.rows[0];
        return {
            data: {
                ...mapProductRow(row as Record<string, any>),
            },
        };
    });
}
