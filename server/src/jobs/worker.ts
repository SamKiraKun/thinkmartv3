import { Job, Worker } from 'bullmq';
import Redis from 'ioredis';
import { randomUUID } from 'crypto';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';
import { getDb, withTransaction } from '../db/client.js';

type JsonObject = Record<string, unknown>;

const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
}) as any;

logger.info('Initializing background workers...');

function asObject(value: unknown): JsonObject {
    return value && typeof value === 'object' && !Array.isArray(value)
        ? (value as JsonObject)
        : {};
}

function asString(value: unknown): string | null {
    return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function asNumber(value: unknown): number | null {
    const num = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(num) ? num : null;
}

async function insertSystemAuditLog(
    action: string,
    targetType: string,
    targetId: string,
    details: JsonObject
) {
    const db = getDb();
    await db.execute({
        sql: `INSERT INTO audit_logs (
                id, actor_uid, action, target_type, target_id, details, ip_address, created_at
              ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        args: [
            randomUUID(),
            'system',
            action,
            targetType,
            targetId,
            JSON.stringify(details),
            'worker',
            new Date().toISOString(),
        ],
    });
}

async function processNotificationJob(job: Job) {
    const payload = asObject(job.data);
    const channel = asString(payload.channel) || 'unknown';
    const userId = asString(payload.userId);
    const message = asString(payload.message);

    if (!message) {
        throw new Error('Notification job missing message');
    }

    // External providers (FCM/email/SMS) are not wired yet in this repo.
    // We still validate, log, and audit every notification dispatch attempt.
    logger.info(
        { jobId: job.id, channel, userId, messagePreview: message.slice(0, 80) },
        'Processed notification job'
    );

    await insertSystemAuditLog('job.notification.dispatch', 'notification', String(job.id), {
        channel,
        userId,
        providerConfigured: Boolean(env.FIREBASE_PROJECT_ID || env.GOOGLE_APPLICATION_CREDENTIALS),
    });

    return { delivered: true, simulated: true, channel };
}

async function processSearchIndexJob(job: Job) {
    const payload = asObject(job.data);
    const entityType = asString(payload.entityType) || 'product';
    const entityId = asString(payload.entityId) || String(job.id);
    const action = asString(payload.action) || 'upsert';

    logger.info({ jobId: job.id, entityType, entityId, action }, 'Processed search index job');

    await insertSystemAuditLog('job.search_index', entityType, entityId, {
        action,
        typesenseConfigured: Boolean(env.TYPESENSE_HOST && env.TYPESENSE_API_KEY),
        simulated: !(env.TYPESENSE_HOST && env.TYPESENSE_API_KEY),
    });

    return { indexed: true, simulated: !(env.TYPESENSE_HOST && env.TYPESENSE_API_KEY) };
}

async function processBackgroundTaskJob(job: Job) {
    const taskName = job.name || 'default';
    const payload = asObject(job.data);
    const db = getDb();

    if (taskName === 'cleanup_idempotency_keys' || asString(payload.task) === 'cleanup_idempotency_keys') {
        const now = new Date().toISOString();
        const result = await db.execute({
            sql: 'DELETE FROM idempotency_keys WHERE expires_at <= ?',
            args: [now],
        });

        await insertSystemAuditLog('job.background.cleanup_idempotency_keys', 'idempotency_keys', 'expired', {
            deleted: Number((result as any).rowsAffected ?? 0),
        });

        return { cleaned: Number((result as any).rowsAffected ?? 0) };
    }

    await insertSystemAuditLog('job.background.run', 'background_task', String(job.id), {
        taskName,
        payload,
        simulated: true,
    });

    return { ok: true, taskName, simulated: true };
}

async function processOrderJob(job: Job) {
    const payload = asObject(job.data);
    const orderId = asString(payload.orderId);
    const action = asString(payload.action) || 'emit_update';

    if (!orderId) {
        throw new Error('Order processing job missing orderId');
    }

    if (action === 'mark_status') {
        const nextStatus = asString(payload.status);
        if (!nextStatus) {
            throw new Error('mark_status job missing status');
        }

        const allowed = new Set(['pending', 'confirmed', 'shipped', 'delivered', 'cancelled', 'refunded']);
        if (!allowed.has(nextStatus)) {
            throw new Error(`Invalid order status: ${nextStatus}`);
        }

        const now = new Date().toISOString();
        await withTransaction(async (tx) => {
            const existing = await tx.execute({
                sql: 'SELECT status, status_history FROM orders WHERE id = ?',
                args: [orderId],
            });

            if (existing.rows.length === 0) {
                throw new Error(`Order not found: ${orderId}`);
            }

            const current = existing.rows[0];
            if ((current.status as string) === nextStatus) {
                return;
            }

            let history: Array<Record<string, unknown>> = [];
            try {
                history = current.status_history
                    ? (JSON.parse(current.status_history as string) as Array<Record<string, unknown>>)
                    : [];
            } catch {
                history = [];
            }

            history.push({
                status: nextStatus,
                date: now,
                note: asString(payload.note) || 'Background worker status update',
                updatedBy: 'system',
                jobId: job.id,
            });

            await tx.execute({
                sql: `UPDATE orders
                      SET status = ?, status_history = ?, updated_at = ?
                      WHERE id = ?`,
                args: [nextStatus, JSON.stringify(history), now, orderId],
            });

            await tx.execute({
                sql: `INSERT INTO audit_logs (
                        id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                args: [
                    randomUUID(),
                    'system',
                    'job.order.mark_status',
                    'order',
                    orderId,
                    JSON.stringify({ status: nextStatus, jobId: job.id }),
                    'worker',
                    now,
                ],
            });
        });

        return { updated: true, orderId, status: nextStatus };
    }

    const db = getDb();
    const result = await db.execute({
        sql: 'SELECT id, status, updated_at FROM orders WHERE id = ?',
        args: [orderId],
    });

    if (result.rows.length === 0) {
        throw new Error(`Order not found: ${orderId}`);
    }

    await insertSystemAuditLog('job.order.emit_update', 'order', orderId, {
        action,
        simulated: true,
        jobId: job.id,
    });

    return { emitted: true, simulated: true, orderId };
}

async function processReferralJob(job: Job) {
    const payload = asObject(job.data);
    const beneficiaryUserId = asString(payload.userId);
    const sourceUserId = asString(payload.sourceUserId);
    const amount = asNumber(payload.amount);
    const level = asNumber(payload.level);
    const payoutType = (asString(payload.type) || 'REFERRAL_BONUS').toUpperCase();
    const currency = (asString(payload.currency) || 'CASH').toUpperCase();

    if (!beneficiaryUserId || !amount || amount <= 0) {
        throw new Error('Referral job requires userId and positive amount');
    }

    if (!['REFERRAL_BONUS', 'TEAM_INCOME'].includes(payoutType)) {
        throw new Error(`Invalid referral payout type: ${payoutType}`);
    }

    if (!['CASH', 'COIN'].includes(currency)) {
        throw new Error(`Invalid referral currency: ${currency}`);
    }

    const sourceTxnId = `referral_job:${job.id}`;
    const now = new Date().toISOString();

    const result = await withTransaction(async (tx) => {
        const existingTxn = await tx.execute({
            sql: 'SELECT id FROM transactions WHERE source_txn_id = ?',
            args: [sourceTxnId],
        });

        if (existingTxn.rows.length > 0) {
            return { duplicate: true, transactionId: existingTxn.rows[0].id };
        }

        const userExists = await tx.execute({
            sql: 'SELECT uid FROM users WHERE uid = ?',
            args: [beneficiaryUserId],
        });
        if (userExists.rows.length === 0) {
            throw new Error(`Referral beneficiary not found: ${beneficiaryUserId}`);
        }

        const walletColumn = currency === 'COIN' ? 'coin_balance' : 'cash_balance';
        await tx.execute({
            sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, total_earnings, updated_at)
                  VALUES (?, ?, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                    ${walletColumn} = ${walletColumn} + ?,
                    total_earnings = total_earnings + ?,
                    updated_at = ?`,
            args: [
                beneficiaryUserId,
                currency === 'COIN' ? amount : 0,
                currency === 'CASH' ? amount : 0,
                amount,
                now,
                amount,
                amount,
                now,
            ],
        });

        const transactionId = randomUUID();
        await tx.execute({
            sql: `INSERT INTO transactions (
                    id, user_id, type, amount, currency, status, description, related_user_id, level, source_txn_id, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                transactionId,
                beneficiaryUserId,
                payoutType,
                amount,
                currency,
                'COMPLETED',
                `Referral payout from worker job ${job.id}`,
                sourceUserId,
                level,
                sourceTxnId,
                now,
            ],
        });

        await tx.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                'system',
                'job.referral.process',
                'transaction',
                transactionId,
                JSON.stringify({
                    beneficiaryUserId,
                    sourceUserId,
                    amount,
                    currency,
                    payoutType,
                    level,
                    jobId: job.id,
                }),
                'worker',
                now,
            ],
        });

        return { duplicate: false, transactionId };
    });

    return { processed: true, ...result };
}

function buildWorker(name: string, processor: (job: Job) => Promise<unknown>) {
    return new Worker(
        name,
        async (job: Job) => {
            logger.info({ queue: name, jobId: job.id, jobName: job.name }, 'Processing job');
            const result = await processor(job);
            logger.info({ queue: name, jobId: job.id, result }, 'Job processed');
            return result;
        },
        { connection }
    );
}

const notificationsWorker = buildWorker('notifications', processNotificationJob);
const searchIndexWorker = buildWorker('search_index', processSearchIndexJob);
const backgroundTasksWorker = buildWorker('background_tasks', processBackgroundTaskJob);
const orderProcessingWorker = buildWorker('order_processing', processOrderJob);
const referralProcessingWorker = buildWorker('referral_processing', processReferralJob);

const workers = [
    notificationsWorker,
    searchIndexWorker,
    backgroundTasksWorker,
    orderProcessingWorker,
    referralProcessingWorker,
];

workers.forEach((worker) => {
    worker.on('completed', (job) => {
        logger.info({ queue: worker.name, jobId: job.id }, 'Job completed');
    });

    worker.on('failed', (job, err) => {
        logger.error(
            { queue: worker.name, jobId: job?.id, err },
            'Job failed'
        );
    });
});

logger.info('Background workers initialized and polling Redis queues');

let shuttingDown = false;

export async function stopWorkers() {
    if (shuttingDown) return;
    shuttingDown = true;

    logger.info('Stopping background workers...');
    await Promise.all(workers.map((w) => w.close()));
    connection.disconnect();
    logger.info('Background workers stopped');
}

for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, () => {
        void stopWorkers()
            .then(() => process.exit(0))
            .catch((err) => {
                logger.error({ err }, 'Failed to stop workers cleanly');
                process.exit(1);
            });
    });
}
