import Fastify from 'fastify';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type DbResult = { rows: any[]; rowsAffected?: number };
type FakeDb = {
  execute: ReturnType<typeof vi.fn>;
  calls: Array<{ sql: string; args: any[] }>;
};

function createFakeDb(
  results: Array<DbResult | ((sql: string, args: any[]) => DbResult | Promise<DbResult>)>
): FakeDb {
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
      };
      request.userId = 'u1';
    },
  }));

  vi.doMock('../utils/idempotency.js', () => ({
    runIdempotentMutation: async ({ request, reply, handler, afterCommit }: any) => {
      const result = await handler(fakeDb);
      if (afterCommit) await afterCommit({ cached: false, payload: result.payload });
      return reply.status(result.statusCode ?? 200).send(result.payload);
    },
  }));

  vi.doMock('../jobs/enqueue.js', () => ({
    enqueueOrderCreatedJobs: async () => undefined,
  }));
  vi.doMock('./realtime/index.js', () => ({
    broadcast: () => undefined,
  }));
  vi.doMock('../utils/partnerCommissions.js', () => ({
    distributePartnerCommissionsForCity: async () => undefined,
  }));

  const plugin = (await import('./orders/writes.js')).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('order contract compatibility', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('../db/client.js');
    vi.doUnmock('../middleware/auth.js');
    vi.doUnmock('../utils/idempotency.js');
    vi.doUnmock('../jobs/enqueue.js');
    vi.doUnmock('./realtime/index.js');
    vi.doUnmock('../utils/partnerCommissions.js');
  });

  it('accepts callable-style create order payload with useCoins and no client pricing hints', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ total: 0 }] }, // recent orders count
      { rows: [{ email: 'u1@example.com', name: 'User One' }] }, // user
      {
        rows: [{
          id: 'p1',
          stock: 10,
          in_stock: 1,
          price: 100,
          coin_price: 0,
          coin_only: 0,
          cash_only: 0,
        }],
      }, // product
      { rows: [] }, // stock update
      { rows: [{ coin_balance: 500, cash_balance: 1000 }] }, // wallet preview
      { rows: [], rowsAffected: 1 }, // wallet debit
      { rows: [], rowsAffected: 1 }, // order insert
      { rows: [], rowsAffected: 1 }, // purchase tx coin
      { rows: [], rowsAffected: 1 }, // purchase tx cash
      { rows: [], rowsAffected: 1 }, // audit log
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        items: [{ productId: 'p1', quantity: 1 }],
        useCoins: true,
        shippingAddress: {
          fullName: 'User One',
          phone: '9999999999',
          addressLine1: 'Street 1',
          city: '',
          state: 'MH',
          pincode: '400001',
        },
      },
    });

    expect(res.statusCode).toBe(201);
    const orderInsert = fakeDb.calls.find((c) => c.sql.includes('INSERT INTO orders'));
    expect(orderInsert).toBeTruthy();
    // args: ... subtotal, cash_paid, coins_redeemed, coin_value ...
    expect(orderInsert!.args[5]).toBe(100);
    expect(orderInsert!.args[6]).toBe(50);
    expect(orderInsert!.args[7]).toBe(500);
    expect(orderInsert!.args[8]).toBe(50);

    await app.close();
  });

  it('rejects coins payment mode when available coins cannot cover full subtotal', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ total: 0 }] }, // recent orders count
      { rows: [{ email: 'u1@example.com', name: 'User One' }] }, // user
      {
        rows: [{
          id: 'p1',
          stock: 10,
          in_stock: 1,
          price: 100,
          coin_price: 0,
          coin_only: 0,
          cash_only: 0,
        }],
      }, // product
      { rows: [] }, // stock update
      { rows: [{ coin_balance: 200, cash_balance: 1000 }] }, // wallet preview, insufficient for 1000 coins
    ]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'POST',
      url: '/api/orders',
      payload: {
        items: [{ productId: 'p1', quantity: 1 }],
        paymentMode: 'coins',
        shippingAddress: {
          fullName: 'User One',
          phone: '9999999999',
          addressLine1: 'Street 1',
          city: '',
          state: 'MH',
          pincode: '400001',
        },
      },
    });

    expect(res.statusCode).toBe(400);
    expect(res.json()).toMatchObject({
      message: expect.stringContaining('Insufficient coins for coins payment mode'),
    });

    await app.close();
  });
});

