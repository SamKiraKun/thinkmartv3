import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { requireAuth, requireRole } from '../../middleware/auth.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { BadRequestError, NotFoundError } from '../../utils/errors.js';

type JsonObject = Record<string, any>;

type AdminSettingsDto = {
    minWithdrawalAmount: number;
    maxWithdrawalAmount: number;
    dailyWithdrawalLimit: number;
    withdrawalFeePercent: number;
    referralBonusAmount: number;
    referralCommissionPercent: number;
    orgCommissionPercent: number;
    partnerCommissionPercent: number;
    dailyTaskLimit: number;
    taskCooldownMinutes: number;
    dailySpinLimit: number;
    dailyLuckyBoxLimit: number;
    maintenanceMode: boolean;
    signupsEnabled: boolean;
    withdrawalsEnabled: boolean;
    updatedAt?: string;
    updatedBy?: string;
};

type GamePrize = {
    id: string;
    label: string;
    value: number;
    probability: number;
    color?: string;
};

type GameConfig = {
    id: 'spin_wheel' | 'lucky_box';
    type: 'spin_wheel' | 'lucky_box';
    name: string;
    enabled: boolean;
    dailyLimit: number;
    cooldownMinutes: number;
    prizes: GamePrize[];
    updatedAt?: string;
    updatedBy?: string;
};

type AdminCmsDto = {
    termsOfService: string;
    privacyPolicy: string;
    aboutUs: string;
    updatedAt?: string;
    updatedBy?: string;
};

const GENERAL_SETTINGS_KEY = 'general';
const GAME_CONFIGS_KEY = 'game_configs';
const CMS_CONTENT_KEY = 'cms_content';

const DEFAULT_SETTINGS: AdminSettingsDto = {
    minWithdrawalAmount: 500,
    maxWithdrawalAmount: 50000,
    dailyWithdrawalLimit: 100000,
    withdrawalFeePercent: 0,
    referralBonusAmount: 0,
    referralCommissionPercent: 5,
    orgCommissionPercent: 10,
    partnerCommissionPercent: 5,
    dailyTaskLimit: 10,
    taskCooldownMinutes: 1440,
    dailySpinLimit: 1,
    dailyLuckyBoxLimit: 1,
    maintenanceMode: false,
    signupsEnabled: true,
    withdrawalsEnabled: true,
};

const DEFAULT_GAME_CONFIGS: GameConfig[] = [
    {
        id: 'spin_wheel',
        type: 'spin_wheel',
        name: 'Daily Spin Wheel',
        enabled: true,
        dailyLimit: 1,
        cooldownMinutes: 1440,
        prizes: [
            { id: 'spin_0', label: 'Better Luck Next Time', value: 0, probability: 40, color: '#e5e7eb' },
            { id: 'spin_50', label: '50 Coins', value: 50, probability: 30, color: '#93c5fd' },
            { id: 'spin_100', label: '100 Coins', value: 100, probability: 20, color: '#86efac' },
            { id: 'spin_500', label: '500 Coins', value: 500, probability: 8, color: '#d8b4fe' },
            { id: 'spin_1000', label: 'JACKPOT (1000)', value: 1000, probability: 2, color: '#fde68a' },
        ],
    },
    {
        id: 'lucky_box',
        type: 'lucky_box',
        name: 'Lucky Box',
        enabled: true,
        dailyLimit: 1,
        cooldownMinutes: 1440,
        prizes: [
            { id: 'box_25', label: '25 Coins', value: 25, probability: 35 },
            { id: 'box_50', label: '50 Coins', value: 50, probability: 30 },
            { id: 'box_100', label: '100 Coins', value: 100, probability: 20 },
            { id: 'box_250', label: '250 Coins', value: 250, probability: 10 },
            { id: 'box_500', label: '500 Coins', value: 500, probability: 5 },
        ],
    },
];

const DEFAULT_CMS_CONTENT: AdminCmsDto = {
    termsOfService: '',
    privacyPolicy: '',
    aboutUs: '',
};

function parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function nowIso() {
    return new Date().toISOString();
}

function clamp(n: number, min: number, max: number) {
    return Math.max(min, Math.min(max, n));
}

function normalizeGeneralSettings(value: unknown, updatedAt?: string, updatedBy?: string): AdminSettingsDto {
    const raw = parseJson<JsonObject>(value, {});
    return {
        minWithdrawalAmount: Math.max(0, Number(raw.minWithdrawalAmount ?? DEFAULT_SETTINGS.minWithdrawalAmount) || DEFAULT_SETTINGS.minWithdrawalAmount),
        maxWithdrawalAmount: Math.max(0, Number(raw.maxWithdrawalAmount ?? DEFAULT_SETTINGS.maxWithdrawalAmount) || DEFAULT_SETTINGS.maxWithdrawalAmount),
        dailyWithdrawalLimit: Math.max(0, Number(raw.dailyWithdrawalLimit ?? DEFAULT_SETTINGS.dailyWithdrawalLimit) || DEFAULT_SETTINGS.dailyWithdrawalLimit),
        withdrawalFeePercent: clamp(Number(raw.withdrawalFeePercent ?? DEFAULT_SETTINGS.withdrawalFeePercent) || 0, 0, 100),
        referralBonusAmount: Math.max(0, Number(raw.referralBonusAmount ?? DEFAULT_SETTINGS.referralBonusAmount) || 0),
        referralCommissionPercent: clamp(Number(raw.referralCommissionPercent ?? DEFAULT_SETTINGS.referralCommissionPercent) || 0, 0, 100),
        orgCommissionPercent: clamp(Number(raw.orgCommissionPercent ?? DEFAULT_SETTINGS.orgCommissionPercent) || 0, 0, 100),
        partnerCommissionPercent: clamp(Number(raw.partnerCommissionPercent ?? DEFAULT_SETTINGS.partnerCommissionPercent) || 0, 0, 50),
        dailyTaskLimit: Math.max(0, Number(raw.dailyTaskLimit ?? DEFAULT_SETTINGS.dailyTaskLimit) || DEFAULT_SETTINGS.dailyTaskLimit),
        taskCooldownMinutes: Math.max(0, Number(raw.taskCooldownMinutes ?? DEFAULT_SETTINGS.taskCooldownMinutes) || DEFAULT_SETTINGS.taskCooldownMinutes),
        dailySpinLimit: Math.max(0, Number(raw.dailySpinLimit ?? DEFAULT_SETTINGS.dailySpinLimit) || DEFAULT_SETTINGS.dailySpinLimit),
        dailyLuckyBoxLimit: Math.max(0, Number(raw.dailyLuckyBoxLimit ?? DEFAULT_SETTINGS.dailyLuckyBoxLimit) || DEFAULT_SETTINGS.dailyLuckyBoxLimit),
        maintenanceMode: Boolean(raw.maintenanceMode ?? DEFAULT_SETTINGS.maintenanceMode),
        signupsEnabled: raw.signupsEnabled === undefined ? DEFAULT_SETTINGS.signupsEnabled : Boolean(raw.signupsEnabled),
        withdrawalsEnabled: raw.withdrawalsEnabled === undefined ? DEFAULT_SETTINGS.withdrawalsEnabled : Boolean(raw.withdrawalsEnabled),
        updatedAt,
        updatedBy,
    };
}

function normalizeGameConfigs(value: unknown): GameConfig[] {
    const parsed = parseJson<unknown>(value, []);
    const arr = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.games)
            ? (parsed as any).games
            : [];
    return DEFAULT_GAME_CONFIGS.map((base) => {
        const found = (arr as any[]).find((g) => String(g?.id || g?.type) === base.id) || {};
        const prizes = Array.isArray(found.prizes) ? found.prizes : base.prizes;
        return {
            id: base.id,
            type: base.type,
            name: String(found.name || base.name),
            enabled: found.enabled === undefined ? base.enabled : Boolean(found.enabled),
            dailyLimit: Math.max(0, Number(found.dailyLimit ?? base.dailyLimit) || base.dailyLimit),
            cooldownMinutes: Math.max(0, Number(found.cooldownMinutes ?? base.cooldownMinutes) || base.cooldownMinutes),
            prizes: (prizes as any[]).map((p, idx) => ({
                id: String(p?.id || `${base.id}_${idx}`),
                label: String(p?.label || `Prize ${idx + 1}`),
                value: Number(p?.value || 0),
                probability: Math.max(0, Number(p?.probability ?? 0)),
                color: p?.color ? String(p.color) : undefined,
            })),
            updatedAt: found.updatedAt ? String(found.updatedAt) : undefined,
            updatedBy: found.updatedBy ? String(found.updatedBy) : undefined,
        };
    });
}

function normalizeCmsContent(value: unknown, updatedAt?: string, updatedBy?: string): AdminCmsDto {
    const raw = parseJson<JsonObject>(value, {});
    return {
        termsOfService: String(raw.termsOfService ?? raw.terms ?? DEFAULT_CMS_CONTENT.termsOfService),
        privacyPolicy: String(raw.privacyPolicy ?? raw.privacy ?? DEFAULT_CMS_CONTENT.privacyPolicy),
        aboutUs: String(raw.aboutUs ?? raw.about ?? DEFAULT_CMS_CONTENT.aboutUs),
        updatedAt,
        updatedBy,
    };
}

function parseVendorConfig(value: unknown): JsonObject {
    return parseJson<JsonObject>(value, {});
}

function vendorStatusFromRow(row: Record<string, any>): 'pending' | 'verified' | 'suspended' {
    if (Boolean(row.is_banned)) return 'suspended';
    const cfg = parseVendorConfig(row.vendor_config);
    if (String(cfg.status || '').toLowerCase() === 'verified' || cfg.verifiedAt) return 'verified';
    return 'pending';
}

export default async function adminExtraRoutes(fastify: FastifyInstance) {
    fastify.addHook('preHandler', requireAuth);
    fastify.addHook('preHandler', requireRole('admin', 'sub_admin'));

    fastify.get('/api/admin/settings', async () => {
        const db = getDb();
        const res = await db.execute({
            sql: 'SELECT key, value, updated_at, updated_by FROM settings WHERE key = ?',
            args: [GENERAL_SETTINGS_KEY],
        });
        const row = res.rows[0] as Record<string, any> | undefined;
        return { data: normalizeGeneralSettings(row?.value, row?.updated_at as string | undefined, row?.updated_by as string | undefined) };
    });

    fastify.put('/api/admin/settings', async (request) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const body = (request.body || {}) as Partial<AdminSettingsDto>;
        const currentRes = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [GENERAL_SETTINGS_KEY],
        });
        const current = normalizeGeneralSettings(currentRes.rows[0]?.value);
        const merged = normalizeGeneralSettings(JSON.stringify({ ...current, ...body }));
        if (merged.maxWithdrawalAmount > 0 && merged.minWithdrawalAmount > merged.maxWithdrawalAmount) {
            throw new BadRequestError('minWithdrawalAmount cannot exceed maxWithdrawalAmount');
        }
        const now = nowIso();
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [GENERAL_SETTINGS_KEY, JSON.stringify(merged), now, adminId],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (id, actor_uid, action, target_type, target_id, details, ip_address, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), adminId, 'settings.update', 'settings', GENERAL_SETTINGS_KEY, JSON.stringify({ keys: Object.keys(body || {}) }), request.ip, now],
        });
        return { data: { updated: true } };
    });

    fastify.get('/api/admin/cms', async () => {
        const db = getDb();
        const res = await db.execute({
            sql: 'SELECT key, value, updated_at, updated_by FROM settings WHERE key = ?',
            args: [CMS_CONTENT_KEY],
        });
        const row = res.rows[0] as Record<string, any> | undefined;
        return {
            data: normalizeCmsContent(
                row?.value,
                row?.updated_at ? String(row.updated_at) : undefined,
                row?.updated_by ? String(row.updated_by) : undefined
            ),
        };
    });

    fastify.put('/api/admin/cms', async (request) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const body = (request.body || {}) as Partial<AdminCmsDto>;
        const currentRes = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [CMS_CONTENT_KEY],
        });
        const current = normalizeCmsContent(currentRes.rows[0]?.value);
        const next = normalizeCmsContent({
            termsOfService: body.termsOfService !== undefined ? String(body.termsOfService).trim() : current.termsOfService,
            privacyPolicy: body.privacyPolicy !== undefined ? String(body.privacyPolicy).trim() : current.privacyPolicy,
            aboutUs: body.aboutUs !== undefined ? String(body.aboutUs).trim() : current.aboutUs,
        });

        const now = nowIso();
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [CMS_CONTENT_KEY, JSON.stringify(next), now, adminId],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (id, actor_uid, action, target_type, target_id, details, ip_address, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                adminId,
                'cms.update',
                'settings',
                CMS_CONTENT_KEY,
                JSON.stringify({ keys: Object.keys(body || {}) }),
                request.ip,
                now,
            ],
        });

        return { data: { updated: true } };
    });

    fastify.get('/api/admin/games', async () => {
        const db = getDb();
        const res = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [GAME_CONFIGS_KEY],
        });
        return { data: normalizeGameConfigs(res.rows[0]?.value) };
    });

    fastify.put('/api/admin/games/:id', async (request) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        if (id !== 'spin_wheel' && id !== 'lucky_box') {
            throw new BadRequestError('Invalid game config id');
        }
        const patch = (request.body || {}) as Partial<GameConfig>;
        const currentRes = await db.execute({
            sql: 'SELECT value FROM settings WHERE key = ?',
            args: [GAME_CONFIGS_KEY],
        });
        const games = normalizeGameConfigs(currentRes.rows[0]?.value);
        const idx = games.findIndex((g) => g.id === id);
        if (idx === -1) throw new NotFoundError('Game config not found');

        const next: GameConfig = {
            ...games[idx],
            enabled: patch.enabled !== undefined ? Boolean(patch.enabled) : games[idx].enabled,
            dailyLimit: patch.dailyLimit !== undefined ? Math.max(0, Number(patch.dailyLimit) || 0) : games[idx].dailyLimit,
            cooldownMinutes: patch.cooldownMinutes !== undefined ? Math.max(0, Number(patch.cooldownMinutes) || 0) : games[idx].cooldownMinutes,
            prizes: Array.isArray(patch.prizes)
                ? patch.prizes.map((p, pIdx) => ({
                    id: String(p.id || `${id}_${pIdx}`),
                    label: String(p.label || `Prize ${pIdx + 1}`),
                    value: Number(p.value || 0),
                    probability: Math.max(0, Number(p.probability || 0)),
                    color: p.color ? String(p.color) : undefined,
                }))
                : games[idx].prizes,
            updatedAt: nowIso(),
            updatedBy: adminId,
        };
        if (next.prizes.length < 2) throw new BadRequestError('At least 2 prizes are required');
        const totalProbability = next.prizes.reduce((sum, p) => sum + Number(p.probability || 0), 0);
        if (Math.abs(totalProbability - 100) > 0.01) {
            throw new BadRequestError('Prize probabilities must sum to 100');
        }
        games[idx] = next;
        const now = nowIso();
        await db.execute({
            sql: `INSERT INTO settings (key, value, updated_at, updated_by)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(key) DO UPDATE SET
                    value = excluded.value,
                    updated_at = excluded.updated_at,
                    updated_by = excluded.updated_by`,
            args: [GAME_CONFIGS_KEY, JSON.stringify(games), now, adminId],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (id, actor_uid, action, target_type, target_id, details, ip_address, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), adminId, 'game_config.update', 'game_config', id, JSON.stringify({ enabled: next.enabled }), request.ip, now],
        });
        return { data: { updated: true, config: next } };
    });

    fastify.get('/api/admin/vendors', async (request) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const page = Math.max(1, Number.parseInt(query.page || '1', 10));
        const limit = Math.min(100, Math.max(1, Number.parseInt(query.limit || '20', 10)));
        const offset = (page - 1) * limit;
        const status = String(query.status || '').trim().toLowerCase();

        const result = await db.execute({
            sql: `SELECT
                    u.uid, u.name, u.email, u.phone, u.city, u.is_banned, u.vendor_config, u.created_at,
                    COALESCE(p.product_count, 0) as product_count
                  FROM users u
                  LEFT JOIN (
                    SELECT vendor, COUNT(*) as product_count
                    FROM products
                    GROUP BY vendor
                  ) p ON p.vendor = u.uid
                  WHERE u.role = 'vendor'
                  ORDER BY u.created_at DESC, u.uid DESC`,
            args: [],
        });

        const rows = (result.rows as Array<Record<string, any>>)
            .map((row) => {
                const cfg = parseVendorConfig(row.vendor_config);
                const derivedStatus = vendorStatusFromRow(row);
                return {
                    id: String(row.uid),
                    businessName: String(cfg.businessName || row.name || 'Vendor'),
                    ownerName: String(row.name || ''),
                    email: String(row.email || ''),
                    phone: row.phone ? String(row.phone) : undefined,
                    city: row.city ? String(row.city) : undefined,
                    status: derivedStatus,
                    productCount: Number(row.product_count || 0),
                    createdAt: String(row.created_at || ''),
                };
            })
            .filter((row) => !status || row.status === status);

        const filteredTotal = rows.length;
        const pageRows = rows.slice(offset, offset + limit);
        return paginatedResponse(pageRows, filteredTotal, page, limit);
    });

    fastify.post('/api/admin/vendors/:id/verify', async (request) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as { note?: string };
        const res = await db.execute({
            sql: 'SELECT uid, role, vendor_config FROM users WHERE uid = ?',
            args: [id],
        });
        const row = res.rows[0] as Record<string, any> | undefined;
        if (!row) throw new NotFoundError('Vendor not found');
        if (String(row.role) !== 'vendor') throw new BadRequestError('User is not a vendor');
        const cfg = parseVendorConfig(row.vendor_config);
        const now = nowIso();
        const nextCfg = {
            ...cfg,
            status: 'verified',
            verifiedAt: now,
            verifiedBy: adminId,
            verificationNote: body.note ? String(body.note).trim().slice(0, 500) : (cfg.verificationNote || ''),
        };
        await db.execute({
            sql: `UPDATE users
                  SET is_banned = 0, is_active = 1, vendor_config = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [JSON.stringify(nextCfg), now, id],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (id, actor_uid, action, target_type, target_id, details, ip_address, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), adminId, 'vendor.verify', 'user', id, JSON.stringify({ note: body.note || null }), request.ip, now],
        });
        return { data: { updated: true, status: 'verified' } };
    });

    fastify.post('/api/admin/vendors/:id/suspend', async (request) => {
        const db = getDb();
        const adminId = request.user!.uid;
        const { id } = request.params as { id: string };
        const body = (request.body || {}) as { reason?: string };
        const reason = String(body.reason || '').trim();
        if (!reason) throw new BadRequestError('reason is required');

        const res = await db.execute({
            sql: 'SELECT uid, role, vendor_config FROM users WHERE uid = ?',
            args: [id],
        });
        const row = res.rows[0] as Record<string, any> | undefined;
        if (!row) throw new NotFoundError('Vendor not found');
        if (String(row.role) !== 'vendor') throw new BadRequestError('User is not a vendor');
        const cfg = parseVendorConfig(row.vendor_config);
        const now = nowIso();
        const nextCfg = {
            ...cfg,
            status: 'suspended',
            suspendedAt: now,
            suspendedBy: adminId,
            suspensionReason: reason.slice(0, 500),
        };

        await db.execute({
            sql: `UPDATE users
                  SET is_banned = 1, vendor_config = ?, updated_at = ?
                  WHERE uid = ?`,
            args: [JSON.stringify(nextCfg), now, id],
        });
        await db.execute({
            sql: `UPDATE products
                  SET in_stock = 0,
                      status = CASE WHEN status IS NULL OR status = '' THEN 'suspended' ELSE 'suspended' END,
                      moderation_reason = ?,
                      moderated_at = ?,
                      moderated_by = ?,
                      updated_at = ?
                  WHERE vendor = ?`,
            args: [reason.slice(0, 500), now, adminId, now, id],
        });
        await db.execute({
            sql: `INSERT INTO audit_logs (id, actor_uid, action, target_type, target_id, details, ip_address, created_at)
                  VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [randomUUID(), adminId, 'vendor.suspend', 'user', id, JSON.stringify({ reason }), request.ip, now],
        });
        return { data: { updated: true, status: 'suspended' } };
    });
}
