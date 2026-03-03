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

async function buildRouteApp(
  modulePath: string,
  fakeDb: FakeDb,
  opts?: { userOverrides?: Partial<any> }
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

  const plugin = (await import(modulePath)).default;
  const app = Fastify();
  await app.register(plugin);
  return app;
}

describe('role parity extension routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  afterEach(async () => {
    vi.resetModules();
    vi.doUnmock('../db/client.js');
    vi.doUnmock('../middleware/auth.js');
  });

  it('partner commissions route applies city/source/date/search filters and returns summary', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ partner_config: JSON.stringify({ assignedCities: ['Delhi'] }) }] },
      { rows: [{ total: 1 }] },
      {
        rows: [
          {
            id: 't1',
            amount: 25,
            description: 'Partner commission 5%',
            created_at: '2026-01-10T12:00:00.000Z',
            related_user_id: 'user_1',
            source_user_name: 'Alice',
            source_user_city: 'Delhi',
            src_txn_amount: 500,
            src_txn_type: 'WITHDRAWAL',
          },
        ],
      },
      { rows: [{ total_amount: 25, purchase_amount: 0, withdrawal_amount: 25 }] },
    ]);

    const app = await buildRouteApp('./partner/index.js', fakeDb, {
      userOverrides: { role: 'partner' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/partner/commissions?city=Delhi&sourceType=withdrawal&from=2026-01-01&to=2026-01-31&search=ali',
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      data: [
        {
          id: 't1',
          city: 'Delhi',
          sourceType: 'withdrawal',
          sourceUserName: 'Alice',
        },
      ],
      summary: {
        totalAmount: 25,
        withdrawalAmount: 25,
      },
      filters: {
        city: 'Delhi',
        sourceType: 'withdrawal',
        search: 'ali',
      },
    });

    expect(fakeDb.calls[1].sql).toContain("src.type = 'WITHDRAWAL'");
    expect(fakeDb.calls[1].sql).toContain('u.city = ?');
    expect(fakeDb.calls[1].sql).toContain('t.created_at >= ?');
    expect(fakeDb.calls[1].args).toContain('Delhi');
    expect(fakeDb.calls[1].args).toContain('%ali%');

    await app.close();
  });

  it('organization earnings export returns csv with applied search filter', async () => {
    const fakeDb = createFakeDb([
      {
        rows: [
          {
            id: 'log_1',
            amount: 45.5,
            related_user_id: 'member_1',
            source_user_name: 'Alice',
            created_at: '2026-02-10T08:15:00.000Z',
          },
        ],
      },
    ]);

    const app = await buildRouteApp('./organizations/index.js', fakeDb, {
      userOverrides: { role: 'organization' },
    });

    const res = await app.inject({
      method: 'GET',
      url: '/api/organizations/me/earnings?export=csv&search=ali',
    });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('text/csv');
    expect(res.body).toContain('id,amount,source_type,source_user_id,source_user_name,created_at');
    expect(res.body).toContain('log_1,45.50,earning,member_1,Alice,2026-02-10T08:15:00.000Z');
    expect(fakeDb.calls[0].sql).toContain('u.name LIKE ?');
    expect(fakeDb.calls[0].args).toContain('%ali%');

    await app.close();
  });

  it('partner can update scoped user KYC status', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ partner_config: JSON.stringify({ assignedCities: ['Delhi'] }) }] },
      {
        rows: [
          {
            uid: 'u_city_1',
            role: 'user',
            city: 'Delhi',
            name: 'Alice',
            email: 'alice@example.com',
            phone: '9000000000',
          },
        ],
      },
      { rows: [], rowsAffected: 1 }, // update user
      { rows: [], rowsAffected: 1 }, // audit log insert
    ]);

    const app = await buildRouteApp('./partner/index.js', fakeDb, {
      userOverrides: { role: 'partner' },
    });

    const res = await app.inject({
      method: 'PATCH',
      url: '/api/partner/users/u_city_1/kyc-status',
      payload: { kycStatus: 'verified', note: 'Docs validated' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({
      data: {
        updated: true,
        id: 'u_city_1',
        kycStatus: 'verified',
      },
    });
    expect(fakeDb.calls[2].sql).toContain('SET kyc_status = ?');
    expect(fakeDb.calls[2].args[0]).toBe('verified');

    await app.close();
  });

  it('organization can create payout withdrawal request from earnings module', async () => {
    const fakeDb = createFakeDb([
      { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500, maxWithdrawalAmount: 50000, maxWithdrawalsPerMonth: 2, withdrawalCooldownDays: 0 }) }] },
      { rows: [{ uid: 'u1', role: 'organization', kyc_status: 'verified' }] },
      { rows: [] }, // no pending withdrawal
      { rows: [{ total: 0 }] }, // monthly count
      { rows: [], rowsAffected: 1 }, // wallet debit
      { rows: [], rowsAffected: 1 }, // withdrawals insert
      { rows: [], rowsAffected: 1 }, // transactions insert
    ]);

    const app = await buildRouteApp('./organizations/index.js', fakeDb, {
      userOverrides: { role: 'organization' },
    });

    const res = await app.inject({
      method: 'POST',
      url: '/api/organizations/me/earnings/withdrawals',
      payload: {
        amount: 1500,
        method: 'upi',
        upiId: 'org@upi',
      },
    });

    expect(res.statusCode).toBe(201);
    expect(res.json()).toMatchObject({
      data: {
        status: 'pending',
        amount: 1500,
      },
    });
    expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO withdrawals'))).toBe(true);

    await app.close();
  });
});
