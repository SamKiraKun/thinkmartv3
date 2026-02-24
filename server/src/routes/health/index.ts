// File: server/src/routes/health/index.ts
/**
 * Health check routes.
 * /health/live - Process is up (always 200 if reachable)
 * /health/ready - DB + Redis reachable (200 if healthy, 503 if not)
 */

import type { FastifyInstance } from 'fastify';
import { checkDbHealth } from '../../db/client.js';
import { checkRedisHealth } from '../../db/redis.js';

export async function healthRoutes(app: FastifyInstance) {
    /**
     * Liveness probe - process is running.
     */
    app.get('/health/live', async (_request, reply) => {
        return reply.send({
            status: 'ok',
            timestamp: new Date().toISOString(),
        });
    });

    /**
     * Readiness probe - dependencies are reachable.
     */
    app.get('/health/ready', async (_request, reply) => {
        const [dbHealthy, redisHealthy] = await Promise.all([
            checkDbHealth(),
            checkRedisHealth(),
        ]);

        const isReady = dbHealthy && redisHealthy;

        const status = {
            status: isReady ? 'ready' : 'not_ready',
            timestamp: new Date().toISOString(),
            checks: {
                database: dbHealthy ? 'ok' : 'fail',
                redis: redisHealthy ? 'ok' : 'fail',
            },
        };

        return reply.status(isReady ? 200 : 503).send(status);
    });
}
