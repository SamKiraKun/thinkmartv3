// File: server/src/routes/tasks/writes.ts
/**
 * Task Completion Write Route (Wave 1 Writes)
 * 
 * POST /api/tasks/:id/complete  - Submit task completion
 */

import { FastifyInstance } from 'fastify';
import { withTransaction } from '../../db/client.js';
import { randomUUID } from 'crypto';
import { requireAuth } from '../../middleware/auth.js';
import { ConflictError, NotFoundError } from '../../utils/errors.js';

export default async function taskWriteRoutes(fastify: FastifyInstance) {

    // ─── Complete a Task ──────────────────────────────────────────
    fastify.post('/api/tasks/:id/complete', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const data = await withTransaction(async (tx) => {
            const taskResult = await tx.execute({
                sql: 'SELECT * FROM tasks WHERE id = ? AND is_active = 1',
                args: [taskId],
            });

            if (taskResult.rows.length === 0) {
                throw new NotFoundError('Task not found or inactive');
            }

            const task = taskResult.rows[0];
            const taskFrequency = String(task.frequency || '').toUpperCase();
            const taskReward = Number(task.reward) || 0;
            const taskRewardType = String(task.reward_type || 'COIN').toUpperCase() === 'CASH' ? 'CASH' : 'COIN';
            const maxPerDay = Number(task.max_completions_per_day) || 0;

            if (taskFrequency === 'ONCE') {
                const existing = await tx.execute({
                    sql: 'SELECT id FROM user_task_completions WHERE user_id = ? AND task_id = ?',
                    args: [userId, taskId],
                });
                if (existing.rows.length > 0) {
                    throw new ConflictError('Task can only be completed once');
                }
            } else if (taskFrequency === 'DAILY') {
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

            const completionId = randomUUID();
            const now = new Date().toISOString();

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
        });

        return reply.status(201).send({ data });
    });

    // ─── Start a Task ─────────────────────────────────────────────
    // Creates a task_session and returns a sessionId for the client to
    // track the task. The client calls /reward when complete.
    fastify.post('/api/tasks/:id/start', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const db = (await import('../../db/client.js')).getDb();

        const taskResult = await db.execute({
            sql: 'SELECT * FROM tasks WHERE id = ? AND is_active = 1',
            args: [taskId],
        });
        if (taskResult.rows.length === 0) {
            return reply.status(404).send({ error: { code: 'NOT_FOUND', message: 'Task not found or inactive' } });
        }

        const { randomUUID } = await import('crypto');
        const sessionId = randomUUID();
        const now = new Date().toISOString();

        try {
            await db.execute({
                sql: `INSERT INTO task_sessions (id, user_id, task_id, status, started_at) VALUES (?, ?, ?, 'started', ?)`,
                args: [sessionId, userId, taskId, now],
            });
        } catch {
            // task_sessions table may not exist yet — create it on the fly
            await db.execute({
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
            await db.execute({
                sql: `INSERT INTO task_sessions (id, user_id, task_id, status, started_at) VALUES (?, ?, ?, 'started', ?)`,
                args: [sessionId, userId, taskId, now],
            });
        }

        return reply.status(201).send({ data: { sessionId, taskId, startedAt: now } });
    });

    // ─── Reward a Task (two-step) ─────────────────────────────────
    fastify.post('/api/tasks/:id/reward', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const body = request.body as { sessionId?: string };

        // Delegate to the complete handler logic
        const db = (await import('../../db/client.js')).getDb();

        if (body.sessionId) {
            await db.execute({
                sql: `UPDATE task_sessions SET status = 'completed', completed_at = ? WHERE id = ? AND user_id = ?`,
                args: [new Date().toISOString(), body.sessionId, userId],
            }).catch(() => { });
        }

        // Re-use complete route logic by forwarding internally
        request.params = { id: taskId } as any;
        const completionHandler = fastify.findRoute({
            method: 'POST',
            url: `/api/tasks/${taskId}/complete`,
        } as any);

        if (completionHandler) {
            return completionHandler;
        }

        // Fallback: inline minimal complete logic
        return reply.status(400).send({ error: { code: 'NOT_SUPPORTED', message: 'Use /api/tasks/:id/complete directly if /reward is unavailable.' } });
    });

    // ─── Survey Submit ────────────────────────────────────────────
    fastify.post('/api/tasks/:id/survey-submit', { preHandler: [requireAuth] }, async (request, reply) => {
        const userId = request.user!.uid;
        const { id: taskId } = request.params as { id: string };
        const body = request.body as { sessionId?: string; answers?: Record<string, unknown> };
        const db = (await import('../../db/client.js')).getDb();

        if (body.sessionId) {
            await db.execute({
                sql: `UPDATE task_sessions SET status = 'survey_submitted', payload = ?, completed_at = ? WHERE id = ? AND user_id = ?`,
                args: [JSON.stringify(body.answers || {}), new Date().toISOString(), body.sessionId, userId],
            }).catch(() => { });
        }

        // Award reward (same as complete)
        const data = await withTransaction(async (tx) => {
            const taskResult = await tx.execute({
                sql: 'SELECT * FROM tasks WHERE id = ? AND is_active = 1',
                args: [taskId],
            });
            if (taskResult.rows.length === 0) throw new NotFoundError('Task not found');

            const task = taskResult.rows[0];
            const { randomUUID } = await import('crypto');
            const completionId = randomUUID();
            const now = new Date().toISOString();
            const walletField = String(task.reward_type || 'COIN').toUpperCase() === 'CASH' ? 'cash_balance' : 'coin_balance';
            const rewardAmount = Number(task.reward) || 0;

            await tx.execute({
                sql: `INSERT INTO user_task_completions (id, user_id, task_id, completed_at, reward, reward_type)
                      VALUES (?, ?, ?, ?, ?, ?)`,
                args: [completionId, userId, taskId, now, rewardAmount, walletField === 'cash_balance' ? 'CASH' : 'COIN'],
            });

            await tx.execute({
                sql: `UPDATE wallets SET ${walletField} = ${walletField} + ? WHERE user_id = ?`,
                args: [rewardAmount, userId],
            });

            return { completionId, rewardAmount, rewardType: walletField === 'cash_balance' ? 'CASH' : 'COIN' };
        });

        return reply.status(201).send({ data });
    });
}

