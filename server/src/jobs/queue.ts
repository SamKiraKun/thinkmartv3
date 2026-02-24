import { Queue, QueueOptions } from 'bullmq';
import Redis from 'ioredis';
import { env } from '../config/env.js';

// Setup Redis Connection
// Using exactly one connection per Queue instance is recommended for BullMQ.
// Note: Depending on scale, passing a persistent ioredis instance handles auto-reconnects better.
const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null, // Required by bullmq
}) as any;

const defaultQueueOptions: QueueOptions = {
    connection,
    defaultJobOptions: {
        removeOnComplete: true,
        removeOnFail: false,
        attempts: 3,
        backoff: {
            type: 'exponential',
            delay: 1000,
        },
    },
};

// Define standard cues for background jobs
export const notificationsQueue = new Queue('notifications', defaultQueueOptions);
export const searchIndexQueue = new Queue('search_index', defaultQueueOptions);
export const backgroundTasksQueue = new Queue('background_tasks', defaultQueueOptions);
export const orderProcessingQueue = new Queue('order_processing', defaultQueueOptions);
export const referralProcessingQueue = new Queue('referral_processing', defaultQueueOptions);

// Safe teardown
export async function closeQueues() {
    await notificationsQueue.close();
    await searchIndexQueue.close();
    await backgroundTasksQueue.close();
    await orderProcessingQueue.close();
    await referralProcessingQueue.close();

    connection.disconnect();
}
