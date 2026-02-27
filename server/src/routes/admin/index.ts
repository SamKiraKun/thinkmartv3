// File: server/src/routes/admin/index.ts
/**
 * Admin Dashboard Routes (Read for Wave 2)
 * 
 * All routes require admin or sub_admin role.
 * 
 * GET /api/admin/stats          - Platform-wide metrics
 * GET /api/admin/users          - All users (paginated, searchable)
 * GET /api/admin/withdrawals    - All withdrawal requests (paginated)
 * GET /api/admin/orders         - All orders (paginated)
 */

import { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';

export default async function adminRoutes(fastify: FastifyInstance) {

    // Apply auth + role check to all routes in this module
    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('admin', 'sub_admin'));

    const normalizeTaskTypeToDb = (input?: string): string => {
        const raw = String(input || 'SURVEY').trim().toUpperCase();
        if (['SURVEY', 'SPIN', 'LUCKY_BOX', 'VIDEO', 'WEBSITE', 'WATCH_VIDEO'].includes(raw)) return raw;
        switch (raw) {
            case 'APP':
            case 'SOCIAL':
                return 'WEBSITE';
            default:
                return raw;
        }
    };

    const normalizeTaskTypeFromDb = (input?: string): string => {
        const raw = String(input || '').trim().toUpperCase();
        if (raw === 'WATCH_VIDEO' || raw === 'VIDEO') return 'video';
        if (raw === 'SURVEY') return 'survey';
        if (raw === 'WEBSITE') return 'website';
        if (raw === 'SPIN') return 'spin';
        if (raw === 'LUCKY_BOX') return 'lucky_box';
        return raw.toLowerCase() || 'task';
    };

    const parseJsonSafe = (value: unknown) => {
        if (!value) return null;
        try {
            return JSON.parse(String(value));
        } catch {
            return null;
        }
    };

    const getRangeStartIso = (range: string): string => {
        const now = new Date();
        const start = new Date(now);
        switch (range) {
            case 'day':
                start.setDate(now.getDate() - 1);
                break;
            case 'month':
                start.setMonth(now.getMonth() - 1);
                break;
            case 'week':
            default:
                start.setDate(now.getDate() - 7);
                break;
        }
        return start.toISOString();
    };

    const transactionCategoryFromType = (type: string): string => {
        const t = String(type || '').toUpperCase();
        if (t === 'WITHDRAWAL') return 'withdrawal';
        if (t === 'PURCHASE') return 'purchase';
        if (t === 'MEMBERSHIP_FEE') return 'membership';
        if (t === 'TASK_REWARD') return 'task';
        if (t === 'PARTNER_COMMISSION') return 'partner_commission';
        if (t === 'REFERRAL_BONUS' || t === 'TEAM_INCOME') return 'referral';
        if (t === 'ADMIN_CREDIT') return 'admin';
        return 'misc';
    };

    const isCreditTransaction = (type: string, amount: number): boolean => {
        const t = String(type || '').toUpperCase();
        if (amount > 0) return true;
        if (['WITHDRAWAL', 'PURCHASE', 'MEMBERSHIP_FEE'].includes(t)) return false;
        return amount >= 0;
    };

    const FEATURE_FLAGS_KEY = 'feature_flags';
    const allowedFeatureRoles = new Set(['user', 'vendor', 'partner', 'organization', 'admin', 'sub_admin']);

    const normalizeFeatureFlags = (value: unknown): Array<Record<string, any>> => {
        const parsed = parseJsonSafe(value);
        const arr = Array.isArray(parsed)
            ? parsed
            : Array.isArray((parsed as any)?.flags)
                ? (parsed as any).flags
                : [];
        return arr
            .filter((f: unknown) => f && typeof f === 'object' && typeof (f as any).id === 'string')
            .map((f: unknown) => {
                const item = f as Record<string, any>;
                return {
                    id: String(item.id),
                    name: String(item.name || item.id),
                    description: item.description ? String(item.description) : '',
                    enabled: Boolean(item.enabled),
                    targetRoles: Array.isArray(item.targetRoles)
                        ? item.targetRoles.map((r: unknown) => String(r)).filter((r: string) => allowedFeatureRoles.has(r))
                        : [],
                    targetCities: Array.isArray(item.targetCities)
                        ? item.targetCities.map((c: unknown) => String(c).trim()).filter(Boolean)
                        : [],
                    rolloutPercentage: Math.max(0, Math.min(100, Number(item.rolloutPercentage ?? 100) || 100)),
                    createdAt: item.createdAt ? String(item.createdAt) : new Date().toISOString(),
                    updatedAt: item.updatedAt ? String(item.updatedAt) : undefined,
                    updatedBy: item.updatedBy ? String(item.updatedBy) : undefined,
                };
            });
    };

    const parsePartnerConfig = (value: unknown): Record<string, any> | null => {
        const raw = parseJsonSafe(value) as Record<string, any> | null;
        const assignedCities = Array.isArray(raw?.assignedCities)
            ? raw!.assignedCities.map((c: unknown) => String(c).trim()).filter(Boolean)
            : [];
        const commissionPercentagesRaw =
            raw?.commissionPercentages && typeof raw.commissionPercentages === 'object'
                ? raw.commissionPercentages as Record<string, unknown>
                : {};
        const commissionPercentages: Record<string, number> = {};
        for (const [city, pct] of Object.entries(commissionPercentagesRaw)) {
            commissionPercentages[String(city)] = Number(pct || 0);
        }
        if (assignedCities.length > 0) {
            return {
                ...raw,
                assignedCities,
                commissionPercentages,
                assignedCity: String(raw?.assignedCity || assignedCities[0] || ''),
                commissionPercentage: Number(
                    raw?.commissionPercentage ?? commissionPercentages[assignedCities[0]] ?? 0
                ),
            };
        }
        const assignedCity = String(raw?.assignedCity || '').trim();
        const commissionPercentage = Number(raw?.commissionPercentage || 0);
        if (assignedCity) {
            return {
                ...raw,
                assignedCity,
                commissionPercentage,
                assignedCities: [assignedCity],
                commissionPercentages: { [assignedCity]: commissionPercentage },
            };
        }
        return null;
    };

    const userStatusLabel = (row: Record<string, any>): 'active' | 'suspended' | 'pending' => {
        if (Boolean(row.is_banned)) return 'suspended';
        if (!Boolean(row.is_active)) return 'pending';
        return 'active';
    };

    const isPrivilegedRole = (role: unknown): boolean =>
        ['admin', 'sub_admin'].includes(String(role || ''));

    const assertActorCanMutateUser = ({
        actorId,
        actorRole,
        targetId,
        targetRole,
        requestedRole,
        action,
    }: {
        actorId: string;
        actorRole: string;
        targetId: string;
        targetRole: string;
        requestedRole?: string;
        action: string;
    }) => {
        if (action === 'role_update' && actorId === targetId) {
            throw new BadRequestError('You cannot change your own role');
        }
        if (action === 'status_ban' && actorId === targetId) {
            throw new BadRequestError('You cannot ban your own account');
        }

        if (actorRole === 'sub_admin') {
            if (isPrivilegedRole(targetRole)) {
                throw new ForbiddenError('Sub-admin cannot modify admin or sub-admin accounts');
            }
            if (requestedRole && isPrivilegedRole(requestedRole)) {
                throw new ForbiddenError('Sub-admin cannot assign admin or sub-admin roles');
            }
        }
    };

    // ─── Platform Stats ───────────────────────────────────────────
    fastify.get('/api/admin/stats', async (request, reply) => {
        const db = getDb();

        const [users, orders, revenue, wallets, withdrawals, products] = await Promise.all([
            db.execute(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN membership_active = 1 THEN 1 ELSE 0 END) as active_members,
        SUM(CASE WHEN is_banned = 1 THEN 1 ELSE 0 END) as banned
      FROM users`),

            db.execute(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'delivered' THEN 1 ELSE 0 END) as delivered,
        COALESCE(SUM(cash_paid), 0) as total_revenue
      FROM orders`),

            db.execute(`SELECT 
        COALESCE(SUM(amount), 0) as total_transactions
      FROM transactions WHERE status = 'COMPLETED'`),

            db.execute(`SELECT 
        COALESCE(SUM(coin_balance), 0) as total_coins,
        COALESCE(SUM(cash_balance), 0) as total_cash
      FROM wallets`),

            db.execute(`SELECT 
        COUNT(*) as total,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_paid
      FROM withdrawals`),

            db.execute(`SELECT COUNT(*) as total FROM products`),
        ]);

        return {
            data: {
                users: {
                    total: Number(users.rows[0].total),
                    activeMembers: Number(users.rows[0].active_members),
                    banned: Number(users.rows[0].banned),
                },
                orders: {
                    total: Number(orders.rows[0].total),
                    pending: Number(orders.rows[0].pending),
                    delivered: Number(orders.rows[0].delivered),
                    totalRevenue: Number(orders.rows[0].total_revenue),
                },
                transactions: {
                    totalValue: Number(revenue.rows[0].total_transactions),
                },
                wallets: {
                    totalCoinsInCirculation: Number(wallets.rows[0].total_coins),
                    totalCashInWallets: Number(wallets.rows[0].total_cash),
                },
                withdrawals: {
                    total: Number(withdrawals.rows[0].total),
                    pending: Number(withdrawals.rows[0].pending),
                    totalPaid: Number(withdrawals.rows[0].total_paid),
                },
                products: {
                    total: Number(products.rows[0].total),
                },
            },
        };
    });

    // ─── All Users ────────────────────────────────────────────────
    fastify.get('/api/admin/users', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const search = query.search;
        const role = query.role;
        const membership = query.membership;
        const city = query.city;
        const kycStatus = query.kycStatus;

        const conditions: string[] = [];
        const params: any[] = [];

        if (search) {
            conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR uid LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term, term, term);
        }
        if (role) {
            conditions.push('role = ?');
            params.push(role);
        }
        if (membership === 'active') {
            conditions.push('membership_active = 1');
        } else if (membership === 'inactive') {
            conditions.push('membership_active = 0');
        }
        if (city) {
            conditions.push('city = ?');
            params.push(city);
        }
        if (kycStatus) {
            conditions.push('kyc_status = ?');
            params.push(kycStatus);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM users ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT uid, name, email, phone, role, state, city, 
                   membership_active, is_active, is_banned, kyc_status,
                   own_referral_code, referred_by, partner_config, created_at, updated_at
            FROM users ${where} 
            ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const users = result.rows.map(row => ({
            id: row.uid,
            uid: row.uid,
            name: row.name,
            email: row.email,
            phone: row.phone,
            role: row.role,
            state: row.state,
            city: row.city,
            membershipActive: Boolean(row.membership_active),
            isActive: Boolean(row.is_active),
            isBanned: Boolean(row.is_banned),
            kycStatus: row.kyc_status,
            ownReferralCode: row.own_referral_code,
            referredBy: row.referred_by,
            partnerConfig: row.partner_config ? JSON.parse(row.partner_config as string) : null,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));

        return paginatedResponse(users, total, page, limit);
    });

    // ─── Update User Status (ban/unban) ────────────────────────────────────
    fastify.patch('/api/admin/users/:id/status', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const actorRole = request.user!.role;
        const { id } = request.params as { id: string };
        const body = request.body as { status?: 'active' | 'banned'; reason?: string };

        if (!body.status || !['active', 'banned'].includes(body.status)) {
            throw new BadRequestError('status must be active or banned');
        }
        if (body.status === 'banned' && !body.reason?.trim()) {
            throw new BadRequestError('reason is required when banning a user');
        }

        const now = new Date().toISOString();
        const userResult = await db.execute({
            sql: 'SELECT uid, role, is_banned FROM users WHERE uid = ?',
            args: [id],
        });
        if (userResult.rows.length === 0) {
            throw new NotFoundError('User not found');
        }
        const targetRole = String(userResult.rows[0].role || '');
        assertActorCanMutateUser({
            actorId: adminId,
            actorRole,
            targetId: id,
            targetRole,
            action: body.status === 'banned' ? 'status_ban' : 'status_unban',
        });

        await db.execute({
            sql: `UPDATE users
                  SET is_banned = ?, is_active = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [body.status === 'banned' ? 1 : 0, body.status === 'active' ? 1 : 0, now, id],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                body.status === 'banned' ? 'user.ban' : 'user.unban',
                'user',
                id,
                JSON.stringify({ reason: body.reason?.trim() || null }),
                request.ip,
                now,
            ],
        });

        return reply.send({ data: { updated: true, status: body.status } });
    });

    // ─── Update User Role ──────────────────────────────────────────────────
    fastify.patch('/api/admin/users/:id/role', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const actorRole = request.user!.role;
        const { id } = request.params as { id: string };
        const body = request.body as { role?: string };
        const allowedRoles = ['user', 'admin', 'sub_admin', 'vendor', 'partner', 'organization'];

        if (!body.role || !allowedRoles.includes(body.role)) {
            throw new BadRequestError('Invalid role');
        }

        const now = new Date().toISOString();
        const existing = await db.execute({
            sql: 'SELECT uid, role FROM users WHERE uid = ?',
            args: [id],
        });
        if (existing.rows.length === 0) {
            throw new NotFoundError('User not found');
        }
        const fromRole = String(existing.rows[0].role || '');
        const toRole = String(body.role || '');
        assertActorCanMutateUser({
            actorId: adminId,
            actorRole,
            targetId: id,
            targetRole: fromRole,
            requestedRole: toRole,
            action: 'role_update',
        });

        await db.execute({
            sql: `UPDATE users
                  SET role = ?, partner_config = CASE WHEN ? = 'partner' THEN partner_config ELSE NULL END, updated_at = ?
                  WHERE uid = ?`,
            args: [body.role, body.role, now, id],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'user.role_update',
                'user',
                id,
                JSON.stringify({ fromRole, toRole }),
                request.ip,
                now,
            ],
        });

        return reply.send({ data: { updated: true, role: body.role } });
    });

    // ─── Update Partner Config ─────────────────────────────────────────────
    fastify.patch('/api/admin/users/:id/partner-config', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as {
            assignedCity?: string;
            commissionPercentage?: number;
            assignedCities?: string[];
            commissionPercentages?: Record<string, number>;
            status?: 'active' | 'suspended' | 'pending';
        };

        const existing = await db.execute({
            sql: 'SELECT uid, role, partner_config FROM users WHERE uid = ?',
            args: [id],
        });
        if (existing.rows.length === 0) throw new NotFoundError('User not found');
        if (String(existing.rows[0].role) !== 'partner') throw new BadRequestError('User must have partner role');

        const requestedCities = Array.isArray(body.assignedCities)
            ? body.assignedCities.map((c) => String(c).trim()).filter(Boolean)
            : [];
        const normalizedRequested = new Set<string>();
        for (const city of requestedCities) {
            const key = city.toLowerCase();
            if (normalizedRequested.has(key)) {
                throw new BadRequestError(`Duplicate city in assignedCities: ${city}`);
            }
            normalizedRequested.add(key);
        }

        const singleAssignedCity = String(body.assignedCity || '').trim();
        const hasMulti = requestedCities.length > 0;
        const hasSingle = Boolean(singleAssignedCity);
        if (!hasMulti && !hasSingle) {
            throw new BadRequestError('assignedCity or assignedCities is required');
        }
        if (body.status && !['active', 'suspended', 'pending'].includes(String(body.status))) {
            throw new BadRequestError('status must be active, suspended, or pending');
        }

        const commissionPercentages: Record<string, number> = {};
        if (hasMulti) {
            const rawMap =
                body.commissionPercentages && typeof body.commissionPercentages === 'object'
                    ? body.commissionPercentages
                    : {};
            for (const key of Object.keys(rawMap as Record<string, number>)) {
                if (!requestedCities.some((city) => city.toLowerCase() === String(key).trim().toLowerCase())) {
                    throw new BadRequestError(`commissionPercentages contains unknown city: ${key}`);
                }
            }
            for (const city of requestedCities) {
                const pct = Number((rawMap as any)[city] ?? 0);
                if (!Number.isFinite(pct) || pct < 0 || pct > 20) {
                    throw new BadRequestError(`commissionPercentages.${city} must be between 0 and 20`);
                }
                commissionPercentages[city] = pct;
            }
        } else {
            const pct = Number(body.commissionPercentage);
            if (!Number.isFinite(pct) || pct < 1 || pct > 20) {
                throw new BadRequestError('commissionPercentage must be between 1 and 20');
            }
            commissionPercentages[singleAssignedCity] = pct;
        }
        const assignedCities = hasMulti ? requestedCities : [singleAssignedCity];
        const assignedCity = assignedCities[0];
        const commissionPercentage = Number(commissionPercentages[assignedCity] || 0);

        const partners = await db.execute({
            sql: `SELECT uid, partner_config FROM users
                  WHERE role = 'partner' AND uid != ? AND partner_config IS NOT NULL`,
            args: [id],
        });

        const allocatedByCity = new Map<string, number>();
        for (const row of partners.rows as Array<Record<string, any>>) {
            const cfg = parsePartnerConfig(row.partner_config);
            if (!cfg) continue;
            const cities = Array.isArray(cfg.assignedCities) ? cfg.assignedCities : [];
            const percMap = (cfg.commissionPercentages && typeof cfg.commissionPercentages === 'object')
                ? cfg.commissionPercentages as Record<string, number>
                : {};
            for (const city of cities) {
                const key = String(city).trim().toLowerCase();
                if (!key) continue;
                allocatedByCity.set(key, Number(allocatedByCity.get(key) || 0) + Number(percMap[city] || 0));
            }
        }

        for (const city of assignedCities) {
            const key = city.toLowerCase();
            const allocated = Number(allocatedByCity.get(key) || 0);
            const requested = Number(commissionPercentages[city] || 0);
            if (allocated + requested > 20) {
                throw new BadRequestError(`City allocation exceeds 20% for ${city} (currently allocated: ${allocated}%)`);
            }
        }

        const now = new Date().toISOString();
        const partnerConfigObj = {
            assignedCity,
            commissionPercentage,
            assignedCities,
            commissionPercentages,
            status: body.status || parsePartnerConfig(existing.rows[0].partner_config)?.status || 'active',
            assignedAt: now,
            assignedBy: adminId,
        };

        const status = body.status;
        const isBanned = status === 'suspended' ? 1 : 0;
        const isActive = status === 'pending' ? 0 : 1;

        await db.execute({
            sql: `UPDATE users
                  SET partner_config = ?, city = ?, is_banned = CASE WHEN ? IS NULL THEN is_banned ELSE ? END,
                      is_active = CASE WHEN ? IS NULL THEN is_active ELSE ? END, updated_at = ?
                  WHERE uid = ?`,
            args: [
                JSON.stringify(partnerConfigObj),
                assignedCity,
                status ?? null,
                isBanned,
                status ?? null,
                isActive,
                now,
                id,
            ],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'partner.config_update',
                'user',
                id,
                JSON.stringify({ assignedCities, commissionPercentages, status: status || undefined }),
                request.ip,
                now,
            ],
        });

        return reply.send({
            data: {
                updated: true,
                partnerConfig: partnerConfigObj,
            },
        });
    });

    // ——— Update Organization Config ————————————————————————————————————————————————
    fastify.patch('/api/admin/users/:id/org-config', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as {
            commissionPercentage?: number;
            status?: 'active' | 'suspended' | 'pending';
            orgName?: string;
            orgType?: string;
        };

        const existing = await db.execute({
            sql: 'SELECT uid, role, name, org_config, is_active, is_banned FROM users WHERE uid = ?',
            args: [id],
        });
        if (existing.rows.length === 0) throw new NotFoundError('User not found');
        if (String(existing.rows[0].role) !== 'organization') {
            throw new BadRequestError('User must have organization role');
        }

        const prevCfg = (parseJsonSafe(existing.rows[0].org_config) as Record<string, any> | null) || {};
        if (body.status && !['active', 'suspended', 'pending'].includes(String(body.status))) {
            throw new BadRequestError('status must be active, suspended, or pending');
        }
        if (body.commissionPercentage !== undefined) {
            const pct = Number(body.commissionPercentage);
            if (!Number.isFinite(pct) || pct < 0 || pct > 20) {
                throw new BadRequestError('commissionPercentage must be between 0 and 20');
            }
        }
        const now = new Date().toISOString();
        const nextCfg = {
            ...prevCfg,
            orgName: body.orgName !== undefined ? String(body.orgName || '').trim() : String(prevCfg.orgName || existing.rows[0].name || ''),
            orgType: body.orgType !== undefined ? String(body.orgType || '').trim() : String(prevCfg.orgType || 'organization'),
            commissionPercentage:
                body.commissionPercentage !== undefined
                    ? Math.max(0, Math.min(20, Number(body.commissionPercentage) || 0))
                    : Number(prevCfg.commissionPercentage ?? 10),
            status: body.status || String(prevCfg.status || userStatusLabel(existing.rows[0] as any)),
            updatedAt: now,
            updatedBy: adminId,
        };

        const status = body.status;
        const isBanned = status === 'suspended' ? 1 : 0;
        const isActive = status === 'pending' ? 0 : 1;

        await db.execute({
            sql: `UPDATE users
                  SET org_config = ?,
                      is_banned = CASE WHEN ? IS NULL THEN is_banned ELSE ? END,
                      is_active = CASE WHEN ? IS NULL THEN is_active ELSE ? END,
                      updated_at = ?
                  WHERE uid = ?`,
            args: [
                JSON.stringify(nextCfg),
                status ?? null,
                isBanned,
                status ?? null,
                isActive,
                now,
                id,
            ],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'organization.config_update',
                'user',
                id,
                JSON.stringify({ commissionPercentage: nextCfg.commissionPercentage, status: nextCfg.status }),
                request.ip,
                now,
            ],
        });

        return { data: { updated: true, orgConfig: nextCfg } };
    });

    // ─── Wallet Adjustment (Admin) ─────────────────────────────────────────
    fastify.post('/api/admin/users/:id/wallet-adjust', async (request, reply) => {
        const adminId = request.user!.uid;
        const actorRole = request.user!.role;
        const { id } = request.params as { id: string };
        const body = request.body as {
            deltaAmount?: number;
            currency?: 'COIN' | 'CASH';
            reason?: string;
            referenceId?: string;
        };

        const deltaAmount = Number(body.deltaAmount);
        if (!Number.isFinite(deltaAmount) || deltaAmount === 0) {
            throw new BadRequestError('deltaAmount must be a non-zero number');
        }
        if (!body.currency || !['COIN', 'CASH'].includes(body.currency)) {
            throw new BadRequestError('currency must be COIN or CASH');
        }
        if (!body.reason?.trim()) {
            throw new BadRequestError('reason is required');
        }
        const currency = body.currency;
        const reason = body.reason.trim();

        const now = new Date().toISOString();
        const txnId = randomUUID();
        const walletColumn = currency === 'COIN' ? 'coin_balance' : 'cash_balance';

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const target = await tx.execute({
                    sql: 'SELECT uid, role FROM users WHERE uid = ?',
                    args: [id],
                });
                if (target.rows.length === 0) {
                    throw new NotFoundError('User not found');
                }
                const targetRole = String(target.rows[0].role || '');
                assertActorCanMutateUser({
                    actorId: adminId,
                    actorRole,
                    targetId: id,
                    targetRole,
                    action: 'wallet_adjust',
                });

                await tx.execute({
                    sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, updated_at)
                          VALUES (?, 0, 0, ?)
                          ON CONFLICT(user_id) DO NOTHING`,
                    args: [id, now],
                });

                if (deltaAmount > 0) {
                    await tx.execute({
                        sql: `UPDATE wallets
                              SET ${walletColumn} = ${walletColumn} + ?, updated_at = ?
                              WHERE user_id = ?`,
                        args: [deltaAmount, now, id],
                    });
                } else {
                    const debit = await tx.execute({
                        sql: `UPDATE wallets
                              SET ${walletColumn} = ${walletColumn} + ?, updated_at = ?
                              WHERE user_id = ? AND ${walletColumn} >= ?`,
                        args: [deltaAmount, now, id, Math.abs(deltaAmount)],
                    });
                    const affected = Number((debit as any).rowsAffected ?? 0);
                    if (affected === 0) {
                        throw new BadRequestError(`Insufficient ${currency.toLowerCase()} balance`);
                    }
                }

                await tx.execute({
                    sql: `INSERT INTO transactions (
                            id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        txnId,
                        id,
                        'ADMIN_CREDIT',
                        deltaAmount,
                        currency,
                        'COMPLETED',
                        reason,
                        body.referenceId?.trim() || null,
                        now,
                    ],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'wallet.admin_adjust',
                        'wallet',
                        id,
                        JSON.stringify({
                            deltaAmount,
                            currency,
                            reason,
                            referenceId: body.referenceId?.trim() || null,
                            transactionId: txnId,
                        }),
                        request.ip,
                        now,
                    ],
                });

                return {
                    statusCode: 200,
                    payload: { data: { id: txnId, status: 'completed' } },
                };
            },
        });
    });

    // ─── Admin User Detail ─────────────────────────────────────────────────
    fastify.get('/api/admin/users/:id', async (request, reply) => {
        const db = getDb();
        const { id } = request.params as { id: string };

        const [userResult, walletResult, withdrawalCountResult] = await Promise.all([
            db.execute({
                sql: `SELECT uid, name, email, phone, role, city, state, kyc_status
                      FROM users WHERE uid = ?`,
                args: [id],
            }),
            db.execute({
                sql: `SELECT cash_balance, coin_balance FROM wallets WHERE user_id = ?`,
                args: [id],
            }),
            db.execute({
                sql: `SELECT COUNT(*) as total FROM withdrawals WHERE user_id = ?`,
                args: [id],
            }),
        ]);

        if (userResult.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'User not found' },
            });
        }

        const user = userResult.rows[0];
        const wallet = walletResult.rows[0];

        return {
            data: {
                uid: user.uid,
                name: user.name,
                email: user.email,
                phone: user.phone,
                role: user.role,
                city: user.city,
                state: user.state,
                kycStatus: user.kyc_status,
                wallet: {
                    cashBalance: Number(wallet?.cash_balance || 0),
                    coinBalance: Number(wallet?.coin_balance || 0),
                },
                withdrawalCount: Number(withdrawalCountResult.rows[0]?.total || 0),
            },
        };
    });

    // ─── All Withdrawals (Admin View) ─────────────────────────────
    fastify.get('/api/admin/withdrawals', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const status = query.status;
        const city = query.city;
        const minAmount = query.minAmount ? Number(query.minAmount) : undefined;
        const maxAmount = query.maxAmount ? Number(query.maxAmount) : undefined;

        const conditions: string[] = [];
        const params: any[] = [];

        if (status) {
            conditions.push('w.status = ?');
            params.push(status);
        }
        if (city) {
            conditions.push('u.city = ?');
            params.push(city);
        }
        if (Number.isFinite(minAmount)) {
            conditions.push('w.amount >= ?');
            params.push(minAmount);
        }
        if (Number.isFinite(maxAmount)) {
            conditions.push('w.amount <= ?');
            params.push(maxAmount);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM withdrawals w ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT w.*, u.name as user_name, u.email as user_email, u.phone as user_phone, u.city as user_city, u.kyc_status as user_kyc_status
            FROM withdrawals w
            LEFT JOIN users u ON w.user_id = u.uid
            ${where}
            ORDER BY w.requested_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const withdrawals = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            userName: row.user_name,
            userEmail: row.user_email,
            userPhone: row.user_phone,
            userCity: row.user_city,
            amount: row.amount,
            method: row.method,
            status: row.status,
            bankDetails: row.bank_details ? JSON.parse(row.bank_details as string) : null,
            upiId: row.upi_id,
            rejectionReason: row.rejection_reason,
            adminNotes: row.admin_notes,
            kycStatus: row.user_kyc_status,
            requestedAt: row.requested_at,
            processedAt: row.processed_at,
            processedBy: row.processed_by,
        }));

        return paginatedResponse(withdrawals, total, page, limit);
    });

    // ─── All Orders (Admin View) ──────────────────────────────────
    fastify.get('/api/admin/orders', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const status = query.status;
        const city = query.city;
        const fromDate = query.fromDate;
        const toDate = query.toDate;

        const conditions: string[] = [];
        const params: any[] = [];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (city) {
            conditions.push('city = ?');
            params.push(city);
        }
        if (fromDate) {
            conditions.push('created_at >= ?');
            params.push(fromDate);
        }
        if (toDate) {
            conditions.push('created_at <= ?');
            params.push(toDate);
        }

        const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM orders ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT * FROM orders ${where} ORDER BY created_at DESC LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const orders = result.rows.map(row => ({
            id: row.id,
            userId: row.user_id,
            userEmail: row.user_email,
            userName: row.user_name,
            items: row.items ? JSON.parse(row.items as string) : [],
            subtotal: row.subtotal,
            cashPaid: row.cash_paid,
            status: row.status,
            city: row.city,
            createdAt: row.created_at,
            updatedAt: row.updated_at,
        }));

        return paginatedResponse(orders, total, page, limit);
    });

    // --- KYC Requests (Admin) -------------------------------------------------
    fastify.get('/api/admin/kyc/requests', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '30')));
        const offset = (page - 1) * limit;
        const status = query.status;

        if (status && !['pending', 'verified', 'rejected'].includes(status)) {
            throw new BadRequestError('Invalid KYC status');
        }

        const where = status ? 'WHERE u.kyc_status = ?' : '';
        const params = status ? [status] : [];

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM users u ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    u.uid,
                    u.name,
                    u.email,
                    u.phone,
                    u.city,
                    u.kyc_status,
                    u.kyc_data,
                    u.kyc_submitted_at,
                    u.kyc_rejection_reason
                  FROM users u
                  ${where}
                  ORDER BY COALESCE(u.kyc_submitted_at, u.updated_at) DESC, u.uid DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const requests = result.rows.map((row) => {
            let kycData: Record<string, any> | null = null;
            try {
                kycData = row.kyc_data ? JSON.parse(String(row.kyc_data)) : null;
            } catch {
                kycData = null;
            }

            return {
                userId: row.uid,
                userName: row.name,
                userEmail: row.email,
                userPhone: row.phone,
                userCity: row.city,
                status: row.kyc_status,
                submittedAt: row.kyc_submitted_at,
                kycData,
                idDocumentUrl: kycData?.idDocumentUrl || null,
                addressProofUrl: kycData?.addressProofUrl || null,
                rejectionReason: row.kyc_rejection_reason,
            };
        });

        return paginatedResponse(requests, total, page, limit);
    });

    fastify.post('/api/admin/kyc/:id/approve', async (request, reply) => {
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const existing = await tx.execute({
                    sql: 'SELECT uid, kyc_status FROM users WHERE uid = ?',
                    args: [id],
                });
                if (existing.rows.length === 0) {
                    throw new NotFoundError('User not found');
                }

                const currentStatus = String(existing.rows[0].kyc_status || 'not_submitted');
                if (!['pending', 'rejected', 'verified'].includes(currentStatus)) {
                    throw new BadRequestError('Invalid KYC state');
                }

                const now = new Date().toISOString();
                await tx.execute({
                    sql: `UPDATE users
                          SET kyc_status = 'verified',
                              kyc_verified_at = ?,
                              kyc_rejection_reason = NULL,
                              updated_at = ?
                          WHERE uid = ?`,
                    args: [now, now, id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'kyc.approve',
                        'user',
                        id,
                        JSON.stringify({ fromStatus: currentStatus, toStatus: 'verified' }),
                        request.ip,
                        now,
                    ],
                });

                return { statusCode: 200, payload: { data: { updated: true, status: 'verified' } } };
            },
        });
    });

    fastify.post('/api/admin/kyc/:id/reject', async (request, reply) => {
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as { reason?: string };
        const reason = body.reason?.trim();

        if (!reason) {
            throw new BadRequestError('reason is required');
        }

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const existing = await tx.execute({
                    sql: 'SELECT uid, kyc_status FROM users WHERE uid = ?',
                    args: [id],
                });
                if (existing.rows.length === 0) {
                    throw new NotFoundError('User not found');
                }

                const currentStatus = String(existing.rows[0].kyc_status || 'not_submitted');
                const now = new Date().toISOString();

                await tx.execute({
                    sql: `UPDATE users
                          SET kyc_status = 'rejected',
                              kyc_rejection_reason = ?,
                              kyc_verified_at = NULL,
                              updated_at = ?
                          WHERE uid = ?`,
                    args: [reason, now, id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'kyc.reject',
                        'user',
                        id,
                        JSON.stringify({ fromStatus: currentStatus, toStatus: 'rejected', reason }),
                        request.ip,
                        now,
                    ],
                });

                return { statusCode: 200, payload: { data: { updated: true, status: 'rejected' } } };
            },
        });
    });

    // --- Product Moderation (Admin) ------------------------------------------
    fastify.get('/api/admin/products/moderation', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const status = query.status;

        if (status && !['pending', 'approved', 'rejected', 'suspended'].includes(status)) {
            throw new BadRequestError('Invalid product status');
        }

        const conditions: string[] = [];
        const params: any[] = [];
        if (status) {
            conditions.push(`COALESCE(p.status, 'approved') = ?`);
            params.push(status);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM products p ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    p.id,
                    p.name,
                    p.price,
                    p.category,
                    p.vendor,
                    COALESCE(u.name, p.vendor) as vendor_name,
                    COALESCE(p.status, 'approved') as status,
                    COALESCE(p.stock, 0) as stock,
                    p.created_at,
                    p.moderation_reason
                  FROM products p
                  LEFT JOIN users u ON u.uid = p.vendor
                  ${where}
                  ORDER BY p.created_at DESC, p.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const products = result.rows.map((row) => ({
            id: row.id,
            name: row.name,
            price: Number(row.price || 0),
            vendorId: row.vendor,
            vendorName: row.vendor_name,
            category: row.category,
            status: row.status,
            stock: Number(row.stock || 0),
            createdAt: row.created_at,
            rejectionReason: row.moderation_reason || null,
        }));

        return paginatedResponse(products, total, page, limit);
    });

    fastify.post('/api/admin/products/:id/approve', async (request, reply) => {
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const existing = await tx.execute({
                    sql: `SELECT id, COALESCE(status, 'approved') as status FROM products WHERE id = ?`,
                    args: [id],
                });
                if (existing.rows.length === 0) {
                    throw new NotFoundError('Product not found');
                }
                const now = new Date().toISOString();

                await tx.execute({
                    sql: `UPDATE products
                          SET status = 'approved',
                              moderation_reason = NULL,
                              moderated_at = ?,
                              moderated_by = ?,
                              updated_at = ?
                          WHERE id = ?`,
                    args: [now, adminId, now, id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'product.approve',
                        'product',
                        id,
                        JSON.stringify({ fromStatus: existing.rows[0].status, toStatus: 'approved' }),
                        request.ip,
                        now,
                    ],
                });

                return { statusCode: 200, payload: { data: { updated: true, status: 'approved' } } };
            },
        });
    });

    fastify.post('/api/admin/products/:id/reject', async (request, reply) => {
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as { reason?: string };
        const reason = body.reason?.trim();
        if (!reason) {
            throw new BadRequestError('reason is required');
        }

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const existing = await tx.execute({
                    sql: `SELECT id, COALESCE(status, 'approved') as status FROM products WHERE id = ?`,
                    args: [id],
                });
                if (existing.rows.length === 0) {
                    throw new NotFoundError('Product not found');
                }
                const now = new Date().toISOString();

                await tx.execute({
                    sql: `UPDATE products
                          SET status = 'rejected',
                              moderation_reason = ?,
                              moderated_at = ?,
                              moderated_by = ?,
                              updated_at = ?
                          WHERE id = ?`,
                    args: [reason, now, adminId, now, id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'product.reject',
                        'product',
                        id,
                        JSON.stringify({ fromStatus: existing.rows[0].status, toStatus: 'rejected', reason }),
                        request.ip,
                        now,
                    ],
                });

                return { statusCode: 200, payload: { data: { updated: true, status: 'rejected' } } };
            },
        });
    });

    // --- Task Management (Admin) ---------------------------------------------
    fastify.get('/api/admin/tasks', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const status = (query.status || '').trim().toLowerCase();
        const type = (query.type || '').trim().toLowerCase();
        const search = (query.search || '').trim();

        const conditions: string[] = [];
        const params: any[] = [];

        if (status === 'active') {
            conditions.push('COALESCE(t.is_archived, 0) = 0');
            conditions.push('t.is_active = 1');
        } else if (status === 'inactive') {
            conditions.push('COALESCE(t.is_archived, 0) = 0');
            conditions.push('t.is_active = 0');
        } else if (status === 'archived') {
            conditions.push('COALESCE(t.is_archived, 0) = 1');
        }

        if (type) {
            if (type === 'video') {
                conditions.push(`t.type IN ('VIDEO', 'WATCH_VIDEO')`);
            } else {
                conditions.push('t.type = ?');
                params.push(normalizeTaskTypeToDb(type));
            }
        }

        if (search) {
            conditions.push('(t.title LIKE ? OR t.description LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM tasks t ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    t.*,
                    COALESCE(tc.total_completions, 0) as total_completions
                  FROM tasks t
                  LEFT JOIN (
                    SELECT task_id, COUNT(*) as total_completions
                    FROM user_task_completions
                    GROUP BY task_id
                  ) tc ON tc.task_id = t.id
                  ${where}
                  ORDER BY COALESCE(t.is_archived, 0) ASC, t.created_at DESC, t.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const tasks = result.rows.map((row) => {
            const config = parseJsonSafe(row.config) as Record<string, any> | null;
            const questions = parseJsonSafe(row.questions) as Array<Record<string, any>> | null;
            const typeUi = normalizeTaskTypeFromDb(String(row.type || ''));
            return {
                id: row.id,
                title: row.title,
                description: row.description,
                type: typeUi,
                rewardAmount: Number(row.reward || 0),
                rewardType: String(row.reward_type || 'COIN').toUpperCase() === 'CASH' ? 'cash' : 'coins',
                duration: row.min_duration != null ? Number(row.min_duration) : null,
                minDuration: row.min_duration != null ? Number(row.min_duration) : null,
                url: config?.url ?? config?.videoUrl ?? null,
                youtubeId: config?.youtubeId ?? null,
                videoUrl: config?.videoUrl ?? null,
                isActive: Boolean(row.is_active),
                isArchived: Boolean(row.is_archived ?? 0),
                dailyLimit: row.max_completions_per_day != null ? Number(row.max_completions_per_day) : null,
                totalCompletions: Number(row.total_completions || 0),
                priority: 0,
                createdAt: row.created_at,
                questions: questions ?? null,
            };
        });

        return paginatedResponse(tasks, total, page, limit);
    });

    fastify.post('/api/admin/tasks', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const body = request.body as Record<string, any>;

        const title = String(body.title || '').trim();
        if (!title) throw new BadRequestError('title is required');

        const typeDb = normalizeTaskTypeToDb(body.type);
        const rewardAmount = Number(body.rewardAmount ?? body.reward ?? 0);
        if (!Number.isFinite(rewardAmount) || rewardAmount < 0) {
            throw new BadRequestError('rewardAmount must be a non-negative number');
        }
        const rewardType = String(body.rewardType || 'coins').toUpperCase() === 'CASH' ? 'CASH' : 'COIN';

        const minDurationRaw = body.minDuration ?? body.duration;
        const minDuration = minDurationRaw == null || minDurationRaw === ''
            ? null
            : Math.max(0, Number(minDurationRaw));
        if (minDuration !== null && !Number.isFinite(minDuration)) {
            throw new BadRequestError('minDuration must be a number');
        }

        const maxCompletionsPerDayRaw = body.dailyLimit ?? body.maxCompletionsPerDay;
        const maxCompletionsPerDay =
            maxCompletionsPerDayRaw == null || maxCompletionsPerDayRaw === ''
                ? null
                : Math.max(0, Number(maxCompletionsPerDayRaw));
        if (maxCompletionsPerDay !== null && !Number.isFinite(maxCompletionsPerDay)) {
            throw new BadRequestError('dailyLimit must be a number');
        }

        const configPayload: Record<string, any> = {};
        if (body.url) configPayload.url = String(body.url).trim();
        if (body.videoUrl) configPayload.videoUrl = String(body.videoUrl).trim();
        if (body.youtubeId) configPayload.youtubeId = String(body.youtubeId).trim();

        const questions = Array.isArray(body.questions) ? body.questions : null;
        const id = randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO tasks (
                    id, title, description, type, reward, reward_type, frequency,
                    min_duration, max_completions_per_day, questions, is_active, created_at, config, is_archived, archived_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, NULL)`,
            args: [
                id,
                title,
                String(body.description || '').trim(),
                typeDb,
                rewardAmount,
                rewardType,
                String(body.frequency || 'ONCE').toUpperCase(),
                minDuration,
                maxCompletionsPerDay,
                questions ? JSON.stringify(questions) : null,
                body.isActive === false ? 0 : 1,
                now,
                Object.keys(configPayload).length ? JSON.stringify(configPayload) : null,
            ],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'task.create',
                'task',
                id,
                JSON.stringify({ type: typeDb, rewardAmount, rewardType }),
                request.ip,
                now,
            ],
        });

        return reply.status(201).send({ data: { id, createdAt: now } });
    });

    fastify.patch('/api/admin/tasks/:id', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as Record<string, any>;

        const existing = await db.execute({
            sql: 'SELECT id, config FROM tasks WHERE id = ?',
            args: [id],
        });
        if (existing.rows.length === 0) {
            throw new NotFoundError('Task not found');
        }

        const updates: string[] = [];
        const params: any[] = [];
        const now = new Date().toISOString();

        if (body.title !== undefined) {
            updates.push('title = ?');
            params.push(String(body.title || '').trim());
        }
        if (body.description !== undefined) {
            updates.push('description = ?');
            params.push(String(body.description || '').trim());
        }
        if (body.isActive !== undefined) {
            updates.push('is_active = ?');
            params.push(body.isActive ? 1 : 0);
        }
        if (body.rewardAmount !== undefined || body.reward !== undefined) {
            const rewardAmount = Number(body.rewardAmount ?? body.reward);
            if (!Number.isFinite(rewardAmount) || rewardAmount < 0) {
                throw new BadRequestError('rewardAmount must be a non-negative number');
            }
            updates.push('reward = ?');
            params.push(rewardAmount);
        }
        if (body.rewardType !== undefined) {
            const rewardType = String(body.rewardType).toUpperCase() === 'CASH' ? 'CASH' : 'COIN';
            updates.push('reward_type = ?');
            params.push(rewardType);
        }
        if (body.minDuration !== undefined || body.duration !== undefined) {
            const val = body.minDuration ?? body.duration;
            const minDuration = val == null || val === '' ? null : Number(val);
            if (minDuration !== null && (!Number.isFinite(minDuration) || minDuration < 0)) {
                throw new BadRequestError('minDuration must be a non-negative number');
            }
            updates.push('min_duration = ?');
            params.push(minDuration);
        }
        if (body.dailyLimit !== undefined || body.maxCompletionsPerDay !== undefined) {
            const val = body.dailyLimit ?? body.maxCompletionsPerDay;
            const dailyLimit = val == null || val === '' ? null : Number(val);
            if (dailyLimit !== null && (!Number.isFinite(dailyLimit) || dailyLimit < 0)) {
                throw new BadRequestError('dailyLimit must be a non-negative number');
            }
            updates.push('max_completions_per_day = ?');
            params.push(dailyLimit);
        }
        if (body.questions !== undefined) {
            if (body.questions !== null && !Array.isArray(body.questions)) {
                throw new BadRequestError('questions must be an array or null');
            }
            updates.push('questions = ?');
            params.push(body.questions ? JSON.stringify(body.questions) : null);
        }
        if (
            body.url !== undefined ||
            body.videoUrl !== undefined ||
            body.youtubeId !== undefined ||
            body.config !== undefined
        ) {
            const existingConfig = parseJsonSafe(existing.rows[0].config) as Record<string, any> | null;
            const nextConfig = {
                ...(existingConfig || {}),
                ...(body.config && typeof body.config === 'object' ? body.config : {}),
            } as Record<string, any>;
            if (body.url !== undefined) nextConfig.url = body.url || null;
            if (body.videoUrl !== undefined) nextConfig.videoUrl = body.videoUrl || null;
            if (body.youtubeId !== undefined) nextConfig.youtubeId = body.youtubeId || null;
            Object.keys(nextConfig).forEach((key) => {
                if (nextConfig[key] == null || nextConfig[key] === '') delete nextConfig[key];
            });
            updates.push('config = ?');
            params.push(Object.keys(nextConfig).length ? JSON.stringify(nextConfig) : null);
        }

        if (updates.length === 0) {
            throw new BadRequestError('No fields to update');
        }

        updates.push('is_archived = COALESCE(is_archived, 0)');
        params.push(id);

        await db.execute({
            sql: `UPDATE tasks SET ${updates.join(', ')} WHERE id = ?`,
            args: params,
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'task.update',
                'task',
                id,
                JSON.stringify({ fields: Object.keys(body || {}) }),
                request.ip,
                now,
            ],
        });

        return { data: { updated: true } };
    });

    fastify.post('/api/admin/tasks/:id/archive', async (request, reply) => {
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };

        return runIdempotentMutation({
            request,
            reply,
            userId: adminId,
            handler: async (tx) => {
                const existing = await tx.execute({
                    sql: 'SELECT id, COALESCE(is_archived, 0) as is_archived FROM tasks WHERE id = ?',
                    args: [id],
                });
                if (existing.rows.length === 0) {
                    throw new NotFoundError('Task not found');
                }

                const now = new Date().toISOString();
                await tx.execute({
                    sql: `UPDATE tasks
                          SET is_archived = 1, is_active = 0, archived_at = ?
                          WHERE id = ?`,
                    args: [now, id],
                });

                await tx.execute({
                    sql: `INSERT INTO audit_logs (
                            id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    args: [
                        randomUUID(),
                        adminId,
                        'task.archive',
                        'task',
                        id,
                        JSON.stringify({ archived: true }),
                        request.ip,
                        now,
                    ],
                });

                return { statusCode: 200, payload: { data: { archived: true } } };
            },
        });
    });

    // --- Analytics (Admin) ---------------------------------------------------
    fastify.get('/api/admin/analytics/revenue-summary', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const range = ['day', 'week', 'month'].includes(query.range) ? query.range : 'week';
        const startIso = getRangeStartIso(range);

        const [ordersResult, withdrawalsResult, commissionResult, membershipResult] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) as order_count, COALESCE(SUM(cash_paid), 0) as gross_revenue
                      FROM orders
                      WHERE created_at >= ? AND status != 'cancelled'`,
                args: [startIso],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(amount), 0) as withdrawals_processed
                      FROM withdrawals
                      WHERE status = 'completed' AND COALESCE(processed_at, requested_at) >= ?`,
                args: [startIso],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(CASE WHEN currency IN ('CASH', 'INR') THEN amount ELSE 0 END), 0) as commissions_paid
                      FROM transactions
                      WHERE status = 'COMPLETED'
                        AND type IN ('PARTNER_COMMISSION', 'REFERRAL_BONUS', 'TEAM_INCOME')
                        AND created_at >= ?`,
                args: [startIso],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(ABS(amount)), 0) as membership_revenue
                      FROM transactions
                      WHERE status = 'COMPLETED'
                        AND type = 'MEMBERSHIP_FEE'
                        AND currency IN ('CASH', 'INR')
                        AND created_at >= ?`,
                args: [startIso],
            }),
        ]);

        const grossRevenue = Number(ordersResult.rows[0]?.gross_revenue || 0) + Number(membershipResult.rows[0]?.membership_revenue || 0);
        const withdrawalsProcessed = Number(withdrawalsResult.rows[0]?.withdrawals_processed || 0);
        const commissionsEarned = Number(commissionResult.rows[0]?.commissions_paid || 0);
        const membershipRevenue = Number(membershipResult.rows[0]?.membership_revenue || 0);
        const orderCount = Number(ordersResult.rows[0]?.order_count || 0);

        return {
            data: {
                range,
                grossRevenue,
                withdrawalsProcessed,
                commissionsEarned,
                netRevenue: grossRevenue - withdrawalsProcessed - commissionsEarned,
                orderCount,
                membershipRevenue,
            },
        };
    });

    fastify.get('/api/admin/analytics/city-summary', async (request, reply) => {
        const db = getDb();

        const [usersByCity, ordersByCity, partnerPayoutsByCity] = await Promise.all([
            db.execute({
                sql: `SELECT TRIM(COALESCE(city, '')) as city, COUNT(*) as user_count
                      FROM users
                      WHERE TRIM(COALESCE(city, '')) != ''
                      GROUP BY TRIM(COALESCE(city, ''))`,
                args: [],
            }),
            db.execute({
                sql: `SELECT TRIM(COALESCE(city, '')) as city,
                             COUNT(*) as order_count,
                             COALESCE(SUM(cash_paid), 0) as revenue
                      FROM orders
                      WHERE TRIM(COALESCE(city, '')) != '' AND status != 'cancelled'
                      GROUP BY TRIM(COALESCE(city, ''))`,
                args: [],
            }),
            db.execute({
                sql: `SELECT TRIM(COALESCE(u.city, '')) as city,
                             COALESCE(SUM(CASE WHEN t.currency IN ('CASH', 'INR') THEN t.amount ELSE 0 END), 0) as partner_payout
                      FROM transactions t
                      JOIN users u ON u.uid = t.user_id
                      WHERE t.status = 'COMPLETED'
                        AND t.type = 'PARTNER_COMMISSION'
                        AND u.role = 'partner'
                        AND TRIM(COALESCE(u.city, '')) != ''
                      GROUP BY TRIM(COALESCE(u.city, ''))`,
                args: [],
            }),
        ]);

        const byCity = new Map<string, {
            city: string;
            userCount: number;
            orderCount: number;
            revenue: number;
            partnerPayout: number;
        }>();

        for (const row of usersByCity.rows as Array<Record<string, any>>) {
            const city = String(row.city || '').trim();
            if (!city) continue;
            byCity.set(city.toLowerCase(), {
                city,
                userCount: Number(row.user_count || 0),
                orderCount: 0,
                revenue: 0,
                partnerPayout: 0,
            });
        }
        for (const row of ordersByCity.rows as Array<Record<string, any>>) {
            const city = String(row.city || '').trim();
            if (!city) continue;
            const key = city.toLowerCase();
            const current = byCity.get(key) || { city, userCount: 0, orderCount: 0, revenue: 0, partnerPayout: 0 };
            current.orderCount = Number(row.order_count || 0);
            current.revenue = Number(row.revenue || 0);
            byCity.set(key, current);
        }
        for (const row of partnerPayoutsByCity.rows as Array<Record<string, any>>) {
            const city = String(row.city || '').trim();
            if (!city) continue;
            const key = city.toLowerCase();
            const current = byCity.get(key) || { city, userCount: 0, orderCount: 0, revenue: 0, partnerPayout: 0 };
            current.partnerPayout = Number(row.partner_payout || 0);
            byCity.set(key, current);
        }

        const data = Array.from(byCity.values())
            .sort((a, b) => (b.revenue - a.revenue) || (b.orderCount - a.orderCount) || a.city.localeCompare(b.city))
            .slice(0, 50);

        return { data };
    });

    // --- Finance / Commission Logs (Admin) -----------------------------------
    fastify.get('/api/admin/commission-logs', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50')));
        const offset = (page - 1) * limit;
        const typeFilter = (query.type || '').trim().toLowerCase();
        const city = (query.city || '').trim();
        const recipientId = (query.recipientId || '').trim();
        const fromDate = (query.fromDate || '').trim();
        const toDate = (query.toDate || '').trim();

        const typeConditions: string[] = [];
        if (typeFilter === 'partner') {
            typeConditions.push(`(t.type = 'PARTNER_COMMISSION' OR (t.type = 'TEAM_INCOME' AND ru.role = 'partner'))`);
        } else if (typeFilter === 'organization') {
            typeConditions.push(`(t.type = 'TEAM_INCOME' AND ru.role = 'organization')`);
        } else if (typeFilter === 'referral') {
            typeConditions.push(`(t.type = 'REFERRAL_BONUS' OR (t.type = 'TEAM_INCOME' AND COALESCE(ru.role, 'user') NOT IN ('partner','organization')))`);
        } else {
            typeConditions.push(`t.type IN ('PARTNER_COMMISSION', 'REFERRAL_BONUS', 'TEAM_INCOME')`);
        }

        const conditions: string[] = [
            `t.status = 'COMPLETED'`,
            `(${typeConditions.join(' OR ')})`,
        ];
        const params: any[] = [];

        if (city) {
            conditions.push(`LOWER(COALESCE(ru.city, '')) = LOWER(?)`);
            params.push(city);
        }
        if (recipientId) {
            conditions.push('t.user_id = ?');
            params.push(recipientId);
        }
        if (fromDate) {
            conditions.push('t.created_at >= ?');
            params.push(fromDate);
        }
        if (toDate) {
            conditions.push('t.created_at <= ?');
            params.push(toDate);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total
                  FROM transactions t
                  LEFT JOIN users ru ON ru.uid = t.user_id
                  ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const settingsResult = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: ['general'],
        });
        const generalSettings = (parseJsonSafe(settingsResult.rows[0]?.value) || {}) as Record<string, any>;
        const defaultPercentages = {
            partner: Number(generalSettings.partnerCommissionPercent || 0),
            organization: Number(generalSettings.orgCommissionPercent || 0),
            referral: Number(generalSettings.referralCommissionPercent || 0),
        };

        const result = await db.execute({
            sql: `SELECT
                    t.id,
                    t.user_id as recipient_id,
                    t.related_user_id as source_user_id,
                    t.amount,
                    t.currency,
                    t.type,
                    t.description,
                    t.source_txn_id,
                    t.created_at,
                    t.level,
                    ru.name as recipient_name,
                    ru.role as recipient_role,
                    ru.city as recipient_city,
                    su.name as source_user_name
                  FROM transactions t
                  LEFT JOIN users ru ON ru.uid = t.user_id
                  LEFT JOIN users su ON su.uid = t.related_user_id
                  ${where}
                  ORDER BY t.created_at DESC, t.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const logs = result.rows.map((row) => {
            const txType = String(row.type || '').toUpperCase();
            const recipientRole = String(row.recipient_role || '').toLowerCase();
            let type: 'partner' | 'organization' | 'referral' = 'referral';
            if (txType === 'PARTNER_COMMISSION' || recipientRole === 'partner') type = 'partner';
            else if (recipientRole === 'organization') type = 'organization';

            const desc = String(row.description || '');
            const match = desc.match(/(\d+(?:\.\d+)?)\s*%/);
            const percentage = match ? Number(match[1]) : (defaultPercentages[type] || 0);

            return {
                id: row.id,
                type,
                recipientId: row.recipient_id,
                recipientName: row.recipient_name || null,
                sourceUserId: row.source_user_id || null,
                sourceUserName: row.source_user_name || null,
                amount: Number(row.currency === 'COIN' ? 0 : row.amount || 0),
                percentage,
                sourceTransaction: row.source_txn_id || null,
                city: row.recipient_city || null,
                createdAt: row.created_at,
            };
        });

        return paginatedResponse(logs, total, page, limit);
    });

    // --- Transactions (Admin) ------------------------------------------------
    fastify.get('/api/admin/transactions', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;
        const category = (query.category || '').trim().toLowerCase();
        const search = (query.search || '').trim();

        const conditions: string[] = [];
        const params: any[] = [];

        if (category) {
            if (category === 'partner_commission') {
                conditions.push(`t.type = 'PARTNER_COMMISSION'`);
            } else if (category === 'referral') {
                conditions.push(`t.type IN ('REFERRAL_BONUS', 'TEAM_INCOME')`);
            } else if (category === 'membership') {
                conditions.push(`t.type = 'MEMBERSHIP_FEE'`);
            } else if (category === 'task') {
                conditions.push(`t.type = 'TASK_REWARD'`);
            } else if (category === 'purchase' || category === 'order') {
                conditions.push(`t.type = 'PURCHASE'`);
            } else if (category === 'withdrawal') {
                conditions.push(`t.type = 'WITHDRAWAL'`);
            } else {
                conditions.push('1 = 0');
            }
        }
        if (search) {
            conditions.push(`(
                t.id LIKE ? OR t.description LIKE ? OR COALESCE(t.source_txn_id, '') LIKE ? OR
                COALESCE(u.name, '') LIKE ? OR COALESCE(u.email, '') LIKE ? OR COALESCE(u.uid, '') LIKE ?
            )`);
            const term = `%${search}%`;
            params.push(term, term, term, term, term, term);
        }

        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.user_id
                  ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    t.*,
                    u.name as user_name,
                    src.uid as src_uid,
                    src.name as src_name
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.user_id
                  LEFT JOIN users src ON src.uid = t.related_user_id
                  ${where}
                  ORDER BY t.created_at DESC, t.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const data = result.rows.map((row) => {
            const rawAmount = Number(row.amount || 0);
            const isCredit = isCreditTransaction(String(row.type || ''), rawAmount);
            const createdAt = String(row.created_at || '');
            const ts = Date.parse(createdAt);
            return {
                id: row.id,
                userId: row.user_id || null,
                userName: row.user_name || null,
                fromUid: row.related_user_id || row.src_uid || null,
                fromName: row.src_name || null,
                toUid: row.user_id || null,
                toName: row.user_name || null,
                amount: String(row.currency || '').toUpperCase() === 'COIN' ? 0 : Math.abs(rawAmount),
                coinAmount: String(row.currency || '').toUpperCase() === 'COIN' ? Math.abs(rawAmount) : 0,
                type: isCredit ? 'credit' : 'debit',
                category: transactionCategoryFromType(String(row.type || '')),
                description: row.description || '',
                referenceId: row.source_txn_id || null,
                timestampMs: Number.isFinite(ts) ? ts : 0,
            };
        });

        return paginatedResponse(data, total, page, limit);
    });

    // --- Partners / Organizations (Admin) -----------------------------------
    fastify.get('/api/admin/partners/page', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || query.pageSize || '20')));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM users WHERE role = 'partner'`,
            args: [],
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    u.uid, u.name, u.email, u.phone, u.partner_config, u.city, u.is_active, u.is_banned, u.created_at,
                    COALESCE(w.cash_balance, 0) as cash_balance,
                    COALESCE(tx.total_earnings, 0) as total_earnings
                  FROM users u
                  LEFT JOIN wallets w ON w.user_id = u.uid
                  LEFT JOIN (
                    SELECT user_id, SUM(CASE WHEN currency IN ('CASH','INR') THEN amount ELSE 0 END) as total_earnings
                    FROM transactions
                    WHERE type IN ('PARTNER_COMMISSION', 'TEAM_INCOME')
                    GROUP BY user_id
                  ) tx ON tx.user_id = u.uid
                  WHERE u.role = 'partner'
                  ORDER BY u.created_at DESC, u.uid DESC
                  LIMIT ? OFFSET ?`,
            args: [limit, offset],
        });

        const partners = result.rows.map((row: Record<string, any>) => {
            const cfg = parsePartnerConfig(row.partner_config);
            return {
                id: row.uid,
                name: row.name || 'Unknown',
                email: row.email || '',
                phone: row.phone || '',
                assignedCity: String(cfg?.assignedCity || row.city || ''),
                assignedCities: Array.isArray(cfg?.assignedCities) ? cfg!.assignedCities : [],
                commissionPercentage: Number(cfg?.commissionPercentage || 0),
                commissionPercentages: (cfg?.commissionPercentages && typeof cfg.commissionPercentages === 'object')
                    ? cfg.commissionPercentages
                    : {},
                partnerConfig: cfg,
                totalEarnings: Number(row.total_earnings || 0),
                withdrawableBalance: Number(row.cash_balance || 0),
                status: userStatusLabel(row),
                createdAt: row.created_at,
            };
        });

        return {
            data: {
                partners,
                nextCursor: page * limit < total ? { page: page + 1 } : null,
                hasMore: page * limit < total,
                pagination: { page, limit, total },
            },
        };
    });

    fastify.get('/api/admin/organizations/page', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || query.pageSize || '20')));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM users WHERE role = 'organization'`,
            args: [],
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    u.uid, u.name, u.email, u.own_referral_code, u.org_config, u.is_active, u.is_banned, u.created_at,
                    COALESCE(m.member_count, 0) as member_count,
                    COALESCE(c.total_commissions, 0) as total_commissions
                  FROM users u
                  LEFT JOIN (
                    SELECT referral_code, COUNT(*) as member_count
                    FROM users
                    WHERE referral_code IS NOT NULL
                    GROUP BY referral_code
                  ) m ON m.referral_code = u.own_referral_code
                  LEFT JOIN (
                    SELECT user_id, SUM(CASE WHEN currency IN ('CASH','INR') THEN amount ELSE 0 END) as total_commissions
                    FROM transactions
                    WHERE type = 'TEAM_INCOME'
                    GROUP BY user_id
                  ) c ON c.user_id = u.uid
                  WHERE u.role = 'organization'
                  ORDER BY u.created_at DESC, u.uid DESC
                  LIMIT ? OFFSET ?`,
            args: [limit, offset],
        });

        const organizations = result.rows.map((row: Record<string, any>) => {
            const cfg = (parseJsonSafe(row.org_config) as Record<string, any> | null) || {};
            return {
                id: row.uid,
                orgName: String(cfg.orgName || row.name || 'Organization'),
                orgType: String(cfg.orgType || 'organization'),
                ownerName: row.name || 'Unknown',
                email: row.email || '',
                referralCode: row.own_referral_code || '',
                memberCount: Number(row.member_count || 0),
                totalCommissions: Number(row.total_commissions || 0),
                commissionPercentage: Number(cfg.commissionPercentage || 10),
                status: String(cfg.status || userStatusLabel(row)),
                createdAt: row.created_at,
                orgConfig: cfg,
            };
        });

        return {
            data: {
                organizations,
                nextCursor: page * limit < total ? { page: page + 1 } : null,
                hasMore: page * limit < total,
                pagination: { page, limit, total },
            },
        };
    });

    // --- Audit Logs (Admin) --------------------------------------------------
    fastify.get('/api/admin/audit-logs', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(200, Math.max(1, parseInt(query.limit || '50')));
        const offset = (page - 1) * limit;
        const action = (query.action || '').trim();
        const targetType = (query.targetType || '').trim();
        const fromDate = (query.fromDate || '').trim();
        const toDate = (query.toDate || '').trim();

        const conditions: string[] = [];
        const params: any[] = [];
        if (action) {
            conditions.push('a.action = ?');
            params.push(action);
        }
        if (targetType) {
            conditions.push('a.target_type = ?');
            params.push(targetType);
        }
        if (fromDate) {
            conditions.push('a.created_at >= ?');
            params.push(fromDate);
        }
        if (toDate) {
            conditions.push('a.created_at <= ?');
            params.push(toDate);
        }
        const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM audit_logs a ${where}`,
            args: params,
        });
        const total = Number(countResult.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT a.*, u.name as actor_name
                  FROM audit_logs a
                  LEFT JOIN users u ON u.uid = a.actor_uid
                  ${where}
                  ORDER BY a.created_at DESC, a.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const logs = result.rows.map((row) => ({
            id: row.id,
            action: row.action,
            actorId: row.actor_uid,
            actorName: row.actor_name || (String(row.actor_uid) === 'system' ? 'System' : null),
            targetId: row.target_id,
            targetType: row.target_type,
            metadata: parseJsonSafe(row.details) || null,
            createdAt: row.created_at,
        }));

        return paginatedResponse(logs, total, page, limit);
    });

    fastify.get('/api/admin/audit-logs/stats', async (request, reply) => {
        const db = getDb();
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);
        const todayIso = todayStart.toISOString();

        const [totalResult, todayResult, topActionsResult, topActorsResult] = await Promise.all([
            db.execute({ sql: 'SELECT COUNT(*) as total FROM audit_logs', args: [] }),
            db.execute({
                sql: 'SELECT COUNT(*) as total FROM audit_logs WHERE created_at >= ?',
                args: [todayIso],
            }),
            db.execute({
                sql: `SELECT action, COUNT(*) as count
                      FROM audit_logs
                      GROUP BY action
                      ORDER BY count DESC, action ASC
                      LIMIT 10`,
                args: [],
            }),
            db.execute({
                sql: `SELECT a.actor_uid as actor_id, u.name as actor_name, COUNT(*) as count
                      FROM audit_logs a
                      LEFT JOIN users u ON u.uid = a.actor_uid
                      GROUP BY a.actor_uid, u.name
                      ORDER BY count DESC, a.actor_uid ASC
                      LIMIT 10`,
                args: [],
            }),
        ]);

        return {
            data: {
                totalLogs: Number(totalResult.rows[0]?.total || 0),
                logsToday: Number(todayResult.rows[0]?.total || 0),
                topActions: topActionsResult.rows.map((row) => ({
                    action: String(row.action || ''),
                    count: Number(row.count || 0),
                })),
                topActors: topActorsResult.rows.map((row) => ({
                    actorId: String(row.actor_id || ''),
                    actorName: row.actor_name || (String(row.actor_id) === 'system' ? 'System' : null),
                    count: Number(row.count || 0),
                })),
            },
        };
    });

    fastify.get('/api/admin/audit-logs/action-types', async (request, reply) => {
        const db = getDb();
        const result = await db.execute({
            sql: `SELECT DISTINCT action
                  FROM audit_logs
                  WHERE action IS NOT NULL AND action != ''
                  ORDER BY action ASC`,
            args: [],
        });

        return {
            data: {
                actions: result.rows.map((row) => String(row.action)).filter(Boolean),
            },
        };
    });

    // --- Feature Flags (Admin) -----------------------------------------------
    fastify.get('/api/admin/feature-flags', async (request, reply) => {
        const db = getDb();
        const result = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [FEATURE_FLAGS_KEY],
        });
        const flags = normalizeFeatureFlags(result.rows[0]?.value);
        flags.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        return { data: { flags } };
    });

    fastify.post('/api/admin/feature-flags', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const body = request.body as {
            name?: string;
            description?: string;
            enabled?: boolean;
            targetRoles?: string[];
            targetCities?: string[];
            rolloutPercentage?: number;
        };

        const name = String(body.name || '').trim();
        if (!/^[a-z][a-z0-9_]*$/.test(name)) {
            throw new BadRequestError('Invalid feature flag name');
        }

        const current = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [FEATURE_FLAGS_KEY],
        });
        const flags = normalizeFeatureFlags(current.rows[0]?.value);
        if (flags.some((f) => String(f.name) === name || String(f.id) === name)) {
            throw new BadRequestError('Feature flag already exists');
        }

        const now = new Date().toISOString();
        const newFlag = {
            id: name,
            name,
            description: String(body.description || '').trim(),
            enabled: Boolean(body.enabled),
            targetRoles: Array.isArray(body.targetRoles)
                ? body.targetRoles.filter((r) => allowedFeatureRoles.has(String(r))).map(String)
                : [],
            targetCities: Array.isArray(body.targetCities)
                ? body.targetCities.map((c) => String(c).trim()).filter(Boolean)
                : [],
            rolloutPercentage: Math.max(0, Math.min(100, Number(body.rolloutPercentage ?? 100) || 100)),
            createdAt: now,
            updatedAt: now,
            updatedBy: adminId,
        };

        const nextFlags = [...flags, newFlag];
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [FEATURE_FLAGS_KEY, JSON.stringify(nextFlags), now, adminId],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'feature_flag.create',
                'feature_flag',
                name,
                JSON.stringify({ enabled: newFlag.enabled }),
                request.ip,
                now,
            ],
        });

        return reply.status(201).send({ data: { flag: newFlag } });
    });

    fastify.patch('/api/admin/feature-flags/:id', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = request.body as {
            enabled?: boolean;
            description?: string;
            targetRoles?: string[];
            targetCities?: string[];
            rolloutPercentage?: number;
            name?: string;
        };

        const current = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [FEATURE_FLAGS_KEY],
        });
        const flags = normalizeFeatureFlags(current.rows[0]?.value);
        const idx = flags.findIndex((f) => String(f.id) === id || String(f.name) === id);
        if (idx === -1) {
            throw new NotFoundError('Feature flag not found');
        }

        const prev = flags[idx];
        const now = new Date().toISOString();
        const next = {
            ...prev,
            description: body.description !== undefined ? String(body.description || '').trim() : prev.description,
            enabled: body.enabled !== undefined ? Boolean(body.enabled) : prev.enabled,
            targetRoles: Array.isArray(body.targetRoles)
                ? body.targetRoles.filter((r) => allowedFeatureRoles.has(String(r))).map(String)
                : prev.targetRoles,
            targetCities: Array.isArray(body.targetCities)
                ? body.targetCities.map((c) => String(c).trim()).filter(Boolean)
                : prev.targetCities,
            rolloutPercentage: body.rolloutPercentage !== undefined
                ? Math.max(0, Math.min(100, Number(body.rolloutPercentage) || 0))
                : prev.rolloutPercentage,
            updatedAt: now,
            updatedBy: adminId,
        };
        flags[idx] = next;

        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [FEATURE_FLAGS_KEY, JSON.stringify(flags), now, adminId],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'feature_flag.update',
                'feature_flag',
                String(prev.id),
                JSON.stringify({ before: { enabled: prev.enabled }, after: { enabled: next.enabled } }),
                request.ip,
                now,
            ],
        });

        return { data: { flag: next } };
    });

    fastify.delete('/api/admin/feature-flags/:id', async (request, reply) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };

        const current = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [FEATURE_FLAGS_KEY],
        });
        const flags = normalizeFeatureFlags(current.rows[0]?.value);
        const removed = flags.find((f) => String(f.id) === id || String(f.name) === id);
        if (!removed) {
            throw new NotFoundError('Feature flag not found');
        }
        const nextFlags = flags.filter((f) => !(String(f.id) === id || String(f.name) === id));
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [FEATURE_FLAGS_KEY, JSON.stringify(nextFlags), now, adminId],
        });

        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'feature_flag.delete',
                'feature_flag',
                String(removed.id),
                JSON.stringify({ name: removed.name }),
                request.ip,
                now,
            ],
        });

        return { data: { deleted: true } };
    });
}
