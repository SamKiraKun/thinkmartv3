// File: server/src/config/logger.ts
/**
 * Pino logger configuration.
 * Structured JSON in production, pretty-printed in development.
 */

import pino from 'pino';
import { env } from './env.js';

export const logger = pino({
    level: env.LOG_LEVEL,
    ...(env.NODE_ENV === 'development'
        ? {
            transport: {
                target: 'pino-pretty',
                options: {
                    colorize: true,
                    translateTime: 'SYS:standard',
                    ignore: 'pid,hostname',
                },
            },
        }
        : {}),
    serializers: {
        err: pino.stdSerializers.err,
        req: (req) => ({
            method: req.method,
            url: req.url,
            hostname: req.hostname,
            remoteAddress: req.ip,
        }),
        res: (res) => ({
            statusCode: res.statusCode,
        }),
    },
});

export type Logger = typeof logger;
