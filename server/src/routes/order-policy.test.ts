import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbResult = { rows: any[]; rowsAffected?: number };
type FakeDb = {
  execute: ReturnType<typeof vi.fn>;
};

function createFakeDb(results: Array<DbResult | ((sql: string, args: any[]) => DbResult | Promise<DbResult>)>): FakeDb {
  let i = 0;
  const execute = vi.fn(async (input: any) => {
    const sql = typeof input === 'string' ? input : input.sql;
    const args = typeof input === 'string' ? [] : (input.args ?? []);
    const next = results[i++];
    if (!next) throw new Error(`Unexpected DB call #${i}: ${sql}`);
    return typeof next === 'function' ? await next(sql, args) : next;
  });
  return { execute };
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

  // Not relevant for this test, but imported by route module.
  vi.doMock('../jobs/enqueue.js', () => ({
    enqueueOrderCreatedJobs: async () => undefined,
  }));
  vi.doMock('./realtime/index.js', () => ({
    broadcast: () => undefined,
  }));

  const plugin = (await import('./orders/writes.js')).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('order policy enforcement', () => {
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

  it('rejects creating more than 5 orders within one hour', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ total: 5 }] }, // recent orders count
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        items: [{ productId: 'p1', quantity: 1, price: 100 }],
        shippingAddress: { city: 'Mumbai' },
        subtotal: 100,
        cashPaid: 100,
        coinsRedeemed: 0,
        coinValue: 0,
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('Maximum 5 orders per hour'),
    });

    await app.close();
  });
});

