import { describe, expect, it, vi } from 'vitest';
import { distributePartnerCommissionsForCity } from './partnerCommissions.js';

describe('partner commission distribution', () => {
  it('credits eligible partners and logs PARTNER_COMMISSION transactions', async () => {
    const calls: Array<{ sql: string; args: any[] }> = [];
    const tx = {
      execute: vi.fn(async (input: any) => {
        const sql = typeof input === 'string' ? input : input.sql;
        const args = typeof input === 'string' ? [] : (input.args ?? []);
        calls.push({ sql, args });

        if (sql.includes("FROM users") && sql.includes("role = 'partner'")) {
          return {
            rows: [
              {
                uid: 'p1',
                partner_config: JSON.stringify({
                  assignedCities: ['Mumbai'],
                  commissionPercentages: { Mumbai: 5 },
                }),
              },
              {
                uid: 'p2',
                partner_config: JSON.stringify({
                  assignedCity: 'Delhi',
                  commissionPercentage: 5,
                }),
              },
            ],
          };
        }

        return { rows: [], rowsAffected: 1 };
      }),
    };

    const result = await distributePartnerCommissionsForCity({
      tx,
      city: 'Mumbai',
      sourceAmount: 1000,
      sourceType: 'purchase',
      sourceId: 'order-1',
      sourceUserId: 'u1',
      createdAt: '2026-03-02T00:00:00.000Z',
    });

    expect(result.distributedCount).toBe(1);
    expect(result.totalCommission).toBeGreaterThan(0);
    expect(calls.some((c) => c.sql.includes('INSERT INTO wallets') && c.args[0] === 'p1')).toBe(true);
    expect(
      calls.some(
        (c) =>
          c.sql.includes('INSERT INTO transactions') &&
          c.args.includes('PARTNER_COMMISSION') &&
          c.args[1] === 'p1'
      )
    ).toBe(true);
  });
});

