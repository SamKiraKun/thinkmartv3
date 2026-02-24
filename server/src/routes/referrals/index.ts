import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function referralRoutes(fastify: FastifyInstance) {
    fastify.get('/api/referrals/team', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const level = query.level ? parseInt(query.level, 10) : undefined;

        let countSql: string;
        let fetchSql: string;
        let params: any[];

        if (level === 1 || !level) {
            countSql = `SELECT COUNT(*) as total FROM users WHERE referred_by = ?`;
            fetchSql = `SELECT uid, name, email, phone, city, state, membership_active, created_at
                        FROM users WHERE referred_by = ?
                        ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params = [userId];
        } else {
            countSql = `SELECT COUNT(*) as total FROM users
                        WHERE upline_path LIKE ? AND referred_by != ?`;
            fetchSql = `SELECT uid, name, email, phone, city, state, membership_active, created_at
                        FROM users WHERE upline_path LIKE ? AND referred_by != ?
                        ORDER BY created_at DESC LIMIT ? OFFSET ?`;
            params = [`%${userId}%`, userId];
        }

        const countResult = await db.execute({ sql: countSql, args: params });
        const total = Number(countResult.rows[0].total);
        const result = await db.execute({ sql: fetchSql, args: [...params, limit, offset] });

        const team = result.rows.map((row) => ({
            uid: row.uid,
            name: row.name,
            email: row.email,
            phone: row.phone,
            city: row.city,
            state: row.state,
            membershipActive: Boolean(row.membership_active),
            createdAt: row.created_at,
        }));

        return paginatedResponse(team, total, page, limit);
    });

    fastify.get('/api/referrals/stats', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;

        const [directResult, activeResult, teamResult, earningsResult, userResult] = await Promise.all([
            db.execute({
                sql: 'SELECT COUNT(*) as count FROM users WHERE referred_by = ?',
                args: [userId],
            }),
            db.execute({
                sql: 'SELECT COUNT(*) as count FROM users WHERE referred_by = ? AND membership_active = 1',
                args: [userId],
            }),
            db.execute({
                sql: `SELECT COUNT(*) as count FROM users WHERE upline_path LIKE ?`,
                args: [`%${userId}%`],
            }),
            db.execute({
                sql: `SELECT COALESCE(SUM(amount), 0) as total_earnings, COUNT(*) as total_transactions
                      FROM transactions
                      WHERE user_id = ? AND type IN ('REFERRAL_BONUS', 'TEAM_INCOME')`,
                args: [userId],
            }),
            db.execute({
                sql: 'SELECT own_referral_code FROM users WHERE uid = ?',
                args: [userId],
            }),
        ]);

        return {
            data: {
                ownReferralCode: userResult.rows[0]?.own_referral_code || '',
                directReferrals: Number(directResult.rows[0].count),
                activeMembers: Number(activeResult.rows[0].count),
                totalTeam: Number(teamResult.rows[0].count),
                totalEarnings: Number(earningsResult.rows[0].total_earnings),
                totalTransactions: Number(earningsResult.rows[0].total_transactions),
            },
        };
    });

    fastify.get('/api/referrals/downline-children', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const requester = request.user!;
        const query = request.query as Record<string, string>;
        const parentReferralCode = String(query.parentReferralCode || '').trim();
        if (!parentReferralCode) return { data: [] };

        const me = await db.execute({
            sql: 'SELECT own_referral_code FROM users WHERE uid = ?',
            args: [requester.uid],
        });
        const myOwnReferralCode = String(me.rows[0]?.own_referral_code || '');
        const isDirectChildQuery = parentReferralCode === myOwnReferralCode;

        const conditions = ['referral_code = ?'];
        const args: any[] = [parentReferralCode];
        if (!['admin', 'sub_admin'].includes(String(requester.role)) && !isDirectChildQuery) {
            conditions.push('upline_path LIKE ?');
            args.push(`%${requester.uid}%`);
        }

        const result = await db.execute({
            sql: `SELECT uid, name, referral_code, own_referral_code
                  FROM users
                  WHERE ${conditions.join(' AND ')}
                  ORDER BY created_at ASC, uid ASC
                  LIMIT 200`,
            args,
        });

        return {
            data: result.rows.map((row) => ({
                uid: row.uid,
                name: row.name || 'Unknown',
                referralCode: row.referral_code || '',
                ownReferralCode: row.own_referral_code || '',
            })),
        };
    });

    fastify.get('/api/referrals/earnings', { preHandler: [requireAuth] }, async (request) => {
        const db = getDb();
        const userId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1', 10));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: `SELECT COUNT(*) as total FROM transactions
                  WHERE user_id = ? AND type IN ('REFERRAL_BONUS', 'TEAM_INCOME')`,
            args: [userId],
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT t.*, u.name as related_user_name
                  FROM transactions t
                  LEFT JOIN users u ON t.related_user_id = u.uid
                  WHERE t.user_id = ? AND t.type IN ('REFERRAL_BONUS', 'TEAM_INCOME')
                  ORDER BY t.created_at DESC
                  LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
        });

        const earnings = result.rows.map((row) => ({
            id: row.id,
            type: row.type,
            amount: row.amount,
            currency: row.currency,
            status: row.status,
            description: row.description,
            relatedUserId: row.related_user_id,
            relatedUserName: row.related_user_name,
            level: row.level,
            createdAt: row.created_at,
        }));

        return paginatedResponse(earnings, total, page, limit);
    });
}
