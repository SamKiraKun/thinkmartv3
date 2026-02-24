// File: server/src/routes/orders/index.ts
/**
 * Order Routes (Read for Wave 2)
 * 
 * GET /api/orders               - User's orders (paginated, filterable)
 * GET /api/orders/:id           - Single order detail
 * GET /api/orders/vendor        - Vendor's received orders (vendor role)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

function formatOrder(row: Record<string, any>) {
    return {
        id: row.id,
        userId: row.user_id,
        userEmail: row.user_email,
        userName: row.user_name,
        items: row.items ? JSON.parse(row.items as string) : [],
        subtotal: row.subtotal,
        cashPaid: row.cash_paid,
        coinsRedeemed: row.coins_redeemed,
        coinValue: row.coin_value,
        couponCode: row.coupon_code,
        couponDiscount: row.coupon_discount,
        shippingAddress: row.shipping_address ? JSON.parse(row.shipping_address as string) : null,
        status: row.status,
        statusHistory: row.status_history ? JSON.parse(row.status_history as string) : [],
        trackingNumber: row.tracking_number,
        city: row.city,
        adminNotes: row.admin_notes,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export default async function orderRoutes(fastify: FastifyInstance) {

    // ─── User's Orders ────────────────────────────────────────────
    fastify.get('/api/orders', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10')));
        const offset = (page - 1) * limit;
        const status = query.status; // pending, confirmed, shipped, delivered, cancelled

        const conditions: string[] = ['user_id = ?'];
        const params: any[] = [userId];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM orders ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        return paginatedResponse(result.rows.map(formatOrder), total, page, limit);
    });

    // ─── Single Order Detail ──────────────────────────────────────
    fastify.get('/api/orders/:id', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;
        const { id } = request.params as { id: string };

        const result = await db.execute({
            sql: 'SELECT * FROM orders WHERE id = ?',
            args: [id],
        });

        if (result.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Order not found' },
            });
        }

        const order = result.rows[0];
        // Ensure user can only see their own orders (unless admin/vendor)
        const userResult = await db.execute({
            sql: 'SELECT role FROM users WHERE uid = ?',
            args: [userId],
        });
        const userRole = userResult.rows[0]?.role;
        const isPrivileged = ['admin', 'sub_admin', 'vendor'].includes(userRole as string);

        if (order.user_id !== userId && !isPrivileged) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Access denied' },
            });
        }

        return { data: formatOrder(order) };
    });

    // ─── Vendor's Received Orders ─────────────────────────────────
    fastify.get('/api/orders/vendor', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        // Verify vendor role
        const userResult = await db.execute({
            sql: 'SELECT role FROM users WHERE uid = ?',
            args: [userId],
        });

        if (!userResult.rows[0] || !['vendor', 'admin', 'sub_admin'].includes(userResult.rows[0].role as string)) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Vendor access required' },
            });
        }

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '10')));
        const offset = (page - 1) * limit;
        const status = query.status;

        // Vendor orders are identified by items containing the vendor's products
        // For now, we use JSON_EXTRACT to find orders with vendor's products
        // In production, consider a denormalized vendor_id column on orders
        const conditions: string[] = [`items LIKE ?`];
        const params: any[] = [`%${userId}%`];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM orders ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        return paginatedResponse(result.rows.map(formatOrder), total, page, limit);
    });
}
