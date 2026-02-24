// File: server/src/middleware/requestId.ts
/**
 * Request ID middleware.
 * Attaches a unique request ID to every request for tracing and logging.
 */

import type { FastifyInstance } from 'fastify';
import { nanoid } from 'nanoid';

export async function requestIdPlugin(app: FastifyInstance) {
    app.addHook('onRequest', async (request) => {
        // Use client-provided request ID or generate one
        const requestId =
            (request.headers['x-request-id'] as string) || nanoid(21);
        request.id = requestId;
    });

    app.addHook('onSend', async (_request, reply) => {
        reply.header('x-request-id', _request.id);
    });
}
