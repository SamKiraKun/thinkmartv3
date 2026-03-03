import type { FastifyInstance } from 'fastify';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { randomUUID } from 'crypto';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';

type JsonValue = any;
type WithdrawalMethod = 'bank' | 'wallet' | 'upi';

type WithdrawalPolicy = {
    minAmount: number;
    maxAmount: number;
    maxPerMonth: number;
    cooldownDays: number;
};

function parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function partnerCitiesAndPercentages(partnerConfigRaw: unknown): { cities: string[]; percentages: Record<string, number> } {
    const cfg = parseJson<Record<string, any>>(partnerConfigRaw, {});
    const assignedCities = Array.isArray(cfg.assignedCities)
        ? cfg.assignedCities.map((c) => String(c).trim()).filter(Boolean)
        : [];
    const commissionPercentagesRaw = cfg.commissionPercentages && typeof cfg.commissionPercentages === 'object'
        ? cfg.commissionPercentages
        : {};
    const commissionPercentages: Record<string, number> = {};
    for (const [city, value] of Object.entries(commissionPercentagesRaw)) {
        commissionPercentages[String(city)] = Number(value || 0);
    }

    if (assignedCities.length > 0) {
        return { cities: assignedCities, percentages: commissionPercentages };
    }

    const singleCity = String(cfg.assignedCity || '').trim();
    if (singleCity) {
        return {
            cities: [singleCity],
            percentages: { [singleCity]: Number(cfg.commissionPercentage || 0) },
        };
    }

    return { cities: [], percentages: {} };
}

function inClause(column: string, values: string[]) {
    const cleaned = values.map((v) => String(v).trim()).filter(Boolean);
    if (cleaned.length === 0) {
        return { sql: '1 = 0', args: [] as any[] };
    }
    return {
        sql: `${column} IN (${cleaned.map(() => '?').join(', ')})`,
        args: cleaned,
    };
}

function formatDateKey(date: Date): string {
    return date.toISOString().slice(0, 10);
}

function txTimestampMs(value: unknown): number {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
}

function parseDateRange(query: Record<string, string>, defaultDays: number) {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(query.days || defaultDays), 10) || defaultDays));
    const fromRaw = String(query.from || '').trim();
    const toRaw = String(query.to || '').trim();

    const now = new Date();
    const parsedFrom = fromRaw ? new Date(fromRaw) : null;
    const parsedTo = toRaw ? new Date(toRaw) : null;

    if (parsedFrom && !Number.isFinite(parsedFrom.getTime())) {
        throw new BadRequestError('Invalid "from" date');
    }
    if (parsedTo && !Number.isFinite(parsedTo.getTime())) {
        throw new BadRequestError('Invalid "to" date');
    }

    let start = parsedFrom ? new Date(parsedFrom) : new Date(now);
    let end = parsedTo ? new Date(parsedTo) : new Date(now);

    if (!parsedFrom) {
        start.setDate(end.getDate() - (days - 1));
    }
    if (!parsedTo) {
        end = new Date(now);
    }

    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);

    if (start.getTime() > end.getTime()) {
        throw new BadRequestError('"from" date must be before "to" date');
    }

    const rangeDays = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    if (rangeDays > 366) {
        throw new BadRequestError('Date range cannot exceed 366 days');
    }

    return {
        start,
        end,
        startIso: start.toISOString(),
        endIso: end.toISOString(),
        rangeDays,
    };
}

function parseWithdrawalPolicy(settingsValue: unknown): WithdrawalPolicy {
    const fallback: WithdrawalPolicy = {
        minAmount: 500,
        maxAmount: 50000,
        maxPerMonth: 2,
        cooldownDays: 24,
    };
    if (typeof settingsValue !== 'string') return fallback;
    try {
        const parsed = JSON.parse(settingsValue) as Record<string, unknown>;
        const minAmount = Number(parsed.minWithdrawalAmount);
        const maxAmount = Number(parsed.maxWithdrawalAmount);
        const maxPerMonth = Number(parsed.maxWithdrawalsPerMonth ?? parsed.monthlyWithdrawalLimit);
        const cooldownDays = Number(parsed.withdrawalCooldownDays);
        return {
            minAmount: Number.isFinite(minAmount) && minAmount > 0 ? minAmount : fallback.minAmount,
            maxAmount: Number.isFinite(maxAmount) && maxAmount > 0 ? maxAmount : fallback.maxAmount,
            maxPerMonth: Number.isFinite(maxPerMonth) && maxPerMonth > 0 ? maxPerMonth : fallback.maxPerMonth,
            cooldownDays: Number.isFinite(cooldownDays) && cooldownDays >= 0 ? cooldownDays : fallback.cooldownDays,
        };
    } catch {
        return fallback;
    }
}

async function loadPartnerAssignedCities(db: ReturnType<typeof getDb>, partnerId: string): Promise<string[]> {
    const partnerRes = await db.execute({
        sql: 'SELECT partner_config FROM users WHERE uid = ?',
        args: [partnerId],
    });
    const { cities } = partnerCitiesAndPercentages(partnerRes.rows[0]?.partner_config);
    return cities;
}

async function loadPartnerManagedUser(params: {
    db: ReturnType<typeof getDb>;
    partnerId: string;
    userId: string;
}) {
    const { db, partnerId, userId } = params;
    const cities = await loadPartnerAssignedCities(db, partnerId);
    if (cities.length === 0) {
        throw new ForbiddenError('No cities are assigned to this partner');
    }

    const cityWhere = inClause('city', cities);
    const userRes = await db.execute({
        sql: `SELECT uid, role, name, email, phone, city, kyc_status, membership_active, is_active, is_banned, created_at, updated_at
              FROM users
              WHERE uid = ? AND ${cityWhere.sql}
              LIMIT 1`,
        args: [userId, ...cityWhere.args],
    });
    if (userRes.rows.length === 0) {
        throw new NotFoundError('User not found in assigned partner cities');
    }
    const row = userRes.rows[0] as Record<string, any>;
    if (String(row.role || '').toLowerCase() !== 'user') {
        throw new ForbiddenError('Only end users can be managed from partner users module');
    }
    return row;
}

function mapProductRow(row: Record<string, any>) {
    return {
        id: row.id,
        name: row.name,
        description: row.description,
        price: Number(row.price || 0),
        category: row.category || 'general',
        image: row.image || '',
        images: row.images ? parseJson(row.images, []) : [],
        commission: Number(row.commission || 0),
        coinPrice: Number(row.coin_price || 0),
        inStock: Boolean(row.in_stock),
        stock: Number(row.stock || 0),
        badges: row.badges ? parseJson(row.badges, []) : [],
        coinOnly: Boolean(row.coin_only),
        cashOnly: Boolean(row.cash_only),
        deliveryDays: Number(row.delivery_days || 7),
        vendor: row.vendor,
        status: row.status || 'pending',
        moderationReason: row.moderation_reason || null,
        createdAt: row.created_at,
        updatedAt: row.updated_at,
    };
}

export default async function partnerRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('partner'));

    fastify.get('/api/partner/dashboard', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const partnerRes = await db.execute({
            sql: `SELECT uid, name, partner_config FROM users WHERE uid = ?`,
            args: [partnerId],
        });
        const partner = partnerRes.rows[0] as Record<string, any> | undefined;
        const { cities, percentages } = partnerCitiesAndPercentages(partner?.partner_config);
        const primaryCity = cities[0] || null;

        const walletRes = await db.execute({
            sql: `SELECT cash_balance FROM wallets WHERE user_id = ?`,
            args: [partnerId],
        });
        const walletBalance = Number(walletRes.rows[0]?.cash_balance || 0);

        let totalUsers = 0;
        let activeUsers7d = 0;
        let totalWithdrawals = 0;
        if (cities.length > 0) {
            const cityFilter = inClause('city', cities);
            const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
            const [usersCount, activeCount, withdrawalsSum] = await Promise.all([
                db.execute({
                    sql: `SELECT COUNT(*) as count FROM users WHERE ${cityFilter.sql}`,
                    args: cityFilter.args,
                }),
                db.execute({
                    sql: `SELECT COUNT(*) as count FROM users WHERE ${cityFilter.sql} AND updated_at >= ?`,
                    args: [...cityFilter.args, weekAgo],
                }),
                db.execute({
                    sql: `SELECT COALESCE(SUM(w.amount), 0) as total
                          FROM withdrawals w
                          JOIN users u ON u.uid = w.user_id
                          WHERE ${cityFilter.sql.replace(/city/g, 'u.city')}
                            AND w.status IN ('approved', 'completed')`,
                    args: cityFilter.args,
                }),
            ]);
            totalUsers = Number(usersCount.rows[0]?.count || 0);
            activeUsers7d = Number(activeCount.rows[0]?.count || 0);
            totalWithdrawals = Number(withdrawalsSum.rows[0]?.total || 0);
        }

        const txRes = await db.execute({
            sql: `SELECT COALESCE(SUM(amount), 0) as total
                  FROM transactions
                  WHERE user_id = ? AND type IN ('PARTNER_COMMISSION', 'TEAM_INCOME') AND currency IN ('CASH','INR')`,
            args: [partnerId],
        });
        const totalEarnings = Number(txRes.rows[0]?.total || 0);

        return {
            data: {
                partnerId,
                partnerName: String(partner?.name || request.user!.name || 'Partner'),
                assignedCity: primaryCity,
                commissionPercentage: primaryCity ? Number(percentages[primaryCity] || 0) : 0,
                totalStats: {
                    totalUsers,
                    activeUsers7d,
                    totalWithdrawals,
                    totalCommissionEarned: totalEarnings,
                    walletBalance,
                    totalEarnings,
                },
            },
        };
    });

    fastify.get('/api/partner/users', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const kycStatus = String(query.kycStatus || '').trim();
        const search = String(query.search || '').trim();

        const cities = await loadPartnerAssignedCities(db, partnerId);
        if (cities.length === 0) return paginatedResponse([], 0, page, limit);

        const cityWhere = inClause('city', cities);
        const conditions = [cityWhere.sql];
        const params: any[] = [...cityWhere.args];

        if (kycStatus) {
            if (kycStatus === 'not_submitted') {
                conditions.push(`COALESCE(kyc_status, 'not_submitted') = 'not_submitted'`);
            } else {
                conditions.push('kyc_status = ?');
                params.push(kycStatus);
            }
        }
        if (search) {
            conditions.push('(name LIKE ? OR email LIKE ? OR phone LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term, term);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;
        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as total FROM users ${where}`,
            args: params,
        });
        const total = Number(countRes.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT uid, name, phone, email, city, kyc_status, membership_active, is_active, is_banned, created_at, updated_at
                  FROM users ${where}
                  ORDER BY created_at DESC, uid DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const data = result.rows.map((row) => ({
            id: row.uid,
            name: row.name,
            phone: row.phone || '',
            email: row.email || '',
            city: row.city || '',
            kycStatus: row.kyc_status || 'not_submitted',
            membershipActive: Boolean(row.membership_active),
            accountStatus: Boolean(row.is_banned) ? 'suspended' : (Boolean(row.is_active) ? 'active' : 'pending'),
            createdAt: row.created_at,
            lastActiveAt: row.updated_at,
        }));
        return paginatedResponse(data, total, page, limit);
    });

    fastify.get('/api/partner/users/:id', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const { id } = request.params as { id: string };
        const user = await loadPartnerManagedUser({ db, partnerId, userId: id });

        const [walletRes, orderStatsRes, withdrawalStatsRes] = await Promise.all([
            db.execute({
                sql: `SELECT coin_balance, cash_balance FROM wallets WHERE user_id = ?`,
                args: [id],
            }),
            db.execute({
                sql: `SELECT COUNT(*) as total, COALESCE(SUM(cash_paid), 0) as total_spend
                      FROM orders
                      WHERE user_id = ?`,
                args: [id],
            }),
            db.execute({
                sql: `SELECT COUNT(*) as count_total, COALESCE(SUM(amount), 0) as amount_total
                      FROM withdrawals
                      WHERE user_id = ?`,
                args: [id],
            }),
        ]);

        return {
            data: {
                id: user.uid,
                name: user.name || 'User',
                email: user.email || '',
                phone: user.phone || '',
                city: user.city || '',
                role: user.role,
                kycStatus: user.kyc_status || 'not_submitted',
                membershipActive: Boolean(user.membership_active),
                accountStatus: Boolean(user.is_banned) ? 'suspended' : (Boolean(user.is_active) ? 'active' : 'pending'),
                createdAt: user.created_at,
                updatedAt: user.updated_at,
                wallet: {
                    coinBalance: Number(walletRes.rows[0]?.coin_balance || 0),
                    cashBalance: Number(walletRes.rows[0]?.cash_balance || 0),
                },
                stats: {
                    orderCount: Number(orderStatsRes.rows[0]?.total || 0),
                    totalSpend: Number(orderStatsRes.rows[0]?.total_spend || 0),
                    withdrawalCount: Number(withdrawalStatsRes.rows[0]?.count_total || 0),
                    withdrawalsTotal: Number(withdrawalStatsRes.rows[0]?.amount_total || 0),
                },
            },
        };
    });

    fastify.patch('/api/partner/users/:id/kyc-status', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as { kycStatus?: string; note?: string };
        const kycStatus = String(body.kycStatus || '').trim().toLowerCase();
        if (!['not_submitted', 'pending', 'verified', 'rejected'].includes(kycStatus)) {
            throw new BadRequestError('kycStatus must be one of: not_submitted, pending, verified, rejected');
        }

        await loadPartnerManagedUser({ db, partnerId, userId: id });
        const now = new Date().toISOString();
        await db.execute({
            sql: `UPDATE users
                  SET kyc_status = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [kycStatus, now, id],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                partnerId,
                'partner.user_kyc_update',
                'user',
                id,
                JSON.stringify({
                    kycStatus,
                    note: String(body.note || '').trim() || null,
                }),
                request.ip,
                now,
            ],
        });
        return {
            data: {
                updated: true,
                id,
                kycStatus,
            },
        };
    });

    fastify.patch('/api/partner/users/:id/membership', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as { membershipActive?: boolean; note?: string };
        if (typeof body.membershipActive !== 'boolean') {
            throw new BadRequestError('membershipActive must be a boolean');
        }
        await loadPartnerManagedUser({ db, partnerId, userId: id });

        const now = new Date().toISOString();
        await db.execute({
            sql: `UPDATE users
                  SET membership_active = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [body.membershipActive ? 1 : 0, now, id],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                partnerId,
                'partner.user_membership_update',
                'user',
                id,
                JSON.stringify({
                    membershipActive: body.membershipActive,
                    note: String(body.note || '').trim() || null,
                }),
                request.ip,
                now,
            ],
        });
        return {
            data: {
                updated: true,
                id,
                membershipActive: body.membershipActive,
            },
        };
    });

    fastify.patch('/api/partner/users/:id/status', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as { status?: string; note?: string };
        const status = String(body.status || '').trim().toLowerCase();
        if (!['active', 'suspended', 'pending'].includes(status)) {
            throw new BadRequestError('status must be active, suspended, or pending');
        }
        await loadPartnerManagedUser({ db, partnerId, userId: id });

        const isBanned = status === 'suspended' ? 1 : 0;
        const isActive = status === 'pending' ? 0 : 1;
        const now = new Date().toISOString();
        await db.execute({
            sql: `UPDATE users
                  SET is_banned = ?, is_active = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [isBanned, isActive, now, id],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                partnerId,
                'partner.user_status_update',
                'user',
                id,
                JSON.stringify({
                    status,
                    note: String(body.note || '').trim() || null,
                }),
                request.ip,
                now,
            ],
        });
        return {
            data: {
                updated: true,
                id,
                status,
            },
        };
    });

    fastify.get('/api/partner/analytics', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const { start, startIso, endIso, rangeDays } = parseDateRange(query, 30);
        const cityFilterRaw = String(query.city || '').trim();
        const sourceType = String(query.sourceType || '').trim().toLowerCase();
        if (sourceType && !['purchase', 'withdrawal'].includes(sourceType)) {
            throw new BadRequestError('sourceType must be purchase or withdrawal');
        }

        const partnerRes = await db.execute({
            sql: 'SELECT partner_config FROM users WHERE uid = ?',
            args: [partnerId],
        });
        const { cities } = partnerCitiesAndPercentages(partnerRes.rows[0]?.partner_config);
        if (cityFilterRaw && !cities.includes(cityFilterRaw)) {
            throw new BadRequestError('Selected city is not assigned to this partner');
        }
        const citiesForGrowth = cityFilterRaw ? [cityFilterRaw] : cities;

        const txFilters: string[] = [
            't.user_id = ?',
            "t.type IN ('PARTNER_COMMISSION', 'TEAM_INCOME')",
            "t.currency IN ('CASH','INR')",
            't.created_at >= ?',
            't.created_at <= ?',
        ];
        const txParams: any[] = [partnerId, startIso, endIso];

        if (cityFilterRaw) {
            txFilters.push('u.city = ?');
            txParams.push(cityFilterRaw);
        }
        if (sourceType === 'withdrawal') {
            txFilters.push("src.type = 'WITHDRAWAL'");
        } else if (sourceType === 'purchase') {
            txFilters.push("(src.type IS NULL OR src.type <> 'WITHDRAWAL')");
        }
        const txWhere = txFilters.join(' AND ');

        const [txRes, usersRes] = await Promise.all([
            db.execute({
                sql: `SELECT t.id, t.amount, t.type, t.description, t.created_at
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      LEFT JOIN transactions src ON src.id = t.source_txn_id
                      WHERE ${txWhere}
                      ORDER BY t.created_at ASC`,
                args: txParams,
            }),
            citiesForGrowth.length > 0
                ? (() => {
                    const cityFilter = inClause('city', citiesForGrowth);
                    return db.execute({
                        sql: `SELECT uid, created_at FROM users
                              WHERE ${cityFilter.sql} AND created_at >= ? AND created_at <= ?
                              ORDER BY created_at ASC`,
                        args: [...cityFilter.args, startIso, endIso],
                    });
                })()
                : Promise.resolve({ rows: [] } as any),
        ]);

        const earningsByDay = new Map<string, { earnings: number; transactions: number }>();
        let totalEarnings = 0;
        for (const row of txRes.rows as Array<Record<string, any>>) {
            const key = String(row.created_at || '').slice(0, 10);
            const amount = Number(row.amount || 0);
            const current = earningsByDay.get(key) || { earnings: 0, transactions: 0 };
            current.earnings += amount;
            current.transactions += 1;
            earningsByDay.set(key, current);
            totalEarnings += amount;
        }

        const usersByDay = new Map<string, number>();
        for (const row of usersRes.rows as Array<Record<string, any>>) {
            const key = String(row.created_at || '').slice(0, 10);
            usersByDay.set(key, Number(usersByDay.get(key) || 0) + 1);
        }

        const earningsChart: Array<{ date: string; earnings: number; transactions: number }> = [];
        const userGrowthChart: Array<{ date: string; newUsers: number }> = [];
        for (let i = 0; i < rangeDays; i++) {
            const d = new Date(start);
            d.setDate(start.getDate() + i);
            const key = formatDateKey(d);
            const earn = earningsByDay.get(key) || { earnings: 0, transactions: 0 };
            earningsChart.push({ date: key, earnings: Math.round(earn.earnings * 100) / 100, transactions: earn.transactions });
            userGrowthChart.push({ date: key, newUsers: Number(usersByDay.get(key) || 0) });
        }

        const topDays = [...earningsChart]
            .filter((d) => d.earnings > 0)
            .sort((a, b) => b.earnings - a.earnings)
            .slice(0, 5);

        return {
            data: {
                earningsChart,
                userGrowthChart,
                topDays,
                summary: {
                    totalEarnings,
                    totalTransactions: txRes.rows.length,
                    newUsers: (usersRes.rows as any[]).length,
                    avgDailyEarnings: rangeDays > 0 ? Math.round((totalEarnings / rangeDays) * 100) / 100 : 0,
                },
                filters: {
                    from: startIso,
                    to: endIso,
                    city: cityFilterRaw || null,
                    sourceType: sourceType || null,
                    days: rangeDays,
                },
            },
        };
    });

    fastify.get('/api/partner/commissions', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '30', 10)));
        const offset = (page - 1) * limit;
        const city = String(query.city || '').trim();
        const sourceType = String(query.sourceType || '').trim().toLowerCase();
        const search = String(query.search || '').trim();
        if (sourceType && !['purchase', 'withdrawal'].includes(sourceType)) {
            throw new BadRequestError('sourceType must be purchase or withdrawal');
        }
        const hasDateFilter = Boolean(query.from || query.to || query.days);
        const dateRange = hasDateFilter ? parseDateRange(query, 365) : null;

        const partnerRes = await db.execute({
            sql: 'SELECT partner_config FROM users WHERE uid = ?',
            args: [partnerId],
        });
        const { cities } = partnerCitiesAndPercentages(partnerRes.rows[0]?.partner_config);
        if (city && !cities.includes(city)) {
            throw new BadRequestError('Selected city is not assigned to this partner');
        }

        const whereParts: string[] = [
            't.user_id = ?',
            "t.type IN ('PARTNER_COMMISSION', 'TEAM_INCOME')",
            "t.currency IN ('CASH','INR')",
        ];
        const whereArgs: any[] = [partnerId];
        if (dateRange) {
            whereParts.push('t.created_at >= ?');
            whereParts.push('t.created_at <= ?');
            whereArgs.push(dateRange.startIso, dateRange.endIso);
        }
        if (city) {
            whereParts.push('u.city = ?');
            whereArgs.push(city);
        }
        if (sourceType === 'withdrawal') {
            whereParts.push("src.type = 'WITHDRAWAL'");
        } else if (sourceType === 'purchase') {
            whereParts.push("(src.type IS NULL OR src.type <> 'WITHDRAWAL')");
        }
        if (search) {
            const term = `%${search}%`;
            whereParts.push('(u.name LIKE ? OR t.related_user_id LIKE ?)');
            whereArgs.push(term, term);
        }
        const where = whereParts.join(' AND ');

        const countRes = await db.execute({
            sql: `SELECT COUNT(*) as total
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.related_user_id
                  LEFT JOIN transactions src ON src.id = t.source_txn_id
                  WHERE ${where}`,
            args: whereArgs,
        });
        const total = Number(countRes.rows[0]?.total || 0);

        const result = await db.execute({
            sql: `SELECT
                    t.id, t.amount, t.type, t.description, t.created_at, t.source_txn_id, t.related_user_id,
                    u.name as source_user_name, u.city as source_user_city,
                    src.amount as src_txn_amount, src.type as src_txn_type
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.related_user_id
                  LEFT JOIN transactions src ON src.id = t.source_txn_id
                  WHERE ${where}
                  ORDER BY t.created_at DESC, t.id DESC
                  LIMIT ? OFFSET ?`,
            args: [...whereArgs, limit, offset],
        });

        const summaryRes = await db.execute({
            sql: `SELECT
                    COALESCE(SUM(t.amount), 0) as total_amount,
                    COALESCE(SUM(CASE WHEN src.type = 'WITHDRAWAL' THEN t.amount ELSE 0 END), 0) as withdrawal_amount,
                    COALESCE(SUM(CASE WHEN src.type IS NULL OR src.type <> 'WITHDRAWAL' THEN t.amount ELSE 0 END), 0) as purchase_amount
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.related_user_id
                  LEFT JOIN transactions src ON src.id = t.source_txn_id
                  WHERE ${where}`,
            args: whereArgs,
        });

        const commissions = result.rows.map((row: Record<string, any>) => {
            const desc = String(row.description || '');
            const pctMatch = desc.match(/(\d+(?:\.\d+)?)\s*%/);
            const pct = pctMatch ? Number(pctMatch[1]) : 0;
            const createdAt = String(row.created_at || '');
            const sourceType = String(row.src_txn_type || '').toUpperCase() === 'WITHDRAWAL' ? 'withdrawal' : 'purchase';
            const sourceAmount = Number(row.src_txn_amount || 0);
            return {
                id: row.id,
                city: row.source_user_city || '',
                sourceType,
                sourceAmount,
                commissionPercentage: pct,
                commissionAmount: Number(row.amount || 0),
                status: 'completed',
                createdAt,
                sourceUserId: row.related_user_id || '',
                sourceUserName: row.source_user_name || undefined,
                _ts: txTimestampMs(createdAt),
            };
        });

        const paged = paginatedResponse(
            commissions.map(({ _ts, ...rest }: any) => rest),
            total,
            page,
            limit
        );
        const summary = summaryRes.rows[0] as Record<string, any> | undefined;
        return {
            ...paged,
            summary: {
                totalAmount: Number(summary?.total_amount || 0),
                purchaseAmount: Number(summary?.purchase_amount || 0),
                withdrawalAmount: Number(summary?.withdrawal_amount || 0),
            },
            filters: {
                from: dateRange?.startIso || null,
                to: dateRange?.endIso || null,
                city: city || null,
                sourceType: sourceType || null,
                search: search || null,
            },
        };
    });

    fastify.get('/api/partner/withdrawals', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const status = String(query.status || '').trim().toLowerCase();
        const method = String(query.method || '').trim().toLowerCase();

        const conditions = ['user_id = ?'];
        const params: any[] = [partnerId];

        if (status) {
            conditions.push('status = ?');
            params.push(status);
        }
        if (method) {
            conditions.push('method = ?');
            params.push(method);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const [countRes, rowsRes, summaryRes] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) as total FROM withdrawals ${where}`,
                args: params,
            }),
            db.execute({
                sql: `SELECT *
                      FROM withdrawals
                      ${where}
                      ORDER BY requested_at DESC, id DESC
                      LIMIT ? OFFSET ?`,
                args: [...params, limit, offset],
            }),
            db.execute({
                sql: `SELECT
                        COUNT(*) as total,
                        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
                        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
                        SUM(CASE WHEN status = 'rejected' THEN 1 ELSE 0 END) as rejected,
                        COALESCE(SUM(CASE WHEN status = 'completed' THEN amount ELSE 0 END), 0) as total_paid
                      FROM withdrawals
                      WHERE user_id = ?`,
                args: [partnerId],
            }),
        ]);

        const total = Number(countRes.rows[0]?.total || 0);
        const data = rowsRes.rows.map((row: Record<string, any>) => ({
            id: row.id,
            amount: Number(row.amount || 0),
            method: row.method || '',
            status: row.status || 'pending',
            bankDetails: row.bank_details ? parseJson(row.bank_details, {}) : null,
            upiId: row.upi_id || null,
            rejectionReason: row.rejection_reason || null,
            adminNotes: row.admin_notes || null,
            requestedAt: row.requested_at,
            processedAt: row.processed_at || null,
            processedBy: row.processed_by || null,
        }));

        const paged = paginatedResponse(data, total, page, limit);
        const summary = summaryRes.rows[0] as Record<string, any> | undefined;

        return {
            ...paged,
            summary: {
                total: Number(summary?.total || 0),
                pending: Number(summary?.pending || 0),
                completed: Number(summary?.completed || 0),
                rejected: Number(summary?.rejected || 0),
                totalPaid: Number(summary?.total_paid || 0),
            },
        };
    });

    fastify.post('/api/partner/withdrawals', async (request, reply) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const body = (request.body || {}) as {
            amount: number;
            method: WithdrawalMethod;
            bankDetails?: Record<string, string>;
            upiId?: string;
        };

        if (!Number.isFinite(body.amount) || !body.method) {
            throw new BadRequestError('Amount and method are required');
        }
        if (body.amount <= 0) {
            throw new BadRequestError('Amount must be positive');
        }
        if (!['bank', 'wallet', 'upi'].includes(body.method)) {
            throw new BadRequestError('Invalid withdrawal method');
        }
        if (body.method === 'bank' && (!body.bankDetails || Object.keys(body.bankDetails).length === 0)) {
            throw new BadRequestError('bankDetails are required for bank withdrawals');
        }
        if (body.method === 'upi' && !body.upiId?.trim()) {
            throw new BadRequestError('upiId is required for UPI withdrawals');
        }

        const settings = await db.execute({
            sql: `SELECT value FROM settings WHERE key = ?`,
            args: ['general'],
        });
        const policy = parseWithdrawalPolicy(settings.rows[0]?.value);
        if (body.amount < policy.minAmount) {
            throw new BadRequestError(`Minimum withdrawal amount is ${policy.minAmount}`);
        }
        if (body.amount > policy.maxAmount) {
            throw new BadRequestError(`Maximum withdrawal amount is ${policy.maxAmount}`);
        }

        const userResult = await db.execute({
            sql: `SELECT uid, role, kyc_status FROM users WHERE uid = ?`,
            args: [partnerId],
        });
        if (userResult.rows.length === 0) throw new NotFoundError('User not found');
        if (String(userResult.rows[0]?.role || '') !== 'partner') {
            throw new ForbiddenError('Partner access required');
        }
        const kycStatus = String(userResult.rows[0]?.kyc_status || 'not_submitted');
        if (kycStatus !== 'verified') {
            throw new BadRequestError('KYC verification required. Please complete your KYC to withdraw funds.');
        }

        const pendingResult = await db.execute({
            sql: `SELECT id FROM withdrawals
                  WHERE user_id = ? AND status = 'pending'
                  LIMIT 1`,
            args: [partnerId],
        });
        if (pendingResult.rows.length > 0) {
            throw new BadRequestError('You already have a pending withdrawal request. Please wait for it to be processed.');
        }

        if (policy.cooldownDays > 0) {
            const lastProcessedResult = await db.execute({
                sql: `SELECT processed_at
                      FROM withdrawals
                      WHERE user_id = ?
                        AND status IN ('completed', 'rejected')
                        AND processed_at IS NOT NULL
                      ORDER BY processed_at DESC
                      LIMIT 1`,
                args: [partnerId],
            });
            if (lastProcessedResult.rows.length > 0) {
                const lastProcessedAt = Date.parse(String(lastProcessedResult.rows[0]?.processed_at || ''));
                if (Number.isFinite(lastProcessedAt)) {
                    const cooldownEnd = new Date(lastProcessedAt);
                    cooldownEnd.setDate(cooldownEnd.getDate() + policy.cooldownDays);
                    if (Date.now() < cooldownEnd.getTime()) {
                        const daysRemaining = Math.max(
                            1,
                            Math.ceil((cooldownEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
                        );
                        throw new BadRequestError(`Withdrawal cooldown active. You can request again in ${daysRemaining} day(s).`);
                    }
                }
            }
        }

        const startOfMonth = new Date();
        startOfMonth.setDate(1);
        startOfMonth.setHours(0, 0, 0, 0);
        const monthlyCountResult = await db.execute({
            sql: `SELECT COUNT(*) as total
                  FROM withdrawals
                  WHERE user_id = ? AND requested_at >= ?`,
            args: [partnerId, startOfMonth.toISOString()],
        });
        const monthlyCount = Number(monthlyCountResult.rows[0]?.total || 0);
        if (monthlyCount >= policy.maxPerMonth) {
            throw new BadRequestError(`Maximum ${policy.maxPerMonth} withdrawals allowed per month. Limit reached.`);
        }

        const now = new Date().toISOString();
        const id = randomUUID();
        const txnId = randomUUID();
        await withTransaction(async (tx) => {
            const walletUpdate = await tx.execute({
                sql: `UPDATE wallets
                      SET cash_balance = cash_balance - ?, updated_at = ?
                      WHERE user_id = ? AND cash_balance >= ?`,
                args: [body.amount, now, partnerId, body.amount],
            });
            if (Number((walletUpdate as any).rowsAffected || 0) === 0) {
                throw new BadRequestError('Insufficient cash balance');
            }
            await tx.execute({
                sql: `INSERT INTO withdrawals (
                        id, user_id, amount, method, status, bank_details, upi_id, requested_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    id,
                    partnerId,
                    body.amount,
                    body.method,
                    'pending',
                    body.bankDetails ? JSON.stringify(body.bankDetails) : null,
                    body.upiId?.trim() || null,
                    now,
                ],
            });
            await tx.execute({
                sql: `INSERT INTO transactions (
                        id, user_id, type, amount, currency, status, description, source_txn_id, created_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    txnId,
                    partnerId,
                    'WITHDRAWAL',
                    -body.amount,
                    'CASH',
                    'PENDING',
                    `Partner withdrawal request via ${body.method}`,
                    id,
                    now,
                ],
            });
        });

        return reply.status(201).send({ data: { id, status: 'pending', amount: body.amount } });
    });

    fastify.patch('/api/partner/withdrawals/:id/cancel', async (request) => {
        const partnerId = request.user!.uid;
        const { id } = request.params as { id: string };
        const now = new Date().toISOString();
        const data = await withTransaction(async (tx) => {
            const existing = await tx.execute({
                sql: 'SELECT id, user_id, amount, status FROM withdrawals WHERE id = ?',
                args: [id],
            });
            if (existing.rows.length === 0) throw new NotFoundError('Withdrawal not found');
            const row = existing.rows[0] as Record<string, any>;
            if (String(row.user_id || '') !== partnerId) {
                throw new ForbiddenError('You can only cancel your own withdrawal');
            }
            if (String(row.status || '') !== 'pending') {
                throw new BadRequestError('Only pending withdrawals can be cancelled');
            }
            const amount = Number(row.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new BadRequestError('Invalid withdrawal amount');
            }

            await tx.execute({
                sql: `UPDATE withdrawals
                      SET status = ?, rejection_reason = ?, admin_notes = ?, processed_at = ?, processed_by = ?
                      WHERE id = ?`,
                args: ['rejected', 'Cancelled by user', 'Cancelled by user', now, partnerId, id],
            });
            await tx.execute({
                sql: `UPDATE wallets
                      SET cash_balance = cash_balance + ?, updated_at = ?
                      WHERE user_id = ?`,
                args: [amount, now, partnerId],
            });
            await tx.execute({
                sql: `UPDATE transactions
                      SET status = ?, description = ?
                      WHERE source_txn_id = ? AND type = 'WITHDRAWAL'`,
                args: ['FAILED', 'Withdrawal cancelled by user', id],
            });
            return { amount };
        });
        return { data: { updated: true, status: 'rejected', amount: data.amount } };
    });

    // Partner Products (explicit partner-scoped CRUD)
    fastify.get('/api/partner/products', async (request) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '30', 10)));
        const offset = (page - 1) * limit;
        const status = String(query.status || '').trim();
        const category = String(query.category || '').trim();
        const search = String(query.search || '').trim();

        const conditions = ['vendor = ?'];
        const params: any[] = [partnerId];

        if (status) {
            conditions.push('COALESCE(status, ?) = ?');
            params.push('pending', status);
        }
        if (category) {
            conditions.push('category = ?');
            params.push(category);
        }
        if (search) {
            conditions.push('(name LIKE ? OR description LIKE ?)');
            const term = `%${search}%`;
            params.push(term, term);
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

    fastify.post('/api/partner/products', async (request, reply) => {
        const db = getDb();
        const partnerId = request.user!.uid;
        const body = request.body as {
            name: string;
            description?: string;
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

        if (!body.name || !body.price || !body.category || !body.image) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'name, price, category, and image are required' },
            });
        }
        if (Number(body.price) <= 0) {
            return reply.status(400).send({
                error: { code: 'VALIDATION_ERROR', message: 'Price must be positive' },
            });
        }

        const id = randomUUID();
        const now = new Date().toISOString();

        await db.execute({
            sql: `INSERT INTO products (
              id, name, description, price, category, image, images,
              commission, coin_price, in_stock, stock, badges,
              coin_only, cash_only, delivery_days, vendor, status,
              moderation_reason, moderated_at, moderated_by, created_at, updated_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                id,
                String(body.name).trim(),
                String(body.description || '').trim(),
                Number(body.price),
                String(body.category || 'general'),
                String(body.image || ''),
                body.images ? JSON.stringify(body.images) : null,
                Number(body.commission || 0),
                Number(body.coinPrice || 0),
                body.isActive !== undefined
                    ? (body.isActive ? 1 : 0)
                    : body.stock !== undefined ? (Number(body.stock) > 0 ? 1 : 0) : 1,
                Number(body.stock ?? 0),
                body.badges ? JSON.stringify(body.badges) : null,
                body.coinOnly ? 1 : 0,
                body.cashOnly ? 1 : 0,
                Number(body.deliveryDays || 7),
                partnerId,
                'pending',
                null,
                null,
                null,
                now,
                now,
            ],
        });

        return reply.status(201).send({
            data: { id, name: body.name, status: 'pending', createdAt: now },
        });
    });

    fastify.patch('/api/partner/products/:id', async (request, reply) => {
        const db = getDb();
        const partnerId = request.user!.uid;
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
        if (String(existing.rows[0].vendor || '') !== partnerId) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Not authorized to update this product' },
            });
        }

        const body = request.body as Record<string, any>;
        const fieldMap: Record<string, string> = {
            name: 'name',
            description: 'description',
            price: 'price',
            category: 'category',
            image: 'image',
            commission: 'commission',
            coinPrice: 'coin_price',
            stock: 'stock',
            deliveryDays: 'delivery_days',
        };

        const updates: string[] = [];
        const params: any[] = [];

        for (const [inputKey, colName] of Object.entries(fieldMap)) {
            if (body[inputKey] !== undefined) {
                updates.push(`${colName} = ?`);
                params.push(body[inputKey]);
            }
        }

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

    fastify.delete('/api/partner/products/:id', async (request, reply) => {
        const db = getDb();
        const partnerId = request.user!.uid;
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
        if (String(existing.rows[0].vendor || '') !== partnerId) {
            return reply.status(403).send({
                error: { code: 'FORBIDDEN', message: 'Not authorized to delete this product' },
            });
        }

        await db.execute({ sql: 'DELETE FROM products WHERE id = ?', args: [id] });
        return { data: { deleted: true } };
    });
}
