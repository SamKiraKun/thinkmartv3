// File: server/src/routes/tasks/index.ts
/**
 * Task Routes (Read-only for Wave 1)
 * 
 * GET /api/tasks              - List active tasks
 * GET /api/tasks/:id          - Get single task
 * GET /api/tasks/completed    - User's completed tasks (authenticated)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';
import { paginatedResponse } from '../../utils/pagination.js';
import { requireAuth } from '../../middleware/auth.js';

export default async function taskRoutes(fastify: FastifyInstance) {
    const mapTaskRow = (row: Record<string, any>) => ({
        ...(row.config ? (() => {
            try {
                const cfg = JSON.parse(String(row.config));
                return {
                    config: cfg,
                    youtubeId: cfg?.youtubeId ?? undefined,
                    videoUrl: cfg?.videoUrl ?? undefined,
                    url: cfg?.url ?? undefined,
                };
            } catch {
                return { config: null };
            }
        })() : { config: null }),
        id: row.id,
        title: row.title,
        description: row.description,
        type: row.type,
        reward: row.reward,
        rewardType: row.reward_type,
        frequency: row.frequency,
        minDuration: row.min_duration,
        cooldownHours: row.cooldown_hours,
        maxCompletionsPerDay: row.max_completions_per_day,
        possibleRewards: row.possible_rewards ? JSON.parse(row.possible_rewards as string) : null,
        questions: row.questions ? JSON.parse(row.questions as string) : null,
        isActive: Boolean(row.is_active),
        isArchived: Boolean(row.is_archived ?? 0),
        createdAt: row.created_at,
        // Backward-compatible aliases for older frontend codepaths
        maxCompletions: row.max_completions_per_day,
        sortOrder: 0,
        startDate: null,
        endDate: null,
    });

    // ─── List Active Tasks ────────────────────────────────────────
    fastify.get('/api/tasks', async (request, reply) => {
        const db = getDb();
        const query = request.query as Record<string, string>;
        const type = query.type; // SURVEY, VIDEO, SPIN, etc.

        const conditions: string[] = ['is_active = 1', 'COALESCE(is_archived, 0) = 0'];
        const params: any[] = [];

        if (type) {
            conditions.push('type = ?');
            params.push(type);
        }

        const where = `WHERE ${conditions.join(' AND ')}`;

        const result = await db.execute({
            sql: `SELECT * FROM tasks ${where} ORDER BY created_at DESC`,
            args: params,
        });

        return {
            data: result.rows.map((row) => mapTaskRow(row as Record<string, any>)),
        };
    });

    // ─── Get Single Task ──────────────────────────────────────────
    fastify.get('/api/tasks/:id', async (request, reply) => {
        const db = getDb();
        const { id } = request.params as { id: string };

        const result = await db.execute({
            sql: 'SELECT * FROM tasks WHERE id = ?',
            args: [id],
        });

        if (result.rows.length === 0) {
            return reply.status(404).send({
                error: { code: 'NOT_FOUND', message: 'Task not found' },
            });
        }

        const row = result.rows[0];
        return {
            data: mapTaskRow(row as Record<string, any>),
        };
    });

    // ─── User's Completed Tasks ───────────────────────────────────
    fastify.get('/api/tasks/completed', { preHandler: [requireAuth] }, async (request, reply) => {
        const db = getDb();
        const userId = request.user!.uid;

        const query = request.query as Record<string, string>;
        const page = Math.max(1, parseInt(query.page || '1'));
        const limit = Math.min(50, Math.max(1, parseInt(query.limit || '20')));
        const offset = (page - 1) * limit;

        const countResult = await db.execute({
            sql: 'SELECT COUNT(*) as total FROM user_task_completions WHERE user_id = ?',
            args: [userId],
        });
        const total = Number(countResult.rows[0].total);

        const result = await db.execute({
            sql: `SELECT utc.*, t.title as task_title, t.type as task_type, t.reward as task_reward, t.reward_type
            FROM user_task_completions utc
            LEFT JOIN tasks t ON utc.task_id = t.id
            WHERE utc.user_id = ?
            ORDER BY utc.completed_at DESC
            LIMIT ? OFFSET ?`,
            args: [userId, limit, offset],
        });

        const completions = result.rows.map(row => ({
            id: row.id,
            taskId: row.task_id,
            taskTitle: row.task_title,
            taskType: row.task_type,
            reward: row.task_reward,
            rewardType: row.reward_type,
            rewardedAmount: row.reward,
            data: null,
            completedAt: row.completed_at,
        }));

        return paginatedResponse(completions, total, page, limit);
    });
}
