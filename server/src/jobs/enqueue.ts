// File: server/src/jobs/enqueue.ts
/**
 * Safe queue enqueue helpers for request-path integration.
 * Jobs are best-effort and must not break user-facing writes if Redis is degraded.
 */

import { logger } from '../config/logger.js';
import { env } from '../config/env.js';

type QueueModule = typeof import('./queue.js');

let queueModulePromise: Promise<QueueModule> | null = null;

async function getQueueModule(): Promise<QueueModule | null> {
    if (!env.FF_JOBS_ENABLED) {
        return null;
    }

    if (!queueModulePromise) {
        queueModulePromise = import('./queue.js');
    }

    try {
        return await queueModulePromise;
    } catch (err) {
        logger.error({ err }, 'Failed to initialize queue module');
        return null;
    }
}

async function safeAdd(
    queueName: keyof Pick<
        QueueModule,
        | 'notificationsQueue'
        | 'searchIndexQueue'
        | 'backgroundTasksQueue'
        | 'orderProcessingQueue'
        | 'referralProcessingQueue'
    >,
    jobName: string,
    payload: Record<string, unknown>,
    jobId?: string
) {
    const mod = await getQueueModule();
    if (!mod) {
        return { queued: false, disabled: !env.FF_JOBS_ENABLED };
    }

    try {
        const queue = mod[queueName];
        await queue.add(jobName, payload, jobId ? { jobId } : undefined);
        return { queued: true };
    } catch (err) {
        logger.warn({ err, queueName, jobName, payload }, 'Failed to enqueue background job');
        return { queued: false, error: true };
    }
}

export async function enqueueOrderCreatedJobs(params: {
    orderId: string;
    userId: string;
    itemsCount: number;
}) {
    await Promise.all([
        safeAdd(
            'orderProcessingQueue',
            'order_created',
            {
                action: 'emit_update',
                orderId: params.orderId,
                userId: params.userId,
                itemsCount: params.itemsCount,
            },
            `order_created:${params.orderId}`
        ),
        safeAdd(
            'notificationsQueue',
            'order_created_notification',
            {
                channel: 'inapp',
                userId: params.userId,
                message: `Order ${params.orderId} placed successfully`,
                orderId: params.orderId,
            },
            `notify_order_created:${params.orderId}:${params.userId}`
        ),
    ]);
}

export async function enqueueWalletCreditNotification(params: {
    userId: string;
    amount: number;
    currency: 'COIN' | 'CASH';
    transactionId: string;
}) {
    await safeAdd(
        'notificationsQueue',
        'wallet_credit_notification',
        {
            channel: 'inapp',
            userId: params.userId,
            message: `${params.amount} ${params.currency} credited to your wallet`,
            transactionId: params.transactionId,
        },
        `notify_wallet_credit:${params.transactionId}`
    );
}

export async function enqueueWithdrawalNotification(params: {
    withdrawalId: string;
    userId: string;
    status: 'pending' | 'completed' | 'rejected';
    amount: number;
}) {
    await safeAdd(
        'notificationsQueue',
        `withdrawal_${params.status}_notification`,
        {
            channel: 'inapp',
            userId: params.userId,
            message:
                params.status === 'pending'
                    ? `Withdrawal request submitted for ${params.amount}`
                    : `Withdrawal ${params.status} for ${params.amount}`,
            withdrawalId: params.withdrawalId,
            status: params.status,
            amount: params.amount,
        },
        `notify_withdrawal:${params.withdrawalId}:${params.status}`
    );
}

export async function enqueueReferralProcessing(params: {
    userId: string;
    action: 'membership_purchase' | 'signup' | 'order_complete';
}) {
    await safeAdd(
        'referralProcessingQueue',
        'process',
        params,
        `referrals:${params.userId}:${params.action}:${Date.now()}`
    );
}
