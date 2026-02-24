// File: scripts/migration/import-turso/import.ts
/**
 * TursoDB Import Script
 * 
 * Reads transformed JSON files and batch-inserts them into TursoDB.
 * Uses batched inserts for performance with conflict handling.
 * 
 * Usage:
 *   npm run import
 *   npm run import -- --collection users
 *   npm run import -- --truncate       # Clear tables before import
 * 
 * Prerequisites:
 *   - Run the transform step first
 *   - Set TURSO_DATABASE_URL and TURSO_AUTH_TOKEN in .env
 */

import { createClient, type Client } from '@libsql/client';
import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config } from 'dotenv';

config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '.env') });
// Also try loading from server .env if migration-specific .env doesn't exist
config({ path: join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', 'server', '.env') });

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const TRANSFORMED_DIR = join(__dirname, '..', 'data', 'transformed');

const INSERT_BATCH_SIZE = 50; // Rows per batch insert

// ─── Import order (respects foreign key dependencies) ───────────────

const IMPORT_ORDER = [
    'users',
    'wallets',
    'products',
    'tasks',
    'badge_definitions',
    'settings',
    'categories',
    'brands',
    'banners',
    'coupons',
    'transactions',
    'orders',
    'withdrawals',
    'reviews',
    'review_stats',
    'review_helpful',
    'wishlists',
    'user_task_completions',
    'user_badges',
];

// ─── Database Connection ────────────────────────────────────────────

function createDbClient(): Client {
    const url = process.env.TURSO_DATABASE_URL;
    if (!url) {
        console.error('❌ TURSO_DATABASE_URL not set');
        process.exit(1);
    }

    return createClient({
        url,
        authToken: process.env.TURSO_AUTH_TOKEN,
    });
}

// ─── Import Logic ───────────────────────────────────────────────────

interface ImportStats {
    table: string;
    totalRows: number;
    insertedRows: number;
    skippedRows: number;
    errors: number;
    durationMs: number;
}

/**
 * Import a single table from its transformed JSON file.
 */
async function importTable(
    db: Client,
    tableName: string,
    truncate: boolean
): Promise<ImportStats> {
    const stats: ImportStats = {
        table: tableName,
        totalRows: 0,
        insertedRows: 0,
        skippedRows: 0,
        errors: 0,
        durationMs: 0,
    };

    const start = Date.now();
    const inputFile = join(TRANSFORMED_DIR, `${tableName}.json`);

    if (!existsSync(inputFile)) {
        console.log(`  ⚠️  No data file for ${tableName} (skipping)`);
        stats.durationMs = Date.now() - start;
        return stats;
    }

    const rows: Record<string, any>[] = JSON.parse(
        readFileSync(inputFile, 'utf-8')
    );
    stats.totalRows = rows.length;

    if (rows.length === 0) {
        console.log(`  ⚠️  Empty data file for ${tableName} (skipping)`);
        stats.durationMs = Date.now() - start;
        return stats;
    }

    // Optionally truncate the table first
    if (truncate) {
        try {
            await db.execute(`DELETE FROM ${tableName}`);
            console.log(`  🗑️  Truncated ${tableName}`);
        } catch (err: any) {
            console.error(`  ❌ Failed to truncate ${tableName}: ${err.message}`);
        }
    }

    // Get column names from the first row
    const columns = Object.keys(rows[0]);
    const placeholders = columns.map(() => '?').join(', ');
    const columnList = columns.join(', ');

    // Use INSERT OR IGNORE to handle duplicate primary keys gracefully
    const insertSql = `INSERT OR IGNORE INTO ${tableName} (${columnList}) VALUES (${placeholders})`;

    // Process in batches
    for (let i = 0; i < rows.length; i += INSERT_BATCH_SIZE) {
        const batch = rows.slice(i, i + INSERT_BATCH_SIZE);
        const batchStatements = batch.map((row) => ({
            sql: insertSql,
            args: columns.map((col) => {
                const val = row[col];
                // Convert undefined/null
                if (val === undefined) return null;
                return val;
            }),
        }));

        try {
            await db.batch(batchStatements, 'write');
            stats.insertedRows += batch.length;
        } catch (err: any) {
            // Fall back to row-by-row insert on batch failure
            console.log(`  ⚠️  Batch failed for ${tableName} at offset ${i}, falling back to row-by-row`);

            for (const stmt of batchStatements) {
                try {
                    await db.execute(stmt);
                    stats.insertedRows++;
                } catch (rowErr: any) {
                    if (rowErr.message?.includes('UNIQUE constraint')) {
                        stats.skippedRows++;
                    } else {
                        stats.errors++;
                        if (stats.errors <= 5) {
                            console.error(`    ❌ Row error: ${rowErr.message}`);
                        }
                    }
                }
            }
        }

        // Progress indicator
        const progress = Math.min(i + INSERT_BATCH_SIZE, rows.length);
        if (rows.length > INSERT_BATCH_SIZE) {
            process.stdout.write(`\r  📥 ${tableName}: ${progress}/${rows.length} rows`);
        }
    }

    if (rows.length > INSERT_BATCH_SIZE) {
        process.stdout.write('\n');
    }

    stats.durationMs = Date.now() - start;
    return stats;
}

// ─── Main ───────────────────────────────────────────────────────────

async function main() {
    const args = process.argv.slice(2);
    const truncate = args.includes('--truncate');
    const singleCollection = args.find((a, i) => args[i - 1] === '--collection');

    console.log('═══════════════════════════════════════════════════════');
    console.log('  ThinkMart TursoDB Import Tool');
    console.log(`  Mode: ${truncate ? 'TRUNCATE + INSERT' : 'INSERT OR IGNORE'}`);
    console.log(`  Time: ${new Date().toISOString()}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (!existsSync(TRANSFORMED_DIR)) {
        console.error(`❌ Transformed data directory not found: ${TRANSFORMED_DIR}`);
        console.error('   Run the transform script first: npm run transform');
        process.exit(1);
    }

    const db = createDbClient();
    console.log('📡 Connected to TursoDB\n');

    const tables = singleCollection ? [singleCollection] : IMPORT_ORDER;
    const allStats: ImportStats[] = [];

    for (const table of tables) {
        console.log(`📥 Importing: ${table}`);
        const stats = await importTable(db, table, truncate);
        allStats.push(stats);

        const status = stats.errors > 0 ? '⚠️' : '✅';
        console.log(`  ${status} ${table}: ${stats.insertedRows} inserted, ${stats.skippedRows} skipped, ${stats.errors} errors (${stats.durationMs}ms)`);
    }

    // Summary
    console.log('\n═══════════════════════════════════════════════════════');
    console.log('  Import Summary');
    console.log('═══════════════════════════════════════════════════════');

    let totalInserted = 0;
    let totalSkipped = 0;
    let totalErrors = 0;

    for (const s of allStats) {
        totalInserted += s.insertedRows;
        totalSkipped += s.skippedRows;
        totalErrors += s.errors;
    }

    console.log(`  Inserted: ${totalInserted}`);
    console.log(`  Skipped (duplicates): ${totalSkipped}`);
    console.log(`  Errors: ${totalErrors}`);
    console.log('═══════════════════════════════════════════════════════\n');

    if (totalErrors > 0) {
        console.warn('⚠️  Some rows had import errors. Review the output above.');
        process.exit(1);
    }

    console.log('✅ Import complete!\n');
}

main().catch((err) => {
    console.error('Import failed:', err);
    process.exit(1);
});
