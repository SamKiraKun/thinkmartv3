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
    if (!next) throw new Error(`Unexpected DB call #${i}: ${sql}`);
    return typeof next === 'function' ? await next(sql, args) : next;
  });
  return { execute, calls };
}

async function buildRouteApp(
  modulePath: string,
  fakeDb: FakeDb,
  opts?: {
    userOverrides?: Partial<any>;
    mockIdempotencyPassthrough?: boolean;
  }
) {
  vi.resetModules();

  vi.doMock('../db/client.js', () => ({
    getDb: () => fakeDb,
    withTransaction: async (fn: (tx: any) => Promise<any>) => fn(fakeDb),
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
        ...(opts?.userOverrides || {}),
      };
      request.userId = request.user.uid;
    },
    requireRole: (...roles: string[]) => async (request: any) => {
      if (!roles.includes(request.user?.role)) {
        const err: any = new Error('Access denied');
        err.statusCode = 403;
        throw err;
      }
    },
  }));

  if (opts?.mockIdempotencyPassthrough) {
    vi.doMock('../utils/idempotency.js', () => ({
      runIdempotentMutation: async ({ request, reply, handler }: any) => {
        const result = await handler(fakeDb);
        return reply.status(result.statusCode ?? 200).send(result.payload);
      },
    }));
  }

  const plugin = (await import(modulePath)).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('final migration parity routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('../db/client.js');
    vi.doUnmock('../middleware/auth.js');
    vi.doUnmock('../utils/idempotency.js');
  });

  it('gamification cooldowns route returns task/spin/lucky cooldowns from Turso table', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ available_at: new Date(Date.now() + 90_000).toISOString(), state_json: null }] },
      { rows: [{ available_at: null, state_json: null }] },
      { rows: [{ available_at: new Date(Date.now() + 10_000).toISOString(), state_json: null }] },
    ]);
    const app = await buildRouteApp('./gamification/index.js', fakeDb);

    const res = await app.inject({ method: 'GET', url: '/api/gamification/cooldowns' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.tasks.secondsRemaining).toBeGreaterThan(0);
    expect(body.data.spin.secondsRemaining).toBe(0);
    expect(body.data.luckyBox.secondsRemaining).toBeGreaterThan(0);

    await app.close();
  });

  it('daily checkin mutation credits wallet and stores cooldown state via Turso', async () => {
    const fakeDb = createFakeDb([
      { rows: [] }, // cooldown row read
      { rows: [], rowsAffected: 1 }, // wallet upsert
      { rows: [], rowsAffected: 1 }, // transaction insert
      { rows: [], rowsAffected: 1 }, // cooldown upsert
    ]);
    const app = await buildRouteApp('./gamification/index.js', fakeDb, { mockIdempotencyPassthrough: true });

    const res = await app.inject({ method: 'POST', url: '/api/gamification/daily-checkin', payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ data: { reward: 100, streak: 1 } });
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO wallets'))).toBe(true);
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO transactions'))).toBe(true);
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO user_action_cooldowns'))).toBe(true);

    await app.close();
  });

  it('referral downline children route applies upline_path guard for non-admin deeper queries', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ own_referral_code: 'SELF123' }] }, // current user referral code
      {
        rows: [
          { uid: 'c1', name: 'Child 1', referral_code: 'PARENTX', own_referral_code: 'CHILD1' },
        ],
      },
    ]);
    const app = await buildRouteApp('./referrals/index.js', fakeDb, { userOverrides: { uid: 'u123', role: 'user' } });

    const res = await app.inject({
      method: 'GET',
      url: '/api/referrals/downline-children?parentReferralCode=PARENTX',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ data: [{ uid: 'c1', ownReferralCode: 'CHILD1' }] });
    expect(fakeDb.calls[1].sql).toContain('upline_path LIKE ?');
    expect(fakeDb.calls[1].args).toContain('%u123%');

    await app.close();
  });

  it('admin games route returns default configs when no settings row exists', async () => {
    const fakeDb = createFakeDb([{ rows: [] }]);
    const app = await buildRouteApp('./admin/extras.js', fakeDb, { userOverrides: { role: 'admin' } });

    const res = await app.inject({ method: 'GET', url: '/api/admin/games' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.map((g: any) => g.id)).toEqual(expect.arrayContaining(['spin_wheel', 'lucky_box']));

    await app.close();
  });

  it('admin cms route returns normalized defaults when no settings row exists', async () => {
    const fakeDb = createFakeDb([{ rows: [] }]);
    const app = await buildRouteApp('./admin/extras.js', fakeDb, { userOverrides: { role: 'admin' } });

    const res = await app.inject({ method: 'GET', url: '/api/admin/cms' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      data: {
        termsOfService: '',
        privacyPolicy: '',
        aboutUs: '',
      },
    });

    await app.close();
  });

  it('admin cms update route stores content under settings.cms_content', async () => {
    const fakeDb = createFakeDb([
      { rows: [] }, // current cms settings row
      { rows: [], rowsAffected: 1 }, // upsert settings
      { rows: [], rowsAffected: 1 }, // audit log
    ]);
    const app = await buildRouteApp('./admin/extras.js', fakeDb, { userOverrides: { role: 'admin' } });

    const res = await app.inject({
      method: 'PUT',
      url: '/api/admin/cms',
      payload: {
        termsOfService: 'Terms text',
        privacyPolicy: 'Privacy text',
        aboutUs: 'About text',
      },
    });

    expect(res.statusCode).toBe(200);
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO settings') && c.args[0] === 'cms_content')).toBe(true);
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO audit_logs') && c.args[2] === 'cms.update')).toBe(true);

    await app.close();
  });

  it('admin vendors suspend route requires reason and does not mutate on invalid payload', async () => {
    const fakeDb = createFakeDb([]);
    const app = await buildRouteApp('./admin/extras.js', fakeDb, { userOverrides: { role: 'admin' } });

    const res = await app.inject({
      method: 'POST',
      url: '/api/admin/vendors/v1/suspend',
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    expect(fakeDb.calls).toHaveLength(0);

    await app.close();
  });
});
