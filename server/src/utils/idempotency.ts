// File: server/src/utils/idempotency.ts
/**
 * Idempotency helpers for retry-prone mutation endpoints.
 *
 * Stores successful responses in `idempotency_keys` within the same DB transaction
 * as the mutation to prevent duplicate effects.
 */

import { createHash, randomUUID } from 'crypto';
import type { Client } from '@libsql/client';
import type { FastifyReply, FastifyRequest } from 'fastify';
import { withTransaction } from '../db/client.js';
import { BadRequestError, ConflictError } from './errors.js';

const PROCESSING_STATUS = 102;
const DEFAULT_TTL_SECONDS = 24 * 60 * 60;
const MAX_KEY_LENGTH = 128;

type TxLike = Pick<Client, 'execute'>;

export interface IdempotentMutationResult {
    statusCode?: number;
    payload: unknown;
}

export interface RunIdempotentMutationOptions {
    request: FastifyRequest;
    reply: FastifyReply;
    userId: string;
    ttlSeconds?: number;
    handler: (tx: TxLike) => Promise<IdempotentMutationResult>;
    afterCommit?: (result: {
        cached: boolean;
        statusCode: number;
        payload: unknown;
    }) => Promise<void> | void;
}

function getRequestPath(request: FastifyRequest): string {
    return request.url.split('?')[0] || '/';
}

function normalizeIdempotencyKey(raw: string | string[] | undefined): string | null {
    const value = Array.isArray(raw) ? raw[0] : raw;
    if (!value) return null;

    const key = value.trim();
    if (!key) {
        throw new BadRequestError('X-Idempotency-Key cannot be empty');
    }
    if (key.length > MAX_KEY_LENGTH) {
        throw new BadRequestError(`X-Idempotency-Key exceeds ${MAX_KEY_LENGTH} characters`);
    }

    return key;
}

export function stableStringify(value: unknown): string {
    if (value === null || value === undefined) return 'null';
    if (typeof value !== 'object') return JSON.stringify(value);
    if (value instanceof Date) return JSON.stringify(value.toISOString());
    if (Array.isArray(value)) {
        return `[${value.map((item) => stableStringify(item)).join(',')}]`;
    }

    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).sort();
    return `{${keys
        .map((key) => `${JSON.stringify(key)}:${stableStringify(obj[key])}`)
        .join(',')}}`;
}

export function buildRequestFingerprint(request: FastifyRequest): string {
    const hash = createHash('sha256');
    hash.update(request.method);
    hash.update('|');
    hash.update(getRequestPath(request));
    hash.update('|');
    hash.update(stableStringify(request.body ?? null));
    return hash.digest('hex');
}

function parseStoredResponse(raw: unknown): unknown {
    if (raw === null || raw === undefined) return null;
    if (typeof raw !== 'string') return raw;

    try {
        return JSON.parse(raw);
    } catch {
        return raw;
    }
}

async function deleteExpiredIdempotencyKey(tx: TxLike, key: string) {
    await tx.execute({
        sql: 'DELETE FROM idempotency_keys WHERE key = ? AND expires_at <= ?',
        args: [key, new Date().toISOString()],
    });
}

export async function runIdempotentMutation({
    request,
    reply,
    userId,
    ttlSeconds = DEFAULT_TTL_SECONDS,
    handler,
    afterCommit,
}: RunIdempotentMutationOptions): Promise<unknown> {
    const idempotencyKey = normalizeIdempotencyKey(
        request.headers['x-idempotency-key'] as string | string[] | undefined
    );

    if (!idempotencyKey) {
        const live = await withTransaction(async (tx) => handler(tx as unknown as TxLike));
        return reply.status(live.statusCode ?? 200).send(live.payload);
    }

    const requestPath = getRequestPath(request);
    const fingerprint = buildRequestFingerprint(request);
    const expiresAt = new Date(Date.now() + ttlSeconds * 1000).toISOString();

    const result = await withTransaction(async (tx) => {
        const txLike = tx as unknown as TxLike;
        await deleteExpiredIdempotencyKey(txLike, idempotencyKey);

        const existingResult = await txLike.execute({
            sql: `SELECT key, user_id, request_path, request_fingerprint, response_status, response_body
                  FROM idempotency_keys
                  WHERE key = ?`,
            args: [idempotencyKey],
        });

        if (existingResult.rows.length > 0) {
            const existing = existingResult.rows[0];

            if (
                existing.user_id !== userId ||
                existing.request_path !== requestPath
            ) {
                throw new ConflictError(
                    'Idempotency key has already been used for a different request'
                );
            }

            if ((existing.request_fingerprint as string | null) !== fingerprint) {
                throw new ConflictError('Idempotency key payload mismatch');
            }

            const existingStatus = Number(existing.response_status);
            if (existingStatus === PROCESSING_STATUS) {
                throw new ConflictError('A request with this idempotency key is already in progress');
            }

            return {
                cached: true,
                statusCode: existingStatus,
                payload: parseStoredResponse(existing.response_body),
            };
        }

        await txLike.execute({
            sql: `INSERT INTO idempotency_keys (
                    key, user_id, request_path, request_fingerprint, response_status, response_body, expires_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
            args: [
                idempotencyKey,
                userId,
                requestPath,
                fingerprint,
                PROCESSING_STATUS,
                '{"processing":true}',
                expiresAt,
            ],
        });

        const live = await handler(txLike);
        const statusCode = live.statusCode ?? 200;
        const responseBody = JSON.stringify(live.payload ?? null);

        await txLike.execute({
            sql: `UPDATE idempotency_keys
                  SET request_fingerprint = ?, response_status = ?, response_body = ?, expires_at = ?
                  WHERE key = ?`,
            args: [fingerprint, statusCode, responseBody, expiresAt, idempotencyKey],
        });

        await txLike.execute({
            sql: `INSERT INTO audit_logs (
                    id, actor_uid, action, target_type, target_id, details, ip_address, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                userId,
                'idempotency.record',
                'idempotency_key',
                idempotencyKey,
                JSON.stringify({
                    requestPath,
                    statusCode,
                    ttlSeconds,
                }),
                request.ip,
                new Date().toISOString(),
            ],
        });

        return {
            cached: false,
            statusCode,
            payload: live.payload,
        };
    });

    if (afterCommit) {
        await afterCommit(result);
    }

    return reply
        .header('x-idempotent-replay', result.cached ? 'true' : 'false')
        .status(result.statusCode)
        .send(result.payload);
}
