// File: server/src/routes/tasks/writes.ts
/**
 * Task Completion Write Routes
 *
 * POST /api/tasks/:id/start
 * POST /api/tasks/:id/complete
 * POST /api/tasks/:id/reward
 * POST /api/tasks/:id/survey-submit
 */

import { FastifyInstance } from 'fastify';
import { getDb, withTransaction } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../../middleware/auth.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../utils/errors.js';

const SESSION_REQUIRED_TYPES = new Set(['SURVEY', 'VIDEO', 'WATCH_VIDEO']);

type SqlExecutor = {
    execute: (arg: string | { sql: string; args?: any[] }) => Promise<any>;
};

type TaskRow = Record<string, any>;
type TaskIntegrity = {
    activeSeconds: number;
    backgroundSeconds: number;
    contentOpened: boolean;
    answerCount?: number;
    questionCount?: number;
    client?: string;
};

function parseNonNegativeInt(value: unknown): number | null {
    if (value == null) return null;
    if (typeof value === 'number') {
        if (!Number.isFinite(value) || value < 0) {
            throw new BadRequestError('integrity fields must be non-negative numbers');
        }
        return Math.floor(value);
    }
    if (typeof value === 'string' && value.trim().length > 0) {
        const parsed = Number(value);
        if (!Number.isFinite(parsed) || parsed < 0) {
            throw new BadRequestError('integrity fields must be non-negative numbers');
        }
        return Math.floor(parsed);
    }
    throw new BadRequestError('integrity fields must be non-negative numbers');
}

function parseBoolean(value: unknown, fallback = false): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value === 'string') {
        const normalized = value.trim().toLowerCase();
        if (normalized === 'true') return true;
        if (normalized === 'false') return false;
    }
    return fallback;
}

function normalizeIntegrity(raw: unknown): TaskIntegrity | undefined {
    if (raw == null) return undefined;
    if (typeof raw !== 'object' || Array.isArray(raw)) {
        throw new BadRequestError('integrity must be an object');
    }

    const input = raw as Record<string, unknown>;
    const activeSeconds = parseNonNegativeInt(input.activeSeconds) ?? 0;
    const backgroundSeconds = parseNonNegativeInt(input.backgroundSeconds) ?? 0;
    const answerCount = parseNonNegativeInt(input.answerCount);
    const questionCount = parseNonNegativeInt(input.questionCount);
    const client = typeof input.client === 'string' ? input.client.trim().slice(0, 64) : undefined;

    return {
        activeSeconds,
        backgroundSeconds,
        contentOpened: parseBoolean(input.contentOpened, false),
        ...(answerCount != null ? { answerCount } : {}),
        ...(questionCount != null ? { questionCount } : {}),
        ...(client ? { client } : {}),
    };
}

function getSurveyQuestionCount(task: TaskRow): number {
    const raw = task.questions;
    if (Array.isArray(raw)) {
        return raw.length;
    }
    if (typeof raw === 'string') {
        try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? parsed.length : 0;
        } catch {
            return 0;
        }
    }
    return 0;
}

async function ensureTaskSessionTable(executor: SqlExecutor) {
    await executor.execute({
        sql: `CREATE TABLE IF NOT EXISTS task_sessions (
                id TEXT PRIMARY KEY,
                user_id TEXT NOT NULL,
                task_id TEXT NOT NULL,
                status TEXT NOT NULL,
                started_at TEXT NOT NULL,
                completed_at TEXT,
                payload TEXT
              )`,
        args: [],
    });
}

async function loadActiveTask(tx: SqlExecutor, taskId: string): Promise<TaskRow> {
    const taskResult = await tx.execute({
        sql: 'SELECT * FROM tasks WHERE id = ? AND is_active = 1',
        args: [taskId],
    });

    if (taskResult.rows.length === 0) {
        throw new NotFoundError('Task not found or inactive');
    }

    return taskResult.rows[0] as TaskRow;
}

async function assertCompletionFrequency(
    tx: SqlExecutor,
    userId: string,
    taskId: string,
    taskFrequency: string,
    maxPerDay: number
) {
    if (taskFrequency === 'ONCE') {
        const existing = await tx.execute({
            sql: 'SELECT id FROM user_task_completions WHERE user_id = ? AND task_id = ?',
            args: [userId, taskId],
        });
        if (existing.rows.length > 0) {
            throw new ConflictError('Task can only be completed once');
        }
        return;
    }

    if (taskFrequency === 'DAILY') {
        const today = new Date().toISOString().split('T')[0];
        const existing = await tx.execute({
            sql: `SELECT id FROM user_task_completions
                  WHERE user_id = ? AND task_id = ? AND completed_at >= ?`,
            args: [userId, taskId, today],
        });
        if ((maxPerDay > 0 && existing.rows.length >= maxPerDay) || (maxPerDay <= 0 && existing.rows.length > 0)) {
            throw new ConflictError('Task already completed today');
        }
    }
}

async function validateAndFinalizeSession(params: {
    tx: SqlExecutor;
    userId: string;
    task: TaskRow;
    taskId: string;
    sessionId?: string;
    nextStatus: string;
    answers?: Record<string, unknown>;
    integrity?: TaskIntegrity;
}) {
    const { tx, userId, task, taskId, sessionId, nextStatus, answers, integrity } = params;
    const taskType = String(task.type || '').toUpperCase();
    const requiresSession = SESSION_REQUIRED_TYPES.has(taskType);
    if (requiresSession && (!sessionId || !sessionId.trim())) {
        throw new BadRequestError('Session is required for this task type');
    }
    if (!sessionId || !sessionId.trim()) {
        return;
    }

    const sessionResult = await tx.execute({
        sql: `SELECT id, task_id, status, started_at
              FROM task_sessions
              WHERE id = ? AND user_id = ?`,
        args: [sessionId, userId],
    });
    if (sessionResult.rows.length === 0) {
        throw new ConflictError('Invalid task session');
    }

    const session = sessionResult.rows[0] as Record<string, any>;
    if (String(session.task_id || '') !== taskId) {
        throw new ConflictError('Session does not match task');
    }

    const status = String(session.status || '').toLowerCase();
    if (['completed', 'rewarded', 'survey_submitted'].includes(status)) {
        throw new ConflictError('Task session already completed');
    }

    const minDuration = Number(task.min_duration || 0);
    if (minDuration > 0) {
        const startedAtMs = Date.parse(String(session.started_at || ''));
        if (!Number.isFinite(startedAtMs)) {
            throw new ConflictError('Invalid task session start time');
        }
        const elapsedSeconds = Math.floor((Date.now() - startedAtMs) / 1000);
        if (elapsedSeconds < minDuration) {
            throw new ConflictError(`Task requires at least ${minDuration}s before completion`);
        }
    }

    if (integrity) {
        if (minDuration > 0 && integrity.activeSeconds + 1 < minDuration) {
            throw new ConflictError(`Task requires at least ${minDuration}s of active time`);
        }

        if (taskType === 'VIDEO' || taskType === 'WATCH_VIDEO') {
            if (!integrity.contentOpened) {
                throw new ConflictError('Open video content before claiming reward');
            }
            if (integrity.backgroundSeconds > 120) {
                throw new ConflictError('Task invalidated due to long background time');
            }
        }

        if (taskType === 'SURVEY') {
            if (integrity.backgroundSeconds > 180) {
                throw new ConflictError('Task invalidated due to long background time');
            }
            const requiredQuestions = getSurveyQuestionCount(task);
            const answerCount =
                integrity.answerCount ??
                (answers ? Object.keys(answers).filter((key) => answers[key] != null).length : 0);
            if (requiredQuestions > 0 && answerCount < requiredQuestions) {
                throw new BadRequestError('Please answer all survey questions before submission');
            }
        }
    }

    const payloadObject: Record<string, unknown> = {};
    if (answers) payloadObject.answers = answers;
    if (integrity) payloadObject.integrity = integrity;
    const payload = Object.keys(payloadObject).length > 0 ? JSON.stringify(payloadObject) : null;

    await tx.execute({
        sql: `UPDATE task_sessions
              SET status = ?, completed_at = ?, payload = COALESCE(?, payload)
              WHERE id = ? AND user_id = ?`,
        args: [
            nextStatus,
            new Date().toISOString(),
            payload,
            sessionId,
            userId,
        ],
    });
}

async function rewardTaskCompletion(params: {
    tx: SqlExecutor;
    userId: string;
    taskId: string;
    task: TaskRow;
}) {
    const { tx, userId, taskId, task } = params;
    const completionId = randomUUID();
    const now = new Date().toISOString();
    const taskReward = Number(task.reward) || 0;
    const taskRewardType = String(task.reward_type || 'COIN').toUpperCase() === 'CASH' ? 'CASH' : 'COIN';

    await tx.execute({
        sql: `INSERT INTO user_task_completions (id, user_id, task_id, reward, completed_at)
              VALUES (?, ?, ?, ?, ?)`,
        args: [completionId, userId, taskId, taskReward, now],
    });

    if (taskReward > 0) {
        const coinDelta = taskRewardType === 'COIN' ? taskReward : 0;
        const cashDelta = taskRewardType === 'CASH' ? taskReward : 0;

        await tx.execute({
            sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, updated_at)
                  VALUES (?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                    coin_balance = coin_balance + ?,
                    cash_balance = cash_balance + ?,
                    updated_at = ?`,
            args: [userId, coinDelta, cashDelta, now, coinDelta, cashDelta, now],
        });

        await tx.execute({
            sql: `INSERT INTO transactions (
                    id, user_id, type, amount, currency, status, description,
                    task_id, task_type, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                userId,
                'TASK_REWARD',
                taskReward,
                taskRewardType,
                'COMPLETED',
                `Task reward: ${String(task.title || taskId)}`,
                taskId,
                String(task.type || ''),
                now,
            ],
        });
    }

    return {
        id: completionId,
        taskId,
        reward: taskReward,
        rewardType: taskRewardType,
        completedAt: now,
    };
}

export default async function taskWriteRoutes(fastify: FastifyInstance) {
    const completeTaskAndReward = async (params: {
        userId: string;
        taskId: string;
        sessionId?: string;
        nextSessionStatus: string;
        answers?: Record<string, unknown>;
        integrity?: TaskIntegrity;
        onlySurvey?: boolean;
    }) => {
        const { userId, taskId, sessionId, nextSessionStatus, answers, integrity, onlySurvey } = params;
        return withTransaction(async (tx) => {
            const task = await loadActiveTask(tx as unknown as SqlExecutor, taskId);
            const taskType = String(task.type || '').toUpperCase();
            if (onlySurvey && taskType !== 'SURVEY') {
                throw new BadRequestError('This endpoint can only be used for survey tasks');
            }

            const taskFrequency = String(task.frequency || '').toUpperCase();
            const maxPerDay = Number(task.max_completions_per_day) || 0;
            await assertCompletionFrequency(
                tx as unknown as SqlExecutor,
                userId,
                taskId,
                taskFrequency,
                maxPerDay
            );

            await validateAndFinalizeSession({
                tx: tx as unknown as SqlExecutor,
                userId,
                task,
                taskId,
                sessionId,
                nextStatus: nextSessionStatus,
                answers,
                integrity,
            });

            return rewardTaskCompletion({
                tx: tx as unknown as SqlExecutor,
                userId,
                taskId,
                task,
            });
        });
    };

    fastify.post('/api/tasks/:id/complete', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const body = request.body as { sessionId?: string; integrity?: unknown };
        const data = await completeTaskAndReward({
            userId,
            taskId,
            sessionId: body?.sessionId,
            integrity: normalizeIntegrity(body?.integrity),
            nextSessionStatus: 'completed',
        });

        return reply.status(201).send({ data });
    });

    fastify.post('/api/tasks/:id/start', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const db = getDb();
        await ensureTaskSessionTable(db as unknown as SqlExecutor);
        const task = await loadActiveTask(db as unknown as SqlExecutor, taskId);
        const taskFrequency = String(task.frequency || '').toUpperCase();
        const maxPerDay = Number(task.max_completions_per_day) || 0;
        await assertCompletionFrequency(
            db as unknown as SqlExecutor,
            userId,
            taskId,
            taskFrequency,
            maxPerDay
        );

        const existingSession = await db.execute({
            sql: `SELECT id, started_at
                  FROM task_sessions
                  WHERE user_id = ? AND task_id = ? AND status IN ('started', 'in_progress')
                  ORDER BY started_at DESC
                  LIMIT 1`,
            args: [userId, taskId],
        });
        if (existingSession.rows.length > 0) {
            const current = existingSession.rows[0] as Record<string, any>;
            return reply.status(200).send({
                data: {
                    sessionId: String(current.id),
                    taskId,
                    startedAt: String(current.started_at || new Date().toISOString()),
                    reused: true,
                },
            });
        }

        const sessionId = randomUUID();
        const now = new Date().toISOString();
        await db.execute({
            sql: `INSERT INTO task_sessions (id, user_id, task_id, status, started_at)
                  VALUES (?, ?, ?, 'started', ?)`,
            args: [sessionId, userId, taskId, now],
        });

        return reply.status(201).send({
            data: {
                sessionId,
                taskId,
                startedAt: now,
                minDuration: Number(task.min_duration || 0),
            },
        });
    });

    fastify.post('/api/tasks/:id/reward', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const body = request.body as { sessionId?: string; integrity?: unknown };
        const data = await completeTaskAndReward({
            userId,
            taskId,
            sessionId: body?.sessionId,
            integrity: normalizeIntegrity(body?.integrity),
            nextSessionStatus: 'completed',
        });
        return reply.status(201).send({ data });
    });

    fastify.post('/api/tasks/:id/survey-submit', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const body = request.body as { sessionId?: string; answers?: Record<string, unknown>; integrity?: unknown };
        if (body.answers != null && typeof body.answers !== 'object') {
            throw new BadRequestError('answers must be an object');
        }

        const data = await completeTaskAndReward({
            userId,
            taskId,
            sessionId: body?.sessionId,
            nextSessionStatus: 'survey_submitted',
            answers: body.answers || {},
            integrity: normalizeIntegrity(body?.integrity),
            onlySurvey: true,
        });

        return reply.status(201).send({ data });
    });
}
