import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';

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

    fastify.get('/api/organizations/me/earnings', async (request) => {
        const db = getDb();
        const orgId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '50', 10)));
        const offset = (page - 1) * limit;

        const [countRes, listRes, totalRes, monthRes, walletRes] = await Promise.all([
            db.execute({
                sql: `SELECT COUNT(*) as total
                      FROM transactions
                      WHERE user_id = ? AND type = 'TEAM_INCOME' AND currency IN ('CASH','INR')`,
                args: [orgId],
            }),
            db.execute({
                sql: `SELECT t.id, t.amount, t.type, t.description, t.related_user_id, t.created_at, u.name as source_user_name
                      FROM transactions t
                      LEFT JOIN users u ON u.uid = t.related_user_id
                      WHERE t.user_id = ? AND t.type = 'TEAM_INCOME' AND t.currency IN ('CASH','INR')
                      ORDER BY t.created_at DESC, t.id DESC
                      LIMIT ? OFFSET ?`,
                args: [orgId, limit, offset],
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
            },
        };
    });
}
