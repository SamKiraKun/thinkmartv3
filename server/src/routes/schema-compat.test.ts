import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbResult = { rows: any[]; rowsAffected?: number };

type FakeDb = {
    execute: ReturnType<typeof vi.fn>;
    calls: Array<{ sql: string; args: any[] }>;
};

function createFakeDb(results: Array<DbResult | ((sql: string, args: any[]) => DbResult | Promise<DbResult>)>): FakeDb {
    const calls: Array<{ sql: string; args: any[] }> = [];
    let i = 0;

    const execute = vi.fn(async (input: any) => {
        const sql = typeof input === 'string' ? input : input.sql;
        const args = typeof input === 'string' ? [] : (input.args ?? []);
        calls.push({ sql, args });

        const next = results[i++];
        if (!next) {
            throw new Error(`Unexpected DB call #${i}: ${sql}`);
        }

        const out = typeof next === 'function' ? await next(sql, args) : next;
        return out;
    });

    return { execute, calls };
}

async function buildRouteApp(
    modulePath: string,
    fakeDb: FakeDb,
    withTransactionImpl?: (fn: (tx: any) => Promise<any>) => Promise<any>
) {
    vi.resetModules();

    vi.doMock('../db/client.js', () => ({
        getDb: () => fakeDb,
        withTransaction:
            withTransactionImpl ??
            (async (fn: (tx: any) => Promise<any>) => fn(fakeDb)),
    }));

    vi.doMock('../middleware/auth.js', () => ({
        requireAuth: async (request: any) => {
            request.user = {
                uid: 'u1',
                role: 'user',
                email: 'u1@example.com',
                isActive: true,
                isBanned: false,
                name: 'User One',
                membershipActive: false,
            };
            request.userId = 'u1';
        },
        requireRole: (..._roles: string[]) => async () => {},
    }));

    const plugin = (await import(modulePath)).default;
    const app = Fastify();
    await app.register(plugin);
    return app;
}

describe('route/schema compatibility', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(async () => {
        vi.resetModules();
        vi.doUnmock('../db/client.js');
        vi.doUnmock('../middleware/auth.js');
    });

    it('tasks completion route inserts into user_task_completions.reward (not legacy columns)', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [
                    {
                        id: 't1',
                        is_active: 1,
                        frequency: 'ONCE',
                        reward: 5,
                        reward_type: 'COIN',
                        max_completions_per_day: null,
                    },
                ],
            },
            { rows: [] }, // no existing completion
            { rows: [], rowsAffected: 1 }, // insert completion
            { rows: [], rowsAffected: 1 }, // wallet upsert for reward credit
            { rows: [], rowsAffected: 1 }, // transaction insert
        ]);

        const app = await buildRouteApp('./tasks/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/tasks/t1/complete',
            payload: {},
        });

        expect(res.statusCode).toBe(201);
        const insertCall = fakeDb.calls.find((c) => c.sql.includes('INSERT INTO user_task_completions'));
        expect(insertCall).toBeTruthy();
        expect(insertCall!.sql).toContain('(id, user_id, task_id, reward, completed_at)');
        expect(insertCall!.sql).not.toContain('rewarded_amount');
        expect(insertCall!.sql).not.toContain(', data,');

        await app.close();
    });

    it('tasks completion route rejects malformed integrity payloads', async () => {
        const fakeDb = createFakeDb([]);
        const app = await buildRouteApp('./tasks/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/tasks/t1/complete',
            payload: { integrity: 'invalid' },
        });

        expect(res.statusCode).toBe(400);
        const body = res.json() as any;
        if (typeof body.error === 'string') {
            expect(body.error).toBe('Bad Request');
        } else {
            expect(body).toMatchObject({
                error: { code: 'BAD_REQUEST' },
            });
        }
        expect(fakeDb.calls.length).toBe(0);

        await app.close();
    });

    it('survey submit persists answers and integrity payload in task session', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [
                    {
                        id: 't_survey',
                        type: 'SURVEY',
                        is_active: 1,
                        frequency: 'ONCE',
                        reward: 0,
                        reward_type: 'COIN',
                        max_completions_per_day: null,
                        min_duration: 0,
                        questions: '[{"text":"q1"}]',
                    },
                ],
            },
            { rows: [] }, // no existing completion
            {
                rows: [
                    {
                        id: 'session_1',
                        task_id: 't_survey',
                        status: 'started',
                        started_at: new Date(Date.now() - 30_000).toISOString(),
                    },
                ],
            },
            { rows: [], rowsAffected: 1 }, // update task_sessions
            { rows: [], rowsAffected: 1 }, // insert completion
        ]);

        const app = await buildRouteApp('./tasks/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/tasks/t_survey/survey-submit',
            payload: {
                sessionId: 'session_1',
                answers: { '0': 'A' },
                integrity: {
                    activeSeconds: 35,
                    backgroundSeconds: 1,
                    answerCount: 1,
                    questionCount: 1,
                    contentOpened: true,
                    client: 'flutter',
                },
            },
        });

        expect(res.statusCode).toBe(201);
        const updateCall = fakeDb.calls.find((c) =>
            c.sql.includes('UPDATE task_sessions')
        );
        expect(updateCall).toBeTruthy();
        expect(String(updateCall!.args[2])).toContain('"answers"');
        expect(String(updateCall!.args[2])).toContain('"integrity"');

        await app.close();
    });

    it('video completion requires contentOpened=true when integrity payload is provided', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [
                    {
                        id: 't_video',
                        type: 'WATCH_VIDEO',
                        is_active: 1,
                        frequency: 'ONCE',
                        reward: 5,
                        reward_type: 'COIN',
                        max_completions_per_day: null,
                        min_duration: 0,
                    },
                ],
            },
            { rows: [] }, // no existing completion
            {
                rows: [
                    {
                        id: 'session_1',
                        task_id: 't_video',
                        status: 'started',
                        started_at: new Date(Date.now() - 60_000).toISOString(),
                    },
                ],
            },
        ]);

        const app = await buildRouteApp('./tasks/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/tasks/t_video/complete',
            payload: {
                sessionId: 'session_1',
                integrity: {
                    activeSeconds: 40,
                    backgroundSeconds: 0,
                    contentOpened: false,
                    client: 'flutter',
                },
            },
        });

        expect(res.statusCode).toBe(409);
        const body = res.json() as any;
        if (typeof body.error === 'string') {
            expect(body.error).toBe('Conflict');
        } else {
            expect(body).toMatchObject({
                error: { code: 'CONFLICT' },
            });
        }

        await app.close();
    });

    it('task completion rejects when session integrity nonce does not match', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [
                    {
                        id: 't_video_nonce',
                        type: 'WATCH_VIDEO',
                        is_active: 1,
                        frequency: 'ONCE',
                        reward: 5,
                        reward_type: 'COIN',
                        max_completions_per_day: null,
                        min_duration: 0,
                        video_url: 'https://videos.example.com/watch/1',
                    },
                ],
            },
            { rows: [] }, // no existing completion
            {
                rows: [
                    {
                        id: 'session_nonce_1',
                        task_id: 't_video_nonce',
                        status: 'started',
                        started_at: new Date(Date.now() - 60_000).toISOString(),
                        payload: JSON.stringify({ integrityNonce: 'nonce_expected' }),
                    },
                ],
            },
        ]);

        const app = await buildRouteApp('./tasks/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/tasks/t_video_nonce/complete',
            payload: {
                sessionId: 'session_nonce_1',
                integrity: {
                    activeSeconds: 40,
                    backgroundSeconds: 0,
                    contentOpened: true,
                    openedHost: 'videos.example.com',
                    sessionNonce: 'nonce_wrong',
                    client: 'flutter',
                },
            },
        });

        expect(res.statusCode).toBe(409);
        const body = res.json() as any;
        if (typeof body.error === 'string') {
            expect(body.error).toBe('Conflict');
        } else {
            expect(body).toMatchObject({
                error: { code: 'CONFLICT' },
            });
        }

        await app.close();
    });

    it('wishlist add route inserts snapshot fields and added_at', async () => {
        const fakeDb = createFakeDb([
            { rows: [] }, // existing wishlist check
            {
                rows: [
                    {
                        id: 'p1',
                        name: 'Product 1',
                        image: 'https://img/p1.png',
                        price: 99,
                        coin_price: 10,
                    },
                ],
            },
            { rows: [], rowsAffected: 1 }, // insert wishlist
        ]);

        const app = await buildRouteApp('./wishlists/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/wishlists',
            payload: { productId: 'p1' },
        });

        expect(res.statusCode).toBe(201);
        const insertCall = fakeDb.calls.find((c) => c.sql.includes('INSERT INTO wishlists'));
        expect(insertCall).toBeTruthy();
        expect(insertCall!.sql).toContain('product_name');
        expect(insertCall!.sql).toContain('product_image');
        expect(insertCall!.sql).toContain('product_price');
        expect(insertCall!.sql).toContain('added_at');

        await app.close();
    });

    it('review create route requires orderId to satisfy schema', async () => {
        const fakeDb = createFakeDb([]);
        const app = await buildRouteApp('./reviews/writes.js', fakeDb);

        const res = await app.inject({
            method: 'POST',
            url: '/api/reviews',
            payload: {
                productId: 'p1',
                rating: 5,
                content: 'Great',
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({
            error: { code: 'VALIDATION_ERROR' },
        });
        expect(fakeDb.calls.length).toBe(0);

        await app.close();
    });

    it('product review compatibility route rejects when no matching user order exists', async () => {
        const fakeDb = createFakeDb([
            { rows: [] }, // lookup latest order for product
        ]);
        const app = await buildRouteApp('./reviews/writes.js', fakeDb);

        const res = await app.inject({
            method: 'POST',
            url: '/api/products/p1/reviews',
            payload: {
                rating: 5,
                title: 'Great',
                content: '',
            },
        });

        expect(res.statusCode).toBe(400);
        expect(res.json()).toMatchObject({
            error: { code: 'INVALID_ORDER' },
        });

        await app.close();
    });

    it('review helpful route rejects duplicate helpful votes', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ id: 'r1', helpful: 3 }] }, // review exists
            { rows: [{ review_id: 'r1' }] }, // existing helpful vote
        ]);

        const app = await buildRouteApp('./reviews/writes.js', fakeDb);
        const res = await app.inject({
            method: 'POST',
            url: '/api/reviews/r1/helpful',
            payload: {},
        });

        expect(res.statusCode).toBe(409);
        expect(res.json()).toMatchObject({
            error: { code: 'ALREADY_EXISTS' },
        });

        await app.close();
    });

    it('catalog routes avoid missing schema columns and return safe fallbacks', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [
                    {
                        id: 'b1',
                        name: 'Brand A',
                        slug: 'brand-a',
                        logo: null,
                        is_active: 1,
                        created_at: '2026-01-01T00:00:00.000Z',
                    },
                ],
            },
            {
                rows: [
                    {
                        id: 'bn1',
                        title: 'Banner 1',
                        image: 'https://img/banner.png',
                        link: '/promo',
                        sort_order: 1,
                        is_active: 1,
                        start_date: null,
                        end_date: null,
                        created_at: '2026-01-01T00:00:00.000Z',
                    },
                ],
            },
        ]);

        const app = await buildRouteApp('./catalog/index.js', fakeDb);

        const brandsRes = await app.inject({
            method: 'GET',
            url: '/api/catalog/brands',
        });
        expect(brandsRes.statusCode).toBe(200);
        expect(brandsRes.json()).toMatchObject({
            data: [{ id: 'b1', sortOrder: 0 }],
        });
        expect(fakeDb.calls[0].sql).not.toContain('sort_order');

        const bannersRes = await app.inject({
            method: 'GET',
            url: '/api/catalog/banners',
        });
        expect(bannersRes.statusCode).toBe(200);
        expect(bannersRes.json()).toMatchObject({
            data: [{ id: 'bn1', linkType: null, placement: null }],
        });

        await app.close();
    });

    it('password change endpoint returns 404 when server-side verification is not configured', async () => {
        const fakeDb = createFakeDb([]);
        const app = await buildRouteApp('./users/profile.js', fakeDb);

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/users/me/password',
            payload: { currentPassword: 'old-pass', newPassword: 'new-pass-123' },
        });

        expect(res.statusCode).toBe(404);
        expect(res.json()).toMatchObject({
            error: { code: 'NOT_FOUND' },
        });

        await app.close();
    });
});
