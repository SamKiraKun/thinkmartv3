import { randomUUID } from 'crypto';

type SqlExecutor = {
    execute: (arg: string | { sql: string; args?: any[] }) => Promise<any>;
};

type CommissionSourceType = 'purchase' | 'withdrawal';

type DistributePartnerCommissionsInput = {
    tx: SqlExecutor;
    city: string;
    sourceAmount: number;
    sourceType: CommissionSourceType;
    sourceId: string;
    sourceUserId: string;
    createdAt: string;
};

const CITY_COMMISSION_POOL_PERCENT = 20;

function parseJson<T>(value: unknown, fallback: T): T {
    if (!value) return fallback;
    try {
        return JSON.parse(String(value)) as T;
    } catch {
        return fallback;
    }
}

function normalizeCity(value: unknown): string {
    return String(value || '').trim().toLowerCase();
}

function partnerCommissionForCity(partnerConfigRaw: unknown, city: string): number {
    const cfg = parseJson<Record<string, any>>(partnerConfigRaw, {});
    const target = normalizeCity(city);
    if (!target) return 0;

    const assignedCities = Array.isArray(cfg.assignedCities)
        ? cfg.assignedCities.map((c: unknown) => normalizeCity(c)).filter(Boolean)
        : [];

    const percentagesRaw =
        cfg.commissionPercentages && typeof cfg.commissionPercentages === 'object'
            ? (cfg.commissionPercentages as Record<string, unknown>)
            : {};
    const percentages = new Map<string, number>();
    for (const [rawCity, value] of Object.entries(percentagesRaw)) {
        const key = normalizeCity(rawCity);
        if (!key) continue;
        const pct = Number(value || 0);
        if (Number.isFinite(pct)) {
            percentages.set(key, pct);
        }
    }

    if (assignedCities.length > 0) {
        if (!assignedCities.includes(target)) return 0;
        const pct = Number(percentages.get(target) ?? cfg.commissionPercentage ?? 0);
        return Number.isFinite(pct) ? Math.max(0, Math.min(20, pct)) : 0;
    }

    const singleAssignedCity = normalizeCity(cfg.assignedCity);
    if (!singleAssignedCity || singleAssignedCity !== target) return 0;
    const pct = Number(percentages.get(target) ?? cfg.commissionPercentage ?? 0);
    return Number.isFinite(pct) ? Math.max(0, Math.min(20, pct)) : 0;
}

export async function distributePartnerCommissionsForCity(
    input: DistributePartnerCommissionsInput
): Promise<{ distributedCount: number; totalCommission: number }> {
    const {
        tx,
        city,
        sourceAmount,
        sourceType,
        sourceId,
        sourceUserId,
        createdAt,
    } = input;

    const normalizedCity = String(city || '').trim();
    if (!normalizedCity) return { distributedCount: 0, totalCommission: 0 };
    if (!Number.isFinite(sourceAmount) || sourceAmount <= 0) {
        return { distributedCount: 0, totalCommission: 0 };
    }

    const pool = Number(
        Math.max(0, sourceAmount * (CITY_COMMISSION_POOL_PERCENT / 100)).toFixed(2)
    );
    if (pool <= 0) return { distributedCount: 0, totalCommission: 0 };

    const partnersResult = await tx.execute({
        sql: `SELECT uid, partner_config
              FROM users
              WHERE role = 'partner'
                AND is_active = 1
                AND is_banned = 0`,
        args: [],
    });

    let distributedCount = 0;
    let totalCommission = 0;

    for (const row of partnersResult.rows as Array<Record<string, any>>) {
        const partnerId = String(row.uid || '').trim();
        if (!partnerId) continue;

        const partnerPercentage = partnerCommissionForCity(row.partner_config, normalizedCity);
        if (partnerPercentage <= 0) continue;

        // Keep parity with callable behavior: partner percentage is a share of the 20% city pool.
        const commissionAmount = Number(
            Math.floor(pool * (partnerPercentage / CITY_COMMISSION_POOL_PERCENT))
        );
        if (!Number.isFinite(commissionAmount) || commissionAmount <= 0) continue;

        await tx.execute({
            sql: `INSERT INTO wallets (user_id, coin_balance, cash_balance, total_earnings, updated_at)
                  VALUES (?, 0, ?, ?, ?)
                  ON CONFLICT(user_id) DO UPDATE SET
                    cash_balance = cash_balance + ?,
                    total_earnings = total_earnings + ?,
                    updated_at = ?`,
            args: [
                partnerId,
                commissionAmount,
                commissionAmount,
                createdAt,
                commissionAmount,
                commissionAmount,
                createdAt,
            ],
        });

        await tx.execute({
            sql: `INSERT INTO transactions (
                    id, user_id, type, amount, currency, status, description,
                    related_user_id, source_txn_id, created_at
                  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            args: [
                randomUUID(),
                partnerId,
                'PARTNER_COMMISSION',
                commissionAmount,
                'CASH',
                'COMPLETED',
                `Partner commission ${partnerPercentage}% (${sourceType})`,
                sourceUserId,
                sourceId,
                createdAt,
            ],
        });

        distributedCount += 1;
        totalCommission += commissionAmount;
    }

    return { distributedCount, totalCommission: Number(totalCommission.toFixed(2)) };
}

