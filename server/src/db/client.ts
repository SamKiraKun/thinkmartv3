// File: server/src/db/client.ts
/**
 * TursoDB (libSQL) client singleton.
 * Provides the database client and a health check helper.
 */

import { createClient, type Client } from '@libsql/client';
import { env } from '../config/env.js';
import { logger } from '../config/logger.js';

let dbClient: Client | null = null;

export function getDb(): Client {
    if (!dbClient) {
        dbClient = createClient({
            url: env.TURSO_DATABASE_URL,
            authToken: env.TURSO_AUTH_TOKEN,
        });
        logger.info('TursoDB client created');
    }
    return dbClient;
}

/**
 * Check if the database is reachable.
 */
export async function checkDbHealth(): Promise<boolean> {
    try {
        const db = getDb();
        await db.execute('SELECT 1');
        return true;
    } catch (err) {
        logger.error({ err }, 'TursoDB health check failed');
        return false;
    }
}

/**
 * Execute a query within a transaction.
 * All statements succeed or all rollback.
 */
export async function withTransaction<T>(
    fn: (tx: Client) => Promise<T>
): Promise<T> {
    const db = getDb();
    // libSQL supports batch transactions via the transaction API
    const tx = await db.transaction('write');
    try {
        const result = await fn(tx as unknown as Client);
        await tx.commit();
        return result;
    } catch (err) {
        await tx.rollback();
        throw err;
    }
}
