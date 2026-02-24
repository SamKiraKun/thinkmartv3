// File: server/src/app.ts
/**
 * Fastify application factory.
 * Registers all plugins, middleware, and routes.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { requestIdPlugin } from './middleware/requestId.js';
import { optionalAuth } from './middleware/auth.js';
import fastifyWebsocket from '@fastify/websocket';
import realtimeRoutes from './routes/realtime/index.js';
import { healthRoutes } from './routes/health/index.js';
import { userRoutes } from './routes/users/index.js';
import { walletRoutes } from './routes/wallet/index.js';
import productRoutes from './routes/products/index.js';
import catalogRoutes from './routes/catalog/index.js';
import reviewRoutes from './routes/reviews/index.js';
import taskRoutes from './routes/tasks/index.js';
import wishlistRoutes from './routes/wishlists/index.js';
import settingsRoutes from './routes/settings/index.js';
import orderRoutes from './routes/orders/index.js';
import withdrawalRoutes from './routes/withdrawals/index.js';
import referralRoutes from './routes/referrals/index.js';
import leaderboardRoutes from './routes/leaderboard/index.js';
import adminRoutes from './routes/admin/index.js';
import adminExtraRoutes from './routes/admin/extras.js';
import vendorRoutes from './routes/vendor/index.js';
import partnerRoutes from './routes/partner/index.js';
import organizationRoutes from './routes/organizations/index.js';
import gamificationRoutes from './routes/gamification/index.js';
// Wave 1 Write Routes
import wishlistWriteRoutes from './routes/wishlists/writes.js';
import reviewWriteRoutes from './routes/reviews/writes.js';
import profileWriteRoutes from './routes/users/profile.js';
import productWriteRoutes from './routes/products/writes.js';
import taskWriteRoutes from './routes/tasks/writes.js';
// Wave 2 Write Routes (Financial)
import orderWriteRoutes from './routes/orders/writes.js';
import walletWriteRoutes from './routes/wallet/writes.js';
import withdrawalWriteRoutes from './routes/withdrawals/writes.js';
import storageRoutes from './routes/storage/index.js';
import membershipWriteRoutes from './routes/membership/writes.js';
import referralWriteRoutes from './routes/referrals/writes.js';
import { AppError } from './utils/errors.js';
import type { FastifyError } from 'fastify';

export async function buildApp() {
    const app = Fastify({
        logger: false, // We use our own Pino instance
        trustProxy: true,
        requestIdHeader: 'x-request-id',
    });

    // ─── CORS ───────────────────────────────────────────────────────
    await app.register(cors, {
        origin: env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim()),
        credentials: true,
        methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
        allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-Id', 'X-Idempotency-Key'],
    });

    // ─── Rate Limiting ──────────────────────────────────────────────
    await app.register(rateLimit, {
        max: 100,
        timeWindow: '1 minute',
        keyGenerator: (request) => {
            // Rate limit by user UID if authenticated, otherwise by IP
            return (request as any).user?.uid || request.ip;
        },
    });

    // ─── Plugins ────────────────────────────────────────────────────
    await app.register(requestIdPlugin);
    await app.register(fastifyWebsocket, {
        options: { maxPayload: 1048576 }
    });

    // Populate request.user / request.userId when a valid Bearer token is present.
    // This keeps legacy routes (which do manual auth checks) working during migration.
    app.addHook('onRequest', optionalAuth);

    // ─── Request / Response Logging ─────────────────────────────────
    app.addHook('onRequest', async (request) => {
        logger.info(
            { method: request.method, url: request.url, requestId: request.id },
            'Incoming request'
        );
    });

    app.addHook('onResponse', async (request, reply) => {
        logger.info(
            {
                method: request.method,
                url: request.url,
                statusCode: reply.statusCode,
                requestId: request.id,
                responseTime: reply.elapsedTime,
            },
            'Request completed'
        );
    });

    // ─── Error Handler ──────────────────────────────────────────────
    app.setErrorHandler((err: FastifyError | AppError, request, reply) => {
        // Handle our custom AppError classes
        if (err instanceof AppError) {
            logger.warn(
                {
                    code: err.code,
                    statusCode: err.statusCode,
                    message: err.message,
                    requestId: request.id,
                },
                'Application error'
            );

            return reply.status(err.statusCode).send({
                error: {
                    code: err.code,
                    message: err.message,
                    details: err.details,
                },
                requestId: request.id,
            });
        }

        const fastifyErr = err as FastifyError;

        // Handle Fastify validation errors
        if (fastifyErr.validation) {
            return reply.status(400).send({
                error: {
                    code: 'VALIDATION_ERROR',
                    message: fastifyErr.message,
                    details: fastifyErr.validation,
                },
                requestId: request.id,
            });
        }

        // Handle rate limit errors
        if (fastifyErr.statusCode === 429) {
            return reply.status(429).send({
                error: {
                    code: 'TOO_MANY_REQUESTS',
                    message: 'Rate limit exceeded. Please try again later.',
                },
                requestId: request.id,
            });
        }

        // Unhandled errors
        logger.error(
            { err: fastifyErr, requestId: request.id },
            'Unhandled error'
        );

        return reply.status(500).send({
            error: {
                code: 'INTERNAL_ERROR',
                message:
                    env.NODE_ENV === 'production'
                        ? 'An unexpected error occurred'
                        : fastifyErr.message,
            },
            requestId: request.id,
        });
    });

    // ─── Routes ─────────────────────────────────────────────────────
    await app.register(healthRoutes);
    await app.register(userRoutes);
    await app.register(walletRoutes);
    // Wave 1 Read Routes
    await app.register(productRoutes);
    await app.register(catalogRoutes);
    await app.register(reviewRoutes);
    await app.register(taskRoutes);
    await app.register(wishlistRoutes);
    await app.register(settingsRoutes);
    // Wave 2 Read Routes (Transactional + Admin)
    await app.register(orderRoutes);
    await app.register(withdrawalRoutes);
    await app.register(referralRoutes);
    await app.register(leaderboardRoutes);
    await app.register(adminRoutes);
    await app.register(adminExtraRoutes);
    await app.register(vendorRoutes);
    await app.register(partnerRoutes);
    await app.register(organizationRoutes);
    await app.register(gamificationRoutes);
    // Wave 1 Write Routes
    await app.register(wishlistWriteRoutes);
    await app.register(reviewWriteRoutes);
    await app.register(profileWriteRoutes);
    await app.register(productWriteRoutes);
    await app.register(taskWriteRoutes);
    // Wave 2 Write Routes
    await app.register(orderWriteRoutes);
    await app.register(walletWriteRoutes);
    await app.register(withdrawalWriteRoutes);
    await app.register(membershipWriteRoutes);
    await app.register(referralWriteRoutes);
    await app.register(storageRoutes);
    await app.register(realtimeRoutes);

    // Root route
    app.get('/', async () => ({
        name: 'ThinkMart API',
        version: '1.0.0',
        status: 'running',
    }));

    return app;
}
