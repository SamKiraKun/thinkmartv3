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
    userOverrides?: Partial<any>,
    options?: { denyRequireRole?: boolean }
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
                role: 'admin',
                email: 'u1@example.com',
                isActive: true,
                isBanned: false,
                name: 'User One',
                membershipActive: false,
                ...userOverrides,
            };
            request.userId = request.user.uid;
        },
        requireRole: (..._roles: string[]) => async () => { },
    }));
    if (options?.denyRequireRole) {
        vi.doMock('../middleware/auth.js', () => ({
            requireAuth: async (request: any) => {
                request.user = {
                    uid: 'u1',
                    role: 'admin',
                    email: 'u1@example.com',
                    isActive: true,
                    isBanned: false,
                    name: 'User One',
                    membershipActive: false,
                    ...userOverrides,
                };
                request.userId = request.user.uid;
            },
            requireRole: (..._roles: string[]) => async () => {
                const err: any = new Error('Access denied');
                err.statusCode = 403;
                err.code = 'FORBIDDEN';
                throw err;
            },
        }));
    }

    const plugin = (await import(modulePath)).default;
    const app = Fastify();
    await app.register(plugin);
    return app;
}

describe('role API hardening routes', () => {
    beforeEach(() => {
        vi.restoreAllMocks();
    });

    afterEach(async () => {
        vi.resetModules();
        vi.doUnmock('../db/client.js');
        vi.doUnmock('../middleware/auth.js');
    });

    it('vendor store profile patch persists vendor_config JSON with sanitized fields', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [{
                    vendor_config: JSON.stringify({ businessName: 'Old Name' }),
                    name: 'Vendor User',
                    email: 'vendor@example.com',
                    phone: '1234567890',
                    city: 'OldCity',
                    state: 'OldState',
                }],
            },
            { rows: [], rowsAffected: 1 },
        ]);
        const app = await buildRouteApp('./vendor/index.js', fakeDb, { role: 'vendor' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/vendor/store-profile',
            payload: {
                businessName: '  Acme Market  ',
                city: 'Delhi',
                logoUrl: 'https://example.com/logo.png',
            },
        });

        expect(res.statusCode).toBe(200);
        const updateCall = fakeDb.calls.find((c) => c.sql.includes('UPDATE users'));
        expect(updateCall).toBeTruthy();
        const vendorConfig = JSON.parse(String(updateCall!.args[0]));
        expect(vendorConfig.vendorId).toBe('u1');
        expect(vendorConfig.businessName).toBe('Acme Market');
        expect(vendorConfig.city).toBe('Delhi');

        await app.close();
    });

    it('vendor routes reject non-vendor role via role guard', async () => {
        const fakeDb = createFakeDb([]);
        const app = await buildRouteApp('./vendor/index.js', fakeDb, { role: 'admin' }, { denyRequireRole: true });

        const res = await app.inject({
            method: 'GET',
            url: '/api/vendor/dashboard',
        });

        expect(res.statusCode).toBe(403);
        expect(fakeDb.calls).toHaveLength(0);

        await app.close();
    });

    it('vendor products route scopes query to vendor and supports search filter', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ total: 1 }] },
            {
                rows: [{
                    id: 'p1',
                    name: 'Vendor Phone',
                    description: 'Smartphone',
                    price: 9999,
                    category: 'electronics',
                    image: 'https://example.com/p1.png',
                    images: null,
                    status: 'pending',
                    stock: 10,
                    in_stock: 1,
                    coin_price: 0,
                    commission: 0,
                    coin_only: 0,
                    cash_only: 0,
                    delivery_days: 7,
                    created_at: '2026-02-21T00:00:00.000Z',
                    updated_at: '2026-02-21T00:00:00.000Z',
                }],
            },
        ]);
        const app = await buildRouteApp('./vendor/index.js', fakeDb, { role: 'vendor', uid: 'vendor-1' });

        const res = await app.inject({
            method: 'GET',
            url: '/api/vendor/products?search=phone&page=1&limit=20',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            data: [{ id: 'p1', name: 'Vendor Phone' }],
        });
        expect(fakeDb.calls[0].sql).toContain('vendor = ?');
        expect(fakeDb.calls[0].args[0]).toBe('vendor-1');
        expect(fakeDb.calls[0].sql).toContain('name LIKE ? OR description LIKE ?');

        await app.close();
    });

    it('partner users route applies not_submitted kyc filter safely', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ partner_config: JSON.stringify({ assignedCities: ['Pune'], commissionPercentages: { Pune: 5 } }) }] },
            { rows: [{ total: 1 }] },
            {
                rows: [{
                    uid: 'user-1',
                    name: 'Alice',
                    phone: '9999999999',
                    email: 'alice@example.com',
                    city: 'Pune',
                    kyc_status: null,
                    membership_active: 1,
                    created_at: '2026-02-01T00:00:00.000Z',
                    updated_at: '2026-02-20T00:00:00.000Z',
                }],
            },
        ]);
        const app = await buildRouteApp('./partner/index.js', fakeDb, { role: 'partner' });

        const res = await app.inject({
            method: 'GET',
            url: '/api/partner/users?kycStatus=not_submitted&page=1&limit=20',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            data: [{ id: 'user-1', kycStatus: 'not_submitted' }],
        });
        expect(fakeDb.calls[1].sql).toContain("COALESCE(kyc_status, 'not_submitted') = 'not_submitted'");

        await app.close();
    });

    it('partner withdrawal create route enforces partner policy and creates pending record', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ value: JSON.stringify({ minWithdrawalAmount: 500, maxWithdrawalAmount: 50000, maxWithdrawalsPerMonth: 2, withdrawalCooldownDays: 0 }) }] }, // settings
            { rows: [{ uid: 'p1', role: 'partner', kyc_status: 'verified' }] }, // partner user
            { rows: [] }, // pending withdrawals
            { rows: [{ total: 0 }] }, // monthly count
            { rows: [], rowsAffected: 1 }, // wallet debit
            { rows: [], rowsAffected: 1 }, // withdrawal insert
            { rows: [], rowsAffected: 1 }, // transaction insert
        ]);
        const app = await buildRouteApp('./partner/index.js', fakeDb, { role: 'partner', uid: 'p1' });

        const res = await app.inject({
            method: 'POST',
            url: '/api/partner/withdrawals',
            payload: { amount: 600, method: 'upi', upiId: 'partner@upi' },
        });

        expect(res.statusCode).toBe(201);
        expect(res.json()).toMatchObject({
            data: { status: 'pending', amount: 600 },
        });
        expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO withdrawals'))).toBe(true);
        expect(fakeDb.calls.some((c) => c.sql.includes('INSERT INTO transactions'))).toBe(true);

        await app.close();
    });

    it('partner withdrawal cancel route restores balance for own pending withdrawal', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ id: 'w1', user_id: 'p1', amount: 600, status: 'pending' }] }, // select existing
            { rows: [], rowsAffected: 1 }, // update withdrawals
            { rows: [], rowsAffected: 1 }, // update wallets
            { rows: [], rowsAffected: 1 }, // update transactions
        ]);
        const app = await buildRouteApp('./partner/index.js', fakeDb, { role: 'partner', uid: 'p1' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/partner/withdrawals/w1/cancel',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            data: { updated: true, status: 'rejected', amount: 600 },
        });
        expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE wallets'))).toBe(true);

        await app.close();
    });

    it('organization dashboard route returns org config and stats from Turso queries', async () => {
        const fakeDb = createFakeDb([
            {
                rows: [{
                    uid: 'org-1',
                    name: 'Org Owner',
                    own_referral_code: 'ORG12345',
                    org_config: JSON.stringify({ orgName: 'Think College', orgType: 'college', commissionPercentage: 12 }),
                    is_active: 1,
                    is_banned: 0,
                }],
            },
            { rows: [{ count: 3 }] },
            {
                rows: [{
                    uid: 'm1',
                    name: 'Member One',
                    email: 'm1@example.com',
                    membership_active: 1,
                    created_at: '2026-02-15T00:00:00.000Z',
                }],
            },
            { rows: [{ total: 1200 }] },
            { rows: [{ total: 300 }] },
            { rows: [{ cash_balance: 1200 }] },
        ]);
        const app = await buildRouteApp('./organizations/index.js', fakeDb, { role: 'organization', uid: 'org-1' });

        const res = await app.inject({
            method: 'GET',
            url: '/api/organizations/me/dashboard',
        });

        expect(res.statusCode).toBe(200);
        expect(res.json()).toMatchObject({
            data: {
                org: { orgName: 'Think College', orgType: 'college', commissionPercentage: 12, referralCode: 'ORG12345' },
                stats: { memberCount: 3, totalEarnings: 1200, thisMonthEarnings: 300, pendingEarnings: 1200 },
            },
        });

        await app.close();
    });

    it('admin partner config route stores multi-city allocations', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ uid: 'p1', role: 'partner', partner_config: null }] }, // existing partner
            { rows: [{ uid: 'p2', partner_config: JSON.stringify({ assignedCity: 'Delhi', commissionPercentage: 5 }) }] }, // other partners
            { rows: [], rowsAffected: 1 }, // update users
            { rows: [], rowsAffected: 1 }, // audit log insert
        ]);
        const app = await buildRouteApp('./admin/index.js', fakeDb, { role: 'admin', uid: 'admin-1' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/admin/users/p1/partner-config',
            payload: {
                assignedCities: ['Mumbai', 'Pune'],
                commissionPercentages: { Mumbai: 6, Pune: 4 },
                status: 'active',
            },
        });

        expect(res.statusCode).toBe(200);
        const updateCall = fakeDb.calls.find((c) => c.sql.includes('UPDATE users') && c.sql.includes('partner_config = ?'));
        expect(updateCall).toBeTruthy();
        const partnerConfig = JSON.parse(String(updateCall!.args[0]));
        expect(partnerConfig.assignedCities).toEqual(['Mumbai', 'Pune']);
        expect(partnerConfig.commissionPercentages).toEqual({ Mumbai: 6, Pune: 4 });
        expect(partnerConfig.status).toBe('active');
        expect(updateCall!.args[1]).toBe('Mumbai'); // primary city mirror

        await app.close();
    });

    it('admin partner config rejects duplicate assignedCities', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ uid: 'p1', role: 'partner', partner_config: null }] },
        ]);
        const app = await buildRouteApp('./admin/index.js', fakeDb, { role: 'admin', uid: 'admin-1' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/admin/users/p1/partner-config',
            payload: {
                assignedCities: ['Mumbai', 'mumbai'],
                commissionPercentages: { Mumbai: 5, mumbai: 3 },
            },
        });

        expect(res.statusCode).toBe(400);
        expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE users') && c.sql.includes('partner_config'))).toBe(false);

        await app.close();
    });

    it('admin partner config rejects unknown commissionPercentages keys', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ uid: 'p1', role: 'partner', partner_config: null }] },
        ]);
        const app = await buildRouteApp('./admin/index.js', fakeDb, { role: 'admin', uid: 'admin-1' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/admin/users/p1/partner-config',
            payload: {
                assignedCities: ['Mumbai'],
                commissionPercentages: { Pune: 5 },
            },
        });

        expect(res.statusCode).toBe(400);
        expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE users') && c.sql.includes('partner_config'))).toBe(false);

        await app.close();
    });

    it('admin org config rejects invalid status', async () => {
        const fakeDb = createFakeDb([
            { rows: [{ uid: 'o1', role: 'organization', name: 'Org', org_config: null, is_active: 1, is_banned: 0 }] },
        ]);
        const app = await buildRouteApp('./admin/index.js', fakeDb, { role: 'admin', uid: 'admin-1' });

        const res = await app.inject({
            method: 'PATCH',
            url: '/api/admin/users/o1/org-config',
            payload: { status: 'disabled' },
        });

        expect(res.statusCode).toBe(400);
        expect(fakeDb.calls.some((c) => c.sql.includes('UPDATE users') && c.sql.includes('org_config'))).toBe(false);

        await app.close();
    });
});
