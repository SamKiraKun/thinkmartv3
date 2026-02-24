import { beforeEach, describe, expect, it, vi } from 'vitest';

type IdempotencyRow = {
    key: string;
    user_id: string;
    request_path: string;
    request_fingerprint: string | null;
    response_status: number;
    response_body: string | null;
    expires_at: string;
};

let idempotencyRows: IdempotencyRow[] = [];
let auditInsertCount = 0;

const txMock = {
    execute: vi.fn(async (input: any) => {
        const sql = typeof input === 'string' ? input : input.sql;
        const args = typeof input === 'string' ? [] : (input.args ?? []);

        if (sql.includes('DELETE FROM idempotency_keys')) {
            const [key, now] = args as [string, string];
            idempotencyRows = idempotencyRows.filter(
                (row) => !(row.key === key && row.expires_at <= now)
            );
            return { rows: [], rowsAffected: 1 };
        }

        if (sql.includes('SELECT key, user_id, request_path')) {
            const [key] = args as [string];
            const row = idempotencyRows.find((r) => r.key === key);
            return { rows: row ? [row] : [], rowsAffected: 0 };
        }

        if (sql.includes('INSERT INTO idempotency_keys')) {
            const [key, userId, path, fingerprint, status, body, expiresAt] = args as [
                string,
                string,
                string,
                string,
                number,
                string,
                string,
            ];
            idempotencyRows.push({
                key,
                user_id: userId,
                request_path: path,
                request_fingerprint: fingerprint,
                response_status: status,
                response_body: body,
                expires_at: expiresAt,
            });
            return { rows: [], rowsAffected: 1 };
        }

        if (sql.includes('UPDATE idempotency_keys')) {
            const [fingerprint, status, body, expiresAt, key] = args as [
                string,
                number,
                string,
                string,
                string,
            ];
            const row = idempotencyRows.find((r) => r.key === key);
            if (row) {
                row.request_fingerprint = fingerprint;
                row.response_status = status;
                row.response_body = body;
                row.expires_at = expiresAt;
            }
            return { rows: [], rowsAffected: row ? 1 : 0 };
        }

        if (sql.includes('INSERT INTO audit_logs')) {
            auditInsertCount += 1;
            return { rows: [], rowsAffected: 1 };
        }

        throw new Error(`Unhandled SQL in test: ${sql}`);
    }),
};

const withTransactionMock = vi.fn(async (fn: any) => fn(txMock));

vi.mock('../db/client.js', () => ({
    withTransaction: (...args: any[]) => withTransactionMock(...args),
}));

function createReply() {
    return {
        headers: {} as Record<string, string>,
        statusCode: 200,
        payload: undefined as unknown,
        header(name: string, value: string) {
            this.headers[name] = value;
            return this;
        },
        status(code: number) {
            this.statusCode = code;
            return this;
        },
        send(payload: unknown) {
            this.payload = payload;
            return { statusCode: this.statusCode, headers: this.headers, payload };
        },
    };
}

function createRequest(overrides?: Partial<any>) {
    return {
        method: 'POST',
        url: '/api/orders',
        body: { amount: 1, nested: { b: 2, a: 1 } },
        headers: { 'x-idempotency-key': 'idem-123' },
        ip: '127.0.0.1',
        ...overrides,
    };
}

describe('idempotency utils', () => {
    beforeEach(() => {
        vi.resetModules();
        idempotencyRows = [];
        auditInsertCount = 0;
        txMock.execute.mockClear();
        withTransactionMock.mockClear();
    });

    it('caches successful mutation response and replays it on retry', async () => {
        const mod = await import('./idempotency.js');
        const handler = vi.fn(async () => ({
            statusCode: 201,
            payload: { data: { id: 'o1' } },
        }));

        const firstReply = createReply();
        const first = await mod.runIdempotentMutation({
            request: createRequest(),
            reply: firstReply as any,
            userId: 'u1',
            handler,
        });

        expect(first).toMatchObject({
            statusCode: 201,
            headers: { 'x-idempotent-replay': 'false' },
            payload: { data: { id: 'o1' } },
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(idempotencyRows).toHaveLength(1);

        const secondReply = createReply();
        const second = await mod.runIdempotentMutation({
            request: createRequest(),
            reply: secondReply as any,
            userId: 'u1',
            handler,
        });

        expect(second).toMatchObject({
            statusCode: 201,
            headers: { 'x-idempotent-replay': 'true' },
            payload: { data: { id: 'o1' } },
        });
        expect(handler).toHaveBeenCalledTimes(1);
        expect(auditInsertCount).toBe(1);
    });

    it('rejects reuse of the same key with a different payload', async () => {
        const mod = await import('./idempotency.js');

        await mod.runIdempotentMutation({
            request: createRequest(),
            reply: createReply() as any,
            userId: 'u1',
            handler: async () => ({ statusCode: 201, payload: { ok: true } }),
        });

        await expect(
            mod.runIdempotentMutation({
                request: createRequest({ body: { amount: 999 } }),
                reply: createReply() as any,
                userId: 'u1',
                handler: async () => ({ statusCode: 201, payload: { ok: true } }),
            })
        ).rejects.toMatchObject({ code: 'CONFLICT' });
    });

    it('stableStringify sorts object keys deterministically', async () => {
        const mod = await import('./idempotency.js');
        const a = mod.stableStringify({ b: 2, a: 1, nested: { y: 2, x: 1 } });
        const b = mod.stableStringify({ nested: { x: 1, y: 2 }, a: 1, b: 2 });
        expect(a).toBe(b);
    });
});
