import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';

type JsonObject = Record<string, any>;

function parseJson<T = any>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function parseOrderItems(value: unknown): any[] {
    const items = parseJson<any[]>(value, []);
    return Array.isArray(items) ? items : [];
}

function orderCreatedAtMs(row: Record<string, any>): number {
    const created = String(row.created_at || '');
    const ms = Date.parse(created);
    return Number.isFinite(ms) ? ms : 0;
}

function normalizeStatus(status: string): string {
    const s = String(status || '').toLowerCase();
    if (['pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled'].includes(s)) return s;
    if (s === 'refunded') return 'cancelled';
    return 'pending';
}

async function buildProductMap(productIds: string[]): Promise<Map<string, Record<string, any>>> {
    const uniqueIds = Array.from(new Set(productIds.filter(Boolean)));
    const map = new Map<string, Record<string, any>>();
    if (uniqueIds.length === 0) return map;
    const db = getDb();
    const placeholders = uniqueIds.map(() => '?').join(', ');
    const result = await db.execute({
        sql: `SELECT id, vendor, name, image, images FROM products WHERE id IN (${placeholders})`,
        args: uniqueIds,
    });
    for (const row of result.rows as Array<Record<string, any>>) {
        map.set(String(row.id), row);
    }
    return map;
}

async function getVendorOrdersInternal(vendorId: string, status?: string) {
    const db = getDb();
    const params: any[] = [];
    const conditions: string[] = [];
    if (status) {
        conditions.push('status = ?');
        params.push(status);
    }
    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const result = await db.execute({
        sql: `SELECT * FROM orders ${where} ORDER BY created_at DESC, id DESC LIMIT 1000`,
        args: params,
    });

    const rawOrders = result.rows as Array<Record<string, any>>;
    const productIds: string[] = [];
    for (const row of rawOrders) {
        for (const item of parseOrderItems(row.items)) {
            if (item?.productId) productIds.push(String(item.productId));
        }
    }
    const productMap = await buildProductMap(productIds);

    const orders = rawOrders
        .map((row) => {
            const items = parseOrderItems(row.items);
            const vendorItems = items
                .filter((item) => {
                    const pid = String(item?.productId || '');
                    const product = productMap.get(pid);
                    return String(product?.vendor || item?.vendor || item?.vendorId || '') === vendorId;
                })
                .map((item) => ({
                    productId: String(item?.productId || ''),
                    productName:
                        String(item?.productName || productMap.get(String(item?.productId || ''))?.name || 'Product'),
                    quantity: Number(item?.quantity || 0),
                    price: Number(item?.price || 0),
                }));

            if (vendorItems.length === 0) return null;

            const shipping = parseJson<JsonObject | null>(row.shipping_address, null);
            return {
                id: String(row.id),
                userId: String(row.user_id || ''),
                userName: String(row.user_name || ''),
                items: vendorItems,
                vendorItemCount: vendorItems.reduce((sum, item) => sum + Number(item.quantity || 0), 0),
                totalItemCount: items.reduce((sum, item) => sum + Number(item?.quantity || 0), 0),
                status: normalizeStatus(String(row.status || 'pending')),
                createdAt: row.created_at,
                shippingAddress: shipping
                    ? [shipping.addressLine1, shipping.addressLine2, shipping.city, shipping.state, shipping.pincode]
                        .filter(Boolean)
                        .join(', ')
                    : '',
                _createdAtMs: orderCreatedAtMs(row),
            };
        })
        .filter(Boolean) as Array<Record<string, any>>;

    orders.sort((a, b) => Number(b._createdAtMs || 0) - Number(a._createdAtMs || 0));
    return orders;
}

export default async function vendorRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('vendor'));

    fastify.get('/api/vendor/dashboard', async (request) => {
        const db = getDb();
        const vendorId = request.user!.uid;

        const productsResult = await db.execute({
            sql: `SELECT
                    COUNT(*) as total_products,
                    SUM(CASE WHEN in_stock = 1 THEN 1 ELSE 0 END) as active_products
                  FROM products
                  WHERE vendor = ?`,
            args: [vendorId],
        });

        const vendorOrders = await getVendorOrdersInternal(vendorId);
        let totalRevenue = 0;
        let pendingOrders = 0;
        for (const order of vendorOrders) {
            if (order.status === 'pending') pendingOrders += 1;
            if (order.status !== 'cancelled') {
                totalRevenue += (order.items as any[]).reduce(
                    (sum, item) => sum + Number(item.price || 0) * Number(item.quantity || 0),
                    0
                );
            }
        }

        return {
            data: {
                totalProducts: Number(productsResult.rows[0]?.total_products || 0),
                activeProducts: Number(productsResult.rows[0]?.active_products || 0),
                totalOrders: vendorOrders.length,
                pendingOrders,
                totalRevenue,
            },
        };
    });

    fastify.get('/api/vendor/orders', async (request) => {
        const vendorId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '25', 10)));
        const status = query.status && query.status !== 'all' ? String(query.status) : undefined;

        const all = await getVendorOrdersInternal(vendorId, status);
        const start = (page - 1) * limit;
        const sliced = all.slice(start, start + limit).map(({ _createdAtMs, ...rest }) => rest);
        return paginatedResponse(sliced, all.length, page, limit);
    });

    fastify.get('/api/vendor/analytics', async (request) => {
        const vendorId = request.user!.uid;
        const db = getDb();
        const now = new Date();
        const start30 = new Date(now);
        start30.setDate(now.getDate() - 29);
        const startIso = start30.toISOString();

        const ordersResult = await db.execute({
            sql: `SELECT * FROM orders WHERE created_at >= ? ORDER BY created_at ASC`,
            args: [startIso],
        });

        const allRows = ordersResult.rows as Array<Record<string, any>>;
        const productIds: string[] = [];
        for (const row of allRows) {
            for (const item of parseOrderItems(row.items)) {
                if (item?.productId) productIds.push(String(item.productId));
            }
        }
        const productMap = await buildProductMap(productIds);

        const dayMap = new Map<string, { revenue: number; orderCount: number }>();
        const topProducts = new Map<string, { totalSold: number; totalRevenue: number; name: string; imageUrl: string | null }>();
        const fulfillment = {
            averageProcessingHours: 0,
            onTimeRate: 100,
            pendingCount: 0,
            confirmedCount: 0,
            shippedCount: 0,
            deliveredCount: 0,
            cancelledCount: 0,
        };

        let totalRevenueLast30Days = 0;
        let totalOrdersLast30Days = 0;
        let cancelledCountForRate = 0;

        for (const row of allRows) {
            const items = parseOrderItems(row.items);
            const vendorItems = items.filter((item) => {
                const product = productMap.get(String(item?.productId || ''));
                return String(product?.vendor || item?.vendor || item?.vendorId || '') === vendorId;
            });
            if (vendorItems.length === 0) continue;

            const status = normalizeStatus(String(row.status || 'pending'));
            const createdAt = String(row.created_at || '');
            const dateKey = createdAt.slice(0, 10);
            const vendorRevenue = vendorItems.reduce(
                (sum, item) => sum + Number(item?.price || 0) * Number(item?.quantity || 0),
                0
            );

            totalOrdersLast30Days += 1;
            if (status !== 'cancelled') totalRevenueLast30Days += vendorRevenue;
            if (status === 'cancelled') cancelledCountForRate += 1;

            const day = dayMap.get(dateKey) || { revenue: 0, orderCount: 0 };
            if (status !== 'cancelled') day.revenue += vendorRevenue;
            day.orderCount += 1;
            dayMap.set(dateKey, day);

            if (status === 'pending') fulfillment.pendingCount += 1;
            else if (status === 'confirmed') fulfillment.confirmedCount += 1;
            else if (status === 'shipped') fulfillment.shippedCount += 1;
            else if (status === 'delivered') fulfillment.deliveredCount += 1;
            else if (status === 'cancelled') fulfillment.cancelledCount += 1;

            for (const item of vendorItems) {
                const pid = String(item?.productId || '');
                const product = productMap.get(pid);
                const key = pid || `${item?.productName || 'unknown'}`;
                const current = topProducts.get(key) || {
                    totalSold: 0,
                    totalRevenue: 0,
                    name: String(item?.productName || product?.name || 'Product'),
                    imageUrl: (() => {
                        const images = parseJson<string[]>(product?.images, []);
                        return (Array.isArray(images) && images[0]) || (product?.image ? String(product.image) : null);
                    })(),
                };
                current.totalSold += Number(item?.quantity || 0);
                current.totalRevenue += Number(item?.price || 0) * Number(item?.quantity || 0);
                topProducts.set(key, current);
            }
        }

        const revenueTrend: Array<{ date: string; revenue: number; orderCount: number }> = [];
        for (let i = 0; i < 30; i++) {
            const d = new Date(start30);
            d.setDate(start30.getDate() + i);
            const key = d.toISOString().slice(0, 10);
            const item = dayMap.get(key) || { revenue: 0, orderCount: 0 };
            revenueTrend.push({ date: key, revenue: item.revenue, orderCount: item.orderCount });
        }

        const topProductsArr = Array.from(topProducts.entries())
            .map(([productId, p]) => ({ productId, ...p }))
            .sort((a, b) => b.totalRevenue - a.totalRevenue)
            .slice(0, 5);

        const delivered = fulfillment.deliveredCount;
        const totalProcessed = delivered + fulfillment.cancelledCount;
        fulfillment.onTimeRate = totalProcessed > 0 ? Math.round((delivered / totalProcessed) * 100) : 100;
        fulfillment.averageProcessingHours = 24;

        return {
            data: {
                revenueTrend,
                topProducts: topProductsArr,
                fulfillment,
                summary: {
                    totalRevenueLast30Days,
                    totalOrdersLast30Days,
                    averageOrderValue: totalOrdersLast30Days > 0 ? Math.round(totalRevenueLast30Days / totalOrdersLast30Days) : 0,
                    returnRate: totalOrdersLast30Days > 0 ? Math.round((cancelledCountForRate / totalOrdersLast30Days) * 100) : 0,
                },
            },
        };
    });

    fastify.get('/api/vendor/store-profile', async (request) => {
        const db = getDb();
        const vendorId = request.user!.uid;
        const result = await db.execute({
            sql: 'SELECT uid, name, email, phone, city, state, vendor_config FROM users WHERE uid = ?',
            args: [vendorId],
        });
        const row = result.rows[0] as Record<string, any> | undefined;
        const cfg = parseJson<JsonObject>(row?.vendor_config, {});
        return {
            data: {
                vendorId,
                businessName: String(cfg.businessName || row?.name || ''),
                contactEmail: String(cfg.contactEmail || row?.email || ''),
                contactPhone: String(cfg.contactPhone || row?.phone || ''),
                addressLine1: String(cfg.addressLine1 || ''),
                addressLine2: String(cfg.addressLine2 || ''),
                city: String(cfg.city || row?.city || ''),
                state: String(cfg.state || row?.state || ''),
                pincode: String(cfg.pincode || ''),
                payoutMethod: String(cfg.payoutMethod || ''),
                payoutAccount: String(cfg.payoutAccount || ''),
                logoUrl: String(cfg.logoUrl || ''),
                bannerUrl: String(cfg.bannerUrl || ''),
            },
        };
    });

    fastify.patch('/api/vendor/store-profile', async (request) => {
        const db = getDb();
        const vendorId = request.user!.uid;
        const body = (request.body || {}) as JsonObject;
        const safeString = (value: unknown, maxLen: number) => String(value ?? '').trim().slice(0, maxLen);
        const result = await db.execute({
            sql: 'SELECT vendor_config, name, email, phone, city, state FROM users WHERE uid = ?',
            args: [vendorId],
        });
        const row = (result.rows[0] || {}) as Record<string, any>;
        const currentCfg = parseJson<JsonObject>(row.vendor_config, {});
        const nextCfg = {
            ...currentCfg,
            vendorId,
            businessName: body.businessName !== undefined ? safeString(body.businessName, 120) : currentCfg.businessName || row.name || '',
            contactEmail: body.contactEmail !== undefined ? safeString(body.contactEmail, 200) : currentCfg.contactEmail || row.email || '',
            contactPhone: body.contactPhone !== undefined ? safeString(body.contactPhone, 40) : currentCfg.contactPhone || row.phone || '',
            addressLine1: body.addressLine1 !== undefined ? safeString(body.addressLine1, 200) : currentCfg.addressLine1 || '',
            addressLine2: body.addressLine2 !== undefined ? safeString(body.addressLine2, 200) : currentCfg.addressLine2 || '',
            city: body.city !== undefined ? safeString(body.city, 80) : currentCfg.city || row.city || '',
            state: body.state !== undefined ? safeString(body.state, 80) : currentCfg.state || row.state || '',
            pincode: body.pincode !== undefined ? safeString(body.pincode, 20) : currentCfg.pincode || '',
            payoutMethod: body.payoutMethod !== undefined ? safeString(body.payoutMethod, 60) : currentCfg.payoutMethod || '',
            payoutAccount: body.payoutAccount !== undefined ? safeString(body.payoutAccount, 200) : currentCfg.payoutAccount || '',
            logoUrl: body.logoUrl !== undefined ? safeString(body.logoUrl, 500) : currentCfg.logoUrl || '',
            bannerUrl: body.bannerUrl !== undefined ? safeString(body.bannerUrl, 500) : currentCfg.bannerUrl || '',
            updatedAt: new Date().toISOString(),
        };

        await db.execute({
            sql: `UPDATE users
                  SET vendor_config = ?, city = COALESCE(NULLIF(?, ''), city), state = COALESCE(NULLIF(?, ''), state), updated_at = ?
                  WHERE uid = ?`,
            args: [JSON.stringify(nextCfg), String(nextCfg.city || ''), String(nextCfg.state || ''), new Date().toISOString(), vendorId],
        });

        return { data: { success: true, profile: nextCfg } };
    });
}
