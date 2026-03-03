import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { BadRequestError } from '../../utils/errors.js';

function parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function orgStatusFromUser(row: Record<string, any>): 'active' | 'suspended' | 'pending' {
    if (Boolean(row?.is_banned)) return 'suspended';
    if (!Boolean(row?.is_active)) return 'pending';
    return 'active';
}

function parseDateRange(query: Record<string, string>, defaultDays: number) {
    const days = Math.min(365, Math.max(1, Number.parseInt(String(query.days || defaultDays), 10) || defaultDays));
    const fromRaw = String(query.from || '').trim();
    const toRaw = String(query.to || '').trim();
    const from = fromRaw ? new Date(fromRaw) : null;
    const to = toRaw ? new Date(toRaw) : null;

    if (from && !Number.isFinite(from.getTime())) {
        throw new BadRequestError('Invalid "from" date');
    }
    if (to && !Number.isFinite(to.getTime())) {
        throw new BadRequestError('Invalid "to" date');
    }

    const now = new Date();
    const end = to ? new Date(to) : new Date(now);
    end.setHours(23, 59, 59, 999);

    const start = from ? new Date(from) : new Date(end);
    if (!from) {
        start.setDate(end.getDate() - (days - 1));
    }
    start.setHours(0, 0, 0, 0);

    if (start.getTime() > end.getTime()) {
        throw new BadRequestError('"from" date must be before "to" date');
    }
    return { startIso: start.toISOString(), endIso: end.toISOString() };
}

function csvEscape(value: unknown): string {
    const str = String(value ?? '');
    if (str.includes('"') || str.includes(',') || str.includes('\n') || str.includes('\r')) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export default async function organizationRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('organization'));

    fastify.get('/api/organizations/me/dashboard', async (request) => {
        const db = getDb();
        const orgId = request.user!.uid;
        const userRes = await db.execute({
            sql: `SELECT uid, name, own_referral_code, org_config, is_active, is_banned
                  FROM users WHERE uid = ?`,
            args: [orgId],
        });
        const userRow = (userRes.rows[0] || {}) as Record<string, any>;
        const referralCode = String(userRow.own_referral_code || '');
        const orgConfig = parseJson<Record<string, any>>(userRow.org_config, {});

        const [membersCountRes, recentMembersRes, earningsRes, monthRes, walletRes] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) as count FROM users WHERE referral_code = ?`,
                args: [referralCode],
            }),
            db.execute({
                sql: `SELECT uid, name, email, membership_active, created_at
                      FROM users
                      WHERE referral_code = ?
                      ORDER BY created_at DESC, uid DESC
                      LIMIT 5`,
                args: [referralCode],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(amount), 0) as total
                      FROM transactions
                      WHERE user_id = ? AND type = 'TEAM_INCOME' AND currency IN ('CASH','INR')`,
                args: [orgId],
            }),
            (() => {
                const start = new Date();
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                return db.execute({
                    sql: `SELECT COALESCE(SUM(amount), 0) as total
                          FROM transactions
                          WHERE user_id = ? AND type = 'TEAM_INCOME' AND currency IN ('CASH','INR') AND created_at >= ?`,
                    args: [orgId, start.toISOString()],
                });
            })(),
            db.execute({
                sql: 'SELECT cash_balance FROM wallets WHERE user_id = ?',
                args: [orgId],
            }),
        ]);

        return {
            data: {
                org: {
                    id: orgId,
                    referralCode,
                    status: orgStatusFromUser(userRow),
                    orgName: String(orgConfig.orgName || userRow.name || 'Organization'),
                    orgType: String(orgConfig.orgType || 'organization'),
                    commissionPercentage: Number(orgConfig.commissionPercentage || 10),
                },
                stats: {
                    memberCount: Number(membersCountRes.rows[0]?.count || 0),
                    totalEarnings: Number(earningsRes.rows[0]?.total || 0),
                    pendingEarnings: Number(walletRes.rows[0]?.cash_balance || 0),
                    thisMonthEarnings: Number(monthRes.rows[0]?.total || 0),
                },
                recentMembers: recentMembersRes.rows.map((row: Record<string, any>) => ({
                    id: row.uid,
                    name: row.name || 'Unknown',
                    email: row.email || '',
                    joinedAt: row.created_at,
                    membershipActive: Boolean(row.membership_active),
                })),
            },
        };
    });

    fastify.get('/api/organizations/me/members', async (request) => {
        const db = getDb();
        const orgId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '50', 10)));
        const offset = (page - 1) * limit;
        const search = String(query.search || '').trim();

        const codeRes = await db.execute({
            sql: 'SELECT own_referral_code FROM users WHERE uid = ?',
            args: [orgId],
        });
        const referralCode = String(codeRes.rows[0]?.own_referral_code || '');
        if (!referralCode) return paginatedResponse([], 0, page, limit);

        const conditions = ['referral_code = ?'];
        const params: any[] = [referralCode];
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
            sql: `SELECT uid, name, email, phone, city, membership_active, created_at
                  FROM users ${where}
                  ORDER BY created_at DESC, uid DESC
                  LIMIT ? OFFSET ?`,
            args: [...params, limit, offset],
        });

        const members = result.rows.map((row: Record<string, any>) => ({
            id: row.uid,
            name: row.name || 'Unknown',
            email: row.email || '',
            phone: row.phone || null,
            city: row.city || null,
            membershipActive: Boolean(row.membership_active),
            createdAt: row.created_at,
        }));
        return paginatedResponse(members, total, page, limit);
    });

    fastify.get('/api/organizations/me/earnings', async (request, reply) => {
        const db = getDb();
        const orgId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '50', 10)));
        const offset = (page - 1) * limit;
        const search = String(query.search || '').trim();
        const sortDir = String(query.sort || 'desc').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
        const exportFormat = String(query.export || '').trim().toLowerCase();
        const sourceType = String(query.sourceType || '').trim().toLowerCase();
        if (sourceType && sourceType !== 'earning') {
            return {
                data: {
                    logs: [],
                    stats: {
                        totalEarnings: 0,
                        thisMonth: 0,
                        pendingPayout: 0,
                    },
                    pagination: {
                        page,
                        limit,
                        total: 0,
                        totalPages: 0,
                        hasNext: false,
                        hasPrev: page > 1,
                    },
                },
            };
        }
        if (exportFormat && exportFormat !== 'csv') {
            throw new BadRequestError('Unsupported export format');
        }
        const hasDateFilter = Boolean(query.from || query.to || query.days);
        const dateRange = hasDateFilter ? parseDateRange(query, 180) : null;

        const whereParts: string[] = [
            't.user_id = ?',
            "t.type = 'TEAM_INCOME'",
            "t.currency IN ('CASH','INR')",
        ];
        const whereArgs: any[] = [orgId];
        if (dateRange) {
            whereParts.push('t.created_at >= ?');
            whereParts.push('t.created_at <= ?');
            whereArgs.push(dateRange.startIso, dateRange.endIso);
        }
        if (search) {
            const term = `%${search}%`;
            whereParts.push('(u.name LIKE ? OR t.related_user_id LIKE ?)');
            whereArgs.push(term, term);
        }
        const where = whereParts.join(' AND ');

        if (exportFormat === 'csv') {
            const rowsRes = await db.execute({
                sql: `SELECT t.id, t.amount, t.description, t.related_user_id, t.created_at, u.name as source_user_name
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      WHERE ${where}
                      ORDER BY t.created_at ${sortDir}, t.id ${sortDir}`,
                args: whereArgs,
            });
            const lines = [
                'id,amount,source_type,source_user_id,source_user_name,created_at',
                ...(rowsRes.rows as Array<Record<string, any>>).map((row) =>
                    [
                        csvEscape(row.id),
                        csvEscape(Number(row.amount || 0).toFixed(2)),
                        csvEscape('earning'),
                        csvEscape(row.related_user_id || ''),
                        csvEscape(row.source_user_name || ''),
                        csvEscape(row.created_at || ''),
                    ].join(',')
                ),
            ];
            const csv = lines.join('\n');
            reply.header('content-type', 'text/csv; charset=utf-8');
            reply.header('content-disposition', `attachment; filename="organization-earnings-${new Date().toISOString().slice(0, 10)}.csv"`);
            return reply.send(csv);
        }

        const [countRes, listRes, totalRes, monthRes, walletRes] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) as total
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      WHERE ${where}`,
                args: whereArgs,
            }),
            db.execute({
                sql: `SELECT t.id, t.amount, t.type, t.description, t.related_user_id, t.created_at, u.name as source_user_name
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      WHERE ${where}
                      ORDER BY t.created_at ${sortDir}, t.id ${sortDir}
                      LIMIT ? OFFSET ?`,
                args: [...whereArgs, limit, offset],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(amount), 0) as total
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      WHERE ${where}`,
                args: whereArgs,
            }),
            (() => {
                const start = new Date();
                start.setDate(1);
                start.setHours(0, 0, 0, 0);
                return db.execute({
                    sql: `SELECT COALESCE(SUM(amount), 0) as total
                          FROM transactions
                          WHERE user_id = ? AND type = 'TEAM_INCOME' AND currency IN ('CASH','INR') AND created_at >= ?`,
                    args: [orgId, start.toISOString()],
                });
            })(),
            db.execute({
                sql: 'SELECT cash_balance FROM wallets WHERE user_id = ?',
                args: [orgId],
            }),
        ]);

        return {
            data: {
                logs: listRes.rows.map((row: Record<string, any>) => ({
                    id: row.id,
                    amount: Number(row.amount || 0),
                    sourceType: 'earning',
                    sourceUserId: row.related_user_id || '',
                    sourceUserName: row.source_user_name || null,
                    createdAt: row.created_at,
                })),
                stats: {
                    totalEarnings: Number(totalRes.rows[0]?.total || 0),
                    thisMonth: Number(monthRes.rows[0]?.total || 0),
                    pendingPayout: Number(walletRes.rows[0]?.cash_balance || 0),
                },
                pagination: {
                    page,
                    limit,
                    total: Number(countRes.rows[0]?.total || 0),
                    totalPages: Math.ceil(Number(countRes.rows[0]?.total || 0) / limit) || 0,
                    hasNext: page * limit < Number(countRes.rows[0]?.total || 0),
                    hasPrev: page > 1,
                },
                filters: {
                    search: search || null,
                    from: dateRange?.startIso || null,
                    to: dateRange?.endIso || null,
                    sort: sortDir.toLowerCase(),
                },
            },
        };
    });
}
