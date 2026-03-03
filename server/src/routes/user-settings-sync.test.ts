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

  const plugin = (await import('./users/profile.js')).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('user settings sync routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('../db/client.js');
    vi.doUnmock('../middleware/auth.js');
  });

  it('returns defaults when user settings are not yet stored', async () => {
    const fakeDb = createFakeDb([{ rows: [] }]);
    const app = await buildRouteApp(fakeDb);

    const res = await app.inject({
      method: 'GET',
      url: '/api/users/me/settings',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      data: {
        taskReminders: true,
        orderUpdates: true,
      },
    });

    await app.close();
  });

  it('upserts and returns user notification settings', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ taskReminders: true, orderUpdates: true }) }] }, // current
      { rows: [], rowsAffected: 1 }, // upsert
      { rows: [{ value: JSON.stringify({ taskReminders: false, orderUpdates: true }), updated_at: '2026-03-01T10:00:00.000Z', updated_by: 'u1' }] }, // get
    ]);
    const app = await buildRouteApp(fakeDb);

    const patchRes = await app.inject({
      method: 'PATCH',
      url: '/api/users/me/settings',
      payload: { taskReminders: false },
    });
    expect(patchRes.statusCode).toBe(200);
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO settings'))).toBe(true);
    const upsertCall = fakeDb.calls.find((c) => c.sql.includes('INSERT INTO settings'));
    expect(upsertCall?.args[0]).toBe('user_settings:u1');

    const getRes = await app.inject({
      method: 'GET',
      url: '/api/users/me/settings',
    });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toMatchObject({
      data: {
        taskReminders: false,
        orderUpdates: true,
        updatedBy: 'u1',
      },
    });

    await app.close();
  });
});

