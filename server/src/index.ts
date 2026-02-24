// File: server/src/index.ts
/**
 * Server entry point.
 * Starts the Fastify server and handles graceful shutdown.
 */

import { buildApp } from './app.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { closeRedis } from './db/redis.js';

async function main() {
    logger.info(
        {
            nodeEnv: env.NODE_ENV,
            port: env.PORT,
            host: env.HOST,
        },
        'Starting ThinkMart API server...'
    );

    const app = await buildApp();

    // ─── Graceful Shutdown ────────────────────────────────────────
    const signals: NodeJS.Signals[] = ['SIGINT', 'SIGTERM'];

    for (const signal of signals) {
        process.on(signal, async () => {
            logger.info({ signal }, 'Received shutdown signal');

            try {
                await app.close();
                logger.info('Fastify server closed');
            } catch (err) {
                logger.error({ err }, 'Error closing Fastify server');
            }

            try {
                await closeRedis();
                logger.info('Redis connection closed');
            } catch (err) {
                logger.error({ err }, 'Error closing Redis connection');
            }

            process.exit(0);
        });
    }

    // ─── Start Server ────────────────────────────────────────────
    try {
        await app.listen({ port: env.PORT, host: env.HOST });
        logger.info(
            `🚀 ThinkMart API server running at http://${env.HOST}:${env.PORT}`
        );
    } catch (err) {
        logger.fatal({ err }, 'Failed to start server');
        process.exit(1);
    }
}

main();
