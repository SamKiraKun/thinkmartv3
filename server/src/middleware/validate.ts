// File: server/src/middleware/validate.ts
/**
 * Request validation middleware using Zod schemas.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { BadRequestError } from '../utils/errors.js';

/**
 * Validate request body against a Zod schema.
 */
export function validateBody<T>(schema: ZodSchema<T>) {
    return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        try {
            request.body = schema.parse(request.body);
        } catch (err) {
            if (err instanceof ZodError) {
                throw new BadRequestError('Validation failed', err.flatten().fieldErrors);
            }
            throw err;
        }
    };
}

/**
 * Validate request query parameters against a Zod schema.
 */
export function validateQuery<T>(schema: ZodSchema<T>) {
    return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        try {
            request.query = schema.parse(request.query) as typeof request.query;
        } catch (err) {
            if (err instanceof ZodError) {
                throw new BadRequestError('Invalid query parameters', err.flatten().fieldErrors);
            }
            throw err;
        }
    };
}

/**
 * Validate request params against a Zod schema.
 */
export function validateParams<T>(schema: ZodSchema<T>) {
    return async function (request: FastifyRequest, _reply: FastifyReply): Promise<void> {
        try {
            request.params = schema.parse(request.params) as typeof request.params;
        } catch (err) {
            if (err instanceof ZodError) {
                throw new BadRequestError('Invalid path parameters', err.flatten().fieldErrors);
            }
            throw err;
        }
    };
}
