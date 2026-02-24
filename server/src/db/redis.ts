// File: server/src/db/redis.ts
/**
 * Redis client singleton (ioredis).
 * Used for caching, rate limiting, session state, and BullMQ queue backend.
 */

import Redis from 'ioredis';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let redisClient: Redis | null = null;

export function getRedis(): Redis {
    if (!redisClient) {
        redisClient = new Redis(env.REDIS_URL, {
            maxRetriesPerRequest: null, // Required for BullMQ
            enableReadyCheck: true,
            lazyConnect: true, // Don't block startup if Redis is unavailable
            retryStrategy: (times) => {
                if (times > 3) {
                    logger.warn('Redis connection failed after 3 retries, giving up');
                    return null; // Stop retrying
                }
                return Math.min(times * 200, 2000);
            },
        });

        redisClient.on('connect', () => {
            logger.info('Redis connected');
        });

        redisClient.on('error', (err) => {
            logger.error({ err }, 'Redis connection error');
        });

        redisClient.on('close', () => {
            logger.warn('Redis connection closed');
        });

        // Try to connect but don't block
        redisClient.connect().catch((err) => {
            logger.warn({ err }, 'Redis not available (non-fatal in development)');
        });
    }
    return redisClient;
}

/**
 * Check if Redis is reachable.
 */
export async function checkRedisHealth(): Promise<boolean> {
    try {
        const redis = getRedis();
        const pong = await redis.ping();
        return pong === 'PONG';
    } catch (err) {
        logger.error({ err }, 'Redis health check failed');
        return false;
    }
}

/**
 * Gracefully close the Redis connection.
 */
export async function closeRedis(): Promise<void> {
    if (redisClient) {
        await redisClient.quit();
        redisClient = null;
        logger.info('Redis connection closed gracefully');
    }
}
