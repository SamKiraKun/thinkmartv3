// File: server/src/routes/catalog/index.ts
/**
 * Catalog Routes (Read-only)
 * 
 * GET /api/catalog/categories  - List categories
 * GET /api/catalog/brands      - List brands  
 * GET /api/catalog/banners     - List active banners
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';

export default async function catalogRoutes(fastify: FastifyInstance) {

    // ─── Categories ───────────────────────────────────────────────
    fastify.get('/api/catalog/categories', async (request, reply) => {
        const db = getDb();

        const result = await db.execute(
            `SELECT * FROM categories WHERE is_active = 1 ORDER BY sort_order ASC, name ASC`
        );

        return {
            data: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                icon: null, // current SQL schema has no icon column
                image: row.image,
                parentId: row.parent_id,
                sortOrder: row.sort_order,
                isActive: Boolean(row.is_active),
                createdAt: row.created_at,
            })),
        };
    });

    // ─── Brands ───────────────────────────────────────────────────
    fastify.get('/api/catalog/brands', async (request, reply) => {
        const db = getDb();

        const result = await db.execute(
            `SELECT * FROM brands WHERE is_active = 1 ORDER BY name ASC`
        );

        return {
            data: result.rows.map(row => ({
                id: row.id,
                name: row.name,
                slug: row.slug,
                logo: row.logo,
                sortOrder: 0, // current SQL schema has no sort_order column for brands
                isActive: Boolean(row.is_active),
                createdAt: row.created_at,
            })),
        };
    });

    // ─── Banners ──────────────────────────────────────────────────
    fastify.get('/api/catalog/banners', async (request, reply) => {
        const db = getDb();
        const now = new Date().toISOString();

        // Active banners: is_active AND within date range (if set)
        const result = await db.execute({
            sql: `SELECT * FROM banners 
            WHERE is_active = 1 
              AND (start_date IS NULL OR start_date <= ?)
              AND (end_date IS NULL OR end_date >= ?)
            ORDER BY sort_order ASC`,
            args: [now, now],
        });

        return {
            data: result.rows.map(row => ({
                id: row.id,
                title: row.title,
                image: row.image,
                link: row.link,
                linkType: null, // current SQL schema has no link_type column
                placement: null, // current SQL schema has no placement column
                sortOrder: row.sort_order,
                isActive: Boolean(row.is_active),
                startDate: row.start_date,
                endDate: row.end_date,
                createdAt: row.created_at,
            })),
        };
    });
}
