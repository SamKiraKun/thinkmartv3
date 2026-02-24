// File: server/src/routes/settings/index.ts
/**
 * Public Settings Route (Read-only)
 * 
 * GET /api/settings/public - Public platform settings (no auth required)
 */

import { FastifyInstance } from 'fastify';
import { getDb } from '../../db/client.js';

export default async function settingsRoutes(fastify: FastifyInstance) {

    // ─── Public Settings ──────────────────────────────────────────
    fastify.get('/api/settings/public', async (request, reply) => {
        const db = getDb();

        const result = await db.execute({
            sql: `SELECT * FROM settings WHERE key = ?`,
            args: ['general'],
        });

        if (result.rows.length === 0) {
            return {
                data: {
                    appName: 'ThinkMart',
                    maintenanceMode: false,
                    signupsEnabled: true,
                },
            };
        }

        const row = result.rows[0];
        // Settings values are stored as JSON in the 'value' column
        // or as direct columns depending on schema implementation.
        // We'll return a merged object of all settings.
        let settingsValue: Record<string, unknown> = {};
        try {
            settingsValue = row.value ? (JSON.parse(row.value as string) as Record<string, unknown>) : {};
        } catch {
            settingsValue = {};
        }

        return {
            data: {
                key: row.key,
                appName: (settingsValue.appName as string) || 'ThinkMart',
                maintenanceMode: Boolean(settingsValue.maintenanceMode),
                signupsEnabled: settingsValue.signupsEnabled === undefined ? true : Boolean(settingsValue.signupsEnabled),
                withdrawalsEnabled: settingsValue.withdrawalsEnabled === undefined ? true : Boolean(settingsValue.withdrawalsEnabled),
                membershipFee: Number(settingsValue.membershipFee) || 1000,
                minWithdrawalAmount: Number(settingsValue.minWithdrawalAmount) || 500,
                updatedAt: row.updated_at,
            },
        };
    });
}
