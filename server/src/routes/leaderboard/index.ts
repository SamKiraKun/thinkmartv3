// File: server/src/routes/leaderboard/index.ts
/**
 * Leaderboard Routes (Read)
 *
 * GET /api/leaderboard?type=earnings|referrals&period=all_time|monthly|weekly&limit=50
 */

import type { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';

type LeaderboardType = 'earnings' | 'referrals';
type LeaderboardPeriod = 'all_time' | 'monthly' | 'weekly';

function getPeriodStart(period: LeaderboardPeriod): string | null {
    const now = new Date();
    if (period === 'all_time') return null;

    const start = new Date(now);
    if (period === 'weekly') {
        start.setDate(now.getDate() - 7);
    } else {
        start.setMonth(now.getMonth() - 1);
    }
    return start.toISOString();
}

export default async function leaderboardRoutes(fastify: FastifyInstance) {
    fastify.get('/api/leaderboard', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const type = (query.type === 'referrals' ? 'referrals' : 'earnings') as LeaderboardType;
        const period = (['all_time', 'monthly', 'weekly'].includes(query.period || '')
            ? query.period
            : 'all_time') as LeaderboardPeriod;
        const limit = Math.min(100, Math.max(1, parseInt(query.limit || '50', 10)));
        const since = getPeriodStart(period);

        if (type === 'referrals') {
            const args: Array<string | number> = [];
            let where = 'u.referred_by IS NOT NULL';
            if (since) {
                where += ' AND u.created_at >= ?';
                args.push(since);
            }

            const result = await db.execute({
                sql: `SELECT
                        parent.uid as user_id,
                        parent.name as user_name,
                        parent.photo_url as user_avatar,
                        COUNT(u.uid) as value
                      FROM users u
                      JOIN users parent ON parent.uid = u.referred_by
                      WHERE ${where}
                      GROUP BY parent.uid, parent.name, parent.photo_url
                      ORDER BY value DESC, parent.name ASC
                      LIMIT ?`,
                args: [...args, limit],
            });

            return reply.send({
                data: {
                    type,
                    period,
                    entries: result.rows.map((row, idx) => ({
                        userId: row.user_id,
                        userName: row.user_name || 'User',
                        userAvatar: row.user_avatar || null,
                        rank: idx + 1,
                        value: Number(row.value) || 0,
                    })),
                    lastUpdated: new Date().toISOString(),
                },
            });
        }

        const earningsTypes = ['TASK_REWARD', 'REFERRAL_BONUS', 'TEAM_INCOME', 'PARTNER_COMMISSION', 'ADMIN_CREDIT'];
        const args: Array<string | number> = [...earningsTypes];
        let timeFilter = '';
        if (since) {
            timeFilter = ' AND t.created_at >= ?';
            args.push(since);
        }
        args.push(limit);

        const placeholders = earningsTypes.map(() => '?').join(', ');
        const result = await db.execute({
            sql: `SELECT
                    t.user_id,
                    u.name as user_name,
                    u.photo_url as user_avatar,
                    SUM(CASE WHEN t.amount > 0 THEN t.amount ELSE 0 END) as value
                  FROM transactions t
                  LEFT JOIN users u ON u.uid = t.user_id
                  WHERE t.status = 'COMPLETED'
                    AND t.type IN (${placeholders})
                    ${timeFilter}
                  GROUP BY t.user_id, u.name, u.photo_url
                  HAVING value > 0
                  ORDER BY value DESC
                  LIMIT ?`,
            args,
        });

        return reply.send({
            data: {
                type,
                period,
                entries: result.rows.map((row, idx) => ({
                    userId: row.user_id,
                    userName: row.user_name || 'User',
                    userAvatar: row.user_avatar || null,
                    rank: idx + 1,
                    value: Number(row.value) || 0,
                })),
                lastUpdated: new Date().toISOString(),
            },
        });
    });
}
