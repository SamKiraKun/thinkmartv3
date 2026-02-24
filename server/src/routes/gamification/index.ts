import type { FastifyInstance } from 'fastify';
import { randomUUID } from 'crypto';
import { getDb } from '../../db/client.js';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, TooManyRequestsError } from '../../utils/errors.js';
import { runIdempotentMutation } from '../../utils/idempotency.js';

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

type CooldownState = {
    last_executed_at?: string | null;
    available_at?: string | null;
    state_json?: string | null;
};

type ActionState = {
    day?: string;
    count?: number;
    pityLossStreak?: number;
    streak?: number;
    lastCheckinDate?: string;
    lastReward?: number;
    lastClaimedAt?: string;
};

const DAILY_CHECKIN_KEY = 'daily_checkin';
const SPIN_KEY = 'spin_wheel';
const LUCKY_BOX_KEY = 'lucky_box';
const GAME_CONFIGS_KEY = 'game_configs';

const DEFAULT_GAME_CONFIGS: GameConfig[] = [
    {
        id: 'spin_wheel',
        type: 'spin_wheel',
        name: 'Daily Spin Wheel',
        enabled: true,
        dailyLimit: 1,
        cooldownMinutes: 24 * 60,
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
        cooldownMinutes: 24 * 60,
        prizes: [
            { id: 'box_25', label: '25 Coins', value: 25, probability: 35 },
            { id: 'box_50', label: '50 Coins', value: 50, probability: 30 },
            { id: 'box_100', label: '100 Coins', value: 100, probability: 20 },
            { id: 'box_250', label: '250 Coins', value: 250, probability: 10 },
            { id: 'box_500', label: '500 Coins', value: 500, probability: 5 },
        ],
    },
];

function parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function nowIso(): string {
    return new Date().toISOString();
}

function todayKey(date = new Date()): string {
    return date.toISOString().slice(0, 10);
}

function yesterdayKey(date = new Date()): string {
    const d = new Date(date);
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
}

function secondsRemainingUntil(iso?: string | null): number {
    if (!iso) return 0;
    const ms = Date.parse(String(iso)) - Date.now();
    if (!Number.isFinite(ms) || ms <= 0) return 0;
    return Math.ceil(ms / 1000);
}

function addMinutesIso(minutes: number): string {
    return new Date(Date.now() + Math.max(0, minutes) * 60_000).toISOString();
}

function addHoursIso(hours: number): string {
    return new Date(Date.now() + Math.max(0, hours) * 3_600_000).toISOString();
}

async function getCooldownRow(userId: string, actionKey: string, tx?: { execute: Function }): Promise<CooldownState | null> {
    const db = (tx || getDb()) as any;
    const res = await db.execute({
        sql: `SELECT last_executed_at, available_at, state_json
              FROM user_action_cooldowns
              WHERE user_id = ? AND action_key = ?`,
        args: [userId, actionKey],
    });
    if (!res.rows?.length) return null;
    return res.rows[0] as CooldownState;
}

async function upsertCooldownRow(
    tx: { execute: Function },
    userId: string,
    actionKey: string,
    input: { lastExecutedAt?: string | null; availableAt?: string | null; state: ActionState }
) {
    const updatedAt = nowIso();
    await tx.execute({
        sql: `INSERT INTO user_action_cooldowns (
                user_id, action_key, last_executed_at, available_at, state_json, updated_at
              ) VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(user_id, action_key) DO UPDATE SET
                last_executed_at = excluded.last_executed_at,
                available_at = excluded.available_at,
                state_json = excluded.state_json,
                updated_at = excluded.updated_at`,
        args: [
            userId,
            actionKey,
            input.lastExecutedAt ?? null,
            input.availableAt ?? null,
            JSON.stringify(input.state || {}),
            updatedAt,
        ],
    });
}

async function ensureCoinWalletAndCredit(
    tx: { execute: Function },
    userId: string,
    amount: number,
    description: string,
    taskType: string,
    taskId: string
) {
    if (amount <= 0) return;
    const now = nowIso();
    await tx.execute({
        sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, updated_at)
              VALUES (?, ?, 0, ?)
              ON CONFLICT(user_id) DO UPDATE SET
                coin_balance = coin_balance + ?,
                updated_at = ?`,
        args: [userId, amount, now, amount, now],
    });
    await tx.execute({
        sql: `INSERT INTO transactions (
                id, user_id, type, amount, currency, status, description, task_id, task_type, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            randomUUID(),
            userId,
            'TASK_REWARD',
            amount,
            'COIN',
            'COMPLETED',
            description,
            taskId,
            taskType,
            now,
        ],
    });
}

function normalizeGameConfigs(raw: unknown): GameConfig[] {
    const parsed = parseJson<unknown>(raw, []);
    const source = Array.isArray(parsed)
        ? parsed
        : Array.isArray((parsed as any)?.games)
            ? (parsed as any).games
            : [];
    const byId = new Map(DEFAULT_GAME_CONFIGS.map((cfg) => [cfg.id, cfg]));
    const normalized: GameConfig[] = [];

    for (const key of ['spin_wheel', 'lucky_box'] as const) {
        const base = byId.get(key)!;
        const found = (source as any[]).find((g) => String(g?.id || g?.type) === key) || {};
        const prizesSource = Array.isArray(found.prizes) ? found.prizes : base.prizes;
        const prizes: GamePrize[] = prizesSource
            .map((p: any, idx: number) => ({
                id: String(p?.id || `${key}_${idx}`),
                label: String(p?.label || `Prize ${idx + 1}`),
                value: Number(p?.value || 0),
                probability: Number(p?.probability ?? 0),
                color: p?.color ? String(p.color) : undefined,
            }))
            .filter((p: GamePrize) => Number.isFinite(p.value) && Number.isFinite(p.probability));

        normalized.push({
            id: key,
            type: key,
            name: String(found.name || base.name),
            enabled: found.enabled === undefined ? base.enabled : Boolean(found.enabled),
            dailyLimit: Math.max(0, Number(found.dailyLimit ?? base.dailyLimit) || base.dailyLimit),
            cooldownMinutes: Math.max(0, Number(found.cooldownMinutes ?? base.cooldownMinutes) || base.cooldownMinutes),
            prizes: prizes.length > 0 ? prizes : base.prizes,
            updatedAt: found.updatedAt ? String(found.updatedAt) : undefined,
            updatedBy: found.updatedBy ? String(found.updatedBy) : undefined,
        });
    }

    return normalized;
}

async function readGameConfigs(tx?: { execute: Function }): Promise<GameConfig[]> {
    const db = (tx || getDb()) as any;
    const res = await db.execute({
        sql: 'SELECT value FROM settings WHERE key = ?',
        args: [GAME_CONFIGS_KEY],
    });
    return normalizeGameConfigs(res.rows?.[0]?.value);
}

function pickWeightedPrize(prizes: GamePrize[]): GamePrize {
    const eligible = prizes.filter((p) => Number(p.probability) > 0);
    const total = eligible.reduce((sum, p) => sum + Number(p.probability), 0);
    if (eligible.length === 0 || total <= 0) {
        throw new BadRequestError('Game prize configuration is invalid');
    }
    let cursor = Math.random() * total;
    for (const prize of eligible) {
        cursor -= Number(prize.probability);
        if (cursor <= 0) return prize;
    }
    return eligible[eligible.length - 1];
}

function formatPrizeForClient(prize: GamePrize) {
    return {
        label: prize.label,
        value: prize.value,
        odds: `${Number(prize.probability)}%`,
        color: prize.color || '',
    };
}

function toCooldownResponse(row: CooldownState | null) {
    return { secondsRemaining: secondsRemainingUntil(row?.available_at) };
}

export default async function gamificationRoutes(fastify: FastifyInstance) {
    fastify.get('/api/gamification/cooldowns', { preHandler: [requireAuth] }, async (request) => {
        const userId = request.user!.uid;
        const [daily, spin, lucky] = await Promise.all([
            getCooldownRow(userId, DAILY_CHECKIN_KEY),
            getCooldownRow(userId, SPIN_KEY),
            getCooldownRow(userId, LUCKY_BOX_KEY),
        ]);

        return {
            data: {
                tasks: toCooldownResponse(daily),
                spin: toCooldownResponse(spin),
                luckyBox: toCooldownResponse(lucky),
            },
        };
    });

    fastify.get('/api/gamification/daily-checkin/status', { preHandler: [requireAuth] }, async (request) => {
        const userId = request.user!.uid;
        const row = await getCooldownRow(userId, DAILY_CHECKIN_KEY);
        const state = parseJson<ActionState>(row?.state_json, {});
        const today = todayKey();
        const claimedToday = state.lastCheckinDate === today || secondsRemainingUntil(row?.available_at) > 0;
        const streak = Math.max(0, Number(state.streak || 0));
        const nextReward = 100 + (20 * Math.min(streak, 6));

        return {
            data: {
                streak,
                claimedToday,
                lastReward: Math.max(0, Number(state.lastReward || 0)),
                nextReward,
                cooldown: toCooldownResponse(row),
            },
        };
    });

    fastify.post('/api/gamification/daily-checkin', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        return runIdempotentMutation({
            request,
            reply,
            userId,
            handler: async (tx) => {
                const row = await getCooldownRow(userId, DAILY_CHECKIN_KEY, tx as any);
                const state = parseJson<ActionState>(row?.state_json, {});
                const today = todayKey();
                const yesterday = yesterdayKey();
                const cooldownSeconds = secondsRemainingUntil(row?.available_at);
                if (cooldownSeconds > 0) {
                    throw new TooManyRequestsError('Daily check-in is on cooldown');
                }
                if (state.lastCheckinDate === today) {
                    throw new BadRequestError('You already checked in today');
                }

                const previousStreak = Math.max(0, Number(state.streak || 0));
                const nextStreak = state.lastCheckinDate === yesterday ? previousStreak + 1 : 1;
                const reward = 100 + (20 * Math.min(Math.max(0, nextStreak - 1), 6));
                const now = nowIso();
                const availableAt = addHoursIso(24);

                await ensureCoinWalletAndCredit(
                    tx as any,
                    userId,
                    reward,
                    'Daily check-in reward',
                    'DAILY_CHECKIN',
                    DAILY_CHECKIN_KEY
                );
                await upsertCooldownRow(tx as any, userId, DAILY_CHECKIN_KEY, {
                    lastExecutedAt: now,
                    availableAt,
                    state: {
                        ...state,
                        streak: nextStreak,
                        lastCheckinDate: today,
                        lastReward: reward,
                        lastClaimedAt: now,
                    },
                });

                return {
                    statusCode: 200,
                    payload: {
                        data: {
                            reward,
                            streak: nextStreak,
                            cooldown: { secondsRemaining: secondsRemainingUntil(availableAt) },
                        },
                    },
                };
            },
        });
    });

    fastify.post('/api/gamification/spin-wheel', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        return runIdempotentMutation({
            request,
            reply,
            userId,
            handler: async (tx) => {
                const configs = await readGameConfigs(tx as any);
                const cfg = configs.find((c) => c.id === 'spin_wheel');
                if (!cfg || !cfg.enabled) throw new BadRequestError('Spin Wheel is currently unavailable');

                const row = await getCooldownRow(userId, SPIN_KEY, tx as any);
                const state = parseJson<ActionState>(row?.state_json, {});
                const currentDay = todayKey();
                const countToday = state.day === currentDay ? Math.max(0, Number(state.count || 0)) : 0;
                const cooldownSeconds = secondsRemainingUntil(row?.available_at);

                if (cfg.dailyLimit > 0 && countToday >= cfg.dailyLimit) {
                    throw new TooManyRequestsError('Daily spin limit reached');
                }
                if (cooldownSeconds > 0) {
                    throw new TooManyRequestsError('Spin is on cooldown');
                }

                const pityLossStreak = Math.max(0, Number(state.pityLossStreak || 0));
                const winPrizes = cfg.prizes.filter((p) => Number(p.value) > 0);
                const pityTriggered = pityLossStreak >= 2 && winPrizes.length > 0;
                const selected = pityTriggered ? pickWeightedPrize(winPrizes) : pickWeightedPrize(cfg.prizes);
                const now = nowIso();
                const availableAt = addMinutesIso(cfg.cooldownMinutes);
                const nextPityLoss = Number(selected.value) > 0 ? 0 : pityLossStreak + 1;

                await ensureCoinWalletAndCredit(
                    tx as any,
                    userId,
                    Math.max(0, Number(selected.value || 0)),
                    `Spin wheel reward: ${selected.label}`,
                    'SPIN',
                    SPIN_KEY
                );
                await upsertCooldownRow(tx as any, userId, SPIN_KEY, {
                    lastExecutedAt: now,
                    availableAt,
                    state: {
                        day: currentDay,
                        count: countToday + 1,
                        pityLossStreak: nextPityLoss,
                    },
                });

                return {
                    payload: {
                        data: {
                            prize: formatPrizeForClient(selected),
                            pityTriggered,
                            cooldown: { secondsRemaining: secondsRemainingUntil(availableAt) },
                        },
                    },
                };
            },
        });
    });

    fastify.post('/api/gamification/lucky-box', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        return runIdempotentMutation({
            request,
            reply,
            userId,
            handler: async (tx) => {
                const configs = await readGameConfigs(tx as any);
                const cfg = configs.find((c) => c.id === 'lucky_box');
                if (!cfg || !cfg.enabled) throw new BadRequestError('Lucky Box is currently unavailable');

                const row = await getCooldownRow(userId, LUCKY_BOX_KEY, tx as any);
                const state = parseJson<ActionState>(row?.state_json, {});
                const currentDay = todayKey();
                const countToday = state.day === currentDay ? Math.max(0, Number(state.count || 0)) : 0;
                const cooldownSeconds = secondsRemainingUntil(row?.available_at);

                if (cfg.dailyLimit > 0 && countToday >= cfg.dailyLimit) {
                    throw new TooManyRequestsError('Daily Lucky Box limit reached');
                }
                if (cooldownSeconds > 0) {
                    throw new TooManyRequestsError('Lucky Box is on cooldown');
                }

                const selected = pickWeightedPrize(cfg.prizes);
                const now = nowIso();
                const availableAt = addMinutesIso(cfg.cooldownMinutes);
                await ensureCoinWalletAndCredit(
                    tx as any,
                    userId,
                    Math.max(0, Number(selected.value || 0)),
                    `Lucky box reward: ${selected.label}`,
                    'LUCKY_BOX',
                    LUCKY_BOX_KEY
                );
                await upsertCooldownRow(tx as any, userId, LUCKY_BOX_KEY, {
                    lastExecutedAt: now,
                    availableAt,
                    state: {
                        day: currentDay,
                        count: countToday + 1,
                    },
                });

                return {
                    payload: {
                        data: {
                            reward: Math.max(0, Number(selected.value || 0)),
                            cooldown: { secondsRemaining: secondsRemainingUntil(availableAt) },
                        },
                    },
                };
            },
        });
    });
}
