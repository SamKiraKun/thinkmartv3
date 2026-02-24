import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type IdempotencyRow = {
    key: string;
    user_id: string;
    request_path: string;
    request_fingerprint: string | null;
    response_status: number;
    response_body: string | null;
    expires_at: string;
};

describe('financial route idempotency', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(() => {
        vi.resetModules();
        vi.doUnmock('../db/client.js');
        vi.doUnmock('../middleware/auth.js');
    });

    it('replays POST /api/wallet/credit without duplicating side effects', async () => {
        vi.resetModules();

        const idempotencyRows: IdempotencyRow[] = [];
        const wallets: Record<string, { coin: number; cash: number }> = {};
        const transactions: Array<{ id: string; userId: string; amount: number; currency: string }> = [];
        let auditCount = 0;

        const fakeDb = {
            execute: vi.fn(async (input: any) => {
                const sql = typeof input === 'string' ? input : input.sql;
                const args = typeof input === 'string' ? [] : (input.args ?? []);

                if (sql.includes('SELECT role FROM users WHERE uid = ?')) {
                    return { rows: [{ role: 'admin' }] };
                }

                if (sql.includes('SELECT uid FROM users WHERE uid = ?')) {
                    const uid = args[0];
                    return { rows: uid === 'u2' ? [{ uid: 'u2' }] : [] };
                }

                if (sql.includes('DELETE FROM idempotency_keys')) {
                    const [key, now] = args as [string, string];
                    for (let i = idempotencyRows.length - 1; i >= 0; i -= 1) {
                        if (idempotencyRows[i].key === key && idempotencyRows[i].expires_at <= now) {
                            idempotencyRows.splice(i, 1);
                        }
                    }
                    return { rows: [], rowsAffected: 1 };
                }

                if (sql.includes('SELECT key, user_id, request_path, request_fingerprint, response_status, response_body')) {
                    const [key] = args as [string];
                    const row = idempotencyRows.find((r) => r.key === key);
                    return { rows: row ? [row] : [] };
                }

                if (sql.includes('INSERT INTO idempotency_keys')) {
                    const [key, userId, requestPath, fingerprint, responseStatus, responseBody, expiresAt] = args as [
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
                        request_path: requestPath,
                        request_fingerprint: fingerprint,
                        response_status: responseStatus,
                        response_body: responseBody,
                        expires_at: expiresAt,
                    });
                    return { rows: [], rowsAffected: 1 };
                }

                if (sql.includes('UPDATE idempotency_keys')) {
                    const [fingerprint, responseStatus, responseBody, expiresAt, key] = args as [
                        string,
                        number,
                        string,
                        string,
                        string,
                    ];
                    const row = idempotencyRows.find((r) => r.key === key)!;
                    row.request_fingerprint = fingerprint;
                    row.response_status = responseStatus;
                    row.response_body = responseBody;
                    row.expires_at = expiresAt;
                    return { rows: [], rowsAffected: 1 };
                }

                if (sql.includes('INSERT INTO wallets') && sql.includes('ON CONFLICT(user_id)')) {
                    const userId = String(args[0]);
                    const coinSeed = Number(args[1] ?? 0);
                    const cashSeed = Number(args[2] ?? 0);
                    const creditAmount = Number(args[4] ?? 0);
                    const isCoinCredit = sql.includes('coin_balance = coin_balance + ?');
                    const current = wallets[userId] ?? { coin: 0, cash: 0 };
                    if (!wallets[userId]) {
                        wallets[userId] = { coin: coinSeed, cash: cashSeed };
                    } else if (isCoinCredit) {
                        current.coin += creditAmount;
                    } else {
                        current.cash += creditAmount;
                    }
                    return { rows: [], rowsAffected: 1 };
                }

                if (sql.includes('INSERT INTO transactions')) {
                    transactions.push({
                        id: String(args[0]),
                        userId: String(args[1]),
                        amount: Number(args[3]),
                        currency: String(args[4]),
                    });
                    return { rows: [], rowsAffected: 1 };
                }

                if (sql.includes('INSERT INTO audit_logs')) {
                    auditCount += 1;
                    return { rows: [], rowsAffected: 1 };
                }

                throw new Error(`Unhandled SQL: ${sql}`);
            }),
        };

        vi.doMock('../db/client.js', () => ({
            getDb: () => fakeDb,
            withTransaction: async (fn: (tx: any) => Promise<any>) => fn(fakeDb),
        }));

        vi.doMock('../middleware/auth.js', () => ({
            requireAuth: async (request: any) => {
                request.user = {
                    uid: 'u1',
                    role: 'admin',
                    email: 'admin@example.com',
                    isActive: true,
                    isBanned: false,
                    name: 'Admin',
                    membershipActive: false,
                };
                request.userId = 'u1';
            },
            requireRole: (..._roles: string[]) => async () => {},
        }));

        vi.doMock('../jobs/enqueue.js', () => ({
            enqueueWalletCreditNotification: vi.fn(async () => ({ queued: false })),
            enqueueOrderCreatedJobs: vi.fn(async () => ({ queued: false })),
            enqueueWithdrawalNotification: vi.fn(async () => ({ queued: false })),
        }));

        const walletWriteRoutes = (await import('./wallet/writes.js')).default;
        const app = Fastify();
        await app.register(walletWriteRoutes);

        const requestPayload = {
            userId: 'u2',
            amount: 50,
            currency: 'CASH',
            description: 'Manual admin top-up',
        };

        const first = await app.inject({
            method: 'POST',
            url: '/api/wallet/credit',
            headers: { 'x-idempotency-key': 'wallet-credit-1' },
            payload: requestPayload,
        });

        expect(first.statusCode).toBe(201);
        expect(first.headers['x-idempotent-replay']).toBe('false');
        expect(transactions).toHaveLength(1);

        const second = await app.inject({
            method: 'POST',
            url: '/api/wallet/credit',
            headers: { 'x-idempotency-key': 'wallet-credit-1' },
            payload: requestPayload,
        });

        expect(second.statusCode).toBe(201);
        expect(second.headers['x-idempotent-replay']).toBe('true');
        expect(transactions).toHaveLength(1);
        expect(Object.keys(wallets)).toContain('u2');
        expect(auditCount).toBeGreaterThanOrEqual(2); // route audit + idempotency audit on first request

        await app.close();
    });
});
