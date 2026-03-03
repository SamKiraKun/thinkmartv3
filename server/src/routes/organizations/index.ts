import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb, withTransaction } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../utils/errors.js';

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

    fastify.get('/api/organizations/me/earnings/withdrawals', async (request) => {
        const db = getDb();
        const orgId = request.user!.uid;
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const status = String(query.status || '').trim().toLowerCase();
        const method = String(query.method || '').trim().toLowerCase();

        const conditions = ['user_id = ?'];
        const params: any[] = [orgId];
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
                args: [orgId],
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

    fastify.post('/api/organizations/me/earnings/withdrawals', async (request, reply) => {
        const db = getDb();
        const orgId = request.user!.uid;
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

        const orgResult = await db.execute({
            sql: `SELECT uid, role, kyc_status FROM users WHERE uid = ?`,
            args: [orgId],
        });
        if (orgResult.rows.length === 0) throw new NotFoundError('Organization not found');
        if (String(orgResult.rows[0]?.role || '') !== 'organization') {
            throw new ForbiddenError('Organization access required');
        }
        const kycStatus = String(orgResult.rows[0]?.kyc_status || 'not_submitted');
        if (kycStatus !== 'verified') {
            throw new BadRequestError('KYC verification required. Please complete your KYC to withdraw funds.');
        }

        const pendingResult = await db.execute({
            sql: `SELECT id FROM withdrawals
                  WHERE user_id = ? AND status = 'pending'
                  LIMIT 1`,
            args: [orgId],
        });
        if (pendingResult.rows.length > 0) {
            throw new BadRequestError('You already have a pending payout request. Please wait for it to be processed.');
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
                args: [orgId],
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
            args: [orgId, startOfMonth.toISOString()],
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
                args: [body.amount, now, orgId, body.amount],
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
                    orgId,
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
                    orgId,
                    'WITHDRAWAL',
                    -body.amount,
                    'CASH',
                    'PENDING',
                    `Organization payout request via ${body.method}`,
                    id,
                    now,
                ],
            });
        });

        return reply.status(201).send({ data: { id, status: 'pending', amount: body.amount } });
    });

    fastify.patch('/api/organizations/me/earnings/withdrawals/:id/cancel', async (request) => {
        const orgId = request.user!.uid;
        const { id } = request.params as { id: string };
        const now = new Date().toISOString();
        const data = await withTransaction(async (tx) => {
            const existing = await tx.execute({
                sql: 'SELECT id, user_id, amount, status FROM withdrawals WHERE id = ?',
                args: [id],
            });
            if (existing.rows.length === 0) throw new NotFoundError('Withdrawal not found');
            const row = existing.rows[0] as Record<string, any>;
            if (String(row.user_id || '') !== orgId) {
                throw new ForbiddenError('You can only cancel your own payout request');
            }
            if (String(row.status || '') !== 'pending') {
                throw new BadRequestError('Only pending payout requests can be cancelled');
            }
            const amount = Number(row.amount || 0);
            if (!Number.isFinite(amount) || amount <= 0) {
                throw new BadRequestError('Invalid payout amount');
            }

            await tx.execute({
                sql: `UPDATE withdrawals
                      SET status = ?, rejection_reason = ?, admin_notes = ?, processed_at = ?, processed_by = ?
                      WHERE id = ?`,
                args: ['rejected', 'Cancelled by organization', 'Cancelled by organization', now, orgId, id],
            });
            await tx.execute({
                sql: `UPDATE wallets
                      SET cash_balance = cash_balance + ?, updated_at = ?
                      WHERE user_id = ?`,
                args: [amount, now, orgId],
            });
            await tx.execute({
                sql: `UPDATE transactions
                      SET status = ?, description = ?
                      WHERE source_txn_id = ? AND type = 'WITHDRAWAL'`,
                args: ['FAILED', 'Organization payout request cancelled by user', id],
            });
            return { amount };
        });

        return { data: { updated: true, status: 'rejected', amount: data.amount } };
    });
}
