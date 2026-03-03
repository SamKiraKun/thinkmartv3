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

async function buildRouteApp(fakeDb: FakeDb) {
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
      };
      request.userId = 'u1';
    },
  }));

  // Block async side effects for these policy tests.
  vi.doMock('../jobs/enqueue.js', () => ({
    enqueueWithdrawalNotification: async () => undefined,
  }));
  vi.doMock('./realtime/index.js', () => ({
    broadcast: () => undefined,
  }));

  const plugin = (await import('./withdrawals/writes.js')).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('withdrawal policy enforcement', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('../db/client.js');
    vi.doUnmock('../middleware/auth.js');
    vi.doUnmock('../jobs/enqueue.js');
    vi.doUnmock('./realtime/index.js');
  });

  it('rejects withdrawal when KYC is not verified', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500 }) }] }, // settings
      { rows: [{ uid: 'u1', kyc_status: 'pending' }] }, // user
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdrawals',
      payload: { amount: 1000, method: 'upi', upiId: 'user@upi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('KYC verification required'),
    });
    expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE wallets'))).toBe(false);

    await app.close();
  });

  it('rejects when user already has a pending withdrawal', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500 }) }] }, // settings
      { rows: [{ uid: 'u1', kyc_status: 'verified' }] }, // user
      { rows: [{ id: 'w1' }] }, // pending withdrawal exists
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdrawals',
      payload: { amount: 1000, method: 'upi', upiId: 'user@upi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('pending withdrawal request'),
    });
    expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE wallets'))).toBe(false);

    await app.close();
  });

  it('rejects during active cooldown window', async () => {
    const nowIso = new Date().toISOString();
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500, withdrawalCooldownDays: 24 }) }] }, // settings
      { rows: [{ uid: 'u1', kyc_status: 'verified' }] }, // user
      { rows: [] }, // no pending
      { rows: [{ processed_at: nowIso }] }, // last processed withdrawal now
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdrawals',
      payload: { amount: 1000, method: 'upi', upiId: 'user@upi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('cooldown active'),
    });
    expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE wallets'))).toBe(false);

    await app.close();
  });

  it('rejects when monthly withdrawal limit is reached', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500, maxWithdrawalsPerMonth: 2, withdrawalCooldownDays: 0 }) }] }, // settings
      { rows: [{ uid: 'u1', kyc_status: 'verified' }] }, // user
      { rows: [] }, // no pending
      { rows: [{ total: 2 }] }, // monthly limit reached
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/withdrawals',
      payload: { amount: 1000, method: 'upi', upiId: 'user@upi' },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('withdrawals allowed per month'),
    });
    expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE wallets'))).toBe(false);

    await app.close();
  });
});
